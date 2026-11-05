import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Appearance, useColorScheme, View } from "react-native";
import * as SecureStore from "expo-secure-store";

/**
 * Duas paletas azul-marinho (clara e escura). Em cada uma, as combinações de texto/fundo
 * usadas no app têm contraste de pelo menos 4,5:1 (mínimo WCAG AA para texto comum).
 * Verde, âmbar e vermelho ficam reservados para status (sucesso, aguardando, perigo).
 *
 * `textoSobreCor` é o texto sobre fundos `primaria` e `perigo` (botões, chips ativos):
 * branco no tema claro; azul quase preto no escuro, onde essas cores são mais claras.
 */
export interface Paleta {
  primaria: string;
  primariaClara: string;
  fundo: string;
  superficie: string;
  borda: string;
  texto: string;
  textoSecundario: string;
  textoSobreCor: string;
  perigo: string;
  perigoClaro: string;
  perigoBorda: string;
  sucesso: string;
  sucessoClaro: string;
  alerta: string;
  alertaClaro: string;
  neutroClaro: string;
}

export const paletaClara: Paleta = {
  primaria: "#1E3A5F",
  primariaClara: "#E3ECF7",
  fundo: "#F5F7FA",
  superficie: "#FFFFFF",
  borda: "#E2E8F0",
  texto: "#0F1B2D",
  textoSecundario: "#5B6472",
  textoSobreCor: "#FFFFFF",
  perigo: "#C62828",
  perigoClaro: "#FEF2F2",
  perigoBorda: "#FECACA",
  sucesso: "#15803D",
  sucessoClaro: "#DCFCE7",
  alerta: "#B45309",
  alertaClaro: "#FEF3C7",
  neutroClaro: "#EEF1F5",
};

export const paletaEscura: Paleta = {
  primaria: "#6FA3E0",
  primariaClara: "#1F3250",
  fundo: "#0E1621",
  superficie: "#17212F",
  borda: "#2A3648",
  texto: "#E6EBF2",
  textoSecundario: "#9AA7B8",
  textoSobreCor: "#0B1626",
  perigo: "#F28B82",
  perigoClaro: "#3A1D1F",
  perigoBorda: "#6B2C2C",
  sucesso: "#4ADE80",
  sucessoClaro: "#14301F",
  alerta: "#FBBF24",
  alertaClaro: "#3A2E10",
  neutroClaro: "#222D3D",
};

export type Preferencia = "claro" | "escuro" | "sistema";
export type Esquema = "claro" | "escuro";

const CHAVE_PREFERENCIA = "condomus.tema";
const FUNDO_CARREGANDO = "#1E3A5F";

interface Contexto {
  cores: Paleta;
  esquema: Esquema;
  preferencia: Preferencia;
  definirPreferencia: (preferencia: Preferencia) => void;
}

const TemaContext = createContext<Contexto | null>(null);

export function TemaProvider({ children }: { children: ReactNode }) {
  const sistema = useColorScheme();
  const [preferencia, setPreferencia] = useState<Preferencia>("sistema");
  const [carregado, setCarregado] = useState(false);

  // Lê a escolha salva antes de mostrar qualquer tela, para não piscar no tema errado.
  useEffect(() => {
    SecureStore.getItemAsync(CHAVE_PREFERENCIA)
      .then((salva) => {
        if (salva === "claro" || salva === "escuro" || salva === "sistema") setPreferencia(salva);
      })
      .catch(() => {})
      .finally(() => setCarregado(true));
  }, []);

  const esquema: Esquema = preferencia === "sistema" ? (sistema === "dark" ? "escuro" : "claro") : preferencia;

  // Faz os componentes nativos (teclado, seletores) acompanharem a escolha.
  useEffect(() => {
    Appearance.setColorScheme(preferencia === "sistema" ? "unspecified" : preferencia === "escuro" ? "dark" : "light");
  }, [preferencia]);

  const definirPreferencia = useCallback((nova: Preferencia) => {
    setPreferencia(nova);
    SecureStore.setItemAsync(CHAVE_PREFERENCIA, nova).catch(() => {});
  }, []);

  const valor = useMemo<Contexto>(
    () => ({ cores: esquema === "escuro" ? paletaEscura : paletaClara, esquema, preferencia, definirPreferencia }),
    [esquema, preferencia, definirPreferencia],
  );

  if (!carregado) return <View style={{ flex: 1, backgroundColor: FUNDO_CARREGANDO }} />;
  return <TemaContext.Provider value={valor}>{children}</TemaContext.Provider>;
}

export function useTema() {
  const ctx = useContext(TemaContext);
  if (!ctx) throw new Error("useTema precisa estar dentro de <TemaProvider>");
  return ctx;
}

/** Paleta do tema ativo. */
export function useCores() {
  return useTema().cores;
}

/** Estilos que dependem da paleta: recriados só quando o tema muda. */
export function useEstilos<T>(criar: (cores: Paleta) => T): T {
  const cores = useCores();
  return useMemo(() => criar(cores), [criar, cores]);
}
