import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { HttpError, naoEncontrado, proibido } from "../../lib/errors.js";
import { ehJpeg } from "../../lib/imagem.js";
import { limitar } from "../../lib/limites.js";
import { enviarPush, notificarUnidade } from "../../lib/push.js";
import { StorageNaoConfiguradoError, deletarFotoChat, downloadFotoChat, uploadFotoChat } from "../../lib/storage.js";
import { naoLidas } from "./regras.js";

/** Mesmo limite da foto de perfil: o app já envia a imagem reduzida. */
const TAMANHO_MAXIMO_FOTO = 500 * 1024;
const TAMANHO_MAXIMO_TEXTO = 1000;
const PAGINA = 30;

const envioSchema = z
  .object({
    texto: z.string().trim().max(TAMANHO_MAXIMO_TEXTO, `A mensagem pode ter até ${TAMANHO_MAXIMO_TEXTO} caracteres`).optional(),
    foto: z.base64("Foto inválida").optional(),
  })
  .refine((m) => !!m.texto || !!m.foto, { message: "Escreva uma mensagem ou envie uma foto" });

const listaSchema = z.object({
  /** Página seguinte (mensagens mais antigas que esta). */
  antesDe: z.uuid().optional(),
  /** Polling: só as mensagens mais novas que esta. */
  depoisDe: z.uuid().optional(),
});

const unidadeParam = z.object({ unidadeId: z.uuid() });
const mensagemParam = z.object({ id: z.uuid() });

type Lado = "MORADOR" | "PORTARIA";

/** Portaria e síndico respondem como "a portaria". */
const ladoDe = (papel: string): Lado => (papel === "MORADOR" ? "MORADOR" : "PORTARIA");

const selecaoMensagem = {
  id: true,
  lado: true,
  texto: true,
  temFoto: true,
  criadaEm: true,
  autor: { select: { id: true, nome: true, fotoAtualizadaEm: true } },
} as const;

/**
 * Chat entre a portaria e cada unidade. A conversa é a unidade: todos os moradores dela e toda a
 * portaria (porteiros e síndico) veem as mesmas mensagens. Sem tempo real: o app busca as novas
 * (`depoisDe`) com a conversa aberta, e o outro lado recebe um push a cada mensagem.
 */
