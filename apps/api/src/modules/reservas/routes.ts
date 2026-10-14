import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { HttpError, naoEncontrado, proibido } from "../../lib/errors.js";

const reservaSchema = z
  .object({
    areaId: z.uuid(),
    inicio: z.coerce.date(),
    fim: z.coerce.date(),
  })
  .refine((r) => r.fim > r.inicio, { message: "O fim deve ser depois do início", path: ["fim"] });

const filtroSchema = z.object({
  areaId: z.uuid().optional(),
  de: z.coerce.date().optional(),
  ate: z.coerce.date().optional(),
});

const idParam = z.object({ id: z.uuid() });

export async function reservasRoutes(app: FastifyInstance) {
  app.get("/areas", { preHandler: app.autorizar() }, async () =>
    prisma.areaComum.findMany({ where: { ativa: true }, orderBy: { nome: "asc" } }),
  );

  // Todos veem as reservas confirmadas para saber a disponibilidade das áreas.
  app.get("/reservas", { preHandler: app.autorizar() }, async (req) => {
    const { areaId, de, ate } = filtroSchema.parse(req.query);
    return prisma.reserva.findMany({
      where: {
        status: "CONFIRMADA",
        areaId,
        ...(de && { fim: { gt: de } }),
        ...(ate && { inicio: { lt: ate } }),
      },
      include: { area: true, unidade: true },
      orderBy: { inicio: "asc" },
    });
  });

  app.post("/reservas", { preHandler: app.autorizar("MORADOR") }, async (req, reply) => {
    const { areaId, inicio, fim } = reservaSchema.parse(req.body);
    if (inicio < new Date()) throw new HttpError(400, "Não é possível reservar no passado");

    const area = await prisma.areaComum.findUnique({ where: { id: areaId } });
    if (!area || !area.ativa) throw naoEncontrado("Área comum");

    // Dois intervalos se sobrepõem quando um começa antes do outro terminar.
    // Obs.: verificação simples, sem lock — duas requisições simultâneas podem passar.
    const conflito = await prisma.reserva.findFirst({
      where: { areaId, status: "CONFIRMADA", inicio: { lt: fim }, fim: { gt: inicio } },
    });
    if (conflito) throw new HttpError(409, "Horário indisponível para esta área");

    const reserva = await prisma.reserva.create({
      data: { areaId, inicio, fim, unidadeId: req.user.unidadeId!, usuarioId: req.user.sub },
    });
    return reply.status(201).send(reserva);
  });

  app.patch("/reservas/:id/cancelar", { preHandler: app.autorizar("MORADOR", "SINDICO") }, async (req) => {
    const { id } = idParam.parse(req.params);
    const reserva = await prisma.reserva.findUnique({ where: { id } });
    if (!reserva) throw naoEncontrado("Reserva");
    if (req.user.papel === "MORADOR" && reserva.unidadeId !== req.user.unidadeId) throw proibido();
    if (reserva.status === "CANCELADA") throw new HttpError(409, "Reserva já cancelada");
    return prisma.reserva.update({ where: { id }, data: { status: "CANCELADA" } });
  });
}
