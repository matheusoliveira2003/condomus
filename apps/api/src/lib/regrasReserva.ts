import { HttpError } from "./errors.js";
import { FUSO, inicioDoDia } from "./validadeVisita.js";

/**
 * Limites das reservas de áreas comuns. O app oferece só o que cabe aqui (8h às 23h, em horas
 * cheias); a API passa a exigir, para um pedido feito por outro meio não escapar da regra.
 * Se mudar o horário, mude também ABERTURA e FECHAMENTO em apps/mobile/src/screens/ReservasScreen.tsx.
 */
export const REGRAS_RESERVA = {
  aberturaHora: 8,
  fechamentoHora: 23,
  duracaoMaximaHoras: 6,
  antecedenciaMaximaDias: 60,
  /** Reservas pendentes ou futuras que uma mesma unidade pode ter em uma mesma área. */
  maximoPorUnidadeEArea: 3,
} as const;

const HORA_MS = 60 * 60 * 1000;
const DIA_MS = 24 * HORA_MS;

/** Hora cheia e dia, no fuso do condomínio. */
function partesLocais(instante: Date) {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: FUSO, hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(instante)
      .map((p) => [p.type, p.value]),
  );
  return { hora: Number(partes.hour) % 24, minuto: Number(partes.minute), segundo: Number(partes.second) };
}

/**
 * Confere se o intervalo respeita o horário de funcionamento e os limites de duração e antecedência.
 * Lança HttpError 400 com a mensagem que o app mostra. O passado e fim <= início já são tratados antes.
 */
export function validarJanela(inicio: Date, fim: Date, agora: Date = new Date()): void {
  const r = REGRAS_RESERVA;
  const a = partesLocais(inicio);
  const b = partesLocais(fim);
  if (a.minuto || a.segundo || b.minuto || b.segundo || inicio.getMilliseconds() || fim.getMilliseconds()) {
    throw new HttpError(400, "A reserva deve começar e terminar em horas cheias");
  }
  // Começa e termina no mesmo dia: o fim às 23h é o último possível. Uma reserva que termina
  // à meia-noite cairia no dia seguinte, e a regra do horário a recusa abaixo.
  if (inicioDoDia(inicio).getTime() !== inicioDoDia(new Date(fim.getTime() - 1)).getTime()) {
    throw new HttpError(400, "A reserva deve começar e terminar no mesmo dia");
  }
  if (a.hora < r.aberturaHora || b.hora > r.fechamentoHora || b.hora <= a.hora) {
    throw new HttpError(400, `As áreas funcionam das ${r.aberturaHora}h às ${r.fechamentoHora}h`);
  }
  if ((fim.getTime() - inicio.getTime()) / HORA_MS > r.duracaoMaximaHoras) {
    throw new HttpError(400, `A reserva pode ter no máximo ${r.duracaoMaximaHoras} horas`);
  }
  if (inicio.getTime() - agora.getTime() > r.antecedenciaMaximaDias * DIA_MS) {
    throw new HttpError(400, `Só é possível reservar com até ${r.antecedenciaMaximaDias} dias de antecedência`);
  }
}
