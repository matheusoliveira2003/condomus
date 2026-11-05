import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Animated, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { cores } from "./tema";

/**
 * Mensagens dentro do app, no lugar dos alertas do sistema:
 * - aviso rápido (sucesso/erro) no topo da tela, que some sozinho;
 * - confirmação para ações que não têm volta (remover, cancelar, sair);
 * - mensagem informativa com botão "Entendi".
 *
 * Este arquivo não importa `componentes.tsx` (os modais de lá é que usam o aviso daqui).
 */

type TipoAviso = "sucesso" | "erro";
interface Aviso { id: number; texto: string; tipo: TipoAviso }
export interface PedidoConfirmacao {
  titulo: string;
  texto: string;
  /** Rótulo do botão de confirmar. Padrão: "Confirmar". */
  confirmar?: string;
  /** Rótulo do botão de desistir. Padrão: "Cancelar". */
  cancelar?: string;
  /** Pinta o botão de confirmar de vermelho (ação destrutiva). */
  perigo?: boolean;
  aoConfirmar: () => void;
}
interface PedidoInformacao { titulo: string; texto: string }

interface Contexto {
  sucesso: (texto: string) => void;
  erro: (texto: string) => void;
  confirmar: (pedido: PedidoConfirmacao) => void;
  informar: (titulo: string, texto: string) => void;
  aviso: Aviso | null;
  dispensarAviso: () => void;
  /** Quantos modais (formulários em tela cheia) estão abertos agora. */
  modaisAbertos: number;
  registrarModal: (aberto: boolean) => void;
}

const MensagensContext = createContext<Contexto | null>(null);

const DURACAO_MS: Record<TipoAviso, number> = { sucesso: 3500, erro: 5500 };

export function MensagensProvider({ children }: { children: ReactNode }) {
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [confirmacao, setConfirmacao] = useState<PedidoConfirmacao | null>(null);
  const [informacao, setInformacao] = useState<PedidoInformacao | null>(null);
  const [modaisAbertos, setModaisAbertos] = useState(0);
  const proximoId = useRef(1);

  const mostrar = useCallback((tipo: TipoAviso, texto: string) => {
    setAviso({ id: proximoId.current++, texto, tipo });
  }, []);
  const dispensarAviso = useCallback(() => setAviso(null), []);
  const registrarModal = useCallback((aberto: boolean) => {
    setModaisAbertos((n) => Math.max(0, n + (aberto ? 1 : -1)));
  }, []);

  const valor = useMemo<Contexto>(
    () => ({
      sucesso: (texto) => mostrar("sucesso", texto),
      erro: (texto) => mostrar("erro", texto),
      confirmar: setConfirmacao,
      informar: (titulo, texto) => setInformacao({ titulo, texto }),
      aviso,
      dispensarAviso,
      modaisAbertos,
      registrarModal,
    }),
    [mostrar, aviso, dispensarAviso, modaisAbertos, registrarModal],
  );

  return (
    <MensagensContext.Provider value={valor}>
      {children}
      {/* Com um modal aberto, o aviso aparece dentro dele (ver AvisoNoModal). */}
      {modaisAbertos === 0 && <AvisoNaTela />}
      <Dialogo
        visivel={!!confirmacao}
        titulo={confirmacao?.titulo ?? ""}
        texto={confirmacao?.texto ?? ""}
        botoes={
          confirmacao
            ? [
                { rotulo: confirmacao.cancelar ?? "Cancelar", tom: "neutro" },
                {
                  rotulo: confirmacao.confirmar ?? "Confirmar",
                  tom: confirmacao.perigo ? "perigo" : "primario",
                  aoPressionar: confirmacao.aoConfirmar,
                },
              ]
            : []
        }
        aoFechar={() => setConfirmacao(null)}
      />
      <Dialogo
        visivel={!!informacao}
        titulo={informacao?.titulo ?? ""}
        texto={informacao?.texto ?? ""}
        botoes={[{ rotulo: "Entendi", tom: "primario" }]}
        aoFechar={() => setInformacao(null)}
      />
    </MensagensContext.Provider>
  );
}

export function useMensagens() {
  const ctx = useContext(MensagensContext);
  if (!ctx) throw new Error("useMensagens precisa estar dentro de <MensagensProvider>");
  return ctx;
}

/** Registra um modal aberto enquanto `aberto` for verdadeiro (usado por ModalFormulario e ModalTela). */
export function useRegistrarModal(aberto: boolean) {
  const { registrarModal } = useMensagens();
  useEffect(() => {
    if (!aberto) return;
    registrarModal(true);
    return () => registrarModal(false);
  }, [aberto, registrarModal]);
}

/** Aviso para ser desenhado dentro de um modal, já que o modal cobre o aviso da raiz. */
export function AvisoNoModal() {
  return <Aviso topo={8} />;
}

function AvisoNaTela() {
  const insets = useSafeAreaInsets();
  return <Aviso topo={insets.top + 8} />;
}

