import { useEffect, useState } from "react";
import { Animated, BackHandler, Image, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../auth/AuthContext";
import { Botao, Campo, MensagemErro } from "../ui/componentes";
import { LOGO_C, LOGO_CASA } from "../ui/logo";
import { cores } from "../ui/tema";

/** Altura do topo colorido com a logo. */
const ALTURA_TOPO = 190;
const TAMANHO_LOGO = 56;
/** Distância que o painel percorre ao entrar (vindo de baixo) ou ao sair (para baixo). */
const DISTANCIA_ENTRADA = 600;

export function LoginScreen({
  onVoltar,
  onEsqueciSenha,
  progresso,
}: {
  onVoltar: () => void;
  onEsqueciSenha: () => void;
  /** Animated.Value 0→1: 0 = boas-vindas visível, 1 = login visível. */
  progresso?: Animated.Value;
}) {
  const { entrar } = useAuth();

  useEffect(() => {
    const assinatura = BackHandler.addEventListener("hardwareBackPress", () => {
      onVoltar();
      return true;
    });
    return () => assinatura.remove();
  }, [onVoltar]);

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [lembrar, setLembrar] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  async function aoEntrar() {
    setErro(null);
    setCarregando(true);
    try {
      await entrar(email, senha, lembrar);
    } catch (e) {
      setErro((e as Error).message);
      setCarregando(false);
    }
  }

  // O painel sobe de DISTANCIA_ENTRADA → 0 conforme progresso vai de 0 → 1.
  const translateY = progresso
    ? progresso.interpolate({ inputRange: [0, 1], outputRange: [DISTANCIA_ENTRADA, 0] })
    : new Animated.Value(0);

  // A tela inteira fica transparente quando não está visível (progresso = 0),
  // para o gradiente da BoasVindasScreen aparecer por baixo.
  const opacity = progresso
    ? progresso.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 1, 1] })
    : new Animated.Value(1);

  // Bloqueia toques quando o painel ainda não está visível (progresso = 0),
  // para não interceptar os botões da BoasVindasScreen atrás.
  const [ativo, setAtivo] = useState(false);
  useEffect(() => {
    if (!progresso) { setAtivo(true); return; }
    const id = progresso.addListener(({ value }) => {
      if (value > 0.05 && !ativo) setAtivo(true);
      if (value < 0.05 && ativo) setAtivo(false);
    });
    return () => progresso.removeListener(id);
  });

  return (
    <Animated.View style={[StyleSheet.absoluteFill, { opacity }]} pointerEvents={ativo ? "auto" : "none"}>
      {/* Fundo branco da tela — fica em position absolute para o gradiente aparecer atrás enquanto anima */}
      <View style={styles.tela}>
        {/* Topo colorido: sem gradiente próprio — o da BoasVindasScreen aparece por trás durante a animação */}
        <View style={styles.topo}>
          <SafeAreaView edges={["top"]}>
            <Pressable onPress={onVoltar} hitSlop={12} style={styles.voltar} accessibilityRole="button" accessibilityLabel="Voltar">
              <Ionicons name="arrow-back" size={24} color="#fff" />
            </Pressable>
          </SafeAreaView>
          <View style={styles.logoTopo}>
            <Image source={LOGO_C} style={styles.imagemLogoTopo} />
            <Image source={LOGO_CASA} style={styles.imagemLogoTopo} accessibilityLabel="Logo do Condomus" />
          </View>
        </View>

        <Animated.View style={[styles.painel, { transform: [{ translateY }] }]}>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
            <ScrollView contentContainerStyle={styles.conteudo} keyboardShouldPersistTaps="handled">
              <Text style={styles.ola}>Olá!</Text>
              <Text style={styles.subtitulo}>Entre com sua conta para continuar</Text>

              <View style={{ height: 8 }} />
              <Campo
                icone="mail-outline"
                placeholder="E-mail"
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
              />
              <Campo
                icone="lock-closed-outline"
                placeholder="Senha"
                senha
                autoComplete="current-password"
                value={senha}
                onChangeText={setSenha}
                onSubmitEditing={aoEntrar}
              />
              <View style={styles.linhaMeio}>
                <Pressable
                  onPress={() => setLembrar((v) => !v)}
                  style={styles.checkboxLinha}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: lembrar }}
                >
                  <View style={[styles.checkbox, lembrar && styles.checkboxAtivo]}>
                    {lembrar && <Ionicons name="checkmark" size={13} color="#fff" />}
                  </View>
                  <Text style={styles.checkboxTexto}>Lembrar-me</Text>
                </Pressable>
                <Pressable onPress={onEsqueciSenha} hitSlop={8}>
                  <Text style={styles.link}>Esqueceu sua senha?</Text>
                </Pressable>
              </View>
              <Botao titulo="Entrar" onPress={aoEntrar} carregando={carregando} desabilitado={!email || !senha} />
              <MensagemErro texto={erro} />
            </ScrollView>
          </KeyboardAvoidingView>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: "transparent" },
  topo: { height: ALTURA_TOPO, alignItems: "center" },
  voltar: { alignSelf: "flex-start", marginLeft: 8, marginTop: 4, padding: 8 },
  logoTopo: { position: "relative", width: TAMANHO_LOGO, height: TAMANHO_LOGO, marginTop: 4 },
  imagemLogoTopo: { position: "absolute", top: 0, left: 0, width: TAMANHO_LOGO, height: TAMANHO_LOGO },
  painel: {
    flex: 1,
    marginTop: -28,
    backgroundColor: cores.superficie,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  conteudo: { flexGrow: 1, padding: 24, paddingTop: 32, gap: 14 },
  ola: { fontSize: 26, fontWeight: "800", color: cores.texto },
  subtitulo: { fontSize: 15, color: cores.textoSecundario, marginBottom: 4 },
  linhaMeio: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  checkboxLinha: { flexDirection: "row", alignItems: "center", gap: 8 },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: cores.borda,
    backgroundColor: cores.superficie,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxAtivo: { backgroundColor: cores.primaria, borderColor: cores.primaria },
  checkboxTexto: { fontSize: 13, color: cores.textoSecundario },
  link: { color: cores.primaria, fontWeight: "500", fontSize: 13, textDecorationLine: "underline" },
});
