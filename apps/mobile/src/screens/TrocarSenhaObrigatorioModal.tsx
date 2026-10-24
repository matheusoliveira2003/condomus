import { useState } from "react";
import { SafeAreaView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { enviar } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { Botao, Campo, MensagemErro } from "../ui/componentes";
import { cores } from "../ui/tema";

/**
 * Tela de troca obrigatória de senha — aparece quando o usuário faz login
 * com uma senha gerada automaticamente pelo síndico (senhaTemporaria = true).
 * Substitui toda a área logada até a senha ser trocada.
 */
export function TrocarSenhaObrigatorioModal() {
  const { sair, confirmarTrocaDeSenha } = useAuth();
  const [nova, setNova] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    if (nova.length < 6) return setErro("A nova senha deve ter pelo menos 6 caracteres");
    if (nova !== confirmacao) return setErro("A confirmação não confere com a nova senha");
    setErro(null);
    setSalvando(true);
    try {
      // senhaAtual ignorada pelo servidor quando senhaTemporaria=true.
      await enviar("PATCH", "/auth/senha", { senhaAtual: "", novaSenha: nova });
      confirmarTrocaDeSenha();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.conteudo}>
        <View style={styles.icone}>
          <Ionicons name="lock-closed" size={32} color={cores.primaria} />
        </View>
        <Text style={styles.titulo}>Defina sua senha</Text>
        <Text style={styles.subtitulo}>
          Sua senha foi gerada automaticamente. Por segurança, defina uma senha pessoal antes de continuar.
        </Text>
        <Campo
          rotulo="Nova senha"
          value={nova}
          onChangeText={setNova}
          senha
          placeholder="Mínimo de 6 caracteres"
        />
        <Campo
          rotulo="Confirmar nova senha"
          value={confirmacao}
          onChangeText={setConfirmacao}
          senha
          onSubmitEditing={salvar}
        />
        <MensagemErro texto={erro} />
        <Botao
          titulo="Definir senha"
          onPress={salvar}
          carregando={salvando}
          desabilitado={nova.length < 6 || !confirmacao}
        />
        <Botao titulo="Sair" variante="discreto" onPress={() => void sair()} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: cores.fundo },
  conteudo: { flex: 1, padding: 24, gap: 16, justifyContent: "center" },
  icone: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: cores.primariaClara,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: 8,
  },
  titulo: { fontSize: 24, fontWeight: "800", color: cores.texto, textAlign: "center" },
  subtitulo: { fontSize: 15, color: cores.textoSecundario, lineHeight: 22, textAlign: "center" },
});
