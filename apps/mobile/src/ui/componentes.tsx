import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Modal,
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
import { SafeAreaView } from "react-native-safe-area-context";
import { useCores, useEstilos, type Paleta } from "./tema";
import { AvisoNoModal, useRegistrarModal } from "./mensagens";

type Variante = "primario" | "secundario" | "perigo" | "discreto";

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
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
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
        <ActivityIndicator color={variante === "secundario" ? cores.primaria : cores.textoSobreCor} />
      ) : (
        <Text style={[
          styles.botaoTexto,
          variante === "secundario" && { color: cores.primaria },
          variante === "discreto" && styles.botaoTextoDiscreto,
        ]}>{titulo}</Text>
      )}
    </Pressable>
  );
}

/**
 * Campo de texto. Sem `rotulo`, o nome do campo deve ir no placeholder.
 * Com `senha`, o texto fica oculto e um ícone de olho permite exibi-lo.
 * Com `icone`, mostra um ícone fixo à esquerda (ex.: envelope no e-mail).
 */
export function Campo({
  rotulo,
  senha,
  icone,
  acaoDireita,
  style,
  ...props
}: TextInputProps & {
  rotulo?: string;
  senha?: boolean;
  icone?: keyof typeof Ionicons.glyphMap;
  /** Ícone/botão exibido no lado direito do campo (não compatível com `senha`). */
  acaoDireita?: ReactNode;
}) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const [visivel, setVisivel] = useState(false);
  const temDireita = senha || !!acaoDireita;
  return (
    <View style={{ gap: 4 }}>
      {rotulo && <Text style={styles.rotulo}>{rotulo}</Text>}
      <View style={styles.campoLinha}>
        {icone && <Ionicons name={icone} size={20} color={cores.textoSecundario} style={styles.iconeEsquerda} />}
        <TextInput
          placeholderTextColor={cores.textoSecundario}
          {...props}
          style={[styles.input, icone && { paddingLeft: 44 }, temDireita && { paddingRight: 48 }, style]}
          // Depois de {...props}, para o botão de exibir senha sempre ter a palavra final.
          {...(senha && { secureTextEntry: !visivel, autoCapitalize: "none", autoCorrect: false })}
        />
        {senha && (
          <Pressable
            onPress={() => setVisivel((v) => !v)}
            hitSlop={8}
            style={styles.olho}
            accessibilityRole="button"
            accessibilityLabel={visivel ? "Ocultar senha" : "Mostrar senha"}
          >
            <Ionicons name={visivel ? "eye-off-outline" : "eye-outline"} size={22} color={cores.textoSecundario} />
          </Pressable>
        )}
        {!senha && acaoDireita && (
          <View style={styles.olho}>{acaoDireita}</View>
        )}
      </View>
    </View>
  );
}

export function Card({ children }: { children: ReactNode }) {
  const styles = useEstilos(criarEstilos);
  return <View style={styles.card}>{children}</View>;
}

