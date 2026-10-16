import Fastify from "fastify";
import cors from "@fastify/cors";
import { ZodError, z } from "zod";
import { Prisma } from "@prisma/client";
import { HttpError } from "./lib/errors.js";
import auth from "./plugins/auth.js";
import { authRoutes } from "./modules/auth/routes.js";
import { visitasRoutes } from "./modules/visitas/routes.js";
import { encomendasRoutes } from "./modules/encomendas/routes.js";
import { avisosRoutes } from "./modules/avisos/routes.js";
import { reservasRoutes } from "./modules/reservas/routes.js";
import { unidadesRoutes } from "./modules/unidades/routes.js";
import { usuariosRoutes } from "./modules/usuarios/routes.js";
import { dispositivosRoutes } from "./modules/dispositivos/routes.js";
import { resumoRoutes } from "./modules/resumo/routes.js";
import { fotosRoutes } from "./modules/fotos/routes.js";

// Mensagens de validação em português.
z.config(z.locales.ptBR());

export async function buildApp({ logger = true }: { logger?: boolean } = {}) {
  const app = Fastify({ logger });

  await app.register(cors);
  await app.register(auth);

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ZodError) {
      return reply.status(400).send({ erro: "Dados inválidos", detalhes: z.flattenError(err).fieldErrors });
    }
    // Violação de campo único (ex.: e-mail ou unidade já cadastrados).
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return reply.status(409).send({ erro: "Já existe um cadastro com esses dados" });
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
  await app.register(usuariosRoutes);
  await app.register(dispositivosRoutes);
  await app.register(resumoRoutes);
  await app.register(fotosRoutes);

  return app;
}
