import type { FastifyInstance } from "fastify";
import type { StatusReserva } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { HttpError, naoEncontrado, proibido } from "../../lib/errors.js";
import { notificarPapel, notificarUnidade } from "../../lib/push.js";

/** Reservas nesses status seguram o horário: ninguém mais pode pedir o mesmo intervalo. */
const OCUPAM_HORARIO: StatusReserva[] = ["PENDENTE", "CONFIRMADA"];

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
  /** Sem status: devolve as que ocupam horário (pendentes e confirmadas). */
  status: z.enum(["PENDENTE", "CONFIRMADA", "RECUSADA", "CANCELADA"]).optional(),
});

const recusaSchema = z.object({ motivo: z.string().trim().max(300).optional() });

const idParam = z.object({ id: z.uuid() });

const incluir = { area: true, unidade: true } as const;

const dataHora = (d: Date) =>
  d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

export async function reservasRoutes(app: FastifyInstance) {
  app.get("/areas", { preHandler: app.autorizar() }, async () =>
    prisma.areaComum.findMany({ where: { ativa: true }, orderBy: { nome: "asc" } }),
  );

  // Todos veem as reservas que ocupam horário, para saber a disponibilidade das áreas.
  app.get("/reservas", { preHandler: app.autorizar() }, async (req) => {
    const { areaId, de, ate, status } = filtroSchema.parse(req.query);
    return prisma.reserva.findMany({
      where: {
        status: status ?? { in: OCUPAM_HORARIO },
        areaId,
        ...(de && { fim: { gt: de } }),
        ...(ate && { inicio: { lt: ate } }),
      },
      include: incluir,
      orderBy: { inicio: "asc" },
    });
  });

  // Reservas futuras da unidade do morador, em qualquer situação exceto canceladas.
  app.get("/reservas/minhas", { preHandler: app.autorizar("MORADOR") }, async (req) =>
    prisma.reserva.findMany({
      where: { unidadeId: req.user.unidadeId!, fim: { gt: new Date() }, status: { not: "CANCELADA" } },
      include: incluir,
      orderBy: { inicio: "asc" },
    }),
  );

  app.post("/reservas", { preHandler: app.autorizar("MORADOR") }, async (req, reply) => {
    const { areaId, inicio, fim } = reservaSchema.parse(req.body);
    if (inicio < new Date()) throw new HttpError(400, "Não é possível reservar no passado");

    const area = await prisma.areaComum.findUnique({ where: { id: areaId } });
    if (!area || !area.ativa) throw naoEncontrado("Área comum");

    // Dois intervalos se sobrepõem quando um começa antes do outro terminar.
    // Obs.: verificação simples, sem lock — duas requisições simultâneas podem passar.
    const conflito = await prisma.reserva.findFirst({
      where: { areaId, status: { in: OCUPAM_HORARIO }, inicio: { lt: fim }, fim: { gt: inicio } },
    });
    if (conflito) throw new HttpError(409, "Horário indisponível para esta área");

    const reserva = await prisma.reserva.create({
      data: { areaId, inicio, fim, unidadeId: req.user.unidadeId!, usuarioId: req.user.sub },
      include: incluir,
    });
    notificarPapel("SINDICO", {
      titulo: "📅 Reserva aguardando aprovação",
      corpo: `${area.nome} · ${dataHora(inicio)} · Bloco ${reserva.unidade.bloco}-${reserva.unidade.numero}`,
      dados: { aba: "Reservas" },
    });
    return reply.status(201).send(reserva);
  });

  app.patch("/reservas/:id/aprovar", { preHandler: app.autorizar("SINDICO") }, async (req) => {
    const reserva = await buscarPendente(req.params);
    const aprovada = await prisma.reserva.update({
      where: { id: reserva.id },
      data: { status: "CONFIRMADA", decididaEm: new Date() },
      include: incluir,
    });
    notificarUnidade(reserva.unidadeId, {
      titulo: "✅ Reserva aprovada",
      corpo: `${aprovada.area.nome} · ${dataHora(aprovada.inicio)}`,
      dados: { aba: "Reservas" },
    });
    return aprovada;
  });

  app.patch("/reservas/:id/recusar", { preHandler: app.autorizar("SINDICO") }, async (req) => {
    const reserva = await buscarPendente(req.params);
    const { motivo } = recusaSchema.parse(req.body ?? {});
    const recusada = await prisma.reserva.update({
      where: { id: reserva.id },
      data: { status: "RECUSADA", decididaEm: new Date(), motivoRecusa: motivo || null },
      include: incluir,
    });
    notificarUnidade(reserva.unidadeId, {
      titulo: "❌ Reserva recusada",
      corpo: `${recusada.area.nome} · ${dataHora(recusada.inicio)}${motivo ? ` — ${motivo}` : ""}`,
      dados: { aba: "Reservas" },
    });
    return recusada;
  });

  app.patch("/reservas/:id/cancelar", { preHandler: app.autorizar("MORADOR", "SINDICO") }, async (req) => {
    const { id } = idParam.parse(req.params);
    const reserva = await prisma.reserva.findUnique({ where: { id } });
    if (!reserva) throw naoEncontrado("Reserva");
    if (req.user.papel === "MORADOR" && reserva.unidadeId !== req.user.unidadeId) throw proibido();
    if (!OCUPAM_HORARIO.includes(reserva.status)) throw new HttpError(409, "Só é possível cancelar reservas pendentes ou confirmadas");
    const cancelada = await prisma.reserva.update({ where: { id }, data: { status: "CANCELADA" }, include: incluir });
    if (req.user.papel === "SINDICO") {
      notificarUnidade(reserva.unidadeId, {
        titulo: "Reserva cancelada pelo síndico",
        corpo: `${cancelada.area.nome} · ${dataHora(cancelada.inicio)}`,
        dados: { aba: "Reservas" },
      });
    }
    return cancelada;
  });
}

async function buscarPendente(params: unknown) {
  const { id } = idParam.parse(params);
  const reserva = await prisma.reserva.findUnique({ where: { id } });
  if (!reserva) throw naoEncontrado("Reserva");
  if (reserva.status !== "PENDENTE") throw new HttpError(409, "Esta reserva já foi analisada");
  return reserva;
}
