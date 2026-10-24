import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api, enviar, type Papel, type PlanoStatus, type Unidade } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { useCondominio } from "../hooks/queries";
import { Botao, Campo, Card, MensagemErro, ModalFormulario, Secao, Selo, estilosTexto } from "../ui/componentes";
import { unidadeTexto } from "../ui/formatar";
import { Avatar } from "../ui/Avatar";
import { escolherFoto, type OrigemFoto } from "../foto";
import { cores } from "../ui/tema";

const rotuloPapel: Record<Papel, string> = { MORADOR: "Morador", PORTEIRO: "Porteiro", SINDICO: "Síndico" };

const rotuloPlano: Record<PlanoStatus, { texto: string; tom: "sucesso" | "primario" | "alerta" | "neutro" }> = {
  TRIAL: { texto: "Período de teste", tom: "primario" },
  ATIVO: { texto: "Ativo", tom: "sucesso" },
  EXPIRADO: { texto: "Expirado", tom: "alerta" },
  SUSPENSO: { texto: "Suspenso", tom: "neutro" },
};

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
          <FotoDePerfil />
          <Text style={[estilosTexto.titulo, { fontSize: 18 }]}>{perfil.nome}</Text>
          <Text style={estilosTexto.secundario}>{perfil.email}</Text>
          <Text style={estilosTexto.corpo}>
            {rotuloPapel[perfil.papel]}
            {perfil.unidade && ` · ${unidadeTexto(perfil.unidade)}`}
          </Text>
        </View>
      )}
      {perfil?.papel === "SINDICO" && <PlanoDoCondominio />}
      <TrocarSenha />
      <Botao titulo="Sair da conta" variante="perigo" onPress={confirmarSaida} />
    </ModalFormulario>
  );
}

/** Situação do plano do condomínio (visível só ao síndico). */
function PlanoDoCondominio() {
  const { data: condominio } = useCondominio();
  if (!condominio) return null;
  const { texto, tom } = rotuloPlano[condominio.planoStatus];
  return (
    <Card>
      <Secao titulo="Plano do condomínio" />
      <Text style={estilosTexto.corpo}>{condominio.nome}</Text>
      <View style={styles.planoLinha}>
        <Selo texto={texto} tom={tom} />
        {condominio.planoExpiraEm && (
          <Text style={estilosTexto.secundario}>
            {condominio.planoStatus === "EXPIRADO" ? "Expirou em " : "Válido até "}
            {new Date(condominio.planoExpiraEm).toLocaleDateString("pt-BR")}
          </Text>
        )}
      </View>
    </Card>
  );
}

/** Avatar grande; tocar mostra as opções de galeria, câmera e remover. */
function FotoDePerfil() {
  const { usuario, definirFoto } = useAuth();
  const [opcoesAbertas, setOpcoesAbertas] = useState(false);
  const [enviando, setEnviando] = useState(false);
  if (!usuario) return null;

  async function trocar(origem: OrigemFoto) {
    setOpcoesAbertas(false);
    try {
      const imagem = await escolherFoto(origem);
      if (!imagem) return;
      setEnviando(true);
      const { fotoAtualizadaEm } = await enviar<{ fotoAtualizadaEm: string }>("PUT", "/auth/foto", { imagem });
      definirFoto(fotoAtualizadaEm);
    } catch (e) {
      Alert.alert("Foto de perfil", (e as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  function remover() {
    setOpcoesAbertas(false);
    Alert.alert("Remover foto", "Deseja remover sua foto de perfil?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Remover",
        style: "destructive",
        onPress: () =>
          enviar("DELETE", "/auth/foto")
            .then(() => definirFoto(null))
            .catch((e: Error) => Alert.alert("Erro", e.message)),
      },
    ]);
  }

  return (
    <View style={styles.fotoArea}>
      <Pressable
        onPress={() => setOpcoesAbertas((v) => !v)}
        disabled={enviando}
        accessibilityRole="button"
        accessibilityLabel="Alterar foto de perfil"
      >
        <Avatar pessoa={usuario} tamanho={96} />
        {enviando ? (
          <View style={styles.carregandoFoto}>
            <ActivityIndicator color="#fff" />
          </View>
        ) : (
          <View style={styles.selo}>
            <Ionicons name="camera" size={16} color="#fff" />
          </View>
        )}
      </Pressable>
      {opcoesAbertas && (
        <View style={styles.opcoesFoto}>
          <Botao titulo="Galeria" variante="secundario" pequeno onPress={() => trocar("galeria")} />
          <Botao titulo="Câmera" variante="secundario" pequeno onPress={() => trocar("camera")} />
          {usuario.fotoAtualizadaEm && <Botao titulo="Remover" variante="secundario" pequeno onPress={remover} />}
        </View>
      )}
    </View>
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


const styles = StyleSheet.create({
  perfil: { alignItems: "center", gap: 4, paddingVertical: 8 },
  fotoArea: { alignItems: "center", gap: 10, marginBottom: 8 },
  carregandoFoto: {
    ...StyleSheet.absoluteFill,
    borderRadius: 48,
    backgroundColor: "rgba(15, 27, 45, 0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  selo: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: cores.primaria,
    borderWidth: 2,
    borderColor: cores.superficie,
    alignItems: "center",
    justifyContent: "center",
  },
  opcoesFoto: { flexDirection: "row", gap: 8, flexWrap: "wrap", justifyContent: "center" },
  sucesso: { flexDirection: "row", alignItems: "center", gap: 6 },
  planoLinha: { flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" },
});
