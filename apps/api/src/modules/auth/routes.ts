import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { HttpError, naoEncontrado } from "../../lib/errors.js";

const loginSchema = z.object({
  email: z.email().trim().toLowerCase(),
  senha: z.string().min(1),
});

const trocarSenhaSchema = z
  .object({
    senhaAtual: z.string().min(1),
    novaSenha: z.string().min(6, "A nova senha deve ter pelo menos 6 caracteres"),
  })
  .refine((s) => s.senhaAtual !== s.novaSenha, { message: "A nova senha deve ser diferente da atual", path: ["novaSenha"] });

export async function authRoutes(app: FastifyInstance) {
  app.post("/auth/login", async (req) => {
    const { email, senha } = loginSchema.parse(req.body);
    const usuario = await prisma.usuario.findUnique({ where: { email } });
    if (!usuario || !usuario.ativo || !(await bcrypt.compare(senha, usuario.senhaHash))) {
      throw new HttpError(401, "E-mail ou senha inválidos");
    }
    const token = app.jwt.sign({ sub: usuario.id, papel: usuario.papel, unidadeId: usuario.unidadeId });
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
  });

  app.get("/auth/me", { preHandler: app.autorizar() }, async (req) => {
    const usuario = await prisma.usuario.findUnique({
      where: { id: req.user.sub },
      select: { id: true, nome: true, email: true, papel: true, unidade: true, fotoAtualizadaEm: true },
    });
    if (!usuario) throw naoEncontrado("Usuário");
    return usuario;
  });

  app.patch("/auth/senha", { preHandler: app.autorizar() }, async (req, reply) => {
    const { senhaAtual, novaSenha } = trocarSenhaSchema.parse(req.body);
    const usuario = await prisma.usuario.findUnique({ where: { id: req.user.sub } });
    if (!usuario) throw naoEncontrado("Usuário");
    // 400 e não 401: o token é válido, só a senha informada está errada (401 deslogaria o app).
    if (!(await bcrypt.compare(senhaAtual, usuario.senhaHash))) throw new HttpError(400, "Senha atual incorreta");
    await prisma.usuario.update({ where: { id: usuario.id }, data: { senhaHash: await bcrypt.hash(novaSenha, 10) } });
    return reply.status(204).send();
  });
}
