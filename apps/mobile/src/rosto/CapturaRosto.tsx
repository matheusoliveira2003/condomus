import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Linking, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../auth/AuthContext";
import { AVISO_ATUALIZAR } from "../convite";
import { Botao, MensagemErro, useEstilosTexto } from "../ui/componentes";
import { useCores } from "../ui/tema";
import { bytesParaBase64 } from "./base64";
import {
  avaliarOrientacao,
  decodificar,
  ESTADO_INICIAL,
  LIMIAR_DETECCAO,
  prepararEntrada,
  type EstadoOrientacao,
  type Orientacao,
  type Preparo,
} from "./deteccao";
import { carregarModelo } from "./modelos";
import { moduloVisao, moduloWorklets } from "./visao";

/** Texto do orientador para cada situação, como nos apps de captura facial. */
const MENSAGENS: Record<Orientacao, string> = {
  nenhum: "Posicione o rosto dentro da moldura",
  aproxime: "Aproxime o rosto",
  afaste: "Afaste um pouco",
  centralize: "Centralize o rosto na moldura",
  parado: "Fique parado",
  pronto: "Capturando…",
};

/** Maior lado, em pixels, da foto entregue a quem usa a captura. */
const LADO_MAXIMO_FOTO = 640;

/** Intervalo mínimo entre análises: o detector não precisa de todo quadro. */
const INTERVALO_MS = 120;

/**
 * Captura ao vivo, sem galeria. O app detecta o rosto nos quadros da câmera frontal e tira a
 * foto sozinho quando o rosto está centralizado, no tamanho certo e parado. A pessoa só segue
 * as orientações. Se o app instalado não tiver os módulos novos, mostra o aviso de atualizar.
 */
export function CapturaRosto({ onCapturada, camera = "front" }: { onCapturada: (jpegBase64: string) => void; camera?: Camera }) {
  const { usuario } = useAuth();
  // A foto ao vivo é tirada pelo porteiro, de frente para o visitante: sem detecção de
  // vivacidade, é a presença dele que impede alguém de mostrar uma foto para a câmera.
  if (usuario?.papel !== "PORTEIRO") return null;
  if (!moduloVisao || !moduloWorklets) return <MensagemErro texto={AVISO_ATUALIZAR} />;
  return <Permissao visao={moduloVisao} worklets={moduloWorklets} onCapturada={onCapturada} camera={camera} />;
}

/** PROVA TÉCNICA: a escolha da câmera existe só para os testes; remover junto com o teste de reconhecimento. */
export type Camera = "front" | "back";

type Visao = NonNullable<typeof moduloVisao>;
type Worklets = NonNullable<typeof moduloWorklets>;

function Permissao({ visao, worklets, onCapturada, camera }: { visao: Visao; worklets: Worklets; onCapturada: (jpegBase64: string) => void; camera: Camera }) {
  const estilosTexto = useEstilosTexto();
  const permissao = visao.useCameraPermission();
  if (!permissao.hasPermission) {
    return (
      <View style={{ gap: 8 }}>
        <Text style={estilosTexto.corpo}>Para a verificação, o app precisa de acesso à câmera.</Text>
        {permissao.canRequestPermission ? (
          <Botao titulo="Permitir câmera" onPress={() => permissao.requestPermission()} />
        ) : (
          <Botao titulo="Abrir configurações" variante="secundario" onPress={() => Linking.openSettings()} />
        )}
      </View>
    );
  }
  return <Visor visao={visao} worklets={worklets} onCapturada={onCapturada} camera={camera} />;
}

