import type { FastifyInstance, FastifyRequest } from "fastify";
import { createHash, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { env } from "../../lib/env.js";
import { prisma } from "../../lib/prisma.js";
import { HttpError, naoEncontrado } from "../../lib/errors.js";

const planoStatusSchema = z.enum(["TRIAL", "ATIVO", "EXPIRADO", "SUSPENSO"]);

const criarSchema = z.object({
  nome: z.string().trim().min(2),
  cnpj: z.string().trim().min(1).optional(),
  endereco: z.string().trim().min(1).optional(),
  planoStatus: planoStatusSchema.optional(),
  planoExpiraEm: z.coerce.date().optional(),
  sindico: z.object({
    nome: z.string().trim().min(2),
    email: z.string().trim().toLowerCase().pipe(z.email()),
    senha: z.string().min(6, "A senha deve ter pelo menos 6 caracteres"),
  }),
});

const planoSchema = z.object({
  planoStatus: planoStatusSchema,
  planoExpiraEm: z.coerce.date().nullable().optional(),
});

const idParam = z.object({ id: z.uuid() });

const digest = (valor: string) => createHash("sha256").update(valor).digest();

/** Rotas de operação (/admin/*): exigem `Authorization: Bearer <ADMIN_SECRET>`, comparado em tempo constante. */
async function exigirAdmin(req: FastifyRequest) {
  const recebido = req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : "";
  if (!timingSafeEqual(digest(recebido), digest(env.ADMIN_SECRET))) throw new HttpError(401, "Credencial de administração inválida");
}

export async function condominiosRoutes(app: FastifyInstance) {
  app.post("/admin/condominios", { preHandler: exigirAdmin }, async (req, reply) => {
    const { sindico, ...dados } = criarSchema.parse(req.body);
    const condominio = await prisma.condominio.create({ data: dados });
    try {
      const criado = await prisma.usuario.create({
        data: {
          nome: sindico.nome,
          email: sindico.email,
          senhaHash: await bcrypt.hash(sindico.senha, 10),
          papel: "SINDICO",
          condominioId: condominio.id,
        },
        select: { id: true, nome: true, email: true, papel: true, ativo: true, condominioId: true },
      });
      return reply.status(201).send({ condominio, sindico: criado });
    } catch (erro) {
      // E-mail do síndico já em uso: não deixa o condomínio órfão.
      await prisma.condominio.delete({ where: { id: condominio.id } });
      throw erro;
    }
  });

  app.patch("/admin/condominios/:id/plano", { preHandler: exigirAdmin }, async (req) => {
    const { id } = idParam.parse(req.params);
    const { planoStatus, planoExpiraEm } = planoSchema.parse(req.body);
    if (!(await prisma.condominio.findUnique({ where: { id } }))) throw naoEncontrado("Condomínio");
    return prisma.condominio.update({ where: { id }, data: { planoStatus, planoExpiraEm } });
  });

  app.get("/condominios/meu", { preHandler: app.autorizar() }, async (req) => {
    const condominio = await prisma.condominio.findUnique({
      where: { id: req.user.condominioId },
      select: { id: true, nome: true, planoStatus: true, planoExpiraEm: true },
    });
    if (!condominio) throw naoEncontrado("Condomínio");
    return condominio;
  });
}
