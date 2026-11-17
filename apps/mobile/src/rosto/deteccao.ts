/**
 * Detecção de rosto com o BlazeFace (short range) do MediaPipe, Apache-2.0.
 * Entrada 128×128 RGB em [-1, 1]; saída: 896 âncoras com 16 regressores e 1 pontuação cada.
 *
 * As funções marcadas 'worklet' rodam na thread da câmera, sobre o quadro ao vivo.
 */

export const LADO_DETECTOR = 128;
const NUM_ANCORAS = 896;
const NUM_REGRESSORES = 16;

/** Como o quadro foi reduzido para 128×128 (letterbox), para mapear a caixa de volta. */
export type Preparo = { escala: number; padX: number; padY: number; largura: number; altura: number };

/** Ponto do rosto, em fração (0 a 1) do quadro inteiro. */
export type Ponto = { x: number; y: number };

/**
 * Caixa do rosto, em fração (0 a 1) do quadro inteiro. `pontos` são os marcos do BlazeFace
 * na ordem: olho direito da pessoa, olho esquerdo, nariz, boca (centro).
 */
export type Caixa = { x: number; y: number; largura: number; altura: number; pontuacao: number; pontos: Ponto[] };

/**
 * Reduz o quadro RGB(A/BGRA) para 128×128, preservando a proporção e com faixas cinza.
 * Devolve o tensor de entrada e os dados para desfazer a redução.
 */
export function prepararEntrada(
  pixels: Uint8Array,
  largura: number,
  altura: number,
  bytesPorLinha: number,
  canais: number,
  bgr: boolean,
): { tensor: Float32Array; preparo: Preparo } {
  "worklet";
  const escala = LADO_DETECTOR / Math.max(largura, altura);
  const padX = (LADO_DETECTOR - largura * escala) / 2;
  const padY = (LADO_DETECTOR - altura * escala) / 2;
  const iR = bgr ? 2 : 0;
  const iB = bgr ? 0 : 2;
  const tensor = new Float32Array(LADO_DETECTOR * LADO_DETECTOR * 3); // zero = cinza médio
  for (let v = 0; v < LADO_DETECTOR; v++) {
    const y = Math.floor((v + 0.5 - padY) / escala);
    if (y < 0 || y >= altura) continue;
    for (let u = 0; u < LADO_DETECTOR; u++) {
      const x = Math.floor((u + 0.5 - padX) / escala);
      if (x < 0 || x >= largura) continue;
      const i = y * bytesPorLinha + x * canais;
      const d = (v * LADO_DETECTOR + u) * 3;
      tensor[d] = pixels[i + iR] / 127.5 - 1;
      tensor[d + 1] = pixels[i + 1] / 127.5 - 1;
      tensor[d + 2] = pixels[i + iB] / 127.5 - 1;
    }
  }
  return { tensor, preparo: { escala, padX, padY, largura, altura } };
}

/** Âncoras do BlazeFace short range (strides 8, 16, 16, 16), em fração da entrada. */
function gerarAncoras(): Float32Array {
  "worklet";
  const strides = [8, 16, 16, 16];
  const n = strides.length;
  const ancoras = new Float32Array(NUM_ANCORAS * 2);
  let k = 0;
  let i = 0;
  while (i < n) {
    let j = i;
    let porCelula = 0;
    while (j < n && strides[j] === strides[i]) {
      porCelula += 2;
      j++;
    }
    const mapa = Math.ceil(LADO_DETECTOR / strides[i]);
    for (let y = 0; y < mapa; y++) {
      for (let x = 0; x < mapa; x++) {
        for (let a = 0; a < porCelula; a++) {
          ancoras[k++] = (x + 0.5) / mapa;
          ancoras[k++] = (y + 0.5) / mapa;
        }
      }
    }
    i = j;
  }
  return ancoras;
}

/**
 * Lê a saída do modelo e devolve o rosto de maior pontuação, ou null se nenhum passar do limiar.
 * Distingue as duas saídas pelo tamanho: regressores têm 16 valores por âncora.
 */
