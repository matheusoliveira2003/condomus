import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { criarLote, criarUnidade, editarUnidade, excluirUnidade, listarUnidades, loteSchema, unidadeSchema } from "./operacoes.js";

const idParam = z.object({ id: z.uuid() });

/** Unidades do condomínio do próprio token. As regras ficam em ./operacoes.ts, também usadas pelo painel. */
export async function unidadesRoutes(app: FastifyInstance) {
  app.get("/unidades", { preHandler: app.autorizar("PORTEIRO", "SINDICO") }, async (req) => listarUnidades(req.user.condominioId));

  app.post("/unidades", { preHandler: app.autorizar("SINDICO") }, async (req, reply) =>
    reply.status(201).send(await criarUnidade(req.user.condominioId, unidadeSchema.parse(req.body))),
  );

  app.post("/unidades/lote", { preHandler: app.autorizar("SINDICO") }, async (req, reply) =>
    reply.status(201).send(await criarLote(req.user.condominioId, loteSchema.parse(req.body))),
  );

  app.patch("/unidades/:id", { preHandler: app.autorizar("SINDICO") }, async (req) =>
    editarUnidade(req.user.condominioId, idParam.parse(req.params).id, unidadeSchema.parse(req.body)),
  );

  app.delete("/unidades/:id", { preHandler: app.autorizar("SINDICO") }, async (req, reply) => {
    await excluirUnidade(req.user.condominioId, idParam.parse(req.params).id);
    return reply.status(204).send();
  });
}
