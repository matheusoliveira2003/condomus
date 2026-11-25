import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { HttpError, naoEncontrado, proibido } from "../../lib/errors.js";
import { notificarUnidade } from "../../lib/push.js";
import { gerarCodigo, normalizarCodigo } from "../../lib/codigo.js";
import { gerarCartaoConvite } from "../../lib/cartaoConvite.js";
import { dadosDaVerificacao, limiteValidade, normalizarDocumento, renovarPrazoRosto, rostoValido, verificacaoSchema } from "../rostos/regras.js";
import { FUSO, aindaValem, antesDoDia, inicioDoDia, venceEm, venceu } from "../../lib/validadeVisita.js";
import { ehMorador, PAPEIS_MORADOR } from "../../lib/papeis.js";

const agendarSchema = z.object({
  nomeVisitante: z.string().min(2),
  documento: z.string().trim().min(5, "Informe o documento do visitante (RG ou CPF)"),
  placaVeiculo: z.string().optional(),
  dataPrevista: z.coerce.date().optional(),
  observacao: z.string().optional(),
});

/** Portaria registrando um visitante sem pré-autorização (entrada imediata). */
const entradaDiretaSchema = agendarSchema.extend({ unidadeId: z.uuid(), verificacao: verificacaoSchema.optional() });

/** Agrupamentos de status usados pelo app: visitas em aberto ou já encerradas. */
const SITUACOES = {
  ativas: ["AGENDADA", "EM_ANDAMENTO"],
  historico: ["FINALIZADA", "CANCELADA"],
} as const;

const PAGE_SIZE = 20;

/** Visitante entra na lista de "frequentes" da unidade se foi autorizado neste período. */
const DIAS_VISITANTE_ATIVO = 90;

const filtroSchema = z.object({
  status: z.enum(["AGENDADA", "EM_ANDAMENTO", "FINALIZADA", "CANCELADA"]).optional(),
  situacao: z.enum(["ativas", "historico"]).optional(),
  limite: z.coerce.number().int().min(1).max(100).default(PAGE_SIZE),
  /** ID da última visita recebida; omitir para a primeira página. */
  cursor: z.uuid().optional(),
});

const idParam = z.object({ id: z.uuid() });

const entradaSchema = z.object({ codigo: z.string().optional(), verificacao: verificacaoSchema.optional() });

