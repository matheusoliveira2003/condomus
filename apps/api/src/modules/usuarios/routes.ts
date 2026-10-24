import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { HttpError, naoEncontrado } from "../../lib/errors.js";

const usuarioSchema = z
  .object({
    nome: z.string().trim().min(2),
    email: z.string().trim().toLowerCase().pipe(z.email()),
    papel: z.enum(["MORADOR", "PORTEIRO", "SINDICO"]),
    unidadeId: z.uuid().optional(),
  })
  .refine((u) => (u.papel === "MORADOR") === !!u.unidadeId, {
    message: "Moradores precisam de uma unidade; funcionários não podem ter unidade",
    path: ["unidadeId"],
  });

/** Gera senha aleatória de 12 caracteres (letras + números). */
function gerarSenhaTemporaria() {
  return randomBytes(9).toString("base64url").slice(0, 12);
}

const filtroSchema = z.object({ papel: z.enum(["MORADOR", "PORTEIRO", "SINDICO"]).optional() });
const ativoSchema = z.object({ ativo: z.boolean() });
const idParam = z.object({ id: z.uuid() });

/** Campos devolvidos ao app — nunca expõe o hash da senha. */
const publico = { id: true, nome: true, email: true, papel: true, ativo: true, unidade: true, fotoAtualizadaEm: true } as const;

export async function usuariosRoutes(app: FastifyInstance) {
  app.get("/usuarios", { preHandler: app.autorizar("SINDICO") }, async (req) => {
    const { papel } = filtroSchema.parse(req.query);
    return prisma.usuario.findMany({
      where: { papel, condominioId: req.user.condominioId },
      select: publico,
      orderBy: [{ ativo: "desc" }, { nome: "asc" }],
    });
  });

  app.post("/usuarios", { preHandler: app.autorizar("SINDICO") }, async (req, reply) => {
    const dados = usuarioSchema.parse(req.body);
    const { condominioId } = req.user;
    if (dados.unidadeId && !(await prisma.unidade.findFirst({ where: { id: dados.unidadeId, condominioId } }))) {
      throw naoEncontrado("Unidade", "f");
    }
    const senhaGerada = gerarSenhaTemporaria();
    const usuario = await prisma.usuario.create({
      data: { ...dados, condominioId, senhaHash: await bcrypt.hash(senhaGerada, 10), senhaTemporaria: true },
      select: publico,
    });
    // Devolve a senha gerada para o síndico passar ao novo usuário (não é armazenada em texto claro).
    return reply.status(201).send({ ...usuario, senhaGerada });
  });

  // Desativar em vez de excluir preserva o histórico (visitas, encomendas, avisos).
  app.patch("/usuarios/:id/ativo", { preHandler: app.autorizar("SINDICO") }, async (req) => {
    const { id } = idParam.parse(req.params);
    const { ativo } = ativoSchema.parse(req.body);
    if (id === req.user.sub && !ativo) throw new HttpError(409, "Você não pode desativar a própria conta");
    const existe = await prisma.usuario.findFirst({ where: { id, condominioId: req.user.condominioId } });
    if (!existe) throw naoEncontrado("Usuário");
    // Incrementa tokenVersion ao desativar (e também ao reativar, por precaução):
    // qualquer token emitido antes da mudança fica inválido imediatamente.
    return prisma.usuario.update({ where: { id }, data: { ativo, tokenVersion: { increment: 1 } }, select: publico });
  });
}
