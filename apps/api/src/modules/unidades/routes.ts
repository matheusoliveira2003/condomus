import type { FastifyInstance } from "fastify";
import { prisma } from "../../lib/prisma.js";

export async function unidadesRoutes(app: FastifyInstance) {
  app.get("/unidades", { preHandler: app.autorizar("PORTEIRO", "SINDICO") }, async () =>
    prisma.unidade.findMany({ orderBy: [{ bloco: "asc" }, { numero: "asc" }] }),
  );
}