export function Selo({ texto, tom = "neutro" }: { texto: string; tom?: "neutro" | "sucesso" | "alerta" | "primario" }) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
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
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const itens = opcoes.map((o) => {
    const ativo = o.valor === valor;
    return (
      <Pressable
        key={o.valor}
        disabled={o.desabilitado}
        onPress={() => onChange(o.valor)}
        style={[styles.chip, ativo && styles.chipAtivo, o.desabilitado && { opacity: 0.35 }]}
      >
        <Text style={[styles.chipTexto, ativo && { color: cores.textoSobreCor }]}>{o.rotulo}</Text>
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

/**
 * Campo de seleção: mostra a opção atual e, ao tocar, abre a lista abaixo para escolher uma.
 * Escolher uma opção fecha a lista.
 */
export function Selecao<T extends string>({
  rotulo,
  opcoes,
  valor,
  onChange,
}: {
  rotulo?: string;
  opcoes: { valor: T; rotulo: string; icone?: keyof typeof Ionicons.glyphMap }[];
  valor: T;
  onChange: (valor: T) => void;
}) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const [aberta, setAberta] = useState(false);
  const atual = opcoes.find((o) => o.valor === valor);
  return (
    <View style={{ gap: 4 }}>
      {rotulo && <Text style={styles.rotulo}>{rotulo}</Text>}
      <Pressable
        onPress={() => setAberta((a) => !a)}
        style={({ pressed }) => [styles.selecaoCampo, pressed && { opacity: 0.7 }]}
        accessibilityRole="button"
        accessibilityState={{ expanded: aberta }}
        accessibilityLabel={rotulo ? `${rotulo}: ${atual?.rotulo ?? ""}` : atual?.rotulo}
      >
        {atual?.icone && <Ionicons name={atual.icone} size={20} color={cores.primaria} />}
        <Text style={styles.selecaoTexto}>{atual?.rotulo ?? ""}</Text>
        <Ionicons name={aberta ? "chevron-up" : "chevron-down"} size={20} color={cores.textoSecundario} />
      </Pressable>
      {aberta && (
        <View style={styles.selecaoLista}>
          {opcoes.map((o, i) => {
            const ativa = o.valor === valor;
            return (
              <Pressable
                key={o.valor}
                onPress={() => {
                  setAberta(false);
                  onChange(o.valor);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: ativa }}
                style={({ pressed }) => [
                  styles.selecaoOpcao,
                  i > 0 && { borderTopWidth: 1, borderTopColor: cores.borda },
                  pressed && { backgroundColor: cores.fundo },
                ]}
              >
                {o.icone && <Ionicons name={o.icone} size={20} color={ativa ? cores.primaria : cores.textoSecundario} />}
                <Text style={[styles.selecaoOpcaoTexto, ativa && { color: cores.primaria, fontWeight: "600" }]}>{o.rotulo}</Text>
                {ativa && <Ionicons name="checkmark" size={20} color={cores.primaria} />}
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

/** Lista com pull-to-refresh, mensagem de vazio e de erro. */
export function Lista<T extends { id: string }>({
  dados,
  carregando,
  recarregando,
  erro,
  recarregar,
  renderItem,
  vazio,
  cabecalho,
  espacoFinal = 96,
}: {
  dados: T[];
  /** Primeira carga (sem dados ainda): mostra spinner no lugar da lista vazia. */
  carregando: boolean;
  /** Qualquer fetch ativo: anima o pull-to-refresh sem bloquear a lista. */
  recarregando?: boolean;
  erro: string | null;
  recarregar: () => void;
  renderItem: (item: T) => ReactNode;
  vazio: string;
  cabecalho?: ReactNode;
  /** Espaço livre no fim da lista; 96 cobre um botão flutuante, 168 cobre dois empilhados. */
  espacoFinal?: number;
}) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  return (
    <FlatList
      style={{ backgroundColor: cores.fundo }}
      // paddingBottom: os últimos itens não ficam escondidos atrás do(s) botão(ões) flutuante(s).
      contentContainerStyle={{ padding: 16, paddingBottom: espacoFinal, gap: 12, flexGrow: 1 }}
      data={dados}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => <>{renderItem(item)}</>}
      refreshControl={<RefreshControl refreshing={recarregando ?? carregando} onRefresh={recarregar} tintColor={cores.primaria} colors={[cores.primaria]} />}
      ListHeaderComponent={
        <>
          {cabecalho}
          {erro && <Text style={styles.erro}>{erro}</Text>}
        </>
      }
      ListEmptyComponent={
        carregando ? (
          // Carregamento inicial: o RefreshControl não aparece sozinho ao montar a tela
          // (só quando o usuário puxa a lista), então sem isto a tela ficava em branco.
          <View style={styles.vazio}>
            <ActivityIndicator color={cores.primaria} />
          </View>
        ) : (
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
  overlay,
}: {
  visivel: boolean;
  titulo: string;
  onFechar: () => void;
  children: ReactNode;
  /** Conteúdo renderizado fora do ScrollView (ex.: bottom sheets, overlays). */
  overlay?: ReactNode;
}) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  useRegistrarModal(visivel);
  return (
    <Modal visible={visivel} animationType="slide" presentationStyle="pageSheet" onRequestClose={onFechar}>
      {/* No Android o modal ocupa a tela toda, por trás da barra de status; a área segura reserva esse espaço. */}
      <SafeAreaView style={styles.modal} edges={["top", "bottom"]}>
        {/* "padding" também no Android: com edge-to-edge o sistema não redimensiona a janela pelo teclado. */}
        <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
          <View style={styles.modalCabecalho}>
            <Pressable onPress={onFechar} hitSlop={12} accessibilityRole="button" accessibilityLabel="Voltar">
              <Ionicons name="arrow-back" size={24} color={cores.texto} />
            </Pressable>
            <Text style={styles.modalTitulo}>{titulo}</Text>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        </KeyboardAvoidingView>
        {overlay}
        <AvisoNoModal />
      </SafeAreaView>
    </Modal>
  );
}

export function Secao({ titulo }: { titulo: string }) {
  const styles = useEstilos(criarEstilos);
  return <Text style={styles.secao}>{titulo}</Text>;
}

/**
 * Banner de erro com ícone de exclamação e fundo vermelho claro.
 * Fica visível enquanto `texto` for não-nulo; some com fade quando `texto` volta a null.
 */
export function MensagemErro({ texto }: { texto: string | null }) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const opacidade = useRef(new Animated.Value(0)).current;
  const [textoAtivo, setTextoAtivo] = useState<string | null>(null);

  useEffect(() => {
    if (texto) {
      setTextoAtivo(texto);
      Animated.timing(opacidade, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    } else {
      Animated.timing(opacidade, { toValue: 0, duration: 300, useNativeDriver: true })
        .start(() => setTextoAtivo(null));
    }
  }, [texto]);

  if (!textoAtivo) return null;

  return (
    <Animated.View style={{ opacity: opacidade }}>
      <View style={styles.erroContainer}>
        <Ionicons name="alert-circle" size={20} color={cores.perigo} style={{ flexShrink: 0 }} />
        <Text style={styles.erroTexto}>{textoAtivo}</Text>
      </View>
    </Animated.View>
  );
}

/** Estilos de texto compartilhados (título, secundário, corpo). */
const criarEstilosTexto = (cores: Paleta) =>
  StyleSheet.create({
    titulo: { fontSize: 16, fontWeight: "600", color: cores.texto },
    secundario: { fontSize: 14, color: cores.textoSecundario },
    corpo: { fontSize: 15, color: cores.texto, lineHeight: 21 },
  });

export function useEstilosTexto() {
  return useEstilos(criarEstilosTexto);
}

const criarEstilos = (cores: Paleta) =>
  StyleSheet.create({
    botao: { paddingVertical: 14, paddingHorizontal: 16, borderRadius: 10, alignItems: "center" },
    botaoPequeno: { paddingVertical: 8, paddingHorizontal: 12 },
    botao_primario: { backgroundColor: cores.primaria },
    botao_secundario: { backgroundColor: cores.primariaClara },
    botao_perigo: { backgroundColor: cores.perigo },
    botao_discreto: { backgroundColor: "transparent" },
    botaoTexto: { color: cores.textoSobreCor, fontWeight: "600", fontSize: 15 },
    botaoTextoDiscreto: { color: cores.textoSecundario, fontWeight: "500", fontSize: 13 },
    rotulo: { fontSize: 14, fontWeight: "500", color: cores.texto },
    campoLinha: { justifyContent: "center" },
    olho: { position: "absolute", right: 12, padding: 4 },
    iconeEsquerda: { position: "absolute", left: 14, zIndex: 1 },
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
    erroContainer: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 10,
      backgroundColor: cores.perigoClaro,
      borderWidth: 1,
      borderColor: cores.perigoBorda,
      borderRadius: 10,
      padding: 12,
    },
    erroTexto: { flex: 1, color: cores.perigo, fontSize: 14, lineHeight: 20 },
    // Mantido para o erro inline da Lista (que não usa MensagemErro)
    erro: { color: cores.perigo, marginBottom: 8 },
    vazio: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 48 },
    vazioTexto: { color: cores.textoSecundario, fontSize: 15 },
    modal: { flex: 1, backgroundColor: cores.superficie },
    modalCabecalho: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      padding: 16,
    },
    modalTitulo: { flex: 1, fontSize: 18, fontWeight: "600", color: cores.texto },
    secao: { fontSize: 13, fontWeight: "600", color: cores.textoSecundario, textTransform: "uppercase", marginTop: 4 },
    // Campo de seleção (Selecao)
    selecaoCampo: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
      borderWidth: 1,
      borderColor: cores.borda,
      backgroundColor: cores.superficie,
      borderRadius: 10,
      padding: 12,
    },
    selecaoTexto: { flex: 1, fontSize: 16, color: cores.texto },
    selecaoLista: {
      borderWidth: 1,
      borderColor: cores.borda,
      backgroundColor: cores.superficie,
      borderRadius: 10,
      overflow: "hidden",
    },
    selecaoOpcao: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, padding: 14 },
    selecaoOpcaoTexto: { flex: 1, fontSize: 15, color: cores.texto },
    // Botão flutuante (BotaoFlutuante)
    fabBotao: {
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
    // Link de histórico (LinkHistorico)
    linkContainer: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", paddingVertical: 4, marginBottom: 4 },
    linkTexto: { color: cores.primaria, fontWeight: "600", fontSize: 14 },
    // Bottom sheet (InfoSheet)
    infoFundo: {
      ...StyleSheet.absoluteFill,
      backgroundColor: "rgba(0,0,0,0.45)",
      justifyContent: "flex-end",
      zIndex: 100,
    },
    infoSheet: {
      backgroundColor: cores.superficie,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingHorizontal: 24,
      paddingBottom: 36,
      paddingTop: 12,
      gap: 12,
    },
    infoAlca: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: cores.borda,
      alignSelf: "center",
      marginBottom: 4,
    },
    infoTitulo: { fontSize: 18, fontWeight: "700", color: cores.texto },
    infoCorpo: { gap: 10 },
    infoBotaoFechar: {
      marginTop: 4,
      paddingVertical: 14,
      alignItems: "center",
      borderRadius: 12,
      backgroundColor: cores.primariaClara,
    },
    infoBotaoFecharTexto: { fontSize: 15, fontWeight: "600", color: cores.primaria },
  });

/** Botão redondo fixo no canto inferior direito, para a ação principal da tela. */
export function BotaoFlutuante({
  onPress,
  icone = "add",
  posicao = 0,
  rotulo,
}: {
  onPress: () => void;
  icone?: keyof typeof Ionicons.glyphMap;
  /** 0 = canto inferior; 1, 2… empilham acima, para mais de uma ação principal na tela. */
  posicao?: number;
  /** Descrição para leitores de tela (o botão só tem ícone). */
  rotulo?: string;
}) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.fabBotao, { bottom: 20 + posicao * 72 }, pressed && { opacity: 0.8 }]}
      accessibilityRole="button"
      accessibilityLabel={rotulo}
    >
      <Ionicons name={icone} size={28} color={cores.textoSobreCor} />
    </Pressable>
  );
}

