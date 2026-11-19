import { prisma } from "./prisma.js";

/**
 * Validade do convite de uma visita agendada.
 *  - Com data prevista, o convite só vale naquele dia (no fuso do condomínio) e vence no fim dele.
 *  - Sem data ("qualquer dia"), vale por DIAS_SEM_DATA a partir do agendamento.
 * O app manda a data como meia-noite local do dia escolhido; em Brasília isso chega como 03:00 UTC,
 * por isso o dia é sempre calculado no fuso do condomínio e não em UTC.
 */
export const FUSO = "America/Sao_Paulo";
export const DIAS_SEM_DATA = 30;
const MS_DIA = 24 * 60 * 60 * 1000;

/** Brasília não tem horário de verão desde 2019: o deslocamento é fixo, o que mantém o cálculo simples e exato. */
const DESLOCAMENTO_HORAS = 3;

/** Início (00:00 no fuso do condomínio) do dia que contém o instante. */
export function inicioDoDia(instante: Date): Date {
  const local = new Date(instante.getTime() - DESLOCAMENTO_HORAS * 60 * 60 * 1000);
  const meiaNoiteLocalComoUtc = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  return new Date(meiaNoiteLocalComoUtc + DESLOCAMENTO_HORAS * 60 * 60 * 1000);
}

/** Momento em que o convite deixa de valer. */
export function venceEm(visita: { dataPrevista: Date | null; criadoEm: Date }): Date {
  if (visita.dataPrevista) return new Date(inicioDoDia(visita.dataPrevista).getTime() + MS_DIA);
  return new Date(visita.criadoEm.getTime() + DIAS_SEM_DATA * MS_DIA);
}

export const venceu = (visita: { dataPrevista: Date | null; criadoEm: Date }, agora: Date = new Date()) =>
  agora >= venceEm(visita);

/** Convite que ainda não chegou ao dia previsto (entrada antecipada). */
export const antesDoDia = (visita: { dataPrevista: Date | null }, agora: Date = new Date()) =>
  !!visita.dataPrevista && agora < inicioDoDia(visita.dataPrevista);

/** Visitas sem data ("qualquer dia") que ainda estão dentro da validade de 30 dias. */
export const semDataValida = (agora: Date = new Date()) => ({
  dataPrevista: null,
  criadoEm: { gt: new Date(agora.getTime() - DIAS_SEM_DATA * MS_DIA) },
});

/** Filtro Prisma das AGENDADAS que ainda valem, para as listas, o resumo e os contadores. */
export function aindaValem(agora: Date = new Date()) {
  const inicioHoje = inicioDoDia(agora);
  return {
    OR: [
      // Com data: o dia previsto é hoje ou depois.
      { dataPrevista: { gte: inicioHoje } },
      // Sem data: dentro dos 30 dias do agendamento.
      { dataPrevista: null, criadoEm: { gt: new Date(agora.getTime() - DIAS_SEM_DATA * MS_DIA) } },
    ],
  };
}

/** Filtro Prisma das AGENDADAS vencidas, para o cancelamento automático. */
export function vencidas(agora: Date = new Date()) {
  const inicioHoje = inicioDoDia(agora);
  return {
    OR: [
      { dataPrevista: { lt: inicioHoje } },
      { dataPrevista: null, criadoEm: { lte: new Date(agora.getTime() - DIAS_SEM_DATA * MS_DIA) } },
    ],
  };
}

/**
 * Cancela as visitas AGENDADAS cujo convite venceu. A leitura já esconde as vencidas e a entrada as
 * recusa, então o atraso desta limpeza (roda de tempos em tempos) não deixa nenhuma entrar: ela só
 * evita que fiquem para sempre como "agendadas" no histórico.
 */
export async function cancelarVisitasVencidas(agora: Date = new Date()) {
  const { count } = await prisma.visita.updateMany({
    where: { status: "AGENDADA", ...vencidas(agora) },
    data: { status: "CANCELADA" },
  });
  return count;
}
