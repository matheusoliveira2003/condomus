import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { HttpError, naoEncontrado } from "../../lib/errors.js";

const usuarioSchema = z
  .object({
    nome: z.string().trim().min(2),
    email: z.email().trim().toLowerCase(),
    senha: z.string().min(6, "A senha deve ter pelo menos 6 caracteres"),
    papel: z.enum(["MORADOR", "PORTEIRO", "SINDICO"]),
    unidadeId: z.uuid().optional(),
  })
  .refine((u) => (u.papel === "MORADOR") === !!u.unidadeId, {
    message: "Moradores precisam de uma unidade; funcionários não podem ter unidade",
    path: ["unidadeId"],
  });

const filtroSchema = z.object({ papel: z.enum(["MORADOR", "PORTEIRO", "SINDICO"]).optional() });
const ativoSchema = z.object({ ativo: z.boolean() });
const idParam = z.object({ id: z.uuid() });

/** Campos devolvidos ao app — nunca expõe o hash da senha. */
const publico = { id: true, nome: true, email: true, papel: true, ativo: true, unidade: true, fotoAtualizadaEm: true } as const;

export async function usuariosRoutes(app: FastifyInstance) {
  app.get("/usuarios", { preHandler: app.autorizar("SINDICO") }, async (req) => {
    const { papel } = filtroSchema.parse(req.query);
    return prisma.usuario.findMany({ where: { papel }, select: publico, orderBy: [{ ativo: "desc" }, { nome: "asc" }] });
  });

  app.post("/usuarios", { preHandler: app.autorizar("SINDICO") }, async (req, reply) => {
    const { senha, ...dados } = usuarioSchema.parse(req.body);
    if (dados.unidadeId && !(await prisma.unidade.findUnique({ where: { id: dados.unidadeId } }))) {
      throw naoEncontrado("Unidade");
    }
    const usuario = await prisma.usuario.create({
      data: { ...dados, senhaHash: await bcrypt.hash(senha, 10) },
      select: publico,
    });
    return reply.status(201).send(usuario);
  });

  // Desativar em vez de excluir preserva o histórico (visitas, encomendas, avisos).
  app.patch("/usuarios/:id/ativo", { preHandler: app.autorizar("SINDICO") }, async (req) => {
    const { id } = idParam.parse(req.params);
    const { ativo } = ativoSchema.parse(req.body);
    if (id === req.user.sub && !ativo) throw new HttpError(409, "Você não pode desativar a própria conta");
    const existe = await prisma.usuario.findUnique({ where: { id } });
    if (!existe) throw naoEncontrado("Usuário");
    return prisma.usuario.update({ where: { id }, data: { ativo }, select: publico });
  });
}
