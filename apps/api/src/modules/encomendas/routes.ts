import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { HttpError, naoEncontrado } from "../../lib/errors.js";

const registrarSchema = z.object({
  unidadeId: z.uuid(),
  descricao: z.string().min(2),
  remetente: z.string().optional(),
});

const retirarSchema = z.object({ retiradaPor: z.string().min(2) });

const filtroSchema = z.object({ status: z.enum(["AGUARDANDO_RETIRADA", "RETIRADA"]).optional() });

const idParam = z.object({ id: z.uuid() });

export async function encomendasRoutes(app: FastifyInstance) {
  app.get("/encomendas", { preHandler: app.autorizar() }, async (req) => {
    const { status } = filtroSchema.parse(req.query);
    const { papel, unidadeId } = req.user;
    return prisma.encomenda.findMany({
      where: { status, ...(papel === "MORADOR" ? { unidadeId: unidadeId! } : {}) },
      include: { unidade: true },
      orderBy: { recebidaEm: "desc" },
    });
  });

  app.post("/encomendas", { preHandler: app.autorizar("PORTEIRO", "SINDICO") }, async (req, reply) => {
    const dados = registrarSchema.parse(req.body);
    const encomenda = await prisma.encomenda.create({ data: { ...dados, recebidaPorId: req.user.sub } });
    // TODO: enviar notificação push ao(s) morador(es) da unidade.
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
