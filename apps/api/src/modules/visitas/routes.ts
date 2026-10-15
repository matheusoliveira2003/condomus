import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { HttpError, naoEncontrado, proibido } from "../../lib/errors.js";
import { notificarUnidade } from "../../lib/push.js";

const agendarSchema = z.object({
  nomeVisitante: z.string().min(2),
  documento: z.string().optional(),
  placaVeiculo: z.string().optional(),
  dataPrevista: z.coerce.date().optional(),
  observacao: z.string().optional(),
});

/** Portaria registrando um visitante sem pré-autorização (entrada imediata). */
const entradaDiretaSchema = agendarSchema.extend({ unidadeId: z.uuid() });

const filtroSchema = z.object({
  status: z.enum(["AGENDADA", "EM_ANDAMENTO", "FINALIZADA", "CANCELADA"]).optional(),
});

const idParam = z.object({ id: z.uuid() });

export async function visitasRoutes(app: FastifyInstance) {
  // Morador vê as visitas da própria unidade; portaria e síndico veem todas.
  app.get("/visitas", { preHandler: app.autorizar() }, async (req) => {
    const { status } = filtroSchema.parse(req.query);
    const { papel, unidadeId } = req.user;
    return prisma.visita.findMany({
      where: { status, ...(papel === "MORADOR" ? { unidadeId: unidadeId! } : {}) },
      include: { unidade: true },
      orderBy: { criadoEm: "desc" },
    });
  });

  app.post("/visitas", { preHandler: app.autorizar("MORADOR") }, async (req, reply) => {
    const dados = agendarSchema.parse(req.body);
    const visita = await prisma.visita.create({
      data: { ...dados, unidadeId: req.user.unidadeId!, autorizadoPorId: req.user.sub },
    });
    return reply.status(201).send(visita);
  });

  app.post("/visitas/entrada-direta", { preHandler: app.autorizar("PORTEIRO", "SINDICO") }, async (req, reply) => {
    const dados = entradaDiretaSchema.parse(req.body);
    const visita = await prisma.visita.create({
      data: { ...dados, status: "EM_ANDAMENTO", entradaEm: new Date(), registradoPorId: req.user.sub },
    });
    avisarChegada(visita.unidadeId, visita.nomeVisitante);
    return reply.status(201).send(visita);
  });

  app.patch("/visitas/:id/entrada", { preHandler: app.autorizar("PORTEIRO", "SINDICO") }, async (req) => {
    const visita = await buscar(req.params);
    if (visita.status !== "AGENDADA") throw new HttpError(409, "Só é possível registrar entrada de visitas agendadas");
    const atualizada = await prisma.visita.update({
      where: { id: visita.id },
      data: { status: "EM_ANDAMENTO", entradaEm: new Date(), registradoPorId: req.user.sub },
    });
    avisarChegada(visita.unidadeId, visita.nomeVisitante);
    return atualizada;
  });

  app.patch("/visitas/:id/saida", { preHandler: app.autorizar("PORTEIRO", "SINDICO") }, async (req) => {
    const visita = await buscar(req.params);
    if (visita.status !== "EM_ANDAMENTO") throw new HttpError(409, "Visitante não está no condomínio");
    return prisma.visita.update({ where: { id: visita.id }, data: { status: "FINALIZADA", saidaEm: new Date() } });
  });

  app.patch("/visitas/:id/cancelar", { preHandler: app.autorizar("MORADOR") }, async (req) => {
    const visita = await buscar(req.params);
    if (visita.unidadeId !== req.user.unidadeId) throw proibido();
    if (visita.status !== "AGENDADA") throw new HttpError(409, "Só é possível cancelar visitas agendadas");
    return prisma.visita.update({ where: { id: visita.id }, data: { status: "CANCELADA" } });
  });
}

function avisarChegada(unidadeId: string, nomeVisitante: string) {
  notificarUnidade(unidadeId, {
    titulo: "🚪 Visitante no condomínio",
    corpo: `${nomeVisitante} acabou de entrar.`,
    dados: { aba: "Visitas" },
  });
}

async function buscar(params: unknown) {
  const { id } = idParam.parse(params);
  const visita = await prisma.visita.findUnique({ where: { id } });
  if (!visita) throw naoEncontrado("Visita");
  return visita;
}
