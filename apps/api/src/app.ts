import Fastify from "fastify";
import cors from "@fastify/cors";
import { ZodError, z } from "zod";
import { HttpError } from "./lib/errors.js";
import auth from "./plugins/auth.js";
import { authRoutes } from "./modules/auth/routes.js";
import { visitasRoutes } from "./modules/visitas/routes.js";
import { encomendasRoutes } from "./modules/encomendas/routes.js";
import { avisosRoutes } from "./modules/avisos/routes.js";
import { reservasRoutes } from "./modules/reservas/routes.js";
import { unidadesRoutes } from "./modules/unidades/routes.js";

export async function buildApp() {
  const app = Fastify({ logger: true });

  await app.register(cors);
  await app.register(auth);

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ZodError) {
      return reply.status(400).send({ erro: "Dados inválidos", detalhes: z.flattenError(err).fieldErrors });
    }
    if (err instanceof HttpError) {
      return reply.status(err.statusCode).send({ erro: err.message });
    }
    app.log.error(err);
    return reply.status(500).send({ erro: "Erro interno do servidor" });
  });

  app.get("/health", async () => ({ status: "ok" }));
  await app.register(authRoutes);
  await app.register(visitasRoutes);
  await app.register(encomendasRoutes);
  await app.register(avisosRoutes);
  await app.register(reservasRoutes);
  await app.register(unidadesRoutes);

  return app;
}
