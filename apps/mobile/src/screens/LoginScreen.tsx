import { useEffect, useState } from "react";
import { BackHandler, Image, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useAuth } from "../auth/AuthContext";
import { Botao, Campo, MensagemErro } from "../ui/componentes";
import { GRADIENTE_MARCA, LOGO_C, LOGO_CASA } from "../ui/logo";
import { cores } from "../ui/tema";

/** Altura do topo colorido com a logo; o painel branco cobre o resto da tela. */
const ALTURA_TOPO = 190;
/** Tamanho da logo no topo (menor que nas Boas-vindas, só para identificar a marca aqui). */
const TAMANHO_LOGO = 56;

export function LoginScreen({ onVoltar, onEsqueciSenha }: { onVoltar: () => void; onEsqueciSenha: () => void }) {
  const { entrar } = useAuth();

  // Botão "voltar" do Android também volta para as boas-vindas (em vez de fechar o app).
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

  return (
    <View style={styles.tela}>
      <LinearGradient colors={GRADIENTE_MARCA} style={styles.topo}>
        <SafeAreaView edges={["top"]}>
          <Pressable onPress={onVoltar} hitSlop={12} style={styles.voltar} accessibilityRole="button" accessibilityLabel="Voltar">
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </Pressable>
        </SafeAreaView>
        <View style={styles.logoTopo}>
          <Image source={LOGO_C} style={styles.imagemLogoTopo} />
          <Image source={LOGO_CASA} style={styles.imagemLogoTopo} accessibilityLabel="Logo do Condomus" />
        </View>
      </LinearGradient>

      {/* "padding" também no Android: com a tela edge-to-edge, o sistema não redimensiona
          a janela quando o teclado abre, então o próprio app empurra o conteúdo para cima. */}
      <KeyboardAvoidingView style={styles.painel} behavior="padding">
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
    </View>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.superficie },
  topo: { height: ALTURA_TOPO, alignItems: "center" },
  voltar: { alignSelf: "flex-start", marginLeft: 8, marginTop: 4, padding: 8 },
  logoTopo: { position: "relative", width: TAMANHO_LOGO, height: TAMANHO_LOGO, marginTop: 4 },
  // Tamanho fixo e explícito (sem depender de absoluteFill), para a logo nunca
  // render no tamanho intrínseco do PNG (768x768) em vez do tamanho do container.
  imagemLogoTopo: { position: "absolute", top: 0, left: 0, width: TAMANHO_LOGO, height: TAMANHO_LOGO },
  // O painel sobrepõe a parte de baixo do topo colorido, criando a borda arredondada "subindo".
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