export async function visitasRoutes(app: FastifyInstance) {
  // Morador vê as visitas da própria unidade; portaria e síndico veem todas.
  app.get("/visitas", { preHandler: app.autorizar() }, async (req) => {
    const { status, situacao, limite, cursor } = filtroSchema.parse(req.query);
    const { papel, unidadeId, condominioId } = req.user;

    // Paginação por cursor: busca `limite + 1` itens para saber se há próxima página.
    const ancoraCursor = cursor
      ? await prisma.visita.findFirst({ where: { id: cursor, unidade: { condominioId } }, select: { criadoEm: true } })
      : null;

    const agora = new Date();
    const visitas = await prisma.visita.findMany({
      where: {
        unidade: { condominioId },
        status: status ?? (situacao && { in: [...SITUACOES[situacao]] }),
        // Convite vencido ainda não cancelado pela limpeza não aparece como esperado. Condição positiva
        // (aindaValem), nunca um NOT sobre a vencida: com dataPrevista nula, o SQL dá "desconhecido"
        // na comparação, e NOT de desconhecido continua desconhecido, o que descartaria a linha.
        // AND explícito: o OR do cursor, abaixo, ocupa a chave `OR` do nível de cima.
        ...(status === "AGENDADA" || situacao === "ativas"
          ? { AND: [{ OR: [{ status: { not: "AGENDADA" as const } }, aindaValem(agora)] }] }
          : {}),
        ...(ehMorador(papel) ? { unidadeId: unidadeId! } : {}),
        // Cursor: registros mais antigos que o último recebido (mesma data → desambigua pelo id).
        ...(ancoraCursor && { OR: [
          { criadoEm: { lt: ancoraCursor.criadoEm } },
          { criadoEm: ancoraCursor.criadoEm, id: { lt: cursor! } },
        ]}),
      },
      include: { unidade: true, autorizadoPor: { select: { id: true, nome: true, fotoAtualizadaEm: true } } },
      orderBy: { criadoEm: "desc" },
      take: limite + 1,
    });

    const temMais = visitas.length > limite;
    const itens = temMais ? visitas.slice(0, limite) : visitas;
    const proximoCursor = temMais ? itens[itens.length - 1].id : null;

    // Entrou há mais de 24 h e a saída não foi registrada: a portaria precisa conferir. Não muda o status.
    const limiteSemSaida = agora.getTime() - 24 * 60 * 60 * 1000;
    const comAviso = itens.map((v) => ({
      ...v,
      semSaida: v.status === "EM_ANDAMENTO" && !!v.entradaEm && v.entradaEm.getTime() < limiteSemSaida,
    }));
    const resultado = ehMorador(papel)
      ? comAviso
      : comAviso.map(({ codigoAcesso, ...visita }) => ({ ...visita, temConvite: codigoAcesso !== null }));

    return { itens: resultado, proximoCursor };
  });

  app.post("/visitas", { preHandler: app.autorizar(...PAPEIS_MORADOR) }, async (req, reply) => {
    const dados = agendarSchema.parse(req.body);
    // O dia previsto não pode ter passado (hoje vale, mesmo que a hora já tenha passado).
    if (dados.dataPrevista && dados.dataPrevista < inicioDoDia(new Date())) {
      throw new HttpError(400, "A data prevista não pode ser anterior a hoje");
    }
    const visita = await prisma.visita.create({
      data: { ...dados, unidadeId: req.user.unidadeId!, autorizadoPorId: req.user.sub, codigoAcesso: await codigoLivre() },
    });
    // Autorizar de novo alguém que o morador tinha tirado da lista o traz de volta para ela.
    await prisma.visitanteOculto.deleteMany({
      where: { unidadeId: req.user.unidadeId!, documento: normalizarDocumento(dados.documento) },
    });
    return reply.status(201).send(visita);
  });

  app.post("/visitas/entrada-direta", { preHandler: app.autorizar("PORTEIRO") }, async (req, reply) => {
    const { verificacao, ...dados } = entradaDiretaSchema.parse(req.body);
    if (!(await prisma.unidade.findFirst({ where: { id: dados.unidadeId, condominioId: req.user.condominioId } }))) {
      throw naoEncontrado("Unidade");
    }
    const verificada = await dadosDaVerificacao(req.user, dados.documento, verificacao);
    const visita = await prisma.visita.create({
      data: { ...dados, ...verificada, status: "EM_ANDAMENTO", entradaEm: new Date(), registradoPorId: req.user.sub },
    });
    await renovarPrazoRosto(req.user.condominioId, visita.documento);
    avisarChegada(visita.unidadeId, visita.nomeVisitante);
    return reply.status(201).send(visita);
  });

  app.patch("/visitas/:id/entrada", { preHandler: app.autorizar("PORTEIRO") }, async (req) => {
    const visita = await buscar(req.params, req.user.condominioId);
    if (visita.status !== "AGENDADA") throw new HttpError(409, "Só é possível registrar entrada de visitas agendadas");
    // O convite só vale no dia previsto (sem data, por 30 dias): antes ou depois disso, a entrada é recusada.
    if (venceu(visita)) throw new HttpError(409, `Este convite venceu em ${formatarDia(venceEm(visita))}`);
    if (antesDoDia(visita)) throw new HttpError(409, `Este convite só vale a partir de ${formatarDia(inicioDoDia(visita.dataPrevista!))}`);
    // Duas provas aceitas, e qualquer uma basta: o código do convite (lido do QR code ou digitado) ou o
    // rosto do visitante, quando ele tem rosto cadastrado. O porteiro escolhe qual usar.
    // Visitas antigas, criadas antes do convite existir, não têm código e seguem sem exigência de convite.
    const { codigo, verificacao } = entradaSchema.parse(req.body ?? {});
    // Código errado é recusado sempre, mesmo que venha junto de uma verificação: não deixa usar o
    // convite de outra visita como se fosse este.
    if (codigo !== undefined && visita.codigoAcesso && normalizarCodigo(codigo) !== visita.codigoAcesso) {
      throw new HttpError(400, "Este convite não é desta visita");
    }
    const conviteLido = !!visita.codigoAcesso && codigo !== undefined;
    if (visita.codigoAcesso && !conviteLido && !verificacao) {
      const temRosto = !!visita.documento && !!(await rostoValido(req.user.condominioId, normalizarDocumento(visita.documento)));
      throw new HttpError(
        400,
        temRosto
          ? "Leia o QR code do convite ou confira a biometria do visitante para registrar a entrada"
          : "Leia o QR code do convite (ou digite o código) para registrar a entrada",
      );
    }
    const verificada = await dadosDaVerificacao(req.user, visita.documento, verificacao, { dispensavel: conviteLido });
    const atualizada = await prisma.visita.update({
      where: { id: visita.id },
      data: { ...verificada, status: "EM_ANDAMENTO", entradaEm: new Date(), registradoPorId: req.user.sub },
    });
    await renovarPrazoRosto(req.user.condominioId, visita.documento);
    avisarChegada(visita.unidadeId, visita.nomeVisitante);
    return atualizada;
  });

  app.patch("/visitas/:id/saida", { preHandler: app.autorizar("PORTEIRO") }, async (req) => {
    const visita = await buscar(req.params, req.user.condominioId);
    if (visita.status !== "EM_ANDAMENTO") throw new HttpError(409, "Visitante não está no condomínio");
    return prisma.visita.update({ where: { id: visita.id }, data: { status: "FINALIZADA", saidaEm: new Date() } });
  });

  app.patch("/visitas/:id/cancelar", { preHandler: app.autorizar(...PAPEIS_MORADOR) }, async (req) => {
    const visita = await buscar(req.params, req.user.condominioId);
    if (visita.unidadeId !== req.user.unidadeId) throw proibido();
    if (visita.status !== "AGENDADA") throw new HttpError(409, "Só é possível cancelar visitas agendadas");
    return prisma.visita.update({ where: { id: visita.id }, data: { status: "CANCELADA" } });
  });

  // Visitantes frequentes da unidade: quem ela autorizou nos últimos 90 dias, um por documento, com os
  // dados da visita mais recente. Sai do histórico (não é um cadastro à parte); o morador pode esconder alguém.
  app.get("/visitantes", { preHandler: app.autorizar(...PAPEIS_MORADOR) }, async (req) => {
    const unidadeId = req.user.unidadeId!;
    const desde = new Date(Date.now() - DIAS_VISITANTE_ATIVO * 24 * 60 * 60 * 1000);
    const [visitas, ocultos] = await Promise.all([
      prisma.visita.findMany({
        where: { unidadeId, unidade: { condominioId: req.user.condominioId }, documento: { not: null }, criadoEm: { gte: desde } },
        select: { nomeVisitante: true, documento: true, placaVeiculo: true, criadoEm: true },
        orderBy: { criadoEm: "desc" },
      }),
      prisma.visitanteOculto.findMany({ where: { unidadeId }, select: { documento: true } }),
    ]);
    const escondidos = new Set(ocultos.map((o) => o.documento));
    const porDocumento = new Map<string, { nomeVisitante: string; documento: string; placaVeiculo: string | null; ultimaVisitaEm: Date }>();
    for (const v of visitas) {
      const chave = normalizarDocumento(v.documento!);
      // A primeira de cada documento é a mais recente (a lista vem em ordem decrescente).
      if (!chave || escondidos.has(chave) || porDocumento.has(chave)) continue;
      porDocumento.set(chave, { nomeVisitante: v.nomeVisitante, documento: v.documento!, placaVeiculo: v.placaVeiculo, ultimaVisitaEm: v.criadoEm });
    }
    const itens = [...porDocumento.entries()];
    const comRosto = new Set(
      (
        await prisma.rostoVisitante.findMany({
          where: { condominioId: req.user.condominioId, documento: { in: itens.map(([chave]) => chave) }, ...rostoAindaValido() },
          select: { documento: true },
        })
      ).map((r) => r.documento),
    );
    return itens.map(([chave, v]) => ({ ...v, temRosto: comRosto.has(chave) }));
  });

  // Tira o visitante da lista da própria unidade. Não apaga o histórico nem o rosto cadastrado.
  // O documento vai no corpo, e não na URL, para não aparecer nos logs de acesso (como em /rostos/consulta).
  app.post("/visitantes/ocultar", { preHandler: app.autorizar(...PAPEIS_MORADOR) }, async (req, reply) => {
    const { documento } = z.object({ documento: z.string().min(1) }).parse(req.body);
    const chave = normalizarDocumento(documento);
    if (chave.length < 5) throw new HttpError(400, "Documento inválido");
    await prisma.visitanteOculto.upsert({
      where: { unidadeId_documento: { unidadeId: req.user.unidadeId!, documento: chave } },
      create: { unidadeId: req.user.unidadeId!, documento: chave },
      update: { ocultoEm: new Date() },
    });
    return reply.status(204).send();
  });

  // Convite do visitante: código (para digitar) e QR code em PNG (para compartilhar).
  app.get("/visitas/:id/convite", { preHandler: app.autorizar(...PAPEIS_MORADOR) }, async (req) => {
    const visita = await conviteDoMorador(req.params, req.user.unidadeId, req.user.condominioId);
    return { codigo: visita.codigoAcesso, nomeVisitante: visita.nomeVisitante };
  });

  app.get("/visitas/:id/convite.png", { preHandler: app.autorizar(...PAPEIS_MORADOR) }, async (req, reply) => {
    const visita = await conviteDoMorador(req.params, req.user.unidadeId, req.user.condominioId);
    const png = await gerarCartaoConvite({
      codigo: visita.codigoAcesso!,
      nomeVisitante: visita.nomeVisitante,
      dataPrevista: visita.dataPrevista,
    });
    return reply.header("Content-Type", "image/png").header("Cache-Control", "private, no-store").send(png);
  });

  // Portaria lê o QR code (ou digita o código) e vê os dados da visita antes de liberar.
  app.get("/visitas/codigo/:codigo", { preHandler: app.autorizar("PORTEIRO") }, async (req) => {
    const { codigo } = z.object({ codigo: z.string().min(1) }).parse(req.params);
    const visita = await prisma.visita.findFirst({
      where: { codigoAcesso: normalizarCodigo(codigo), unidade: { condominioId: req.user.condominioId } },
      include: { unidade: true, autorizadoPor: { select: { id: true, nome: true, fotoAtualizadaEm: true } } },
      omit: { codigoAcesso: true },
    });
    if (!visita) throw naoEncontrado("Convite");
    return visita;
  });
}

