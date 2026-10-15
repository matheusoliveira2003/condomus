import type { ReactNode } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { cores } from "./tema";

type Variante = "primario" | "secundario" | "perigo";

export function Botao({
  titulo,
  onPress,
  variante = "primario",
  carregando,
  desabilitado,
  pequeno,
}: {
  titulo: string;
  onPress: () => void;
  variante?: Variante;
  carregando?: boolean;
  desabilitado?: boolean;
  pequeno?: boolean;
}) {
  const inativo = carregando || desabilitado;
  return (
    <Pressable
      onPress={onPress}
      disabled={inativo}
      style={({ pressed }) => [
        styles.botao,
        styles[`botao_${variante}`],
        pequeno && styles.botaoPequeno,
        (pressed || inativo) && { opacity: 0.6 },
      ]}
    >
      {carregando ? (
        <ActivityIndicator color={variante === "secundario" ? cores.primaria : "#fff"} />
      ) : (
        <Text style={[styles.botaoTexto, variante === "secundario" && { color: cores.primaria }]}>{titulo}</Text>
      )}
    </Pressable>
  );
}

export function Campo({ rotulo, ...props }: TextInputProps & { rotulo: string }) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={styles.rotulo}>{rotulo}</Text>
      <TextInput style={styles.input} placeholderTextColor={cores.textoSecundario} {...props} />
    </View>
  );
}

export function Card({ children }: { children: ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

export function Selo({ texto, tom = "neutro" }: { texto: string; tom?: "neutro" | "sucesso" | "alerta" | "primario" }) {
  const fundo = { neutro: cores.neutroClaro, sucesso: cores.sucessoClaro, alerta: cores.alertaClaro, primario: cores.primariaClara }[tom];
  const cor = { neutro: cores.textoSecundario, sucesso: cores.sucesso, alerta: cores.alerta, primario: cores.primaria }[tom];
  return (
    <View style={[styles.selo, { backgroundColor: fundo }]}>
      <Text style={[styles.seloTexto, { color: cor }]}>{texto}</Text>
    </View>
  );
}

/**
 * Opções em que uma pode ser selecionada. Por padrão rolam na horizontal;
 * com `grade`, quebram em linhas para mostrar todas de uma vez.
 */
export function Chips<T extends string>({
  opcoes,
  valor,
  onChange,
  grade,
}: {
  opcoes: { valor: T; rotulo: string; desabilitado?: boolean }[];
  valor: T | null;
  onChange: (valor: T) => void;
  grade?: boolean;
}) {
  const itens = opcoes.map((o) => {
    const ativo = o.valor === valor;
    return (
      <Pressable
        key={o.valor}
        disabled={o.desabilitado}
        onPress={() => onChange(o.valor)}
        style={[styles.chip, ativo && styles.chipAtivo, o.desabilitado && { opacity: 0.35 }]}
      >
        <Text style={[styles.chipTexto, ativo && { color: "#fff" }]}>{o.rotulo}</Text>
      </Pressable>
    );
  });
  if (grade) return <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{itens}</View>;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
      {itens}
    </ScrollView>
  );
}

/** Lista com pull-to-refresh, mensagem de vazio e de erro. */
export function Lista<T extends { id: string }>({
  dados,
  carregando,
  erro,
  recarregar,
  renderItem,
  vazio,
  cabecalho,
}: {
  dados: T[];
  carregando: boolean;
  erro: string | null;
  recarregar: () => void;
  renderItem: (item: T) => ReactNode;
  vazio: string;
  cabecalho?: ReactNode;
}) {
  return (
    <FlatList
      style={{ backgroundColor: cores.fundo }}
      contentContainerStyle={{ padding: 16, gap: 12, flexGrow: 1 }}
      data={dados}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => <>{renderItem(item)}</>}
      refreshControl={<RefreshControl refreshing={carregando} onRefresh={recarregar} />}
      ListHeaderComponent={
        <>
          {cabecalho}
          {erro && <Text style={styles.erro}>{erro}</Text>}
        </>
      }
      ListEmptyComponent={
        carregando ? null : (
          <View style={styles.vazio}>
            <Ionicons name="file-tray-outline" size={40} color={cores.textoSecundario} />
            <Text style={styles.vazioTexto}>{vazio}</Text>
          </View>
        )
      }
    />
  );
}