/** Link discreto no topo de uma lista, para abrir o histórico (itens encerrados). */
export function LinkHistorico({ texto, onPress }: { texto: string; onPress: () => void }) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  return (
    <Pressable onPress={onPress} hitSlop={8} style={({ pressed }) => [styles.linkContainer, pressed && { opacity: 0.6 }]}>
      <Ionicons name="time-outline" size={18} color={cores.primaria} />
      <Text style={styles.linkTexto}>{texto}</Text>
      <Ionicons name="chevron-forward" size={16} color={cores.primaria} />
    </Pressable>
  );
}

/** Tela cheia em modal, com título e botão de fechar, para conteúdo que já rola (ex.: Lista). */
export function ModalTela({ visivel, titulo, onFechar, children }: { visivel: boolean; titulo: string; onFechar: () => void; children: ReactNode }) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  useRegistrarModal(visivel);
  return (
    <Modal visible={visivel} animationType="slide" presentationStyle="pageSheet" onRequestClose={onFechar}>
      <SafeAreaView style={styles.modal} edges={["top", "bottom"]}>
        <View style={styles.modalCabecalho}>
          <Pressable onPress={onFechar} hitSlop={12} accessibilityRole="button" accessibilityLabel="Voltar">
            <Ionicons name="arrow-back" size={24} color={cores.texto} />
          </Pressable>
          <Text style={styles.modalTitulo}>{titulo}</Text>
        </View>
        {/* Só monta o conteúdo com o modal aberto: assim ele carrega dados novos a cada abertura. */}
        {visivel && <View style={{ flex: 1 }}>{children}</View>}
        <AvisoNoModal />
      </SafeAreaView>
    </Modal>
  );
}

