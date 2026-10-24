import { useState } from "react";
import { ActionSheetIOS, ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { enviar, type PlanoStatus } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { useCondominio, usePerfil } from "../hooks/queries";
import { Botao, Campo, Card, MensagemErro, ModalFormulario, Secao, Selo, estilosTexto } from "../ui/componentes";
import { unidadeTexto } from "../ui/formatar";
import { Avatar } from "../ui/Avatar";
import { escolherFoto, type OrigemFoto } from "../foto";
import { cores } from "../ui/tema";
import type { Papel } from "../api/client";

const rotuloPapel: Record<Papel, string> = { MORADOR: "Morador", PORTEIRO: "Porteiro", SINDICO: "Síndico" };

const rotuloPlano: Record<PlanoStatus, { texto: string; tom: "sucesso" | "primario" | "alerta" | "neutro" }> = {
  TRIAL: { texto: "Período de teste", tom: "primario" },
  ATIVO: { texto: "Ativo", tom: "sucesso" },
  EXPIRADO: { texto: "Expirado", tom: "alerta" },
  SUSPENSO: { texto: "Suspenso", tom: "neutro" },
};

export function MinhaContaModal({ visivel, onFechar }: { visivel: boolean; onFechar: () => void }) {
  const { sair } = useAuth();
  const { data: perfil } = usePerfil(visivel);
  const [trocandoSenha, setTrocandoSenha] = useState(false);

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
      {/* Cabeçalho do perfil */}
      {perfil ? (
        <View style={styles.perfil}>
          <FotoDePerfil />
          <Text style={[estilosTexto.titulo, { fontSize: 18 }]}>{perfil.nome}</Text>
          <Text style={estilosTexto.secundario}>{perfil.email}</Text>
          <Text style={estilosTexto.corpo}>
            {rotuloPapel[perfil.papel]}
            {perfil.unidade && ` · ${unidadeTexto(perfil.unidade)}`}
          </Text>
        </View>
      ) : (
        <View style={styles.perfilCarregando}>
          <ActivityIndicator color={cores.primaria} />
        </View>
      )}

      {/* Plano (síndico) */}
      {perfil?.papel === "SINDICO" && <PlanoDoCondominio />}

      {/* Link para trocar senha */}
      <Pressable
        onPress={() => setTrocandoSenha(true)}
        style={({ pressed }) => [styles.linkSenha, pressed && { opacity: 0.6 }]}
        accessibilityRole="button"
      >
        <Ionicons name="lock-closed-outline" size={20} color={cores.primaria} />
        <Text style={styles.linkSenhaTexto}>Trocar senha</Text>
        <Ionicons name="chevron-forward" size={16} color={cores.primaria} style={{ marginLeft: "auto" }} />
      </Pressable>

      {/* Separador antes do botão de sair */}
      <View style={styles.separador} />

      <Botao titulo="Sair da conta" variante="perigo" onPress={confirmarSaida} />

      {/* Modal de troca de senha */}
      <TrocarSenhaModal visivel={trocandoSenha} onFechar={() => setTrocandoSenha(false)} />
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

/** Avatar grande; tocar abre ActionSheet com Galeria, Câmera e Remover. */
function FotoDePerfil() {
  const { usuario: usuarioOuNull, definirFoto } = useAuth();
  const [enviando, setEnviando] = useState(false);
  if (!usuarioOuNull) return null;
  // Capturamos numa constante não-nula para que o TypeScript estreite o tipo
  // dentro das closures (abrirOpcoes, etc.) sem precisar de asserções.
  const usuario = usuarioOuNull;

  async function trocar(origem: OrigemFoto) {
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

  function abrirOpcoes() {
    const opcoes = ["Galeria", "Câmera", ...(usuario.fotoAtualizadaEm ? ["Remover foto"] : []), "Cancelar"];
    const indiceDestruir = usuario.fotoAtualizadaEm ? opcoes.indexOf("Remover foto") : -1;
    const indiceCancelar = opcoes.indexOf("Cancelar");

    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: opcoes, destructiveButtonIndex: indiceDestruir, cancelButtonIndex: indiceCancelar },
        (idx) => {
          if (idx === 0) void trocar("galeria");
          else if (idx === 1) void trocar("camera");
          else if (indiceDestruir >= 0 && idx === indiceDestruir) remover();
        },
      );
    } else {
      // Android: Alert com botões
      const botoesAndroid: Parameters<typeof Alert.alert>[2] = [
        { text: "Galeria", onPress: () => void trocar("galeria") },
        { text: "Câmera", onPress: () => void trocar("camera") },
      ];
      if (usuario.fotoAtualizadaEm) botoesAndroid.push({ text: "Remover foto", style: "destructive", onPress: remover });
      botoesAndroid.push({ text: "Cancelar", style: "cancel" });
      Alert.alert("Foto de perfil", "Escolha uma opção", botoesAndroid);
    }
  }

  return (
    <Pressable
      onPress={abrirOpcoes}
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
        <View style={styles.seloCamera}>
          <Ionicons name="camera" size={16} color="#fff" />
        </View>
      )}
    </Pressable>
  );
}

/** Modal separado para troca de senha. */
function TrocarSenhaModal({ visivel, onFechar }: { visivel: boolean; onFechar: () => void }) {
  const [atual, setAtual] = useState("");
  const [nova, setNova] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState(false);
  const [salvando, setSalvando] = useState(false);

  function fechar() {
    setAtual("");
    setNova("");
    setConfirmacao("");
    setErro(null);
    setSucesso(false);
    onFechar();
  }

  async function salvar() {
    setErro(null);
    setSucesso(false);
    if (nova !== confirmacao) return setErro("A confirmação não confere com a nova senha");
    setSalvando(true);
    try {
      await enviar("PATCH", "/auth/senha", { senhaAtual: atual, novaSenha: nova });
      setSucesso(true);
      setAtual("");
      setNova("");
      setConfirmacao("");
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <ModalFormulario visivel={visivel} titulo="Trocar senha" onFechar={fechar}>
      <Campo rotulo="Senha atual" value={atual} onChangeText={setAtual} senha />
      <Campo rotulo="Nova senha" value={nova} onChangeText={setNova} senha placeholder="Mínimo de 6 caracteres" />
      <Campo rotulo="Confirmar nova senha" value={confirmacao} onChangeText={setConfirmacao} senha />
      <MensagemErro texto={erro} />
      {sucesso && (
        <View style={styles.sucesso}>
          <Ionicons name="checkmark-circle" size={18} color={cores.sucesso} />
          <Text style={{ color: cores.sucesso }}>Senha alterada com sucesso</Text>
        </View>
      )}
      <Botao titulo="Salvar nova senha" onPress={salvar} carregando={salvando} desabilitado={!atual || nova.length < 6 || !confirmacao} />
    </ModalFormulario>
  );
}

const styles = StyleSheet.create({
  perfil: { alignItems: "center", gap: 4, paddingVertical: 8 },
  perfilCarregando: { alignItems: "center", paddingVertical: 32 },
  carregandoFoto: {
    ...StyleSheet.absoluteFill,
    borderRadius: 48,
    backgroundColor: "rgba(15, 27, 45, 0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  seloCamera: {
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
  planoLinha: { flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" },
  linkSenha: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: cores.superficie,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: cores.borda,
  },
  linkSenhaTexto: { fontSize: 15, fontWeight: "500", color: cores.primaria },
  separador: { height: 1, backgroundColor: cores.borda, marginVertical: 4 },
  sucesso: { flexDirection: "row", alignItems: "center", gap: 6 },
});
