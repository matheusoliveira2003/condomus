import { useEffect, useRef } from "react";
import { Animated, Easing, Image, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Botao } from "../ui/componentes";
import { FUNDO_MARCA, LOGO_C, LOGO_CASA, TAMANHO_LOGO } from "../ui/logo";
import { cores } from "../ui/tema";

/**
 * Primeira tela sem login: o logo no centro (exatamente onde a abertura animada o deixa)
 * e o painel com "Entrar" e "Criar conta", que sobe por baixo quando `painelVisivel` fica verdadeiro.
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
      <View style={styles.centro} pointerEvents="none">
        <View style={{ width: TAMANHO_LOGO, height: TAMANHO_LOGO }}>
          <Image source={LOGO_C} style={StyleSheet.absoluteFill} />
          <Image source={LOGO_CASA} style={StyleSheet.absoluteFill} accessibilityLabel="Logo do Condomus" />
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
  // Centro da tela inteira: o mesmo ponto em que a abertura deixa o logo.
  centro: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center" },
  painel: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: cores.superficie,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 28,
    gap: 12,
  },
  titulo: { fontSize: 26, fontWeight: "800", color: cores.texto },
  subtitulo: { fontSize: 15, color: cores.textoSecundario, marginBottom: 8, lineHeight: 21 },
});
