import { Text } from "react-native";
import type { StatusVisita, Visita } from "../api/client";
import { Selo, useEstilosTexto } from "./componentes";
import { data, dataHora } from "./formatar";

const rotulos: Record<StatusVisita, { texto: string; tom: "neutro" | "sucesso" | "alerta" | "primario" }> = {
  AGENDADA: { texto: "Agendada", tom: "primario" },
  EM_ANDAMENTO: { texto: "No condomínio", tom: "sucesso" },
  FINALIZADA: { texto: "Finalizada", tom: "neutro" },
  CANCELADA: { texto: "Cancelada", tom: "neutro" },
};

export const SeloVisita = ({ status }: { status: StatusVisita }) => <Selo {...rotulos[status]} />;

/** Linhas de detalhe comuns aos cards de visita (morador e portaria). */
export function DetalhesVisita({ visita }: { visita: Visita }) {
  const estilosTexto = useEstilosTexto();
  const linhas = [
    visita.documento && `Documento: ${visita.documento}`,
    visita.placaVeiculo && `Placa: ${visita.placaVeiculo}`,
    visita.dataPrevista && `Previsto para ${data(visita.dataPrevista)}`,
    visita.entradaEm && `Entrada: ${dataHora(visita.entradaEm)}`,
    visita.saidaEm && `Saída: ${dataHora(visita.saidaEm)}`,
  ].filter(Boolean);
  return linhas.map((l) => (
    <Text key={l as string} style={estilosTexto.secundario}>
      {l}
    </Text>
  ));
}

/** Próximos dias como opções de chip, com valor ISO (meia-noite local). */
export function proximosDias(quantidade: number) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return Array.from({ length: quantidade }, (_, i) => {
    const d = new Date(hoje);
    d.setDate(hoje.getDate() + i);
    const rotulo = i === 0 ? "Hoje" : i === 1 ? "Amanhã" : data(d);
    return { valor: d.toISOString(), rotulo };
  });
}