function Visor({ visao, worklets, onCapturada, camera }: { visao: Visao; worklets: Worklets; onCapturada: (jpegBase64: string) => void; camera: Camera }) {
  const cores = useCores();
  const estilosTexto = useEstilosTexto();
  const [orientacao, setOrientacao] = useState<Orientacao>("nenhum");
  const [erro, setErro] = useState<string | null>(null);
  const [capturando, setCapturando] = useState(false);

  const dispositivo = visao.useCameraDevice(camera);
  // 640×480 basta para o rosto; foto maior deixa a decodificação em JavaScript lenta (~10 s).
  const fotoSaida = visao.usePhotoOutput({
    containerFormat: "jpeg",
    quality: 0.9,
    qualityPrioritization: "speed",
    targetResolution: visao.CommonResolutions.VGA_4_3,
  });

  // Estado da análise, na thread do app. A worklet da câmera só reduz o quadro e o envia.
  const aberto = useMemo(() => worklets.createSynchronizable(true), [worklets]);
  const ocupado = useRef(false);
  const ultimaAnalise = useRef(0);
  const estado = useRef<EstadoOrientacao>({ ...ESTADO_INICIAL });
  const capturaEmCurso = useRef(false);
  const montado = useRef(true);

  useEffect(() => {
    montado.current = true;
    carregarModelo("blazeface").catch((e: Error) => setErro(`Falha ao carregar o detector: ${e.message}`));
    return () => {
      montado.current = false;
      aberto.setBlocking(false);
    };
  }, [aberto]);

  const capturar = useCallback(async () => {
    if (capturaEmCurso.current) return;
    capturaEmCurso.current = true;
    aberto.setBlocking(false); // para de analisar quadros enquanto a foto é tirada
    setCapturando(true);
    try {
      // Sem o som de obturador: a captura é automática, não um clique do usuário.
      const foto = await fotoSaida.capturePhoto({ flashMode: "off", enableShutterSound: false }, {});
      try {
        // O Android entrega a foto em 4000×3000 mesmo com `targetResolution` menor, e decodificar
        // isso em JavaScript leva ~3,7 s. Reduzimos no lado nativo: o rosto cabe em 640 px. A
        // conversão também já aplica a orientação, que o JPEG original só traz no EXIF.
        const imagem = await foto.toImageAsync();
        try {
          const escala = LADO_MAXIMO_FOTO / Math.max(imagem.width, imagem.height);
          const reduzida = await imagem.resizeAsync(Math.round(imagem.width * escala), Math.round(imagem.height * escala));
          try {
            const codificada = await reduzida.toEncodedImageDataAsync("jpg", 90);
            if (montado.current) onCapturada(bytesParaBase64(new Uint8Array(codificada.buffer)));
          } finally {
            reduzida.dispose();
          }
        } finally {
          imagem.dispose();
        }
      } finally {
        foto.dispose();
      }
    } catch (e) {
      if (montado.current) setErro(`Não foi possível tirar a foto: ${(e as Error).message}`);
      estado.current = { ...ESTADO_INICIAL };
      aberto.setBlocking(true);
      setCapturando(false);
    } finally {
      capturaEmCurso.current = false;
    }
  }, [aberto, fotoSaida, onCapturada]);

  /** Recebe o quadro já reduzido, roda o detector e atualiza o orientador. */
  const analisar = useCallback(
    async (tensor: Float32Array, preparo: Preparo) => {
      try {
        const modelo = await carregarModelo("blazeface");
        const saidas = await modelo.run([tensor.buffer as ArrayBuffer]);
        if (!montado.current || capturaEmCurso.current) return;
        const caixa = decodificar(saidas, preparo, LIMIAR_DETECCAO);
        const resultado = avaliarOrientacao(caixa, estado.current);
        estado.current = resultado.estado;
        setOrientacao(resultado.orientacao);
        if (resultado.orientacao === "pronto") void capturar();
      } catch (e) {
        if (montado.current) setErro(`Falha na detecção: ${(e as Error).message}`);
      } finally {
        ocupado.current = false;
      }
    },
    [capturar],
  );

  /** Chamada na thread do app para cada quadro reduzido: uma análise por vez, com intervalo. */
  const receberQuadro = useCallback(
    (tensor: Float32Array, preparo: Preparo) => {
      if (ocupado.current || capturaEmCurso.current) return;
      const agora = Date.now();
      if (agora - ultimaAnalise.current < INTERVALO_MS) return;
      ultimaAnalise.current = agora;
      ocupado.current = true;
      void analisar(tensor, preparo);
    },
    [analisar],
  );

  // Só a função entra na worklet: capturar o módulo `worklets` inteiro derruba o app
  // ("Cannot copy value of type NativeWorklets").
  const agendarNoApp = worklets.scheduleOnRN;

  const quadroSaida = visao.useFrameOutput({
    pixelFormat: "rgb",
    enablePhysicalBufferRotation: true,
    dropFramesWhileBusy: true,
    targetResolution: visao.CommonResolutions.VGA_4_3,
    onFrame(frame) {
      "worklet";
      try {
        if (!aberto.getDirty()) return;
        const formato = frame.pixelFormat;
        if (formato !== "rgb-bgra-8-bit" && formato !== "rgb-rgba-8-bit" && formato !== "rgb-rgb-8-bit") return;
        const canais = formato === "rgb-rgb-8-bit" ? 3 : 4;
        const bgr = formato === "rgb-bgra-8-bit";
        // No Android, getPixelBuffer() do quadro exige API 26 (HardwareBuffer) e falha com
        // minSdk 24; o plano lê o ByteBuffer comum. RGB vem num plano só.
        const planos = frame.getPlanes();
        try {
          const plano = planos.length > 0 ? planos[0] : null;
          const pixels = new Uint8Array(plano ? plano.getPixelBuffer() : frame.getPixelBuffer());
          const bytesPorLinha = plano ? plano.bytesPerRow : frame.bytesPerRow;
          const { tensor, preparo } = prepararEntrada(pixels, frame.width, frame.height, bytesPorLinha, canais, bgr);
          agendarNoApp(receberQuadro, tensor, preparo);
        } finally {
          for (const p of planos) p.dispose();
        }
      } finally {
        frame.dispose();
      }
    },
  });

  const saidas = useMemo(() => [fotoSaida, quadroSaida], [fotoSaida, quadroSaida]);

  if (!dispositivo) return <ActivityIndicator color={cores.primaria} />;

  const pronto = orientacao === "pronto" || capturando;
  // Moldura apagada enquanto a orientação não é seguida; firme quando o rosto está no lugar
  // (só falta ficar parado); verde ao capturar.
  const posicionado = pronto || orientacao === "parado";
  return (
    <View style={{ gap: 12 }}>
      <View style={styles.visor}>
        <visao.Camera style={StyleSheet.absoluteFill} device={dispositivo} isActive outputs={saidas} mirrorMode={camera === "front" ? "on" : "off"} />
        <View
          style={[
            styles.mira,
            pronto ? styles.miraPronta : posicionado ? styles.miraPosicionada : styles.miraApagada,
          ]}
          pointerEvents="none"
        />
        <View style={[styles.faixa, pronto && styles.faixaPronta]} pointerEvents="none">
          <Text style={styles.mensagem}>{MENSAGENS[pronto ? "pronto" : orientacao]}</Text>
        </View>
      </View>
      <Text style={estilosTexto.secundario}>Boa iluminação no rosto, sem óculos escuros nem boné.</Text>
      <MensagemErro texto={erro} />
    </View>
  );
}

