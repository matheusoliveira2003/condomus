import fp from "fastify-plugin";
import { createSigner, createVerifier } from "fast-jwt";
import { createHash, timingSafeEqual } from "node:crypto";
import type { FastifyRequest } from "fastify";
import { env } from "../lib/env.js";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../lib/errors.js";

/** Conteúdo do token do painel. O campo `tipo` o distingue, de propósito, de um token de usuário do app. */
export interface AdminToken {
  sub: string;
  tipo: "admin";
  tokenVersion: number;
}

declare module "fastify" {
  interface FastifyInstance {
    /** preHandler das rotas do painel: exige um token de administrador válido e uma conta ativa. */
    exigirAdministrador: (req: FastifyRequest) => Promise<void>;
    /** preHandler que aceita só a chave ADMIN_SECRET (criação da primeira conta e scripts antigos). */
    exigirChaveAdmin: (req: FastifyRequest) => Promise<void>;
  }
  interface FastifyRequest {
    administrador?: { id: string };
  }
}

/** Sessão do painel, em milissegundos: curta, porque dá acesso a todos os condomínios. */
export const VALIDADE_SESSAO_ADMIN_MS = 2 * 60 * 60 * 1000;

/**
 * Segredo próprio do painel, derivado do JWT_SECRET com um rótulo fixo. Um token do app nunca é aceito
 * aqui, e um token do painel nunca é aceito no app, mesmo que alguém troque um pelo outro.
 */
const segredoAdmin = createHash("sha256").update(`condomus-admin:${env.JWT_SECRET}`).digest("hex");

const digest = (valor: string) => createHash("sha256").update(valor).digest();

const assinar = createSigner({ key: segredoAdmin, expiresIn: VALIDADE_SESSAO_ADMIN_MS });
const verificar = createVerifier({ key: segredoAdmin });

/** Emite o token de uma sessão do painel. */
export const emitirTokenAdmin = (id: string, tokenVersion: number) => assinar({ sub: id, tipo: "admin", tokenVersion } satisfies AdminToken);

function tokenDoCabecalho(req: FastifyRequest) {
  const cabecalho = req.headers.authorization ?? "";
  return cabecalho.startsWith("Bearer ") ? cabecalho.slice(7) : "";
}

export default fp(async (app) => {
  app.decorate("exigirAdministrador", async (req: FastifyRequest) => {
    let conteudo: AdminToken;
    try {
      conteudo = verificar(tokenDoCabecalho(req)) as AdminToken;
    } catch {
      throw new HttpError(401, "Sessão do painel ausente ou expirada");
    }
    if (conteudo.tipo !== "admin") throw new HttpError(401, "Sessão do painel ausente ou expirada");
    const admin = await prisma.administrador.findUnique({ where: { id: conteudo.sub }, select: { ativo: true, tokenVersion: true } });
    if (!admin?.ativo || admin.tokenVersion !== conteudo.tokenVersion) throw new HttpError(401, "Sessão do painel ausente ou expirada");
    req.administrador = { id: conteudo.sub };
  });

  // Comparação em tempo constante, como a do exigirAdmin que já existia.
  app.decorate("exigirChaveAdmin", async (req: FastifyRequest) => {
    if (!timingSafeEqual(digest(tokenDoCabecalho(req)), digest(env.ADMIN_SECRET))) {
      throw new HttpError(401, "Credencial de administração inválida");
    }
  });
});
