import type { FastifyInstance } from "fastify";
import type { Papel } from "@prisma/client";

interface UsuarioSessao {
  id: string;
  nome: string;
  papel: Papel;
  unidadeId: string | null;
  condominioId: string;
  tokenVersion: number;
  fotoAtualizadaEm: Date | null;
}

/** Monta a resposta de login (token + dados públicos), igual para /auth/login e /cadastro. */
export function emitirSessao(app: FastifyInstance, usuario: UsuarioSessao) {
  const token = app.jwt.sign({
    sub: usuario.id,
    papel: usuario.papel,
    unidadeId: usuario.unidadeId,
    condominioId: usuario.condominioId,
    tokenVersion: usuario.tokenVersion,
  });
  return {
    token,
    usuario: {
      id: usuario.id,
      nome: usuario.nome,
      papel: usuario.papel,
      unidadeId: usuario.unidadeId,
      fotoAtualizadaEm: usuario.fotoAtualizadaEm,
    },
  };
}
