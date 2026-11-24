import { prisma } from "../../lib/prisma.js";
import { naoEncontrado } from "../../lib/errors.js";
import { gerarCodigoConvite } from "../../lib/codigo.js";

/** O convite de uma unidade vale por este tempo depois de gerado. */
export const VALIDADE_CONVITE_DIAS = 7;

/** Gera o convite para o morador se cadastrar na unidade. O pendente anterior é descartado: só há um por unidade. */
export async function gerarConviteDaUnidade(condominioId: string, unidadeId: string) {
  const unidade = await prisma.unidade.findFirst({ where: { id: unidadeId, condominioId } });
  if (!unidade) throw naoEncontrado("Unidade", "f");
  const expiraEm = new Date(Date.now() + VALIDADE_CONVITE_DIAS * 24 * 60 * 60 * 1000);
  const codigo = gerarCodigoConvite();
  await prisma.$transaction([
    prisma.conviteUnidade.deleteMany({ where: { unidadeId, usadoEm: null } }),
    prisma.conviteUnidade.create({ data: { codigo, expiraEm, unidadeId } }),
  ]);
  return { codigo, expiraEm };
}
