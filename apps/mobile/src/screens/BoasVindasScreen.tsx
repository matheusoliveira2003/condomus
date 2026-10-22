import { useEffect, useRef } from "react";
import { Animated, Easing, Image, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Botao } from "../ui/componentes";
import { FUNDO_MARCA, GRADIENTE_MARCA, LOGO_C, LOGO_CASA } from "../ui/logo";
import { cores } from "../ui/tema";

/** Tamanho da logo nas Boas-vindas (igual ao usado na abertura, ver AberturaAnimada). */
const TAMANHO_LOGO = 88;

/**
 * Primeira tela sem login: o logo no centro e o painel com "Entrar" e "Criar conta",
 * que sobe por baixo quando `painelVisivel` fica verdadeiro.
 */
export function BoasVindasScreen({
  painelVisivel,
  onEntrar,
  onCriarConta,
}: {
  painelVisivel: boolean;
  onEntrar: () => void;
  onCriarConta: () => void;
}) {
  const insets = useSafeAreaInsets();
  const entrada = useRef(new Animated.Value(painelVisivel ? 1 : 0)).current;

  useEffect(() => {
    if (!painelVisivel) return;
    Animated.timing(entrada, { toValue: 1, duration: 520, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [painelVisivel, entrada]);

  return (
    <View style={styles.tela}>
      <LinearGradient colors={GRADIENTE_MARCA} style={StyleSheet.absoluteFill} />
      {/* Logo só na faixa azul de cima — centralizar na tela inteira a deixava atrás do painel. */}
      <View style={styles.areaLogo} pointerEvents="none">
        <View style={styles.caixaLogo}>
          <Image source={LOGO_C} style={styles.imagemLogo} />
          <Image source={LOGO_CASA} style={styles.imagemLogo} accessibilityLabel="Logo do Condomus" />
        </View>
      </View>

      <Animated.View
        style={[
          styles.painel,
          {
            paddingBottom: insets.bottom + 24,
            opacity: entrada,
            // Sobe de baixo da tela até o lugar.
            transform: [{ translateY: entrada.interpolate({ inputRange: [0, 1], outputRange: [360, 0] }) }],
          },
        ]}
      >
        <Text style={styles.titulo}>Bem-vindo!</Text>
        <Text style={styles.subtitulo}>Entre com sua conta ou peça acesso ao seu condomínio.</Text>
        <Botao titulo="Entrar" onPress={onEntrar} />
        <Botao titulo="Criar conta" variante="secundario" onPress={onCriarConta} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: FUNDO_MARCA },
  // Ocupa só a parte de cima da tela (acima de onde o painel sobe), para a logo
  // ficar centralizada na faixa azul em vez de atrás do painel branco.
  areaLogo: { position: "absolute", top: 0, left: 0, right: 0, bottom: "40%", alignItems: "center", justifyContent: "center" },
  // Tamanho fixo e explícito na própria caixa e em cada imagem (sem depender de
  // absoluteFill), para a logo nunca render no tamanho intrínseco do PNG (768x768).
  caixaLogo: { position: "relative", width: TAMANHO_LOGO, height: TAMANHO_LOGO },
  imagemLogo: { position: "absolute", top: 0, left: 0, width: TAMANHO_LOGO, height: TAMANHO_LOGO },
  painel: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: cores.superficie,
    paddingHorizontal: 24,
    paddingTop: 28,
    gap: 12,
  },
  titulo: { fontSize: 26, fontWeight: "800", color: cores.texto },
  subtitulo: { fontSize: 15, color: cores.textoSecundario, marginBottom: 8, lineHeight: 21 },
});
