import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { HttpError, naoEncontrado } from "../../lib/errors.js";
import { enviarBoasVindas } from "../../lib/email.js";
import { limitar } from "../../lib/limites.js";
import { situacaoDoPlano } from "../../lib/plano.js";
import { emitirTokenAdmin } from "../../plugins/admin.js";
import { gerarConviteDaUnidade } from "../convites/operacoes.js";
import { areaEdicaoSchema, areaSchema, criarArea, editarArea, listarAreas } from "../reservas/areas.js";
import { criarLote, criarUnidade, editarUnidade, excluirUnidade, listarUnidades, loteSchema, unidadeSchema } from "../unidades/operacoes.js";
import {
  alterarAtivo,
  ativoSchema,
  criarUsuario,
  editarSchema,
  editarUsuario,
  filtroSchema,
  gerarSenhaTemporaria,
  listarUsuarios,
  reenviarSenha,
  usuarioSchema,
} from "../usuarios/operacoes.js";

/**
 * Painel do administrador: gerencia todos os condomínios. Toda rota exige a sessão do painel, e toda
 * operação recebe o condomínio pela URL, conferindo que o recurso pertence a ele.
 */

const planoStatusSchema = z.enum(["TRIAL", "ATIVO", "EXPIRADO", "SUSPENSO"]);
const idCondominio = z.object({ condominioId: z.uuid() });
const idRecurso = z.object({ condominioId: z.uuid(), id: z.uuid() });

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  senha: z.string().min(1),
});

const novaContaSchema = z.object({
  nome: z.string().trim().min(2),
  email: z.string().trim().toLowerCase().pipe(z.email()),
  senha: z.string().min(12, "A senha do administrador deve ter pelo menos 12 caracteres"),
});

const trocarSenhaSchema = z
  .object({
    senhaAtual: z.string().min(1, "Informe a senha atual"),
    novaSenha: z.string().min(12, "A nova senha deve ter pelo menos 12 caracteres"),
  })
  .refine((s) => s.senhaAtual !== s.novaSenha, { message: "A nova senha deve ser diferente da atual", path: ["novaSenha"] });

const novoCondominioSchema = z.object({
  nome: z.string().trim().min(2),
  cnpj: z.string().trim().min(1).optional(),
  endereco: z.string().trim().min(1).optional(),
  planoStatus: planoStatusSchema.optional(),
  planoExpiraEm: z.coerce.date().optional(),
  sindico: z.object({ nome: z.string().trim().min(2), email: z.string().trim().toLowerCase().pipe(z.email()) }),
});

const edicaoCondominioSchema = z.object({
  nome: z.string().trim().min(2).optional(),
  cnpj: z.string().trim().min(1).nullable().optional(),
  endereco: z.string().trim().min(1).nullable().optional(),
  planoStatus: planoStatusSchema.optional(),
  planoExpiraEm: z.coerce.date().nullable().optional(),
});

/**
 * Hash de uma senha qualquer, só para o login gastar o mesmo tempo quando o e-mail não existe: assim
 * o tempo de resposta não revela quais e-mails têm conta de administrador.
 */
const HASH_FALSO = bcrypt.hashSync("senha-que-ninguem-usa-no-painel", 10);

/** Garante que o condomínio existe antes de qualquer operação dentro dele. */
async function condominioDaUrl(params: unknown) {
  const { condominioId } = idCondominio.parse(params);
  if (!(await prisma.condominio.findUnique({ where: { id: condominioId }, select: { id: true } }))) throw naoEncontrado("Condomínio");
  return condominioId;
}

