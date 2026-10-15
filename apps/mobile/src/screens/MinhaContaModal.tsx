import { useEffect, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api, enviar, type Papel, type Unidade } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { Botao, Campo, Card, MensagemErro, ModalFormulario, Secao, estilosTexto } from "../ui/componentes";
import { unidadeTexto } from "../ui/formatar";
import { cores } from "../ui/tema";

const rotuloPapel: Record<Papel, string> = { MORADOR: "Morador", PORTEIRO: "Porteiro", SINDICO: "Síndico" };

interface Perfil {
  nome: string;
  email: string;
  papel: Papel;
  unidade: Unidade | null;
}

export function MinhaContaModal({ visivel, onFechar }: { visivel: boolean; onFechar: () => void }) {
  const { sair } = useAuth();
  const [perfil, setPerfil] = useState<Perfil | null>(null);

  useEffect(() => {
    if (visivel) api<Perfil>("/auth/me").then(setPerfil).catch(() => setPerfil(null));
  }, [visivel]);

  function confirmarSaida() {
    Alert.alert("Sair", "Deseja sair da sua conta?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Sair",
        style: "destructive",
        onPress: () => {
          onFechar();
          void sair();
        },
      },
    ]);
  }

  return (
    <ModalFormulario visivel={visivel} titulo="Minha conta" onFechar={onFechar}>
      {perfil && (
        <View style={styles.perfil}>
          <View style={styles.avatar}>
            <Text style={styles.iniciais}>{iniciais(perfil.nome)}</Text>
          </View>
          <Text style={[estilosTexto.titulo, { fontSize: 18 }]}>{perfil.nome}</Text>
          <Text style={estilosTexto.secundario}>{perfil.email}</Text>
          <Text style={estilosTexto.corpo}>
            {rotuloPapel[perfil.papel]}
            {perfil.unidade && ` · ${unidadeTexto(perfil.unidade)}`}
          </Text>
        </View>
      )}
      <TrocarSenha />
      <Botao titulo="Sair da conta" variante="perigo" onPress={confirmarSaida} />
    </ModalFormulario>
  );
}

function TrocarSenha() {
  const [atual, setAtual] = useState("");
  const [nova, setNova] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState(false);
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    setErro(null);
    setSucesso(false);
    if (nova !== confirmacao) return setErro("A confirmação não confere com a nova senha");
    setSalvando(true);
    try {
      await enviar("PATCH", "/auth/senha", { senhaAtual: atual, novaSenha: nova });
      setAtual("");
      setNova("");
      setConfirmacao("");
      setSucesso(true);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Card>
      <Secao titulo="Trocar senha" />
      <Campo rotulo="Senha atual" value={atual} onChangeText={setAtual} secureTextEntry />
      <Campo rotulo="Nova senha" value={nova} onChangeText={setNova} secureTextEntry placeholder="Mínimo de 6 caracteres" />
      <Campo rotulo="Confirmar nova senha" value={confirmacao} onChangeText={setConfirmacao} secureTextEntry />
      <MensagemErro texto={erro} />
      {sucesso && (
        <View style={styles.sucesso}>
          <Ionicons name="checkmark-circle" size={18} color={cores.sucesso} />
          <Text style={{ color: cores.sucesso }}>Senha alterada com sucesso</Text>
        </View>
      )}
      <Botao titulo="Salvar nova senha" onPress={salvar} carregando={salvando} desabilitado={!atual || nova.length < 6 || !confirmacao} />
    </Card>
  );
}

const iniciais = (nome: string) => {
  const partes = nome.trim().split(/\s+/);
  return (partes[0][0] + (partes.length > 1 ? partes[partes.length - 1][0] : "")).toUpperCase();
};

const styles = StyleSheet.create({
  perfil: { alignItems: "center", gap: 4, paddingVertical: 8 },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: cores.primaria,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  iniciais: { color: "#fff", fontSize: 26, fontWeight: "700" },
  sucesso: { flexDirection: "row", alignItems: "center", gap: 6 },
});
