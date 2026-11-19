import type { FastifyRequest } from "fastify";

/**
 * Limites de tentativa das rotas sensíveis (login, códigos de 6 dígitos, cadastro). Cada rota
 * conta por IP e, quando o corpo traz um e-mail, também por e-mail: sem isso, quem erra a senha de
 * uma conta trocando de IP, ou testa vários e-mails do mesmo IP, escaparia de um dos dois limites.
 */
const JANELA = "15 minutes";

const emailDoCorpo = (req: FastifyRequest) => {
  const email = (req.body as { email?: unknown } | undefined)?.email;
  return typeof email === "string" ? email.trim().toLowerCase() : null;
};

/** Configuração `config.rateLimit` de uma rota: `max` tentativas por IP + `max` por e-mail em 15 minutos. */
export function limitar(max: number) {
  return {
    rateLimit: {
      max,
      timeWindow: JANELA,
      // preHandler: o corpo já foi lido, então a chave pode usar o e-mail.
      hook: "preHandler" as const,
      keyGenerator: (req: FastifyRequest) => {
        const email = emailDoCorpo(req);
        return email ? `${req.ip}|${email}` : req.ip;
      },
    },
  };
}
