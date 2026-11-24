import { z } from "zod";
import { HttpError, naoEncontrado } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";

/** Operações de cadastro de unidades, para o síndico (app) e o administrador (painel). */

export const unidadeSchema = z.object({
  bloco: z.string().trim().min(1).toUpperCase(),
  numero: z.string().trim().min(1),
});

/** Teto de unidades por chamada em lote: evita uma digitação errada gerar milhares de registros. */
export const MAX_LOTE = 500;

export const loteSchema = z
  .object({
    /** Um ou mais blocos (ex.: ["A", "B"]); cada um recebe todos os andares. */
    blocos: z.array(z.string().trim().min(1).toUpperCase()).min(1).max(50),
    andarInicial: z.number().int().min(0).max(200),
    andarFinal: z.number().int().min(0).max(200),
    /** Apartamentos por andar; o número é andar × 100 + posição (101, 102, 201...). */
    porAndar: z.number().int().min(1).max(99),
  })
  .refine((l) => l.andarFinal >= l.andarInicial, { message: "O andar final deve ser maior ou igual ao inicial", path: ["andarFinal"] });

export function listarUnidades(condominioId: string) {
  return prisma.unidade.findMany({
    where: { condominioId },
    include: { _count: { select: { moradores: { where: { ativo: true } } } } },
    orderBy: [{ bloco: "asc" }, { numero: "asc" }],
  });
}

export function criarUnidade(condominioId: string, dados: z.infer<typeof unidadeSchema>) {
  return prisma.unidade.create({ data: { ...dados, condominioId } });
}

/** Blocos × andares × apartamentos por andar. As que já existem são ignoradas. */
export async function criarLote(condominioId: string, { blocos, andarInicial, andarFinal, porAndar }: z.infer<typeof loteSchema>) {
  const numeros: string[] = [];
  for (let andar = andarInicial; andar <= andarFinal; andar++) {
    for (let posicao = 1; posicao <= porAndar; posicao++) numeros.push(String(andar * 100 + posicao));
  }
  const blocosUnicos = [...new Set(blocos)];
  const total = blocosUnicos.length * numeros.length;
  if (total > MAX_LOTE) throw new HttpError(400, `O lote geraria ${total} unidades; o máximo por vez é ${MAX_LOTE}`);
  const { count } = await prisma.unidade.createMany({
    data: blocosUnicos.flatMap((bloco) => numeros.map((numero) => ({ bloco, numero, condominioId }))),
    skipDuplicates: true,
  });
  return { criadas: count, ignoradas: total - count };
}

export async function editarUnidade(condominioId: string, id: string, dados: z.infer<typeof unidadeSchema>) {
  const unidade = await prisma.unidade.findFirst({ where: { id, condominioId } });
  if (!unidade) throw naoEncontrado("Unidade", "f");
  // Se bloco/número já pertencem a outra unidade, o P2002 vira 409 no manipulador global.
  return prisma.unidade.update({ where: { id }, data: dados });
}

/**
 * Só exclui unidade sem histórico: moradores, visitas, encomendas, reservas e conversas no chat ficam
 * como estão. Convites e a lista de visitantes ocultos são descartáveis e saem junto.
 */
export async function excluirUnidade(condominioId: string, id: string) {
  const unidade = await prisma.unidade.findFirst({
    where: { id, condominioId },
    select: { _count: { select: { moradores: true, visitas: true, encomendas: true, reservas: true, mensagensChat: true } } },
  });
  if (!unidade) throw naoEncontrado("Unidade", "f");

  const { moradores, visitas, encomendas, reservas, mensagensChat } = unidade._count;
  const vinculos = [
    moradores && `${moradores} ${moradores === 1 ? "morador" : "moradores"}`,
    visitas && `${visitas} ${visitas === 1 ? "visita" : "visitas"}`,
    encomendas && `${encomendas} ${encomendas === 1 ? "encomenda" : "encomendas"}`,
    reservas && `${reservas} ${reservas === 1 ? "reserva" : "reservas"}`,
    mensagensChat && `${mensagensChat} ${mensagensChat === 1 ? "mensagem no chat" : "mensagens no chat"}`,
  ].filter(Boolean);
  if (vinculos.length > 0) throw new HttpError(409, `Não é possível excluir: a unidade tem ${vinculos.join(", ")}`);

  await prisma.$transaction([
    prisma.conviteUnidade.deleteMany({ where: { unidadeId: id } }),
    prisma.visitanteOculto.deleteMany({ where: { unidadeId: id } }),
    prisma.leituraChat.deleteMany({ where: { unidadeId: id } }),
    prisma.unidade.delete({ where: { id } }),
  ]);
}