/** Formulário em modal deslizante, com título e botão de fechar. */
export function ModalFormulario({
  visivel,
  titulo,
  onFechar,
  children,
}: {
  visivel: boolean;
  titulo: string;
  onFechar: () => void;
  children: ReactNode;
}) {
  return (
    <Modal visible={visivel} animationType="slide" presentationStyle="pageSheet" onRequestClose={onFechar}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.modalCabecalho}>
          <Text style={styles.modalTitulo}>{titulo}</Text>
          <Pressable onPress={onFechar} hitSlop={12}>
            <Ionicons name="close" size={26} color={cores.texto} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function Secao({ titulo }: { titulo: string }) {
  return <Text style={styles.secao}>{titulo}</Text>;
}

export function MensagemErro({ texto }: { texto: string | null }) {
  return texto ? <Text style={styles.erro}>{texto}</Text> : null;
}

export const estilosTexto = StyleSheet.create({
  titulo: { fontSize: 16, fontWeight: "600", color: cores.texto },
  secundario: { fontSize: 14, color: cores.textoSecundario },
  corpo: { fontSize: 15, color: cores.texto, lineHeight: 21 },
});

const styles = StyleSheet.create({
  botao: { paddingVertical: 14, paddingHorizontal: 16, borderRadius: 10, alignItems: "center" },
  botaoPequeno: { paddingVertical: 8, paddingHorizontal: 12 },
  botao_primario: { backgroundColor: cores.primaria },
  botao_secundario: { backgroundColor: cores.primariaClara },
  botao_perigo: { backgroundColor: cores.perigo },
  botaoTexto: { color: "#fff", fontWeight: "600", fontSize: 15 },
  rotulo: { fontSize: 14, fontWeight: "500", color: cores.texto },
  input: {
    borderWidth: 1,
    borderColor: cores.borda,
    backgroundColor: cores.superficie,
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    color: cores.texto,
  },
  card: {
    backgroundColor: cores.superficie,
    borderRadius: 12,
    padding: 16,
    gap: 8,
    borderWidth: 1,
    borderColor: cores.borda,
  },
  selo: { alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  seloTexto: { fontSize: 12, fontWeight: "600" },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: cores.borda,
    backgroundColor: cores.superficie,
  },
  chipAtivo: { backgroundColor: cores.primaria, borderColor: cores.primaria },
  chipTexto: { fontSize: 14, color: cores.texto, fontWeight: "500" },
  erro: { color: cores.perigo, marginBottom: 8 },
  vazio: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 48 },
  vazioTexto: { color: cores.textoSecundario, fontSize: 15 },
  modalCabecalho: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: cores.borda,
  },
  modalTitulo: { fontSize: 18, fontWeight: "600", color: cores.texto },
  secao: { fontSize: 13, fontWeight: "600", color: cores.textoSecundario, textTransform: "uppercase", marginTop: 4 },
});

/** Botão redondo fixo no canto inferior direito, para a ação principal da tela. */
export function BotaoFlutuante({ onPress, icone = "add" }: { onPress: () => void; icone?: keyof typeof Ionicons.glyphMap }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [fab.botao, pressed && { opacity: 0.8 }]}>
      <Ionicons name={icone} size={28} color="#fff" />
    </Pressable>
  );
}

const fab = StyleSheet.create({
  botao: {
    position: "absolute",
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: cores.primaria,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
});

/** Link discreto no topo de uma lista, para abrir o histórico (itens encerrados). */
export function LinkHistorico({ texto, onPress }: { texto: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} style={({ pressed }) => [link.container, pressed && { opacity: 0.6 }]}>
      <Ionicons name="time-outline" size={18} color={cores.primaria} />
      <Text style={link.texto}>{texto}</Text>
      <Ionicons name="chevron-forward" size={16} color={cores.primaria} />
    </Pressable>
  );
}

/** Tela cheia em modal, com título e botão de fechar, para conteúdo que já rola (ex.: Lista). */
export function ModalTela({ visivel, titulo, onFechar, children }: { visivel: boolean; titulo: string; onFechar: () => void; children: ReactNode }) {
  return (
    <Modal visible={visivel} animationType="slide" presentationStyle="pageSheet" onRequestClose={onFechar}>
      <View style={styles.modalCabecalho}>
        <Text style={styles.modalTitulo}>{titulo}</Text>
        <Pressable onPress={onFechar} hitSlop={12}>
          <Ionicons name="close" size={26} color={cores.texto} />
        </Pressable>
      </View>
      {/* Só monta o conteúdo com o modal aberto: assim ele carrega dados novos a cada abertura. */}
      {visivel && <View style={{ flex: 1 }}>{children}</View>}
    </Modal>
  );
}

const link = StyleSheet.create({
  container: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", paddingVertical: 4, marginBottom: 4 },
  texto: { color: cores.primaria, fontWeight: "600", fontSize: 14 },
});
