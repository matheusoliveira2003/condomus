import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { HttpError, naoEncontrado } from "../../lib/errors.js";

const loginSchema = z.object({
  email: z.email().trim().toLowerCase(),
  senha: z.string().min(1),
});

export async function authRoutes(app: FastifyInstance) {
  app.post("/auth/login", async (req) => {
    const { email, senha } = loginSchema.parse(req.body);
    const usuario = await prisma.usuario.findUnique({ where: { email } });
    if (!usuario || !usuario.ativo || !(await bcrypt.compare(senha, usuario.senhaHash))) {
      throw new HttpError(401, "E-mail ou senha inválidos");
    }
    const token = app.jwt.sign({ sub: usuario.id, papel: usuario.papel, unidadeId: usuario.unidadeId });
    return { token, usuario: { id: usuario.id, nome: usuario.nome, papel: usuario.papel, unidadeId: usuario.unidadeId } };
  });

  app.get("/auth/me", { preHandler: app.autorizar() }, async (req) => {
    const usuario = await prisma.usuario.findUnique({
      where: { id: req.user.sub },
      select: { id: true, nome: true, email: true, papel: true, unidade: true },
    });
    if (!usuario) throw naoEncontrado("Usuário");
    return usuario;
  });
}
