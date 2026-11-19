import { decode as decodeJpeg } from "jpeg-js";
import { base64ParaBytes } from "./base64";
import { Caixa, decodificar, LIMIAR_DETECCAO, prepararEntrada } from "./deteccao";
import { carregarModelo } from "./modelos";

/** Entrada do MobileFaceNet: 112×112 RGB, só o rosto. */
const LADO = 112;
/**
 * Orientações tentadas, em graus no sentido horário. O jpeg-js ignora o EXIF, então uma foto
 * salva deitada não mostra o rosto de pé; tentamos as quatro até achar.
 */
const ORIENTACOES = [0, 90, 270, 180] as const;

/** Tempos (ms) e tamanho de cada etapa, para a prova técnica. */
export type Medidas = Record<string, number | string>;

type Imagem = { data: Uint8Array; largura: number; altura: number };

/** Gira uma imagem RGB em múltiplos de 90° no sentido horário. */
function girar(imagem: Imagem, graus: number): Imagem {
  if (graus === 0) return imagem;
  const { data, largura: w, altura: h } = imagem;
  const trocaLados = graus === 90 || graus === 270;
  const nw = trocaLados ? h : w;
  const nh = trocaLados ? w : h;
  const saida = new Uint8Array(nw * nh * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let dx: number;
      let dy: number;
      if (graus === 90) {
        dx = h - 1 - y;
        dy = x;
      } else if (graus === 180) {
        dx = w - 1 - x;
        dy = h - 1 - y;
      } else {
        dx = y;
        dy = w - 1 - x;
      }
      const origem = (y * w + x) * 3;
      const destino = (dy * nw + dx) * 3;
      saida[destino] = data[origem];
      saida[destino + 1] = data[origem + 1];
      saida[destino + 2] = data[origem + 2];
    }
  }
  return { data: saida, largura: nw, altura: nh };
}

/** Acha o rosto em qualquer uma das orientações; devolve a imagem já na orientação em que ele aparece. */
async function localizarRosto(imagem: Imagem): Promise<{ imagem: Imagem; caixa: Caixa }> {
  const detector = await carregarModelo("blazeface");
  for (const graus of ORIENTACOES) {
    const girada = girar(imagem, graus);
    const { tensor, preparo } = prepararEntrada(girada.data, girada.largura, girada.altura, girada.largura * 3, 3, false);
    const caixa = decodificar(await detector.run([tensor.buffer as ArrayBuffer]), preparo, LIMIAR_DETECCAO);
    if (caixa) return { imagem: girada, caixa };
  }
  throw new Error("Nenhum rosto encontrado na foto. Tire de novo.");
}

/**
 * Posições dos marcos num rosto 112×112 alinhado (referência do ArcFace/MobileFaceNet):
 * olho esquerdo (na imagem), olho direito, nariz, centro da boca.
 */
const REFERENCIA: [number, number][] = [
  [38.29, 51.69],
  [73.53, 51.5],
  [56.03, 71.74],
  [56.14, 92.2],
];

/**
 * Transformação de semelhança (rotação + escala + translação) por mínimos quadrados que leva
 * os pontos da foto para a referência: u = a·x − b·y + tx; v = b·x + a·y + ty.
 */
function ajustarSemelhanca(origem: [number, number][]): { a: number; b: number; tx: number; ty: number } {
  let sxx = 0;
  let sx = 0;
  let sy = 0;
  let su = 0;
  let sv = 0;
  let num1 = 0;
  let num2 = 0;
  const n = origem.length;
  for (let i = 0; i < n; i++) {
    const [x, y] = origem[i];
    const [u, v] = REFERENCIA[i];
    sx += x;
    sy += y;
    su += u;
    sv += v;
    sxx += x * x + y * y;
    num1 += x * u + y * v;
    num2 += x * v - y * u;
  }
  const cx = sx / n;
  const cy = sy / n;
  const cu = su / n;
  const cv = sv / n;
  const den = sxx - n * (cx * cx + cy * cy);
  const a = (num1 - n * (cx * cu + cy * cv)) / den;
  const b = (num2 - n * (cx * cv - cy * cu)) / den;
  return { a, b, tx: cu - (a * cx - b * cy), ty: cv - (b * cx + a * cy) };
}

