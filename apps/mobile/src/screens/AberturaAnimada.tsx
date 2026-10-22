import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet } from "react-native";
import { FUNDO_MARCA } from "../ui/logo";

/** Para onde a abertura leva: boas-vindas, o app (já logado), ou ainda indefinido. */
export type DestinoAbertura = "boasVindas" | "app" | null;

/** Quanto tempo o fundo fica parado antes de poder sair de cena. */
const DURACAO_PARADA = 900;

/**
 * Abertura simples: uma tela azul-marinho (a cor da marca) aparece, fica parada um instante
 * e desaparece com fade, revelando a tela de trás. Toque para pular. O destino pode chegar
 * depois (ex.: enquanto confere o login salvo) — nesse caso a tela só fica esperando.
 */
export function AberturaAnimada({ destino, onTerminar }: { destino: DestinoAbertura; onTerminar: () => void }) {
  const [chegouAoMeio, setChegouAoMeio] = useState(false);
  const terminou = useRef(false);
  const iniciou = useRef(false);

  const fundo = useRef(new Animated.Value(1)).current;

  const terminar = () => {
    if (terminou.current) return;
    terminou.current = true;
    onTerminar();
  };

  // Acessibilidade: com "reduzir movimento" ligado, pula a espera.
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then((reduzir) => reduzir && setChegouAoMeio(true));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Parte 1: fica parada por um instante antes de poder sair de cena.
  useEffect(() => {
    if (iniciou.current) return;
    iniciou.current = true;
    const espera = setTimeout(() => setChegouAoMeio(true), DURACAO_PARADA);
    return () => clearTimeout(espera);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Parte 2: com a espera terminada e o destino conhecido, sai de cena (fade-out do fundo).
  useEffect(() => {
    if (!chegouAoMeio || !destino) return;
    const animacao = Animated.timing(fundo, { toValue: 0, duration: 400, easing: Easing.inOut(Easing.quad), useNativeDriver: true });
    animacao.start(terminar);
    return () => animacao.stop();
  }, [chegouAoMeio, destino]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pular: vai direto para o fim (o destino ainda pode demorar; nesse caso espera nele).
  function pular() {
    setChegouAoMeio(true);
  }

  return (
    <Pressable style={StyleSheet.absoluteFill} onPress={pular} accessibilityLabel="Abertura do Condomus. Toque para pular.">
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: FUNDO_MARCA, opacity: fundo }]} />
    </Pressable>
  );
}
