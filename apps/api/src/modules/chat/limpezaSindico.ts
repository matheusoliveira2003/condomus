import { prisma } from "../../lib/prisma.js";
import { deletarFotoChat } from "../../lib/storage.js";
import { PREFIXO_LEMBRETE } from "../encomendas/lembretes.js";

/**
 * Limpeza de uma vez: o síndico deixou de falar com a portaria (agora é um morador, com a conversa da própria
 * unidade), então as mensagens que ele mandou como "a portaria" são apagadas, com as fotos.
 *
 * O critério é estreito de propósito:
 *  - lado PORTARIA e autor com papel SINDICO. Mensagens do porteiro, e as do síndico como morador (lado MORADOR), ficam;
 *  - o lembrete automático de encomenda parada não entra: ele leva o autor de quem registrou a encomenda, que podia
 *    ser o síndico, mas é uma mensagem da portaria para o morador e não deve sumir.
 */
const criterio = {
  lado: "PORTARIA" as const,
  autor: { papel: "SINDICO" as const },
  NOT: { texto: { startsWith: PREFIXO_LEMBRETE } },
};

/** Quantas mensagens seriam apagadas, sem apagar nada. */
export const contarMensagensDoSindico = () => prisma.mensagemChat.count({ where: criterio });

/**
 * Apaga as mensagens do síndico na portaria. Primeiro a foto no bucket, depois a linha: se a foto não puder ser
 * removida, a linha fica e uma nova execução tenta de novo. Idempotente: sem mensagens que casem, não faz nada.
 */
export async function apagarMensagensDoSindico() {
  const alvo = await prisma.mensagemChat.findMany({ where: criterio, select: { id: true, unidadeId: true, temFoto: true } });
  let apagadas = 0;
  let falhas = 0;
  for (const m of alvo) {
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
