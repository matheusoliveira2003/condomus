import type { PlanoStatus } from "@prisma/client";

/**
 * O período de teste (TRIAL) acaba na data `planoExpiraEm`. O síndico é avisado nos últimos
 * DIAS_AVISO dias e, passada a data, há DIAS_CARENCIA dias de tolerância antes do bloqueio, para a
 * conversa com o suporte não acontecer com o condomínio já parado.
 * Sem `planoExpiraEm`, o teste não expira (é o caso dos condomínios criados antes desta regra).
 */
export const DIAS_AVISO = 7;
export const DIAS_CARENCIA = 3;
const MS_DIA = 24 * 60 * 60 * 1000;

export interface SituacaoPlano {
  /** Plano que vale agora: um TRIAL além da carência vira EXPIRADO. */
  status: PlanoStatus;
  /** Dias até a data de expiração (negativo depois dela); null quando não há data. */
  diasParaExpirar: number | null;
  /** O teste passou da data, mas ainda está na carência (tudo funciona; o síndico vê o aviso). */
  emCarencia: boolean;
  /** Dias de carência que restam, quando em carência. */
  diasDeCarencia: number | null;
}

export function situacaoDoPlano(
  condominio: { planoStatus: PlanoStatus; planoExpiraEm: Date | null },
  agora: Date = new Date(),
): SituacaoPlano {
  const { planoStatus, planoExpiraEm } = condominio;
  if (planoStatus !== "TRIAL" || !planoExpiraEm) {
    return { status: planoStatus, diasParaExpirar: planoExpiraEm ? Math.ceil((planoExpiraEm.getTime() - agora.getTime()) / MS_DIA) : null, emCarencia: false, diasDeCarencia: null };
  }
  const restante = planoExpiraEm.getTime() - agora.getTime();
  const fimDaCarencia = planoExpiraEm.getTime() + DIAS_CARENCIA * MS_DIA;
  const diasParaExpirar = Math.ceil(restante / MS_DIA);
  if (agora.getTime() >= fimDaCarencia) return { status: "EXPIRADO", diasParaExpirar, emCarencia: false, diasDeCarencia: null };
  if (restante < 0) {
    return { status: "TRIAL", diasParaExpirar, emCarencia: true, diasDeCarencia: Math.ceil((fimDaCarencia - agora.getTime()) / MS_DIA) };
  }
  return { status: "TRIAL", diasParaExpirar, emCarencia: false, diasDeCarencia: null };
}

/** Deve avisar o síndico: faltam até DIAS_AVISO dias, ou o teste já passou da data (carência). */
export const deveAvisar = (s: SituacaoPlano) =>
  s.emCarencia || (s.status === "TRIAL" && s.diasParaExpirar !== null && s.diasParaExpirar <= DIAS_AVISO);

/** Bloqueia moradores e funcionários (o síndico continua entrando para ver o status). */
export const planoBloqueado = (s: SituacaoPlano) => s.status === "EXPIRADO" || s.status === "SUSPENSO";
