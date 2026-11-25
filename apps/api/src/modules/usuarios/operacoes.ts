import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { HttpError, naoEncontrado } from "../../lib/errors.js";
import { enviarBoasVindas } from "../../lib/email.js";
import { ehMorador } from "../../lib/papeis.js";

/**
 * Operações de cadastro de usuários, sem saber quem chama. O síndico (app) e o administrador (painel)
 * usam as mesmas regras; muda só de onde vem o condomínio: do token do síndico, ou da URL no painel.
 */

export const usuarioSchema = z
  .object({
    nome: z.string().trim().min(2),
    email: z.string().trim().toLowerCase().pipe(z.email()),
    papel: z.enum(["MORADOR", "PORTEIRO", "SINDICO"]),
    unidadeId: z.uuid().optional(),
  })
  // Morador e síndico moram numa unidade; o porteiro atende todas e não tem a sua.
  .refine((u) => ehMorador(u.papel) === !!u.unidadeId, {
    message: "Moradores e síndicos precisam de uma unidade; porteiros não podem ter unidade",
    path: ["unidadeId"],
  });

/** Corrige o nome e muda o morador de unidade. E-mail e papel ficam de fora de propósito. */
export const editarSchema = z
  .object({
    nome: z.string().trim().min(2).optional(),
    unidadeId: z.uuid().optional(),
  })
  .refine((d) => d.nome !== undefined || d.unidadeId !== undefined, { message: "Informe o nome ou a unidade" });

export const filtroSchema = z.object({ papel: z.enum(["MORADOR", "PORTEIRO", "SINDICO"]).optional() });
export const ativoSchema = z.object({ ativo: z.boolean() });

/** Campos devolvidos: nunca expõe o hash da senha. */
export const publico = { id: true, nome: true, email: true, papel: true, ativo: true, unidade: true, fotoAtualizadaEm: true, senhaTemporaria: true } as const;

/** Gera senha aleatória de 12 caracteres (letras + números). */
export function gerarSenhaTemporaria() {
  return randomBytes(9).toString("base64url").slice(0, 12);
}

export function listarUsuarios(condominioId: string, papel?: "MORADOR" | "PORTEIRO" | "SINDICO") {
  return prisma.usuario.findMany({
    where: { papel, condominioId },
    select: publico,
    orderBy: [{ ativo: "desc" }, { nome: "asc" }],
  });
}

export async function criarUsuario(condominioId: string, dados: z.infer<typeof usuarioSchema>) {
  if (dados.unidadeId && !(await prisma.unidade.findFirst({ where: { id: dados.unidadeId, condominioId } }))) {
    throw naoEncontrado("Unidade", "f");
  }
  const senhaGerada = gerarSenhaTemporaria();
  const usuario = await prisma.usuario.create({
    data: { ...dados, condominioId, senhaHash: await bcrypt.hash(senhaGerada, 10), senhaTemporaria: true },
    select: publico,
  });
  // E-mail de boas-vindas com a senha temporária (fire-and-forget).
  enviarBoasVindas(dados.email, dados.nome, senhaGerada);
  // Devolve a senha gerada para quem cadastrou ver na tela (não é guardada em texto claro).
  return { ...usuario, senhaGerada };
}

export async function editarUsuario(condominioId: string, id: string, { nome, unidadeId }: z.infer<typeof editarSchema>) {
  const usuario = await prisma.usuario.findFirst({ where: { id, condominioId } });
  if (!usuario) throw naoEncontrado("Usuário");
  if (unidadeId !== undefined) {
    if (!ehMorador(usuario.papel)) throw new HttpError(409, "Só moradores e síndicos têm unidade");
    if (!(await prisma.unidade.findFirst({ where: { id: unidadeId, condominioId } }))) throw naoEncontrado("Unidade", "f");
  }
  const mudouUnidade = unidadeId !== undefined && unidadeId !== usuario.unidadeId;
  return prisma.usuario.update({
    where: { id },
    data: {
      ...(nome !== undefined && { nome }),
      // A unidade vai no token: mudá-la encerra a sessão para a pessoa entrar de novo com a unidade nova.
      ...(mudouUnidade && { unidadeId, tokenVersion: { increment: 1 } }),
    },
    select: publico,
  });
}

/**
 * Gera uma nova senha temporária e reenvia o e-mail. Só vale para quem ainda não fez o primeiro acesso:
 * senão quem cadastra poderia trocar a senha de alguém que já tem a própria.
 */
export async function reenviarSenha(condominioId: string, id: string) {
  const usuario = await prisma.usuario.findFirst({ where: { id, condominioId } });
  if (!usuario) throw naoEncontrado("Usuário");
  if (!usuario.ativo) throw new HttpError(409, "Reative a conta antes de reenviar a senha");
  if (!usuario.senhaTemporaria) throw new HttpError(409, "Este usuário já fez o primeiro acesso e definiu a própria senha");
  const senhaGerada = gerarSenhaTemporaria();
  // Uma sessão aberta com a senha anterior deixa de valer.
  await prisma.usuario.update({ where: { id }, data: { senhaHash: await bcrypt.hash(senhaGerada, 10), tokenVersion: { increment: 1 } } });
  enviarBoasVindas(usuario.email, usuario.nome, senhaGerada);
}

/** Desativar em vez de excluir preserva o histórico. Qualquer token emitido antes deixa de valer. */
export async function alterarAtivo(condominioId: string, id: string, ativo: boolean) {
  const existe = await prisma.usuario.findFirst({ where: { id, condominioId } });
  if (!existe) throw naoEncontrado("Usuário");
  return prisma.usuario.update({ where: { id }, data: { ativo, tokenVersion: { increment: 1 } }, select: publico });
}
