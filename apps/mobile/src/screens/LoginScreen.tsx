import { useState } from "react";
import { Image, KeyboardAvoidingView, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../auth/AuthContext";
import { Botao, Campo, MensagemErro } from "../ui/componentes";
import { cores } from "../ui/tema";

export function LoginScreen() {
  const { entrar } = useAuth();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  async function aoEntrar() {
    setErro(null);
    setCarregando(true);
    try {
      await entrar(email, senha);
    } catch (e) {
      setErro((e as Error).message);
      setCarregando(false);
    }
  }

  return (
    // "padding" também no Android: com a tela edge-to-edge, o sistema não redimensiona
    // a janela quando o teclado abre, então o próprio app empurra o conteúdo para cima.
    <SafeAreaView style={{ flex: 1, backgroundColor: cores.fundo }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <View style={styles.marca}>
            <Image source={require("../../assets/icon.png")} style={styles.logo} accessibilityLabel="Logo do Condomus" />
            <Text style={styles.titulo}>Condomus</Text>
            <Text style={styles.subtitulo}>Seu condomínio em um só lugar</Text>
          </View>
          <Campo
            placeholder="E-mail"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <Campo
            placeholder="Senha"
            senha
            autoComplete="current-password"
            value={senha}
            onChangeText={setSenha}
            onSubmitEditing={aoEntrar}
          />
          <MensagemErro texto={erro} />
          <Botao titulo="Entrar" onPress={aoEntrar} carregando={carregando} desabilitado={!email || !senha} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // flexGrow centraliza quando sobra espaço e deixa rolar quando o teclado ocupa a tela.
  container: { flexGrow: 1, justifyContent: "center", padding: 24, gap: 16 },
  marca: { alignItems: "center", marginBottom: 24, gap: 8 },
  // O ícone do app é um quadrado cheio; o arredondamento vem do estilo, como nos launchers.
  logo: { width: 96, height: 96, borderRadius: 24 },
  titulo: { fontSize: 30, fontWeight: "700", color: cores.texto },
  subtitulo: { fontSize: 15, color: cores.textoSecundario },
});
