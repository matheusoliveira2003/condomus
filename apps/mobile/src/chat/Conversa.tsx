import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Image, KeyboardAvoidingView, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useIsFocused } from "@react-navigation/native";
import { useQueryClient } from "@tanstack/react-query";
import { API_URL, obterToken, type LadoChat, type MensagemChat } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { escolherFoto, type OrigemFoto } from "../foto";
import { keys, marcarChatLido, useConversa, useEnviarMensagem } from "../hooks/queries";
import { Avatar } from "../ui/Avatar";
import { MensagemErro, useEstilosTexto } from "../ui/componentes";
import { data, hora } from "../ui/formatar";
import { useMensagens } from "../ui/mensagens";
import { useCores, useEstilos, type Paleta } from "../ui/tema";
import { ehMorador } from "@condomus/types";

/** Lado maior da foto enviada no chat: legível (etiqueta de encomenda, por exemplo) e abaixo de 500 KB. */
const LADO_FOTO_CHAT = 1024;
const TAMANHO_MAXIMO_TEXTO = 1000;

/**
 * Conversa do chat entre a portaria e uma unidade. O morador abre sem `unidadeId` (é a da própria
 * unidade); a portaria e o síndico informam qual. Com a tela em foco, busca as novas mensagens de
 * tempos em tempos e marca a conversa como lida.
 */
export function Conversa({ unidadeId }: { unidadeId?: string }) {
  const cores = useCores();
  const styles = useEstilos(criarStyles);
  const estilosTexto = useEstilosTexto();
  const mensagens = useMensagens();
  const qc = useQueryClient();
  const { usuario } = useAuth();
  const emFoco = useIsFocused();
  const meuLado: LadoChat = usuario && ehMorador(usuario.papel) ? "MORADOR" : "PORTARIA";

  const conversa = useConversa(unidadeId, emFoco);
  const enviarMensagem = useEnviarMensagem(unidadeId);
  const [texto, setTexto] = useState("");
  const itens = conversa.data ?? [];
  // Distância do topo da tela até a conversa (cabeçalho da aba, ou do modal na portaria). O teclado
  // empurra o campo por essa medida real, em vez de um número fixo que varia entre aparelhos.
  const raiz = useRef<View>(null);
  const [deslocamento, setDeslocamento] = useState(0);
  const medir = () => raiz.current?.measureInWindow((_x, y) => setDeslocamento(Math.max(0, Math.round(y))));
  // Envio que passa de alguns segundos: o servidor provavelmente está acordando.
  const [demorando, setDemorando] = useState(false);
  useEffect(() => {
    if (!enviarMensagem.isPending) return setDemorando(false);
    const t = setTimeout(() => setDemorando(true), 3000);
    return () => clearTimeout(t);
  }, [enviarMensagem.isPending]);

  // Ao abrir e a cada mensagem nova do outro lado, marca como lida e atualiza o número da aba.
  const ultimaId = itens[0]?.id;
  useEffect(() => {
    if (!emFoco || !ultimaId) return;
    marcarChatLido(unidadeId)
      .then(() => {
        void qc.invalidateQueries({ queryKey: ["contadores"] });
        void qc.invalidateQueries({ queryKey: keys.conversas });
      })
      .catch(() => {});
  }, [emFoco, ultimaId, unidadeId, qc]);

  async function enviarTexto() {
    const conteudo = texto.trim();
    if (!conteudo) return;
    try {
      await enviarMensagem.mutateAsync({ texto: conteudo });
      setTexto("");
    } catch (e) {
      mensagens.erro((e as Error).message);
    }
  }

  async function enviarFoto(origem: OrigemFoto) {
    try {
      const foto = await escolherFoto(origem, { quadrada: false, lado: LADO_FOTO_CHAT });
      if (!foto) return;
      // O texto digitado, se houver, vai junto como legenda da foto.
      await enviarMensagem.mutateAsync({ foto, ...(texto.trim() && { texto: texto.trim() }) });
      setTexto("");
    } catch (e) {
      mensagens.erro((e as Error).message);
    }
  }

  return (
    <View ref={raiz} onLayout={medir} style={{ flex: 1 }}>
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: cores.fundo }} behavior="padding" keyboardVerticalOffset={deslocamento}>
      {conversa.isLoading ? (
        <ActivityIndicator color={cores.primaria} style={{ marginTop: 32 }} />
      ) : (
        <FlatList
          data={itens}
          // A lista começa de baixo: as mais novas ficam perto do campo de texto.
          inverted
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: 16, gap: 8 }}
          renderItem={({ item, index }) => (
            <Balao mensagem={item} minha={item.lado === meuLado} anterior={itens[index + 1]} styles={styles} />
          )}
          onEndReached={() => {
            if (conversa.hasNextPage && !conversa.isFetchingNextPage) void conversa.fetchNextPage();
          }}
          onEndReachedThreshold={0.4}
          ListFooterComponent={conversa.isFetchingNextPage ? <ActivityIndicator color={cores.primaria} /> : null}
        />
      )}
      {/* Fora da lista: ela é invertida, e o texto de dentro sai espelhado. */}
      {!conversa.isLoading && itens.length === 0 && (
        <View style={styles.vazio} pointerEvents="none">
          <Ionicons name="chatbubbles-outline" size={40} color={cores.textoSecundario} />
          <Text style={[estilosTexto.secundario, { textAlign: "center" }]}>
            {meuLado === "MORADOR" ? "Fale com a portaria por aqui." : "Nenhuma mensagem desta unidade ainda."}
          </Text>
        </View>
      )}
      <MensagemErro texto={conversa.error ? (conversa.error as Error).message : null} />
      {demorando && <Text style={styles.conectando}>Conectando ao servidor…</Text>}
      <View style={styles.barra}>
        <Pressable onPress={() => void enviarFoto("camera")} hitSlop={6} disabled={enviarMensagem.isPending} style={styles.icone} accessibilityRole="button" accessibilityLabel="Tirar foto e enviar">
          <Ionicons name="camera-outline" size={25} color={cores.primaria} />
        </Pressable>
        <Pressable onPress={() => void enviarFoto("galeria")} hitSlop={6} disabled={enviarMensagem.isPending} style={styles.icone} accessibilityRole="button" accessibilityLabel="Escolher foto da galeria e enviar">
          <Ionicons name="image-outline" size={24} color={cores.primaria} />
        </Pressable>
        <TextInput
          style={styles.campo}
          value={texto}
          onChangeText={setTexto}
          placeholder="Mensagem"
          placeholderTextColor={cores.textoSecundario}
          multiline
          maxLength={TAMANHO_MAXIMO_TEXTO}
        />
        <Pressable
          onPress={enviarTexto}
          hitSlop={8}
          disabled={!texto.trim() || enviarMensagem.isPending}
          style={[styles.enviar, (!texto.trim() || enviarMensagem.isPending) && { opacity: 0.4 }]}
          accessibilityRole="button"
          accessibilityLabel="Enviar mensagem"
        >
          {enviarMensagem.isPending ? <ActivityIndicator color={cores.textoSobreCor} /> : <Ionicons name="send" size={18} color={cores.textoSobreCor} />}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
    </View>
  );
}

