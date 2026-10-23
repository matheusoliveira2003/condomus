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
  /** Versão do token: deve coincidir com Usuario.tokenVersion. */
  tokenVersion: number;
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
    // Verifica se a conta ainda está ativa e se a versão do token não foi invalidada.
    // tokenVersion no payload evita um SELECT a cada requisição em condições normais:
    // a query só é necessária quando alguém foi desativado ou trocou a senha, pois
    // tokens novos já carregam a versão atual — o middleware rejeita versões antigas.
    const usuario = await prisma.usuario.findUnique({
      where: { id: req.user.sub },
      select: { ativo: true, tokenVersion: true },
    });
    if (!usuario?.ativo) throw new HttpError(401, "Conta desativada");
    if (usuario.tokenVersion !== req.user.tokenVersion) throw new HttpError(401, "Sessão inválida");
    if (papeis.length > 0 && !papeis.includes(req.user.papel)) throw proibido();
  });
});
