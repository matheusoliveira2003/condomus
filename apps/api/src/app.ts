import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
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
import { condominiosRoutes } from "./modules/condominios/routes.js";
import { convitesRoutes } from "./modules/convites/routes.js";
import { rostosRoutes } from "./modules/rostos/routes.js";

// Mensagens de validação em português.
z.config(z.locales.ptBR());

/**
 * `limites: false` desliga o limite de tentativas. Só os testes usam: todos fazem login do mesmo IP,
 * e o contador não zera entre um teste e outro. Em produção, o padrão (ligado) é o que vale.
 */
export async function buildApp({ logger = true, limites = true }: { logger?: boolean; limites?: boolean } = {}) {
  // Atrás do proxy do Render, o IP real vem no X-Forwarded-For. Sem isto, todos os usuários
  // pareceriam um só (o IP do proxy) e dividiriam o mesmo limite de tentativas.
  const app = Fastify({ logger, trustProxy: true });

  await app.register(cors);
  // Limite de tentativas só nas rotas que marcam `config.rateLimit` (login, recuperação de senha,
  // troca de e-mail e cadastro). As demais ficam sem limite: o morador usa o app o dia todo.
  if (limites) {
    await app.register(rateLimit, {
      global: false,
      // Mesmo formato dos outros erros da API ({ erro }), que é o que o app lê.
      errorResponseBuilder: (_req, contexto) =>
        new HttpError(429, `Muitas tentativas. Tente de novo em ${Math.ceil(contexto.ttl / 60000)} min.`),
    });
  }
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
  await app.register(condominiosRoutes);
  await app.register(convitesRoutes);
  await app.register(rostosRoutes);

  return app;
}
