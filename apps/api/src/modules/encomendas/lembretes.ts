import { prisma } from "../../lib/prisma.js";
import { notificarUnidade } from "../../lib/push.js";

/**
 * Lembrete automático de encomenda parada: se o morador demora para retirar, o chat da unidade recebe
 * uma mensagem da portaria. Passados DIAS_ATE_LEMBRAR, o lembrete sai; se a encomenda continuar parada,
 * repete a cada DIAS_ATE_LEMBRAR, até MAX_LEMBRETES vezes.
 */
export const DIAS_ATE_LEMBRAR = 3;
export const MAX_LEMBRETES = 3;
const MS_DIA = 24 * 60 * 60 * 1000;

/** Marca o início do texto, para ficar claro no chat que a mensagem não foi digitada por uma pessoa. */
export const PREFIXO_LEMBRETE = "📦 Lembrete automático:";

const diasEntre = (de: Date, ate: Date) => Math.floor((ate.getTime() - de.getTime()) / MS_DIA);
const plural = (n: number, singular: string, pluralizado: string) => `${n} ${n === 1 ? singular : pluralizado}`;

/** Texto da mensagem: uma linha por encomenda, com há quantos dias ela está na portaria. */
export function textoDoLembrete(encomendas: { descricao: string; recebidaEm: Date }[], agora: Date): string {
  const itens = encomendas.map((e) => {
    const dias = diasEntre(e.recebidaEm, agora);
    return `• ${e.descricao} (${dias === 1 ? "há 1 dia" : `há ${dias} dias`})`;
  });
  const quantas = plural(encomendas.length, "encomenda aguardando retirada", "encomendas aguardando retirada");
  return `${PREFIXO_LEMBRETE} você tem ${quantas} na portaria:\n${itens.join("\n")}`;
}

/**
 * Envia os lembretes que já venceram. Uma mensagem por unidade por rodada, juntando as encomendas dela,
 * e um único push. Cada encomenda guarda quantos lembretes já recebeu e quando foi o último, e a
 * atualização só vale se ninguém mexeu nela desde a leitura: duas execuções ao mesmo tempo não enviam
 * o mesmo lembrete duas vezes. Devolve quantas mensagens saíram.
 */
export async function lembrarEncomendasParadas(agora: Date = new Date()): Promise<number> {
  const abertas = await prisma.encomenda.findMany({
    where: { status: "AGUARDANDO_RETIRADA", lembretesEnviados: { lt: MAX_LEMBRETES } },
    select: { id: true, descricao: true, recebidaEm: true, ultimoLembreteEm: true, lembretesEnviados: true, unidadeId: true, recebidaPorId: true },
    orderBy: { recebidaEm: "asc" },
  });

  // O prazo conta do último lembrete, ou da chegada se ainda não houve nenhum.
  const vencidas = abertas.filter((e) => agora.getTime() - (e.ultimoLembreteEm ?? e.recebidaEm).getTime() >= DIAS_ATE_LEMBRAR * MS_DIA);

  const porUnidade = new Map<string, typeof vencidas>();
  for (const e of vencidas) porUnidade.set(e.unidadeId, [...(porUnidade.get(e.unidadeId) ?? []), e]);

  let enviadas = 0;
  for (const [unidadeId, grupo] of porUnidade) {
    const gravou = await prisma.$transaction(async (tx) => {
      // Reserva cada encomenda do grupo: só segue quem ainda está no contador que lemos.
      let reservadas = 0;
      for (const e of grupo) {
        const { count } = await tx.encomenda.updateMany({
          where: { id: e.id, status: "AGUARDANDO_RETIRADA", lembretesEnviados: e.lembretesEnviados },
          data: { lembretesEnviados: { increment: 1 }, ultimoLembreteEm: agora },
        });
        reservadas += count;
      }
      // Alguma foi retirada ou já lembrada por outra execução: desiste, e a transação desfaz as reservas.
      if (reservadas !== grupo.length) throw new LembreteJaEnviado();
      await tx.mensagemChat.create({
        data: {
          unidadeId,
          // A mensagem sai em nome de quem registrou a encomenda mais antiga do grupo.
          autorId: grupo[0].recebidaPorId,
          lado: "PORTARIA",
          texto: textoDoLembrete(grupo, agora),
        },
      });
      return true;
    }).catch((e) => {
      if (e instanceof LembreteJaEnviado) return false;
      throw e;
    });

    if (gravou) {
      enviadas++;
      notificarUnidade(unidadeId, {
        titulo: "📦 Encomenda aguardando retirada",
        corpo: grupo.length === 1 ? grupo[0].descricao : `${grupo.length} encomendas na portaria`,
        dados: { aba: "Chat", unidadeId },
      });
    }
  }
  return enviadas;
}

/** Outra execução (ou uma retirada) chegou primeiro: não enviar este lembrete. */
class LembreteJaEnviado extends Error {}
