import { useRef, useState } from "react";
import { Animated, ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from "react-native";
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
  const { sair, usuario, definirFoto } = useAuth();
  const { data: perfil } = usePerfil(visivel);
  const [trocandoSenha, setTrocandoSenha] = useState(false);
  const [sheetAberto, setSheetAberto] = useState(false);
  const [enviandoFoto, setEnviandoFoto] = useState(false);

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

  async function trocar(origem: OrigemFoto) {
    setSheetAberto(false);
    try {
      const imagem = await escolherFoto(origem);
      if (!imagem) return;
      setEnviandoFoto(true);
      const { fotoAtualizadaEm } = await enviar<{ fotoAtualizadaEm: string }>("PUT", "/auth/foto", { imagem });
      definirFoto(fotoAtualizadaEm);
    } catch (e) {
      Alert.alert("Foto de perfil", (e as Error).message);
    } finally {
      setEnviandoFoto(false);
    }
  }

  function removerFoto() {
    setSheetAberto(false);
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
    <ModalFormulario
      visivel={visivel}
      titulo="Minha conta"
      onFechar={onFechar}
      overlay={
        <FotoSheet
          visivel={sheetAberto}
          temFoto={!!usuario?.fotoAtualizadaEm}
          onGaleria={() => void trocar("galeria")}
          onCamera={() => void trocar("camera")}
          onRemover={removerFoto}
          onFechar={() => setSheetAberto(false)}
        />
      }
    >
      {/* Cabeçalho do perfil */}
      {perfil ? (
        <View style={styles.perfil}>
          <FotoDePerfil enviando={enviandoFoto} onAbrirSheet={() => setSheetAberto(true)} />
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

/** Avatar grande; tocar chama onAbrirSheet para exibir o sheet no nível correto. */
function FotoDePerfil({ enviando, onAbrirSheet }: { enviando: boolean; onAbrirSheet: () => void }) {
  const { usuario } = useAuth();
  if (!usuario) return null;

  return (
    <Pressable
      onPress={onAbrirSheet}
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

/** Bottom sheet customizado para seleção de foto de perfil. */
function FotoSheet({
  visivel,
  temFoto,
  onGaleria,
  onCamera,
  onRemover,
  onFechar,
}: {
  visivel: boolean;
  temFoto: boolean;
  onGaleria: () => void;
  onCamera: () => void;
  onRemover: () => void;
  onFechar: () => void;
}) {
  const translateY = useRef(new Animated.Value(300)).current;
  const opacidade = useRef(new Animated.Value(0)).current;

  // Anima entrada e saída do sheet.
  if (visivel) {
    Animated.parallel([
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 4 }),
      Animated.timing(opacidade, { toValue: 1, duration: 180, useNativeDriver: true }),
    ]).start();
  } else {
    Animated.parallel([
      Animated.timing(translateY, { toValue: 300, duration: 200, useNativeDriver: true }),
      Animated.timing(opacidade, { toValue: 0, duration: 180, useNativeDriver: true }),
    ]).start();
  }

  if (!visivel && (translateY as any)._value >= 300) return null;

  return (
    <Animated.View style={[stylesSheet.fundo, { opacity: opacidade }]}>
      <Pressable style={{ flex: 1 }} onPress={onFechar} />
      <Animated.View style={[stylesSheet.sheet, { transform: [{ translateY }] }]}>
        <View style={stylesSheet.alca} />
        <Text style={stylesSheet.titulo}>Foto de perfil</Text>
        <OpcaoSheet icone="images-outline" texto="Escolher da galeria" onPress={onGaleria} />
        <OpcaoSheet icone="camera-outline" texto="Tirar foto" onPress={onCamera} />
        {temFoto && (
          <>
            <View style={stylesSheet.separador} />
            <OpcaoSheet icone="trash-outline" texto="Remover foto" onPress={onRemover} perigo />
          </>
        )}
        <Pressable onPress={onFechar} style={stylesSheet.cancelar}>
          <Text style={stylesSheet.cancelarTexto}>Cancelar</Text>
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

function OpcaoSheet({
  icone,
  texto,
  onPress,
  perigo,
}: {
  icone: keyof typeof Ionicons.glyphMap;
  texto: string;
  onPress: () => void;
  perigo?: boolean;
}) {
  const cor = perigo ? cores.perigo : cores.texto;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [stylesSheet.opcao, pressed && { backgroundColor: cores.fundo }]}
    >
      <View style={[stylesSheet.opcaoIcone, perigo && { backgroundColor: "#fff0f0" }]}>
        <Ionicons name={icone} size={20} color={cor} />
      </View>
      <Text style={[stylesSheet.opcaoTexto, { color: cor }]}>{texto}</Text>
      {!perigo && <Ionicons name="chevron-forward" size={16} color={cores.textoSecundario} style={{ marginLeft: "auto" }} />}
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

const stylesSheet = StyleSheet.create({
  fundo: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
    zIndex: 100,
  },
  sheet: {
    backgroundColor: cores.superficie,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingBottom: 32,
    paddingTop: 12,
  },
  alca: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: cores.borda,
    alignSelf: "center",
    marginBottom: 16,
  },
  titulo: {
    fontSize: 13,
    fontWeight: "600",
    color: cores.textoSecundario,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  opcao: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderRadius: 10,
  },
  opcaoIcone: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: cores.primariaClara,
    alignItems: "center",
    justifyContent: "center",
  },
  opcaoTexto: { fontSize: 16, fontWeight: "500" },
  separador: { height: 1, backgroundColor: cores.borda, marginVertical: 4 },
  cancelar: {
    marginTop: 8,
    paddingVertical: 14,
    alignItems: "center",
    borderRadius: 12,
    backgroundColor: cores.fundo,
  },
  cancelarTexto: { fontSize: 16, fontWeight: "600", color: cores.textoSecundario },
});
