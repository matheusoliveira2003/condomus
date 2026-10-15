import fp from "fastify-plugin";
import jwt from "@fastify/jwt";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { Papel } from "@prisma/client";
import { env } from "../lib/env.js";
import { prisma } from "../lib/prisma.js";
import { HttpError, proibido } from "../lib/errors.js";

export interface UsuarioToken {
  sub: string;
  papel: Papel;
  unidadeId: string | null;
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: UsuarioToken;
    user: UsuarioToken;
  }
}

declare module "fastify" {
  interface FastifyInstance {
    /** preHandler que exige token válido e, opcionalmente, um dos perfis informados. */
    autorizar: (...papeis: Papel[]) => (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export default fp(async (app) => {
  await app.register(jwt, { secret: env.JWT_SECRET, sign: { expiresIn: "8h" } });

  app.decorate("autorizar", (...papeis: Papel[]) => async (req: FastifyRequest) => {
    try {
      await req.jwtVerify();
    } catch {
      throw new HttpError(401, "Token ausente ou inválido");
    }
    // Conta desativada pelo síndico perde o acesso imediatamente, mesmo com token válido.
    const usuario = await prisma.usuario.findUnique({ where: { id: req.user.sub }, select: { ativo: true } });
    if (!usuario?.ativo) throw new HttpError(401, "Conta desativada");
    if (papeis.length > 0 && !papeis.includes(req.user.papel)) throw proibido();
  });
});