/** Visita agendada da unidade do morador, garantindo que tenha código (visitas antigas não tinham). */
async function conviteDoMorador(params: unknown, unidadeId: string | null, condominioId: string) {
  const visita = await buscar(params, condominioId);
  if (visita.unidadeId !== unidadeId) throw proibido();
  if (visita.status !== "AGENDADA") throw new HttpError(409, "O convite só vale para visitas agendadas");
  if (visita.codigoAcesso) return visita;
  return prisma.visita.update({ where: { id: visita.id }, data: { codigoAcesso: await codigoLivre() } });
}

/** Gera um código que ainda não está em uso (colisão é rara, mas possível). */
async function codigoLivre() {
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    const codigo = gerarCodigo();
    if (!(await prisma.visita.findUnique({ where: { codigoAcesso: codigo }, select: { id: true } }))) return codigo;
  }
  throw new HttpError(500, "Não foi possível gerar o código do convite");
}

function avisarChegada(unidadeId: string, nomeVisitante: string) {
  notificarUnidade(unidadeId, {
    titulo: "🚪 Visitante no condomínio",
    corpo: `${nomeVisitante} acabou de entrar.`,
    dados: { aba: "Visitas" },
  });
}

async function buscar(params: unknown, condominioId: string) {
  const { id } = idParam.parse(params);
  const visita = await prisma.visita.findFirst({ where: { id, unidade: { condominioId } } });
  if (!visita) throw naoEncontrado("Visita", "f");
  return visita;
}

const formatarDia = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: FUSO });

/** Rosto ainda dentro do prazo (mesma regra de rostoValido, para várias consultas de uma vez). */
const rostoAindaValido = () => ({ ultimaVisitaEm: { gte: limiteValidade() } });