/**
 * Alinha o rosto pelos marcos do detector (olhos, nariz, boca) e monta o tensor do
 * MobileFaceNet: RGB 112×112, normalizado como no treinamento: (pixel - 127,5) / 128.
 * O modelo foi treinado com rostos alinhados; só recortar a caixa separa mal as pessoas.
 */
async function paraTensor(jpegBase64: string, medidas?: Medidas): Promise<ArrayBuffer> {
  let t = Date.now();
  const marcar = (nome: string) => {
    const agora = Date.now();
    if (medidas) medidas[nome] = agora - t;
    t = agora;
  };
  const bytes = base64ParaBytes(jpegBase64);
  marcar("base64");
  // useTArray: o padrão usa Buffer do Node, que o React Native não tem.
  const decodificada = decodeJpeg(bytes, { useTArray: true, formatAsRGBA: false, maxMemoryUsageInMB: 256 });
  marcar("jpeg");
  if (medidas) medidas.tamanho = `${decodificada.width}x${decodificada.height}`;
  const { imagem: { data, largura: width, altura: height }, caixa } = await localizarRosto({
    data: decodificada.data,
    largura: decodificada.width,
    altura: decodificada.height,
  });
  marcar("deteccao");

  // Olhos em ordem da esquerda para a direita da imagem, como na referência.
  const [p0, p1, nariz, boca] = caixa.pontos;
  const [olhoE, olhoD] = p0.x <= p1.x ? [p0, p1] : [p1, p0];
  const origem = [olhoE, olhoD, nariz, boca].map((p) => [p.x * width, p.y * height] as [number, number]);
  const { a, b, tx, ty } = ajustarSemelhanca(origem);

  // Transformação inversa: para cada pixel (u, v) do destino, onde amostrar na foto.
  const det = a * a + b * b;
  const ia = a / det;
  const ib = b / det;
  const entrada = new Float32Array(LADO * LADO * 3);
  for (let v = 0; v < LADO; v++) {
    for (let u = 0; u < LADO; u++) {
      const du = u + 0.5 - tx;
      const dv = v + 0.5 - ty;
      const x = ia * du + ib * dv - 0.5;
      const y = -ib * du + ia * dv - 0.5;
      const x0 = Math.floor(x);
      const y0 = Math.floor(y);
      const fx = x - x0;
      const fy = y - y0;
      const destino = (v * LADO + u) * 3;
      for (let c = 0; c < 3; c++) {
        const amostra = (px: number, py: number) =>
          data[(Math.min(height - 1, Math.max(0, py)) * width + Math.min(width - 1, Math.max(0, px))) * 3 + c];
        const valor =
          amostra(x0, y0) * (1 - fx) * (1 - fy) +
          amostra(x0 + 1, y0) * fx * (1 - fy) +
          amostra(x0, y0 + 1) * (1 - fx) * fy +
          amostra(x0 + 1, y0 + 1) * fx * fy;
        entrada[destino + c] = (valor - 127.5) / 128;
      }
    }
  }
  marcar("alinhamento");
  return entrada.buffer;
}

/** Vetor de 128 dimensões, já normalizado (norma 1). */
export type Assinatura = Float32Array;

/** Gera a assinatura facial de uma foto JPEG em base64. */
export async function gerarAssinatura(jpegBase64: string, medidas?: Medidas): Promise<Assinatura> {
  const tensor = await paraTensor(jpegBase64, medidas);
  const inicio = Date.now();
  const modelo = await carregarModelo("mobilefacenet");
  const [saida] = await modelo.run([tensor]);
  if (medidas) medidas.modelo = Date.now() - inicio;
  // A biblioteca reutiliza o mesmo buffer de saída em cada chamada: copiamos antes de guardar.
  return new Float32Array(saida.slice(0));
}

/**
 * Semelhança de cosseno entre duas assinaturas, de -1 a 1: produto interno dividido pelas
 * normas. Não supõe que a saída do modelo já tem norma 1. Acima do limiar calibrado,
 * consideramos a mesma pessoa.
 */
export function semelhanca(a: Assinatura, b: Assinatura): number {
  let produto = 0;
  let normaA = 0;
  let normaB = 0;
  for (let i = 0; i < a.length; i++) {
    produto += a[i] * b[i];
    normaA += a[i] * a[i];
    normaB += b[i] * b[i];
  }
  return produto / (Math.sqrt(normaA) * Math.sqrt(normaB));
}
