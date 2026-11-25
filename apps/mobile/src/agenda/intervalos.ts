/**
 * Regras de data da agenda de reservas. Puras (sem React), para serem testadas sem o app.
 * Os intervalos são calculados no fuso do aparelho, que é o de Brasília para quem usa o app no condomínio.
 */

/** Horário de funcionamento da linha do tempo do dia (horas cheias, como na API). */
export const ABERTURA = 8;
export const FECHAMENTO = 23;

/** Início e fim (exclusivo) de um dia no fuso local. */
export function diaDe(data: Date): { inicio: Date; fim: Date } {
  const inicio = new Date(data.getFullYear(), data.getMonth(), data.getDate());
  const fim = new Date(data.getFullYear(), data.getMonth(), data.getDate() + 1);
  return { inicio, fim };
}

/** Início e fim (exclusivo) de um mês. */
export function mesDe(data: Date): { inicio: Date; fim: Date } {
  return {
    inicio: new Date(data.getFullYear(), data.getMonth(), 1),
    fim: new Date(data.getFullYear(), data.getMonth() + 1, 1),
  };
}

/** Início e fim (exclusivo) de um ano. */
export function anoDe(data: Date): { inicio: Date; fim: Date } {
  return { inicio: new Date(data.getFullYear(), 0, 1), fim: new Date(data.getFullYear() + 1, 0, 1) };
}

/**
 * Converte o intervalo de uma reserva em faixas dentro de um dia, em porcentagem da linha do tempo (ABERTURA às FECHAMENTO).
 * Uma reserva que atravessa a meia-noite só aparece no dia em que começa (dentro do dia, o fim é cortado).
 * Devolve `null` se a reserva não toca o dia ou fica fora do horário de funcionamento.
 */
export function faixaNoDia(inicio: Date, fim: Date, dia: Date): { inicioPct: number; fimPct: number } | null {
  const { inicio: ini, fim: fimDia } = diaDe(dia);
  const inicioVisivel = Math.max(inicio.getTime(), ini.getTime());
  const fimVisivel = Math.min(fim.getTime(), fimDia.getTime());
  if (fimVisivel <= inicioVisivel) return null;

  const abertura = new Date(ini.getTime() + ABERTURA * 3_600_000).getTime();
  const fechamento = new Date(ini.getTime() + FECHAMENTO * 3_600_000).getTime();
  const inicioLinha = Math.max(inicioVisivel, abertura);
  const fimLinha = Math.min(fimVisivel, fechamento);
  if (fimLinha <= inicioLinha) return null;

  const total = fechamento - abertura;
  return {
    inicioPct: ((inicioLinha - abertura) / total) * 100,
    fimPct: ((fimLinha - abertura) / total) * 100,
  };
}

/** Quantas reservas ocupam cada dia do mês (índice 0 = dia 1), para as marcações do calendário. */
export function contarPorDia<T extends { inicio: string; fim: string }>(reservas: T[], mes: Date): number[] {
  const dias = new Date(mes.getFullYear(), mes.getMonth() + 1, 0).getDate();
  const contagem = Array<number>(dias).fill(0);
  for (const r of reservas) {
    for (let d = 0; d < dias; d++) {
      const dia = new Date(mes.getFullYear(), mes.getMonth(), d + 1);
      if (faixaNoDia(new Date(r.inicio), new Date(r.fim), dia)) contagem[d]++;
    }
  }
  return contagem;
}

/** Quantas reservas começam em cada mês do ano (índice 0 = janeiro). */
export function contarPorMes<T extends { inicio: string }>(reservas: T[], ano: Date): number[] {
  const contagem = Array<number>(12).fill(0);
  for (const r of reservas) {
    const d = new Date(r.inicio);
    if (d.getFullYear() === ano.getFullYear()) contagem[d.getMonth()]++;
  }
  return contagem;
}