/** Balão de uma mensagem. Mostra o dia quando muda em relação à anterior, e o autor do outro lado. */
function Balao({
  mensagem,
  minha,
  anterior,
  styles,
}: {
  mensagem: MensagemChat;
  minha: boolean;
  anterior?: MensagemChat;
  styles: ReturnType<typeof criarStyles>;
}) {
  const novoDia = !anterior || data(anterior.criadaEm) !== data(mensagem.criadaEm);
  return (
    <View style={{ gap: 6 }}>
      {novoDia && <Text style={styles.dia}>{data(mensagem.criadaEm)}</Text>}
      <View style={[styles.linhaBalao, minha ? styles.linhaMinha : styles.linhaOutro]}>
        {!minha && <Avatar pessoa={mensagem.autor} tamanho={28} />}
        <View style={[styles.balao, minha ? styles.balaoMeu : styles.balaoOutro]}>
          {!minha && <Text style={styles.autor}>{mensagem.autor.nome}</Text>}
          {mensagem.temFoto && <FotoDaMensagem id={mensagem.id} />}
          {mensagem.texto && <Text style={minha ? styles.textoMeu : styles.textoOutro}>{mensagem.texto}</Text>}
          <Text style={[styles.hora, minha && styles.horaMinha]}>{hora(mensagem.criadaEm)}</Text>
        </View>
      </View>
    </View>
  );
}

/** Foto de uma mensagem, servida pela API com o token (a rota é privada). */
function FotoDaMensagem({ id }: { id: string }) {
  const cores = useCores();
  const [falhou, setFalhou] = useState(false);
  const montado = useRef(true);
  useEffect(() => () => void (montado.current = false), []);
  if (falhou) return <Text style={{ color: cores.textoSecundario, fontSize: 13 }}>Não foi possível carregar a foto.</Text>;
  return (
    <Image
      // Fonte dentro de uma lista: no Android (RN 0.86), fonte única descarta `headers`, e sem o login a API recusa.
      source={[{ uri: `${API_URL}/chat/mensagens/${id}/foto`, headers: { Authorization: `Bearer ${obterToken()}` } }]}
      style={{ width: 220, height: 220, borderRadius: 10, backgroundColor: cores.neutroClaro }}
      resizeMode="cover"
      onError={() => montado.current && setFalhou(true)}
      accessibilityLabel="Foto enviada no chat"
    />
  );
}

const criarStyles = (cores: Paleta) =>
  StyleSheet.create({
    vazio: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center", gap: 8, paddingBottom: 72 },
    conectando: { textAlign: "center", fontSize: 12, color: cores.textoSecundario, paddingVertical: 4 },
    dia: { alignSelf: "center", fontSize: 12, color: cores.textoSecundario, marginVertical: 4 },
    linhaBalao: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
    linhaMinha: { justifyContent: "flex-end" },
    linhaOutro: { justifyContent: "flex-start" },
    balao: { maxWidth: "78%", borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8, gap: 4 },
    balaoMeu: { backgroundColor: cores.primaria, borderBottomRightRadius: 4 },
    balaoOutro: { backgroundColor: cores.superficie, borderWidth: 1, borderColor: cores.borda, borderBottomLeftRadius: 4 },
    autor: { fontSize: 12, fontWeight: "700", color: cores.primaria },
    textoMeu: { fontSize: 15, color: cores.textoSobreCor },
    textoOutro: { fontSize: 15, color: cores.texto },
    hora: { fontSize: 11, color: cores.textoSecundario, alignSelf: "flex-end" },
    horaMinha: { color: cores.textoSobreCor, opacity: 0.8 },
    barra: {
      flexDirection: "row",
      alignItems: "flex-end",
      gap: 10,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: cores.borda,
      backgroundColor: cores.superficie,
    },
    campo: {
      flex: 1,
      maxHeight: 120,
      minHeight: 40,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: cores.borda,
      paddingHorizontal: 14,
      paddingVertical: 10,
      fontSize: 15,
      color: cores.texto,
      backgroundColor: cores.fundo,
    },
    // Mesma altura do campo (40): o ícone fica no centro dele, e não colado no fundo da barra.
    icone: { width: 32, height: 40, alignItems: "center", justifyContent: "center" },
    enviar: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: cores.primaria },
  });
