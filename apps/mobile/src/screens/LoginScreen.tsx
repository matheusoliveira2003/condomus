import { useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
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
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={styles.marca}>
        <View style={styles.logo}>
          <Ionicons name="business" size={40} color="#fff" />
        </View>
        <Text style={styles.titulo}>Condomus</Text>
        <Text style={styles.subtitulo}>Seu condomínio em um só lugar</Text>
      </View>
      <Campo
        rotulo="E-mail"
        placeholder="voce@email.com"
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <Campo
        rotulo="Senha"
        placeholder="••••••"
        secureTextEntry
        value={senha}
        onChangeText={setSenha}
        onSubmitEditing={aoEntrar}
      />
      <MensagemErro texto={erro} />
      <Botao titulo="Entrar" onPress={aoEntrar} carregando={carregando} desabilitado={!email || !senha} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 24, gap: 16, backgroundColor: cores.fundo },
  marca: { alignItems: "center", marginBottom: 24, gap: 8 },
  logo: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: cores.primaria,
    alignItems: "center",
    justifyContent: "center",
  },
  titulo: { fontSize: 30, fontWeight: "700", color: cores.texto },
  subtitulo: { fontSize: 15, color: cores.textoSecundario },
});