function Aviso({ topo }: { topo: number }) {
  const { aviso, dispensarAviso } = useMensagens();
  const [exibido, setExibido] = useState<Aviso | null>(null);
  const opacidade = useRef(new Animated.Value(0)).current;
  const deslocamento = useRef(new Animated.Value(-16)).current;

  useEffect(() => {
    if (aviso) {
      setExibido(aviso);
      Animated.parallel([
        Animated.timing(opacidade, { toValue: 1, duration: 180, useNativeDriver: true }),
        Animated.timing(deslocamento, { toValue: 0, duration: 180, useNativeDriver: true }),
      ]).start();
      const temporizador = setTimeout(dispensarAviso, DURACAO_MS[aviso.tipo]);
      return () => clearTimeout(temporizador);
    }
    Animated.parallel([
      Animated.timing(opacidade, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(deslocamento, { toValue: -16, duration: 200, useNativeDriver: true }),
    ]).start(({ finished }) => { if (finished) setExibido(null); });
  }, [aviso?.id]);

  if (!exibido) return null;
  const erro = exibido.tipo === "erro";
  return (
    <Animated.View
      pointerEvents="box-none"
      style={[estilos.avisoArea, { top: topo, opacity: opacidade, transform: [{ translateY: deslocamento }] }]}
    >
      <Pressable
        onPress={dispensarAviso}
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        style={[estilos.aviso, erro ? estilos.avisoErro : estilos.avisoSucesso]}
      >
        <Ionicons
          name={erro ? "alert-circle" : "checkmark-circle"}
          size={22}
          color={erro ? cores.perigo : cores.sucesso}
          style={{ flexShrink: 0 }}
        />
        <Text style={[estilos.avisoTexto, { color: erro ? cores.perigo : cores.sucesso }]}>{exibido.texto}</Text>
      </Pressable>
    </Animated.View>
  );
}

interface BotaoDialogo {
  rotulo: string;
  tom: "neutro" | "primario" | "perigo";
  aoPressionar?: () => void;
}

/** Caixa de diálogo centralizada. Um Modal transparente fica acima de qualquer outro modal aberto. */
function Dialogo({
  visivel,
  titulo,
  texto,
  botoes,
  aoFechar,
}: {
  visivel: boolean;
  titulo: string;
  texto: string;
  botoes: BotaoDialogo[];
  aoFechar: () => void;
}) {
  // Guarda o último conteúdo para o texto não sumir durante o fade de saída.
  const ultimo = useRef({ titulo, texto, botoes });
  if (visivel) ultimo.current = { titulo, texto, botoes };
  ({ titulo, texto, botoes } = ultimo.current);

  return (
    <Modal visible={visivel} transparent animationType="fade" onRequestClose={aoFechar} statusBarTranslucent>
      <View style={estilos.dialogoFundo}>
        <Pressable style={StyleSheet.absoluteFill} onPress={aoFechar} accessibilityLabel="Fechar" />
        <View style={estilos.dialogo} accessibilityViewIsModal>
          <Text style={estilos.dialogoTitulo}>{titulo}</Text>
          <Text style={estilos.dialogoTexto}>{texto}</Text>
          <View style={estilos.dialogoBotoes}>
            {botoes.map((b) => (
              <Pressable
                key={b.rotulo}
                accessibilityRole="button"
                onPress={() => {
                  aoFechar();
                  b.aoPressionar?.();
                }}
                style={({ pressed }) => [estilos.dialogoBotao, estilos[`botao_${b.tom}`], pressed && { opacity: 0.7 }]}
              >
                <Text style={[estilos.dialogoBotaoTexto, b.tom === "neutro" && { color: cores.primaria }]}>{b.rotulo}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const estilos = StyleSheet.create({
  avisoArea: { position: "absolute", left: 16, right: 16, zIndex: 1000, alignItems: "center" },
  aviso: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    width: "100%",
    maxWidth: 480,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    elevation: 6,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  avisoSucesso: { backgroundColor: cores.sucessoClaro, borderColor: cores.sucesso },
  avisoErro: { backgroundColor: "#FDECEC", borderColor: cores.perigo },
  avisoTexto: { flex: 1, fontSize: 14, fontWeight: "600", lineHeight: 20 },
  dialogoFundo: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center", padding: 24 },
  dialogo: { width: "100%", maxWidth: 400, backgroundColor: cores.superficie, borderRadius: 20, padding: 20, gap: 10 },
  dialogoTitulo: { fontSize: 18, fontWeight: "700", color: cores.texto },
  dialogoTexto: { fontSize: 15, lineHeight: 22, color: cores.textoSecundario },
  dialogoBotoes: { flexDirection: "row", gap: 10, marginTop: 8 },
  dialogoBotao: { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  dialogoBotaoTexto: { fontSize: 15, fontWeight: "600", color: "#fff" },
  botao_neutro: { backgroundColor: cores.primariaClara },
  botao_primario: { backgroundColor: cores.primaria },
  botao_perigo: { backgroundColor: cores.perigo },
});