export async function chatRoutes(app: FastifyInstance) {
  // --- Morador: a conversa da própria unidade -------------------------------------------------
  app.get("/chat/mensagens", { preHandler: app.autorizar("MORADOR") }, async (req) => {
    const unidadeId = await unidadeDoMorador(req);
    return listar(unidadeId, listaSchema.parse(req.query));
  });

  app.post("/chat/mensagens", { preHandler: app.autorizar("MORADOR"), config: limitar(30) }, async (req, reply) => {
    const unidadeId = await unidadeDoMorador(req);
    return reply.status(201).send(await enviar(req, unidadeId));
  });

  // --- Portaria e síndico: todas as conversas do condomínio -----------------------------------
  app.get("/chat/conversas", { preHandler: app.autorizar("PORTEIRO", "SINDICO") }, async (req) => {
    const { condominioId, sub } = req.user;
    // Última mensagem de cada unidade que já conversou, mais recentes primeiro.
    const ultimas = await prisma.mensagemChat.findMany({
      where: { unidade: { condominioId } },
      distinct: ["unidadeId"],
      orderBy: [{ unidadeId: "asc" }, { criadaEm: "desc" }],
      select: { ...selecaoMensagem, unidade: { select: { id: true, bloco: true, numero: true } } },
    });
    const conversas = await Promise.all(
      ultimas.map(async (m) => ({
        unidade: m.unidade,
        ultima: { id: m.id, lado: m.lado, texto: m.texto, temFoto: m.temFoto, criadaEm: m.criadaEm, autor: m.autor },
        naoLidas: await naoLidas(sub, m.unidade.id, "PORTARIA"),
      })),
    );
    return conversas.sort((a, b) => b.ultima.criadaEm.getTime() - a.ultima.criadaEm.getTime());
  });

  app.get("/chat/conversas/:unidadeId/mensagens", { preHandler: app.autorizar("PORTEIRO", "SINDICO") }, async (req) => {
    const unidadeId = await unidadeDoCondominio(req);
    return listar(unidadeId, listaSchema.parse(req.query));
  });

  app.post(
    "/chat/conversas/:unidadeId/mensagens",
    { preHandler: app.autorizar("PORTEIRO", "SINDICO"), config: limitar(30) },
    async (req, reply) => {
      const unidadeId = await unidadeDoCondominio(req);
      return reply.status(201).send(await enviar(req, unidadeId));
    },
  );

  // --- Comum --------------------------------------------------------------------------------
  // Marca a conversa como lida até agora. O morador marca a da própria unidade; a portaria informa qual.
  app.post("/chat/lida", { preHandler: app.autorizar("MORADOR", "PORTEIRO", "SINDICO") }, async (req, reply) => {
    const unidadeId =
      req.user.papel === "MORADOR"
        ? await unidadeDoMorador(req)
        : await unidadeDoCondominioPorId(z.object({ unidadeId: z.uuid() }).parse(req.body).unidadeId, req.user.condominioId);
    const agora = new Date();
    await prisma.leituraChat.upsert({
      where: { usuarioId_unidadeId: { usuarioId: req.user.sub, unidadeId } },
      create: { usuarioId: req.user.sub, unidadeId, lidaEm: agora },
      update: { lidaEm: agora },
    });
    return reply.status(204).send();
  });

  // A foto só é servida a quem participa da conversa, pela API, e nunca fica em cache público.
  app.get("/chat/mensagens/:id/foto", { preHandler: app.autorizar("MORADOR", "PORTEIRO", "SINDICO") }, async (req, reply) => {
    const { id } = mensagemParam.parse(req.params);
    const mensagem = await prisma.mensagemChat.findFirst({
      where: { id, temFoto: true, unidade: { condominioId: req.user.condominioId } },
      select: { unidadeId: true },
    });
    if (!mensagem) throw naoEncontrado("Foto", "f");
    if (req.user.papel === "MORADOR" && mensagem.unidadeId !== (await unidadeDoMorador(req))) throw proibido();
    const bytes = await comStorage(() => downloadFotoChat(mensagem.unidadeId, id));
    if (!bytes) throw naoEncontrado("Foto", "f");
    return reply.header("Content-Type", "image/jpeg").header("Cache-Control", "private, max-age=86400").send(bytes);
  });
}

/**
 * Unidade do morador lida do banco, e não do token: se o síndico mudou o morador de unidade, o
 * token antigo ainda traria a anterior.
 */
async function unidadeDoMorador(req: FastifyRequest) {
  const usuario = await prisma.usuario.findUnique({ where: { id: req.user.sub }, select: { unidadeId: true } });
  if (!usuario?.unidadeId) throw new HttpError(409, "Sua conta ainda não tem uma unidade");
  return usuario.unidadeId;
}

async function unidadeDoCondominio(req: FastifyRequest) {
  const { unidadeId } = unidadeParam.parse(req.params);
  return unidadeDoCondominioPorId(unidadeId, req.user.condominioId);
}

async function unidadeDoCondominioPorId(unidadeId: string, condominioId: string) {
  const unidade = await prisma.unidade.findFirst({ where: { id: unidadeId, condominioId }, select: { id: true } });
  if (!unidade) throw naoEncontrado("Unidade", "f");
  return unidade.id;
}

