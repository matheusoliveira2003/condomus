import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";

const unidadeSchema = z.object({
  bloco: z.string().trim().min(1).toUpperCase(),
  numero: z.string().trim().min(1),
});

export async function unidadesRoutes(app: FastifyInstance) {
  app.get("/unidades", { preHandler: app.autorizar("PORTEIRO", "SINDICO") }, async (req) =>
    prisma.unidade.findMany({
      where: { condominioId: req.user.condominioId },
      include: { _count: { select: { moradores: { where: { ativo: true } } } } },
      orderBy: [{ bloco: "asc" }, { numero: "asc" }],
    }),
  );

  app.post("/unidades", { preHandler: app.autorizar("SINDICO") }, async (req, reply) => {
    const unidade = await prisma.unidade.create({ data: { ...unidadeSchema.parse(req.body), condominioId: req.user.condominioId } });
    return reply.status(201).send(unidade);
  });
}
