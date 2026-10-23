import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { HttpError, naoEncontrado } from "../../lib/errors.js";
import { notificarUnidade } from "../../lib/push.js";

const PAGE_SIZE = 20;

const registrarSchema = z.object({
  unidadeId: z.uuid(),
  descricao: z.string().min(2),
  remetente: z.string().optional(),
});

const retirarSchema = z.object({ retiradaPor: z.string().min(2) });

const filtroSchema = z.object({
  status: z.enum(["AGUARDANDO_RETIRADA", "RETIRADA"]).optional(),
  limite: z.coerce.number().int().min(1).max(100).default(PAGE_SIZE),
  /** ID da última encomenda recebida; omitir para a primeira página. */
  cursor: z.uuid().optional(),
});

const idParam = z.object({ id: z.uuid() });

export async function encomendasRoutes(app: FastifyInstance) {
  app.get("/encomendas", { preHandler: app.autorizar() }, async (req) => {
    const { status, limite, cursor } = filtroSchema.parse(req.query);
    const { papel, unidadeId } = req.user;

    // Encomendas retiradas ordenam por retiradaEm; aguardando por recebidaEm.
    const ordenarPor = status === "RETIRADA" ? "retiradaEm" : "recebidaEm";

    const ancoraCursor = cursor
      ? await prisma.encomenda.findUnique({ where: { id: cursor }, select: { [ordenarPor]: true } })
      : null;
    const dataAncora = ancoraCursor ? (ancoraCursor as Record<string, Date | null>)[ordenarPor] : null;

    const encomendas = await prisma.encomenda.findMany({
      where: {
        status,
        ...(papel === "MORADOR" ? { unidadeId: unidadeId! } : {}),
        ...(dataAncora && { OR: [
          { [ordenarPor]: { lt: dataAncora } },
          { [ordenarPor]: dataAncora, id: { lt: cursor! } },
        ]}),
      },
      include: { unidade: true },
      orderBy: [{ [ordenarPor]: "desc" }, { id: "desc" }],
      take: limite + 1,
    });

    const temMais = encomendas.length > limite;
    const itens = temMais ? encomendas.slice(0, limite) : encomendas;
    return { itens, proximoCursor: temMais ? itens[itens.length - 1].id : null };
  });

  app.post("/encomendas", { preHandler: app.autorizar("PORTEIRO", "SINDICO") }, async (req, reply) => {
    const dados = registrarSchema.parse(req.body);
    const encomenda = await prisma.encomenda.create({ data: { ...dados, recebidaPorId: req.user.sub } });
    notificarUnidade(dados.unidadeId, {
      titulo: "📦 Encomenda na portaria",
      corpo: dados.remetente ? `${dados.descricao} (${dados.remetente})` : dados.descricao,
      dados: { aba: "Encomendas" },
    });
    return reply.status(201).send(encomenda);
  });

  app.patch("/encomendas/:id/retirada", { preHandler: app.autorizar("PORTEIRO", "SINDICO") }, async (req) => {
    const { id } = idParam.parse(req.params);
    const { retiradaPor } = retirarSchema.parse(req.body);
    const encomenda = await prisma.encomenda.findUnique({ where: { id } });
    if (!encomenda) throw naoEncontrado("Encomenda");
    if (encomenda.status === "RETIRADA") throw new HttpError(409, "Encomenda já retirada");
    return prisma.encomenda.update({
      where: { id },
      data: { status: "RETIRADA", retiradaEm: new Date(), retiradaPor },
    });
  });
}
