import { useEffect } from "react";
import { useNavigation, useRoute } from "@react-navigation/native";

/**
 * Atalhos da tela inicial navegam com `{ novo: true }` para abrir o formulário
 * direto. Chama `abrir` e limpa o parâmetro, para não reabrir ao voltar à aba.
 */
export function useAbrirFormularioPorParametro(abrir: () => void) {
  const rota = useRoute();
  const navegacao = useNavigation();
  const novo = (rota.params as { novo?: boolean } | undefined)?.novo;

  useEffect(() => {
    if (!novo) return;
    abrir();
    navegacao.setParams({ novo: undefined } as never);
  }, [novo, abrir, navegacao]);
}
