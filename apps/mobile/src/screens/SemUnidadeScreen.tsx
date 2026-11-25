import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../auth/AuthContext";
import { Botao } from "../ui/componentes";
import { useCores, useEstilos, type Paleta } from "../ui/tema";

/**
 * Mostrada a quem mora numa unidade (morador ou síndico) mas ainda não tem uma vinculada. Acontece, por exemplo, com o
 * síndico de um condomínio recém-criado: o administrador cadastra as unidades e vincula cada pessoa pelo painel.
 */
export function SemUnidadeScreen() {
  const cores = useCores();
  const styles = useEstilos(criarStyles);
  const { sair } = useAuth();
  return (
    <SafeAreaView style={styles.tela} edges={["top", "bottom"]}>
      <View style={styles.conteudo}>
        <Ionicons name="home-outline" size={56} color={cores.textoSecundario} />
        <Text style={styles.titulo}>Falta vincular a sua unidade</Text>
        <Text style={styles.texto}>
          Sua conta ainda não está ligada a um apartamento, por isso as visitas, as encomendas, as reservas e o chat ainda não estão disponíveis. Fale com a
          administração do condomínio para vincular a sua unidade. Depois, saia e entre de novo no app.
        </Text>
      </View>
      <View style={styles.rodape}>
        <Botao titulo="Sair" variante="secundario" onPress={() => void sair()} />
      </View>
    </SafeAreaView>
  );
}

const criarStyles = (cores: Paleta) =>
  StyleSheet.create({
    tela: { flex: 1, backgroundColor: cores.superficie },
    conteudo: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 14 },
    titulo: { fontSize: 24, fontWeight: "800", color: cores.texto, textAlign: "center" },
    texto: { fontSize: 15, color: cores.textoSecundario, textAlign: "center", lineHeight: 22 },
    rodape: { padding: 24 },
  });
