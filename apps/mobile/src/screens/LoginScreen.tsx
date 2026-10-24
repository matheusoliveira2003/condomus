import { useEffect, useState } from "react";
import { Animated, BackHandler, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../auth/AuthContext";
import { Botao, Campo, MensagemErro } from "../ui/componentes";
import { cores } from "../ui/tema";

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

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [lembrar, setLembrar] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  // Bloqueia toques e BackHandler quando o painel não está visível.
  const [ativo, setAtivo] = useState(!progresso);

  // O painel sobe de DISTANCIA_ENTRADA → 0 conforme progresso vai de 0 → 1.
  const translateY = progresso
    ? progresso.interpolate({ inputRange: [0, 1], outputRange: [DISTANCIA_ENTRADA, 0] })
    : new Animated.Value(0);

  // A tela inteira fica transparente quando não está visível (progresso = 0).
  const opacity = progresso
    ? progresso.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 1, 1] })
    : new Animated.Value(1);

  useEffect(() => {
    if (!progresso) { setAtivo(true); return; }
    const id = progresso.addListener(({ value }) => {
      if (value > 0.05 && !ativo) setAtivo(true);
      if (value < 0.05 && ativo) setAtivo(false);
    });
    return () => progresso.removeListener(id);
  });

  // BackHandler só age quando a tela está visível (ativo=true).
  useEffect(() => {
    if (!ativo) return;
    const assinatura = BackHandler.addEventListener("hardwareBackPress", () => {
      onVoltar();
      return true;
    });
    return () => assinatura.remove();
  }, [ativo, onVoltar]);

  async function aoEntrar() {
    Keyboard.dismiss();
    setErro(null);
    setCarregando(true);
    try {
      await entrar(email, senha, lembrar);
    } catch (e) {
      setErro((e as Error).message);
      setCarregando(false);
    }
  }

  return (
    <Animated.View style={[StyleSheet.absoluteFill, { opacity }]} pointerEvents={ativo ? "auto" : "none"}>
      <Animated.View style={[styles.painel, { transform: [{ translateY }] }]}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "height" : "padding"}>
          <ScrollView contentContainerStyle={styles.conteudo} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
            <View style={styles.linhaVoltar}>
              <Pressable onPress={onVoltar} hitSlop={12} accessibilityRole="button" accessibilityLabel="Voltar">
                <Ionicons name="arrow-back" size={24} color={cores.texto} />
              </Pressable>
              <Text style={styles.ola}>Inicie sua sessão</Text>
            </View>
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
                  {lembrar && <Ionicons name="checkmark" size={11} color="#fff" />}
                </View>
                <Text style={styles.checkboxTexto}>Lembrar-me</Text>
              </Pressable>
              <Pressable onPress={onEsqueciSenha} hitSlop={8} style={{ marginTop: 3 }}>
                <Text style={styles.link}>Esqueceu sua senha?</Text>
              </Pressable>
            </View>
            <Botao titulo="Entrar" onPress={aoEntrar} carregando={carregando} desabilitado={!email || !senha} />
            <MensagemErro texto={erro} />
          </ScrollView>
        </KeyboardAvoidingView>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  painel: {
    ...StyleSheet.absoluteFill,
    backgroundColor: cores.superficie,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    marginTop: 80,
  },
  conteudo: { flexGrow: 1, padding: 24, paddingTop: 32, gap: 14 },
  linhaVoltar: { flexDirection: "row", alignItems: "center", gap: 10 },
  ola: { fontSize: 30, fontWeight: "800", color: cores.texto },
  subtitulo: { fontSize: 15, color: cores.textoSecundario, marginBottom: 4 },
  linhaMeio: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  checkboxLinha: { flexDirection: "row", alignItems: "center", gap: 8 },
  checkbox: {
    width: 17,
    height: 17,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: cores.borda,
    backgroundColor: cores.superficie,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxAtivo: { backgroundColor: cores.primaria, borderColor: cores.primaria },
  checkboxTexto: { fontSize: 13, color: cores.textoSecundario },
  link: { color: cores.textoSecundario, fontSize: 13, textDecorationLine: "underline" },
});
