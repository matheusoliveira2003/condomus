import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { naoEncontrado } from "../../lib/errors.js";
import { notificarTodos } from "../../lib/push.js";

const avisoSchema = z.object({
  titulo: z.string().min(3),
  conteudo: z.string().min(1),
  fixado: z.boolean().optional(),
});

const idParam = z.object({ id: z.uuid() });

export async function avisosRoutes(app: FastifyInstance) {
  app.get("/avisos", { preHandler: app.autorizar() }, async () =>
    prisma.aviso.findMany({
      include: { autor: { select: { nome: true } } },
      orderBy: [{ fixado: "desc" }, { criadoEm: "desc" }],
    }),
  );

  app.post("/avisos", { preHandler: app.autorizar("SINDICO") }, async (req, reply) => {
    const dados = avisoSchema.parse(req.body);
    const aviso = await prisma.aviso.create({ data: { ...dados, autorId: req.user.sub } });
    notificarTodos(req.user.sub, {
      titulo: `📢 ${aviso.titulo}`,
      // O corpo da notificação é curto; o texto completo fica na aba Avisos.
      corpo: aviso.conteudo.length > 120 ? `${aviso.conteudo.slice(0, 117)}…` : aviso.conteudo,
      dados: { aba: "Avisos" },
    });
    return reply.status(201).send(aviso);
  });

  app.delete("/avisos/:id", { preHandler: app.autorizar("SINDICO") }, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const { count } = await prisma.aviso.deleteMany({ where: { id } });
    if (count === 0) throw naoEncontrado("Aviso");
    return reply.status(204).send();
  });
}
