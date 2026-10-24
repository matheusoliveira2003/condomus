import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { HttpError, naoEncontrado } from "../../lib/errors.js";
import { gerarCodigoConvite, normalizarCodigo } from "../../lib/codigo.js";
import { emitirSessao } from "../../lib/sessao.js";

const VALIDADE_CONVITE_DIAS = 7;

const idParam = z.object({ id: z.uuid() });
const codigoParam = z.object({ codigo: z.string().trim().min(1).max(32) });
const cadastroSchema = z.object({
  codigo: z.string().trim().min(1).max(32),
  nome: z.string().trim().min(2),
  email: z.string().trim().toLowerCase().pipe(z.email()),
  senha: z.string().min(6, "A senha deve ter pelo menos 6 caracteres"),
});

/** Busca o convite pelo código e garante que existe, não expirou e não foi usado. Mesmo erro para qualquer falha de validade. */
async function buscarConviteValido(entrada: string) {
  const convite = await prisma.conviteUnidade.findUnique({
    where: { codigo: normalizarCodigo(entrada) },
    include: { unidade: { include: { condominio: true } } },
  });
  if (!convite) throw naoEncontrado("Convite");
  if (convite.usadoEm || convite.expiraEm < new Date()) throw new HttpError(410, "Convite expirado ou já utilizado");
  return convite;
}

export async function convitesRoutes(app: FastifyInstance) {
  app.post("/unidades/:id/convite", { preHandler: app.autorizar("SINDICO") }, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const unidade = await prisma.unidade.findFirst({ where: { id, condominioId: req.user.condominioId } });
    if (!unidade) throw naoEncontrado("Unidade");

    const expiraEm = new Date(Date.now() + VALIDADE_CONVITE_DIAS * 24 * 60 * 60 * 1000);
    const codigo = gerarCodigoConvite();
    // Só um convite pendente por unidade: o anterior (ainda não usado) é descartado.
    await prisma.$transaction([
      prisma.conviteUnidade.deleteMany({ where: { unidadeId: id, usadoEm: null } }),
      prisma.conviteUnidade.create({ data: { codigo, expiraEm, unidadeId: id } }),
    ]);
    return reply.status(201).send({ codigo, expiraEm });
  });

  // Público: o morador ainda não tem conta. Não expõe ids internos.
  app.get("/convite/:codigo", async (req) => {
    const { codigo } = codigoParam.parse(req.params);
    const { unidade } = await buscarConviteValido(codigo);
    return {
      unidade: { bloco: unidade.bloco, numero: unidade.numero },
      condominio: { nome: unidade.condominio.nome },
    };
  });

  app.post("/cadastro", async (req, reply) => {
    const { codigo, nome, email, senha } = cadastroSchema.parse(req.body);
    const convite = await buscarConviteValido(codigo);
    const senhaHash = await bcrypt.hash(senha, 10);

    // Marca o convite como usado só se ainda estiver livre (updateMany é atômico): evita uso duplo em corrida.
    const usuario = await prisma.$transaction(async (tx) => {
      const marcado = await tx.conviteUnidade.updateMany({
        where: { id: convite.id, usadoEm: null, expiraEm: { gt: new Date() } },
        data: { usadoEm: new Date() },
      });
      if (marcado.count !== 1) throw new HttpError(410, "Convite expirado ou já utilizado");
      return tx.usuario.create({
        data: {
          nome,
          email,
          senhaHash,
          papel: "MORADOR",
          unidadeId: convite.unidadeId,
          condominioId: convite.unidade.condominioId,
        },
      });
    });
    return reply.status(201).send(emitirSessao(app, usuario));
  });
}
