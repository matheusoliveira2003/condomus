import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../auth/AuthContext";
import { Botao } from "../ui/componentes";
import { cores } from "../ui/tema";

/** Mostrada no lugar do app quando o plano do condomínio está expirado ou suspenso (a API responde 402). */
export function PlanoInativoScreen() {
  const { sair } = useAuth();
  return (
    <SafeAreaView style={styles.tela} edges={["top", "bottom"]}>
      <View style={styles.conteudo}>
        <Ionicons name="lock-closed-outline" size={56} color={cores.textoSecundario} />
        <Text style={styles.titulo}>Plano inativo</Text>
        <Text style={styles.texto}>
          O plano do seu condomínio está expirado ou suspenso, por isso o acesso ao app está temporariamente bloqueado. Fale com o síndico para
          regularizar.
        </Text>
      </View>
      <View style={styles.rodape}>
        <Botao titulo="Sair" variante="secundario" onPress={() => void sair()} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.superficie },
  conteudo: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 14 },
  titulo: { fontSize: 24, fontWeight: "800", color: cores.texto },
  texto: { fontSize: 15, color: cores.textoSecundario, textAlign: "center", lineHeight: 22 },
  rodape: { padding: 24 },
});