/**
 * Bottom sheet informativo genérico — slide de baixo para cima com fundo escurecido.
 * Ideal para explicações contextuais sem sair da tela atual.
 */
export function InfoSheet({
  visivel,
  titulo,
  children,
  onFechar,
}: {
  visivel: boolean;
  titulo: string;
  children: ReactNode;
  onFechar: () => void;
}) {
  const styles = useEstilos(criarEstilos);
  const translateY = useRef(new Animated.Value(400)).current;
  const opacidade = useRef(new Animated.Value(0)).current;
  const [montado, setMontado] = useState(visivel);

  useEffect(() => {
    if (visivel) {
      setMontado(true);
      Animated.parallel([
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 5 }),
        Animated.timing(opacidade, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateY, { toValue: 400, duration: 220, useNativeDriver: true }),
        Animated.timing(opacidade, { toValue: 0, duration: 180, useNativeDriver: true }),
      ]).start(({ finished }) => { if (finished) setMontado(false); });
    }
  }, [visivel]);

  if (!montado) return null;

  return (
    <Animated.View style={[styles.infoFundo, { opacity: opacidade }]}>
      <Pressable style={{ flex: 1 }} onPress={onFechar} />
      <Animated.View style={[styles.infoSheet, { transform: [{ translateY }] }]}>
        <View style={styles.infoAlca} />
        <Text style={styles.infoTitulo}>{titulo}</Text>
        <View style={styles.infoCorpo}>{children}</View>
        <Pressable onPress={onFechar} style={styles.infoBotaoFechar}>
          <Text style={styles.infoBotaoFecharTexto}>Entendi</Text>
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}
