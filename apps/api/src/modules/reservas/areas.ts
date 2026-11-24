import { z } from "zod";
import { HttpError, naoEncontrado } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";

/** Cadastro das áreas comuns, para o síndico (app) e o administrador (painel). */

export const areaSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome da área").max(60),
  descricao: z.string().trim().max(200).optional(),
  capacidade: z.number().int().min(1).max(10000).optional(),
});

export const areaEdicaoSchema = areaSchema.extend({ ativa: z.boolean().optional() });

export function listarAreas(condominioId: string, { incluirInativas = false } = {}) {
  return prisma.areaComum.findMany({
    where: { condominioId, ...(incluirInativas ? {} : { ativa: true }) },
    orderBy: { nome: "asc" },
  });
}

export async function criarArea(condominioId: string, { nome, descricao, capacidade }: z.infer<typeof areaSchema>) {
  const existente = await prisma.areaComum.findUnique({ where: { condominioId_nome: { condominioId, nome } } });
  if (existente) throw new HttpError(409, "Já existe uma área com esse nome");
  return prisma.areaComum.create({ data: { nome, descricao: descricao || null, capacidade: capacidade ?? null, condominioId } });
}

/** Edita os dados e, se informado, ativa ou desativa. Área desativada some da lista de reservas; o histórico fica. */
export async function editarArea(condominioId: string, id: string, { nome, descricao, capacidade, ativa }: z.infer<typeof areaEdicaoSchema>) {
  const area = await prisma.areaComum.findFirst({ where: { id, condominioId } });
  if (!area) throw naoEncontrado("Área comum", "f");
  if (nome !== area.nome) {
    const outra = await prisma.areaComum.findUnique({ where: { condominioId_nome: { condominioId, nome } } });
    if (outra) throw new HttpError(409, "Já existe uma área com esse nome");
  }
  return prisma.areaComum.update({
    where: { id },
    data: { nome, descricao: descricao || null, capacidade: capacidade ?? null, ...(ativa !== undefined && { ativa }) },
  });
}
