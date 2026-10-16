import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { CORPO_PALAVRA, FONTE_MARCA, FUNDO_MARCA, LOGO_C, LOGO_CASA, TAMANHO_LOGO } from "../ui/logo";

/** Para onde a abertura leva: boas-vindas (o logo se encaixa no da tela), o app (some) ou ainda indefinido. */
export type DestinoAbertura = "boasVindas" | "app" | null;

const RESTO = "ondomus".split("");

/**
 * Abertura: "Condomus" aparece, as letras depois do "C" somem, o "C" vai para o centro da tela e
 * vira o logo (do mesmo tamanho) e a casa surge dentro dele. Toque para pular.
 * Nas boas-vindas o logo fica exatamente nesse lugar, então a abertura só precisa sair de cena;
 * se já houver alguém logado, ela some revelando o app. O destino pode chegar depois
 * (ex.: enquanto o app confere o login salvo) — o logo espera no centro.
 */
export function AberturaAnimada({ destino, onTerminar }: { destino: DestinoAbertura; onTerminar: () => void }) {
  const [medidas, setMedidas] = useState<{ palavra: number; c: number } | null>(null);
  const [chegouAoMeio, setChegouAoMeio] = useState(false);
  const terminou = useRef(false);

  const fundo = useRef(new Animated.Value(1)).current;
  const palavra = useRef(new Animated.Value(0)).current;
  const letras = useRef(RESTO.map(() => new Animated.Value(1))).current;
  const moverC = useRef(new Animated.Value(0)).current;
  const textoC = useRef(new Animated.Value(1)).current;
  const logo = useRef(new Animated.Value(0)).current; // opacidade do logo
  const casa = useRef(new Animated.Value(0)).current;

  const terminar = () => {
    if (terminou.current) return;
    terminou.current = true;
    onTerminar();
  };

  // Acessibilidade: com "reduzir movimento" ligado, pula a animação.
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then((reduzir) => reduzir && setChegouAoMeio(true));
  }, []);

  // Parte 1: da palavra ao logo no centro. Começa uma única vez, com a palavra e o "C" já medidos:
  // as duas medições chegam em momentos diferentes, e reiniciar a cada uma fazia a animação engasgar.
  const pronta = !!medidas && medidas.palavra > 0 && medidas.c > 0;
  const iniciou = useRef(false);
  useEffect(() => {
    if (!pronta || iniciou.current) return;
    iniciou.current = true;
    const t = (valor: Animated.Value, para: number, duracao: number, easing = Easing.out(Easing.cubic)) =>
      Animated.timing(valor, { toValue: para, duration: duracao, easing, useNativeDriver: true });
    const animacao = Animated.sequence([
      t(palavra, 1, 450),
      Animated.delay(250),
      Animated.parallel([
        // As letras somem da direita para a esquerda enquanto o "C" desliza para o centro.
        Animated.stagger(45, [...letras].reverse().map((l) => t(l, 0, 220))),
        t(moverC, 1, 520, Easing.inOut(Easing.cubic)),
      ]),
      // O "C" da fonte vira o "C" desenhado do logo, no mesmo lugar e tamanho.
      Animated.parallel([t(textoC, 0, 260), t(logo, 1, 260)]),
      Animated.spring(casa, { toValue: 1, friction: 5, tension: 70, useNativeDriver: true }),
      Animated.delay(200),
    ]);
    animacao.start(({ finished }) => finished && setChegouAoMeio(true));
  }, [pronta]); // eslint-disable-line react-hooks/exhaustive-deps

  // Parte 2: com o logo no centro e o destino conhecido, segue para ele.
  useEffect(() => {
    if (!chegouAoMeio || !destino) return;
    // Boas-vindas: o logo de lá está neste mesmo lugar, então basta sair (o painel sobe por baixo).
    if (destino === "boasVindas") return terminar();
    const animacao = Animated.timing(fundo, { toValue: 0, duration: 300, useNativeDriver: true });
    animacao.start(terminar);
    return () => animacao.stop();
  }, [chegouAoMeio, destino]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pular: vai direto para o fim (o destino ainda pode demorar; nesse caso espera nele, já com o logo pronto).
  function pular() {
    [palavra, moverC, logo, casa].forEach((v) => v.setValue(1));
    letras.forEach((l) => l.setValue(0));
    textoC.setValue(0);
    setChegouAoMeio(true);
  }

  // Deslocamento do "C" até o centro da tela: da metade da palavra até a metade do "C".
  const deslocamentoC = medidas ? medidas.palavra / 2 - medidas.c / 2 : 0;

  return (
    <Pressable style={StyleSheet.absoluteFill} onPress={pular} accessibilityLabel="Abertura do Condomus. Toque para pular.">
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: FUNDO_MARCA, opacity: fundo }]} />

      {/* Palavra: o "C" e o resto, para animar separadamente. */}
      <View style={styles.centro} pointerEvents="none">
        <Animated.View
          renderToHardwareTextureAndroid
          shouldRasterizeIOS
          style={{ flexDirection: "row", opacity: palavra }}
          onLayout={(e) => {
            const larguraPalavra = e.nativeEvent.layout.width;
            setMedidas((m) => (m ? { ...m, palavra: larguraPalavra } : { palavra: larguraPalavra, c: 0 }));
          }}
        >
          <Animated.Text
            style={[
              styles.texto,
              {
                opacity: textoC,
                transform: [{ translateX: moverC.interpolate({ inputRange: [0, 1], outputRange: [0, deslocamentoC] }) }],
              },
            ]}
            onLayout={(e) => {
              const larguraC = e.nativeEvent.layout.width;
              setMedidas((m) => ({ palavra: m?.palavra ?? 0, c: larguraC }));
            }}
          >
            C
          </Animated.Text>
          {RESTO.map((letra, i) => (
            <Animated.Text key={i} style={[styles.texto, { opacity: letras[i] }]}>
              {letra}
            </Animated.Text>
          ))}
        </Animated.View>
      </View>

      {/* Logo: aparece no lugar do "C" (centro da tela), do mesmo tamanho, e recebe a casa. */}
      <View style={styles.centro} pointerEvents="none">
        <Animated.View renderToHardwareTextureAndroid shouldRasterizeIOS style={{ width: TAMANHO_LOGO, height: TAMANHO_LOGO, opacity: logo }}>
          <Image source={LOGO_C} style={StyleSheet.absoluteFill} />
          <Animated.Image source={LOGO_CASA} style={[StyleSheet.absoluteFill, { opacity: casa, transform: [{ scale: casa }] }]} />
        </Animated.View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  centro: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center" },
  texto: { fontFamily: FONTE_MARCA, fontSize: CORPO_PALAVRA, color: "#fff", letterSpacing: -0.5, includeFontPadding: false },
});