export async function adminRoutes(app: FastifyInstance) {
  // --- Contas de administrador --------------------------------------------------------------
  // A primeira conta (e as seguintes) só nasce com a chave ADMIN_SECRET: ninguém se cadastra sozinho.
  app.post("/admin/administradores", { preHandler: app.exigirChaveAdmin }, async (req, reply) => {
    const { nome, email, senha } = novaContaSchema.parse(req.body);
    const conta = await prisma.administrador.create({
      data: { nome, email, senhaHash: await bcrypt.hash(senha, 10) },
      select: { id: true, nome: true, email: true },
    });
    return reply.status(201).send(conta);
  });

  app.post("/admin/auth/login", { config: limitar(5) }, async (req) => {
    const { email, senha } = loginSchema.parse(req.body);
    const conta = await prisma.administrador.findUnique({ where: { email } });
    // Sempre uma comparação bcrypt, para o tempo não revelar se o e-mail existe.
    const ok = await bcrypt.compare(senha, conta?.senhaHash ?? HASH_FALSO);
    if (!conta || !conta.ativo || !ok) throw new HttpError(401, "E-mail ou senha inválidos");
    return { token: emitirTokenAdmin(conta.id, conta.tokenVersion), administrador: { id: conta.id, nome: conta.nome, email: conta.email } };
  });

  app.get("/admin/eu", { preHandler: app.exigirAdministrador }, async (req) =>
    prisma.administrador.findUniqueOrThrow({ where: { id: req.administrador!.id }, select: { id: true, nome: true, email: true } }),
  );

  // Troca de senha do próprio administrador. Pede a senha atual (uma sessão esquecida aberta não basta),
  // tem limite de tentativas e encerra as outras sessões: o token usado aqui também perde a validade, e
  // a resposta traz um novo para o painel continuar aberto.
  app.patch("/admin/senha", { preHandler: app.exigirAdministrador, config: limitar(5) }, async (req) => {
    const { senhaAtual, novaSenha } = trocarSenhaSchema.parse(req.body);
    const conta = await prisma.administrador.findUniqueOrThrow({ where: { id: req.administrador!.id } });
    if (!(await bcrypt.compare(senhaAtual, conta.senhaHash))) throw new HttpError(400, "Senha atual incorreta");
    const atualizada = await prisma.administrador.update({
      where: { id: conta.id },
      data: { senhaHash: await bcrypt.hash(novaSenha, 10), tokenVersion: { increment: 1 } },
    });
    return { token: emitirTokenAdmin(atualizada.id, atualizada.tokenVersion) };
  });

  // --- Condomínios --------------------------------------------------------------------------
  app.get("/admin/painel/condominios", { preHandler: app.exigirAdministrador }, async () => {
    const condominios = await prisma.condominio.findMany({
      orderBy: { nome: "asc" },
      include: { _count: { select: { unidades: true, usuarios: true } } },
    });
    // O status que vale agora: um teste além da carência já aparece como expirado.
    return condominios.map((c) => ({ ...c, situacao: situacaoDoPlano(c) }));
  });

  app.get("/admin/painel/condominios/:condominioId", { preHandler: app.exigirAdministrador }, async (req) => {
    const condominioId = await condominioDaUrl(req.params);
    const c = await prisma.condominio.findUniqueOrThrow({
      where: { id: condominioId },
      include: { _count: { select: { unidades: true, usuarios: true, areas: true } } },
    });
    return { ...c, situacao: situacaoDoPlano(c) };
  });

  // Condomínio e síndico na mesma transação: não sobra condomínio sem síndico se o e-mail já estiver em uso.
  app.post("/admin/painel/condominios", { preHandler: app.exigirAdministrador }, async (req, reply) => {
    const { sindico, ...dados } = novoCondominioSchema.parse(req.body);
    const senhaGerada = gerarSenhaTemporaria();
    const senhaHash = await bcrypt.hash(senhaGerada, 10);
    const criado = await prisma.$transaction(async (tx) => {
      const condominio = await tx.condominio.create({ data: dados });
      const usuario = await tx.usuario.create({
        data: { nome: sindico.nome, email: sindico.email, senhaHash, senhaTemporaria: true, papel: "SINDICO", condominioId: condominio.id },
        select: { id: true, nome: true, email: true, papel: true },
      });
      return { condominio, sindico: usuario };
    });
    enviarBoasVindas(sindico.email, sindico.nome, senhaGerada);
    return reply.status(201).send({ ...criado, senhaGerada });
  });

  app.patch("/admin/painel/condominios/:condominioId", { preHandler: app.exigirAdministrador }, async (req) => {
    const condominioId = await condominioDaUrl(req.params);
    return prisma.condominio.update({ where: { id: condominioId }, data: edicaoCondominioSchema.parse(req.body) });
  });

  // --- Unidades -----------------------------------------------------------------------------
  app.get("/admin/painel/condominios/:condominioId/unidades", { preHandler: app.exigirAdministrador }, async (req) =>
    listarUnidades(await condominioDaUrl(req.params)),
  );
  app.post("/admin/painel/condominios/:condominioId/unidades", { preHandler: app.exigirAdministrador }, async (req, reply) =>
    reply.status(201).send(await criarUnidade(await condominioDaUrl(req.params), unidadeSchema.parse(req.body))),
  );
  app.post("/admin/painel/condominios/:condominioId/unidades/lote", { preHandler: app.exigirAdministrador }, async (req, reply) =>
    reply.status(201).send(await criarLote(await condominioDaUrl(req.params), loteSchema.parse(req.body))),
  );
  app.patch("/admin/painel/condominios/:condominioId/unidades/:id", { preHandler: app.exigirAdministrador }, async (req) => {
    const { condominioId, id } = idRecurso.parse(req.params);
    return editarUnidade(await condominioDaUrl({ condominioId }), id, unidadeSchema.parse(req.body));
  });
  app.delete("/admin/painel/condominios/:condominioId/unidades/:id", { preHandler: app.exigirAdministrador }, async (req, reply) => {
    const { condominioId, id } = idRecurso.parse(req.params);
    await excluirUnidade(await condominioDaUrl({ condominioId }), id);
    return reply.status(204).send();
  });
  app.post("/admin/painel/condominios/:condominioId/unidades/:id/convite", { preHandler: app.exigirAdministrador }, async (req, reply) => {
    const { condominioId, id } = idRecurso.parse(req.params);
    return reply.status(201).send(await gerarConviteDaUnidade(await condominioDaUrl({ condominioId }), id));
  });

  // --- Usuários -----------------------------------------------------------------------------
  app.get("/admin/painel/condominios/:condominioId/usuarios", { preHandler: app.exigirAdministrador }, async (req) =>
    listarUsuarios(await condominioDaUrl(req.params), filtroSchema.parse(req.query).papel),
  );
  app.post("/admin/painel/condominios/:condominioId/usuarios", { preHandler: app.exigirAdministrador }, async (req, reply) =>
    reply.status(201).send(await criarUsuario(await condominioDaUrl(req.params), usuarioSchema.parse(req.body))),
  );
  app.patch("/admin/painel/condominios/:condominioId/usuarios/:id", { preHandler: app.exigirAdministrador }, async (req) => {
    const { condominioId, id } = idRecurso.parse(req.params);
    return editarUsuario(await condominioDaUrl({ condominioId }), id, editarSchema.parse(req.body));
  });
  app.post("/admin/painel/condominios/:condominioId/usuarios/:id/reenviar-senha", { preHandler: app.exigirAdministrador }, async (req, reply) => {
    const { condominioId, id } = idRecurso.parse(req.params);
    await reenviarSenha(await condominioDaUrl({ condominioId }), id);
    return reply.status(204).send();
  });
  app.patch("/admin/painel/condominios/:condominioId/usuarios/:id/ativo", { preHandler: app.exigirAdministrador }, async (req) => {
    const { condominioId, id } = idRecurso.parse(req.params);
    return alterarAtivo(await condominioDaUrl({ condominioId }), id, ativoSchema.parse(req.body).ativo);
  });

  // --- Áreas comuns -------------------------------------------------------------------------
  app.get("/admin/painel/condominios/:condominioId/areas", { preHandler: app.exigirAdministrador }, async (req) =>
    listarAreas(await condominioDaUrl(req.params), { incluirInativas: true }),
  );
  app.post("/admin/painel/condominios/:condominioId/areas", { preHandler: app.exigirAdministrador }, async (req, reply) =>
    reply.status(201).send(await criarArea(await condominioDaUrl(req.params), areaSchema.parse(req.body))),
  );
  app.patch("/admin/painel/condominios/:condominioId/areas/:id", { preHandler: app.exigirAdministrador }, async (req) => {
    const { condominioId, id } = idRecurso.parse(req.params);
    return editarArea(await condominioDaUrl({ condominioId }), id, areaEdicaoSchema.parse(req.body));
  });
}