export function decodificar(saidas: ArrayBuffer[], preparo: Preparo, limiar: number): Caixa | null {
  "worklet";
  let regressores: Float32Array | null = null;
  let logits: Float32Array | null = null;
  for (const s of saidas) {
    if (s.byteLength === NUM_ANCORAS * NUM_REGRESSORES * 4) regressores = new Float32Array(s);
    else if (s.byteLength === NUM_ANCORAS * 4) logits = new Float32Array(s);
  }
  if (!regressores || !logits) return null;

  let melhor = 0;
  for (let k = 1; k < NUM_ANCORAS; k++) if (logits[k] > logits[melhor]) melhor = k;
  const pontuacao = 1 / (1 + Math.exp(-Math.max(-100, Math.min(100, logits[melhor]))));
  if (pontuacao < limiar) return null;

  const ancoras = gerarAncoras();
  const r = melhor * NUM_REGRESSORES;
  // Regressores são em pixels da entrada 128×128, relativos à âncora: dividimos por 128 para fração.
  const cx = regressores[r] / LADO_DETECTOR + ancoras[melhor * 2];
  const cy = regressores[r + 1] / LADO_DETECTOR + ancoras[melhor * 2 + 1];
  const w = regressores[r + 2] / LADO_DETECTOR;
  const h = regressores[r + 3] / LADO_DETECTOR;

  // Da entrada 128×128 (com faixas) de volta para o quadro original, em fração.
  const { escala, padX, padY, largura, altura } = preparo;
  const pontos: Ponto[] = [];
  for (let i = 0; i < 4; i++) {
    const px = regressores[r + 4 + i * 2] / LADO_DETECTOR + ancoras[melhor * 2];
    const py = regressores[r + 5 + i * 2] / LADO_DETECTOR + ancoras[melhor * 2 + 1];
    pontos.push({
      x: (px * LADO_DETECTOR - padX) / escala / largura,
      y: (py * LADO_DETECTOR - padY) / escala / altura,
    });
  }
  return {
    x: (cx * LADO_DETECTOR - w * LADO_DETECTOR / 2 - padX) / escala / largura,
    y: (cy * LADO_DETECTOR - h * LADO_DETECTOR / 2 - padY) / escala / altura,
    largura: (w * LADO_DETECTOR) / escala / largura,
    altura: (h * LADO_DETECTOR) / escala / altura,
    pontuacao,
    pontos,
  };
}

/** Limiares da orientação. Frações do quadro; ainda não calibrados em aparelho. */
export const LIMIAR_DETECCAO = 0.6;
export const LARGURA_MINIMA = 0.4;
export const LARGURA_MAXIMA = 0.75;
export const TOLERANCIA_CENTRO = 0.15;
export const TOLERANCIA_MOVIMENTO = 0.03;
export const QUADROS_ESTAVEIS = 8;

export type Orientacao = "nenhum" | "aproxime" | "afaste" | "centralize" | "parado" | "pronto";

/** Estado entre quadros: quantos seguidos o rosto ficou parado e onde estava. */
export type EstadoOrientacao = { estavel: number; x: number; y: number; largura: number; altura: number };

export const ESTADO_INICIAL: EstadoOrientacao = { estavel: 0, x: 0, y: 0, largura: 0, altura: 0 };

/**
 * Decide a orientação do quadro atual: "pronto" quando o rosto ficou centralizado, no tamanho
 * certo e parado por QUADROS_ESTAVEIS quadros seguidos.
 */
export function avaliarOrientacao(caixa: Caixa | null, estado: EstadoOrientacao): { orientacao: Orientacao; estado: EstadoOrientacao } {
  "worklet";
  if (!caixa) return { orientacao: "nenhum", estado: { ...ESTADO_INICIAL } };
  if (caixa.largura < LARGURA_MINIMA) return { orientacao: "aproxime", estado: { ...ESTADO_INICIAL } };
  if (caixa.largura > LARGURA_MAXIMA) return { orientacao: "afaste", estado: { ...ESTADO_INICIAL } };
  const cx = caixa.x + caixa.largura / 2;
  const cy = caixa.y + caixa.altura / 2;
  if (Math.abs(cx - 0.5) > TOLERANCIA_CENTRO || Math.abs(cy - 0.45) > TOLERANCIA_CENTRO) {
    return { orientacao: "centralize", estado: { ...ESTADO_INICIAL } };
  }
  const movimento =
    Math.abs(caixa.x - estado.x) + Math.abs(caixa.y - estado.y) + Math.abs(caixa.largura - estado.largura);
  const seguidos = movimento > TOLERANCIA_MOVIMENTO ? 0 : estado.estavel + 1;
  const novo = { estavel: seguidos, x: caixa.x, y: caixa.y, largura: caixa.largura, altura: caixa.altura };
  if (movimento > TOLERANCIA_MOVIMENTO) return { orientacao: "parado", estado: novo };
  return { orientacao: seguidos >= QUADROS_ESTAVEIS ? "pronto" : "parado", estado: novo };
}