/** Mensagens da conversa, das mais novas para as mais antigas. Com `depoisDe`, só as mais novas que ela. */
async function listar(unidadeId: string, { antesDe, depoisDe }: z.infer<typeof listaSchema>) {
  const ancora = antesDe ?? depoisDe;
  const referencia = ancora
    ? await prisma.mensagemChat.findFirst({ where: { id: ancora, unidadeId }, select: { criadaEm: true } })
    : null;
  if (ancora && !referencia) throw naoEncontrado("Mensagem", "f");

  const mensagens = await prisma.mensagemChat.findMany({
    where: {
      unidadeId,
      ...(referencia && antesDe && { criadaEm: { lt: referencia.criadaEm } }),
      ...(referencia && depoisDe && { criadaEm: { gt: referencia.criadaEm } }),
    },
    select: selecaoMensagem,
    orderBy: [{ criadaEm: "desc" }, { id: "desc" }],
    take: depoisDe ? undefined : PAGINA + 1,
  });
  if (depoisDe) return { itens: mensagens, proximoCursor: null };
  const temMais = mensagens.length > PAGINA;
  const itens = temMais ? mensagens.slice(0, PAGINA) : mensagens;
  return { itens, proximoCursor: temMais ? itens[itens.length - 1].id : null };
}

/** Grava a mensagem (e a foto) e avisa o outro lado por push. */
async function enviar(req: FastifyRequest, unidadeId: string) {
  const { texto, foto } = envioSchema.parse(req.body);
  const bytes = foto ? Buffer.from(foto, "base64") : null;
  if (bytes && !ehJpeg(bytes)) throw new HttpError(400, "A foto deve ser uma imagem JPEG");
  if (bytes && bytes.length > TAMANHO_MAXIMO_FOTO) throw new HttpError(400, "A foto deve ter no máximo 500 KB");

  const lado = ladoDe(req.user.papel);
  const mensagem = await prisma.mensagemChat.create({
    data: { unidadeId, autorId: req.user.sub, lado, texto: texto || null, temFoto: !!bytes },
    select: { ...selecaoMensagem, unidade: { select: { bloco: true, numero: true } } },
  });
  if (bytes) {
    try {
      await comStorage(() => uploadFotoChat(unidadeId, mensagem.id, bytes));
    } catch (e) {
      // Sem a foto, a mensagem não deve ficar dizendo que tem uma.
      await prisma.mensagemChat.delete({ where: { id: mensagem.id } }).catch(() => {});
      await deletarFotoChat(unidadeId, mensagem.id).catch(() => {});
      throw e;
    }
  }
  // Quem enviou já leu até aqui.
  await prisma.leituraChat.upsert({
    where: { usuarioId_unidadeId: { usuarioId: req.user.sub, unidadeId } },
    create: { usuarioId: req.user.sub, unidadeId, lidaEm: mensagem.criadaEm },
    update: { lidaEm: mensagem.criadaEm },
  });

  avisar(req.user.condominioId, unidadeId, lado, mensagem.autor.nome, mensagem.unidade, texto ?? null, !!bytes);
  const { unidade: _unidade, ...resposta } = mensagem;
  return resposta;
}

/** Push para o outro lado. Corpo curto e sem a foto: a conversa completa fica no app. */
function avisar(
  condominioId: string,
  unidadeId: string,
  lado: Lado,
  autor: string,
  unidade: { bloco: string; numero: string },
  texto: string | null,
  comFoto: boolean,
) {
  const previa = texto ? (texto.length > 100 ? `${texto.slice(0, 97)}…` : texto) : comFoto ? "📷 Foto" : "";
  const dados = { aba: "Chat", unidadeId };
  if (lado === "MORADOR") {
    void prisma.usuario
      .findMany({ where: { condominioId, ativo: true, papel: { in: ["PORTEIRO", "SINDICO"] } }, select: { id: true } })
      .then((portaria) =>
        enviarPush(portaria.map((u) => u.id), { titulo: `💬 Bloco ${unidade.bloco}-${unidade.numero} · ${autor}`, corpo: previa, dados }),
      )
      .catch((erro) => console.error("[chat] Falha ao avisar a portaria", erro));
  } else {
    notificarUnidade(unidadeId, { titulo: "💬 Portaria", corpo: previa, dados });
  }
}

/** Traduz a falta de configuração do storage em 503, como nas rotas de foto. */
async function comStorage<T>(operacao: () => Promise<T>): Promise<T> {
  try {
    return await operacao();
  } catch (e) {
    if (e instanceof StorageNaoConfiguradoError) throw new HttpError(503, e.message);
    throw e;
  }
}
