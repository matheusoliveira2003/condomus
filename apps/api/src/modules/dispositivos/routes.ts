import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";

const tokenSchema = z.object({
  token: z.string().regex(/^(ExponentPushToken|ExpoPushToken)\[.+\]$/, "Token de push inválido"),
});

export async function dispositivosRoutes(app: FastifyInstance) {
  // Upsert: se outra pessoa entrar no mesmo celular, o aparelho passa a ser dela.
  app.put("/dispositivos", { preHandler: app.autorizar() }, async (req, reply) => {
    const { token } = tokenSchema.parse(req.body);
    await prisma.dispositivoPush.upsert({
      where: { token },
      update: { usuarioId: req.user.sub },
      create: { token, usuarioId: req.user.sub },
    });
    return reply.status(204).send();
  });

  // Chamado ao sair da conta, para o celular parar de receber notificações dela.
  app.delete("/dispositivos/:token", { preHandler: app.autorizar() }, async (req, reply) => {
    const { token } = tokenSchema.parse(req.params);
    await prisma.dispositivoPush.deleteMany({ where: { token, usuarioId: req.user.sub } });
    return reply.status(204).send();
  });
}
