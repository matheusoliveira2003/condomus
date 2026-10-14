import { useCallback, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";

/**
 * Carrega dados sempre que a tela ganha foco e expõe o estado para
 * pull-to-refresh. `carregar` deve ser estável (useCallback).
 */
export function useCarregar<T>(carregar: () => Promise<T>, inicial: T) {
  const [dados, setDados] = useState<T>(inicial);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const recarregar = useCallback(async () => {
    setCarregando(true);
    try {
      setDados(await carregar());
      setErro(null);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [carregar]);

  useFocusEffect(
    useCallback(() => {
      void recarregar();
    }, [recarregar]),
  );

  return { dados, carregando, erro, recarregar };
}
