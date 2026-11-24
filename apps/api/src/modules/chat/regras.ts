import { prisma } from "../../lib/prisma.js";
import { deletarFotoChat } from "../../lib/storage.js";

/** As mensagens (e as fotos) do chat são apagadas depois deste prazo. */
export const DIAS_RETENCAO_CHAT = 90;
const MS_DIA = 24 * 60 * 60 * 1000;

export const limiteRetencao = (agora: Date = new Date()) => new Date(agora.getTime() - DIAS_RETENCAO_CHAT * MS_DIA);

/**
 * Apaga as mensagens com mais de 90 dias. Primeiro a foto no bucket, depois a linha: se a foto não
 * puder ser removida, a linha fica e a próxima rodada tenta de novo (como na limpeza dos rostos),
 * para não sobrar foto no bucket sem registro.
 */
export async function limparMensagensAntigas(agora: Date = new Date()) {
  const antigas = await prisma.mensagemChat.findMany({
    where: { criadaEm: { lt: limiteRetencao(agora) } },
    select: { id: true, unidadeId: true, temFoto: true },
  });
  let apagadas = 0;
  let falhas = 0;
  for (const m of antigas) {
    try {
      if (m.temFoto) await deletarFotoChat(m.unidadeId, m.id);
      await prisma.mensagemChat.delete({ where: { id: m.id } });
      apagadas++;
    } catch {
      falhas++;
    }
  }
  return { apagadas, falhas };
}

/** Mensagens que a pessoa ainda não leu numa conversa: as do outro lado, depois da última leitura dela. */
export async function naoLidas(usuarioId: string, unidadeId: string, ladoDoLeitor: "MORADOR" | "PORTARIA") {
  const leitura = await prisma.leituraChat.findUnique({ where: { usuarioId_unidadeId: { usuarioId, unidadeId } } });
  return prisma.mensagemChat.count({
    where: {
      unidadeId,
      lado: { not: ladoDoLeitor },
      ...(leitura && { criadaEm: { gt: leitura.lidaEm } }),
    },
  });
}
