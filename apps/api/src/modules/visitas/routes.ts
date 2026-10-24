import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { HttpError, naoEncontrado, proibido } from "../../lib/errors.js";
import { notificarUnidade } from "../../lib/push.js";
import { gerarCodigo, normalizarCodigo } from "../../lib/codigo.js";
import { gerarCartaoConvite } from "../../lib/cartaoConvite.js";

const agendarSchema = z.object({
  nomeVisitante: z.string().min(2),
  documento: z.string().optional(),
  placaVeiculo: z.string().optional(),
  dataPrevista: z.coerce.date().optional(),
  observacao: z.string().optional(),
});

/** Portaria registrando um visitante sem pré-autorização (entrada imediata). */
const entradaDiretaSchema = agendarSchema.extend({ unidadeId: z.uuid() });

/** Agrupamentos de status usados pelo app: visitas em aberto ou já encerradas. */
const SITUACOES = {
  ativas: ["AGENDADA", "EM_ANDAMENTO"],
  historico: ["FINALIZADA", "CANCELADA"],
} as const;

const PAGE_SIZE = 20;

const filtroSchema = z.object({
  status: z.enum(["AGENDADA", "EM_ANDAMENTO", "FINALIZADA", "CANCELADA"]).optional(),
  situacao: z.enum(["ativas", "historico"]).optional(),
  limite: z.coerce.number().int().min(1).max(100).default(PAGE_SIZE),
  /** ID da última visita recebida; omitir para a primeira página. */
  cursor: z.uuid().optional(),
});

const idParam = z.object({ id: z.uuid() });

const entradaSchema = z.object({ codigo: z.string().optional() });

export async function visitasRoutes(app: FastifyInstance) {
  // Morador vê as visitas da própria unidade; portaria e síndico veem todas.
  app.get("/visitas", { preHandler: app.autorizar() }, async (req) => {
    const { status, situacao, limite, cursor } = filtroSchema.parse(req.query);
    const { papel, unidadeId, condominioId } = req.user;

    // Paginação por cursor: busca `limite + 1` itens para saber se há próxima página.
    const ancoraCursor = cursor
      ? await prisma.visita.findFirst({ where: { id: cursor, unidade: { condominioId } }, select: { criadoEm: true } })
      : null;

    const visitas = await prisma.visita.findMany({
      where: {
        unidade: { condominioId },
        status: status ?? (situacao && { in: [...SITUACOES[situacao]] }),
        ...(papel === "MORADOR" ? { unidadeId: unidadeId! } : {}),
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

    const resultado = papel === "MORADOR"
      ? itens
      : itens.map(({ codigoAcesso, ...visita }) => ({ ...visita, temConvite: codigoAcesso !== null }));

    return { itens: resultado, proximoCursor };
  });

  app.post("/visitas", { preHandler: app.autorizar("MORADOR") }, async (req, reply) => {
    const dados = agendarSchema.parse(req.body);
    const visita = await prisma.visita.create({
      data: { ...dados, unidadeId: req.user.unidadeId!, autorizadoPorId: req.user.sub, codigoAcesso: await codigoLivre() },
    });
    return reply.status(201).send(visita);
  });

  app.post("/visitas/entrada-direta", { preHandler: app.autorizar("PORTEIRO", "SINDICO") }, async (req, reply) => {
    const dados = entradaDiretaSchema.parse(req.body);
    if (!(await prisma.unidade.findFirst({ where: { id: dados.unidadeId, condominioId: req.user.condominioId } }))) {
      throw naoEncontrado("Unidade");
    }
    const visita = await prisma.visita.create({
      data: { ...dados, status: "EM_ANDAMENTO", entradaEm: new Date(), registradoPorId: req.user.sub },
    });
    avisarChegada(visita.unidadeId, visita.nomeVisitante);
    return reply.status(201).send(visita);
  });

  app.patch("/visitas/:id/entrada", { preHandler: app.autorizar("PORTEIRO", "SINDICO") }, async (req) => {
    const visita = await buscar(req.params, req.user.condominioId);
    if (visita.status !== "AGENDADA") throw new HttpError(409, "Só é possível registrar entrada de visitas agendadas");
    // Visita com convite só entra com o código dele (lido do QR code ou digitado).
    // Visitas antigas, criadas antes do convite existir, não têm código e seguem sem exigência.
    if (visita.codigoAcesso) {
      const { codigo } = entradaSchema.parse(req.body ?? {});
      if (!codigo) throw new HttpError(400, "Leia o QR code do convite (ou digite o código) para registrar a entrada");
      if (normalizarCodigo(codigo) !== visita.codigoAcesso) throw new HttpError(400, "Este convite não é desta visita");
    }
    const atualizada = await prisma.visita.update({
      where: { id: visita.id },
      data: { status: "EM_ANDAMENTO", entradaEm: new Date(), registradoPorId: req.user.sub },
    });
    avisarChegada(visita.unidadeId, visita.nomeVisitante);
    return atualizada;
  });

  app.patch("/visitas/:id/saida", { preHandler: app.autorizar("PORTEIRO", "SINDICO") }, async (req) => {
    const visita = await buscar(req.params, req.user.condominioId);
    if (visita.status !== "EM_ANDAMENTO") throw new HttpError(409, "Visitante não está no condomínio");
    return prisma.visita.update({ where: { id: visita.id }, data: { status: "FINALIZADA", saidaEm: new Date() } });
  });

  app.patch("/visitas/:id/cancelar", { preHandler: app.autorizar("MORADOR") }, async (req) => {
    const visita = await buscar(req.params, req.user.condominioId);
    if (visita.unidadeId !== req.user.unidadeId) throw proibido();
    if (visita.status !== "AGENDADA") throw new HttpError(409, "Só é possível cancelar visitas agendadas");
    return prisma.visita.update({ where: { id: visita.id }, data: { status: "CANCELADA" } });
  });

  // Convite do visitante: código (para digitar) e QR code em PNG (para compartilhar).
  app.get("/visitas/:id/convite", { preHandler: app.autorizar("MORADOR") }, async (req) => {
    const visita = await conviteDoMorador(req.params, req.user.unidadeId, req.user.condominioId);
    return { codigo: visita.codigoAcesso, nomeVisitante: visita.nomeVisitante };
  });

  app.get("/visitas/:id/convite.png", { preHandler: app.autorizar("MORADOR") }, async (req, reply) => {
    const visita = await conviteDoMorador(req.params, req.user.unidadeId, req.user.condominioId);
    const png = await gerarCartaoConvite({
      codigo: visita.codigoAcesso!,
      nomeVisitante: visita.nomeVisitante,
      dataPrevista: visita.dataPrevista,
    });
    return reply.header("Content-Type", "image/png").header("Cache-Control", "private, no-store").send(png);
  });

  // Portaria lê o QR code (ou digita o código) e vê os dados da visita antes de liberar.
  app.get("/visitas/codigo/:codigo", { preHandler: app.autorizar("PORTEIRO", "SINDICO") }, async (req) => {
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
  if (!visita) throw naoEncontrado("Visita");
  return visita;
}
