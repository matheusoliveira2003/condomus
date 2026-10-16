import { useEffect } from "react";
import { useNavigation, useRoute } from "@react-navigation/native";

/**
 * Abre algo na tela (um formulário, uma lista) quando ela é aberta com o parâmetro
 * `nome` verdadeiro — ex.: atalhos do Início navegam com `{ novo: true }`.
 * Depois limpa o parâmetro, para não reabrir ao voltar à aba.
 */
export function useAbrirPorParametro(nome: string, abrir: () => void) {
  const rota = useRoute();
  const navegacao = useNavigation();
  const ativo = (rota.params as Record<string, unknown> | undefined)?.[nome] === true;

  useEffect(() => {
    if (!ativo) return;
    abrir();
    navegacao.setParams({ [nome]: undefined } as never);
  }, [ativo, abrir, navegacao, nome]);
}