/**
 * Cores fixas: ficam sobre a imagem da câmera, que não muda com o tema. (Antes o texto usava
 * `textoSobreCor`, que no modo escuro é quase preto.)
 */
const BRANCO = "#FFFFFF";
const VERDE = "#22C55E";

const styles = StyleSheet.create({
    visor: {
      aspectRatio: 3 / 4,
      borderRadius: 12,
      overflow: "hidden",
      backgroundColor: "#000",
    },
    mira: {
      position: "absolute",
      left: "15%",
      right: "15%",
      top: "10%",
      bottom: "18%",
      borderRadius: 999,
    },
    miraApagada: { borderWidth: 3, borderColor: BRANCO, opacity: 0.35 },
    miraPosicionada: { borderWidth: 4, borderColor: BRANCO, opacity: 1 },
    miraPronta: { borderWidth: 5, borderColor: VERDE, opacity: 1 },
    faixa: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      paddingVertical: 12,
      paddingHorizontal: 12,
      backgroundColor: "rgba(0,0,0,0.6)",
    },
    faixaPronta: { backgroundColor: "rgba(21,128,61,0.85)" },
    mensagem: {
      color: BRANCO,
      fontSize: 18,
      fontWeight: "700",
      textAlign: "center",
      textShadowColor: "rgba(0,0,0,0.6)",
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 3,
    },
  });
