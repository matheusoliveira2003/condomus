// Gera os ícones do app (monograma "C") em apps/mobile/assets a partir de SVG.
// Uso (macOS, na raiz do projeto): node docs/marca/gerar-icones.js . apps/mobile/assets
// O qlmanage sempre renderiza sobre fundo branco; para obter transparência, cada imagem
// é renderizada sobre preto e sobre branco, e o alfa sai da diferença entre as duas.
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { PNG } = require(path.resolve(process.argv[2], "node_modules/pngjs"));
const [, , raiz, destino] = process.argv;
const tmp = path.join(require("os").tmpdir(), "condomus-icones");
fs.mkdirSync(tmp, { recursive: true });

const MARINHO = "#1E3A5F", AMBAR = "#F5B544", BRANCO = "#FFFFFF";

// Desenho no espaço 512x512 (mesmo do conceito aprovado).
// Com `porta` nula, a porta vira um recorte transparente (máscara), para o ícone monocromático.
const glifo = ({ c = BRANCO, casa = AMBAR, porta = MARINHO } = {}) => `
  <defs><mask id="recorte"><rect width="512" height="512" fill="#fff"/><rect x="241" y="282" width="30" height="46" rx="5" fill="#000"/></mask></defs>
  <path d="M 362 150 A 150 150 0 1 0 362 362" fill="none" stroke="${c}" stroke-width="52" stroke-linecap="round"/>
  <g ${porta ? "" : 'mask="url(#recorte)"'}>
    <polyline points="186,258 256,200 326,258" fill="none" stroke="${casa}" stroke-width="24" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="208" y="252" width="96" height="76" rx="10" fill="${casa}"/>
  </g>
  ${porta ? `<rect x="241" y="282" width="30" height="46" rx="5" fill="${porta}"/>` : ""}`;

// Caixa do glifo no espaço 512: x 80–388, y 80–432 (centro óptico ~ x 234).
// `escala` = altura do glifo em fração do quadro; recentraliza no meio da imagem.
const posicionar = (conteudo, escala) => {
  const s = (escala * 512) / 352;
  const tx = 256 - 234 * s, ty = 256 - 256 * s;
  return `<g transform="translate(${tx} ${ty}) scale(${s})">${conteudo}</g>`;
};

const svg = (fundo, corpo) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">${fundo ? `<rect width="512" height="512" fill="${fundo}"/>` : ""}${corpo}</svg>`;

function renderizar(nome, conteudo, tamanho) {
  const arq = path.join(tmp, `${nome}.svg`);
  fs.writeFileSync(arq, conteudo);
  execFileSync("qlmanage", ["-t", "-s", String(tamanho), "-o", tmp, arq], { stdio: "ignore" });
  return PNG.sync.read(fs.readFileSync(`${arq}.png`));
}

function salvar(png, arquivo) {
  fs.writeFileSync(path.join(destino, arquivo), PNG.sync.write(png));
  console.log(`${arquivo} ${png.width}x${png.height}`);
}

/** Imagem opaca: o próprio SVG já tem fundo. */
function opaca(arquivo, corpo, tamanho) {
  const img = renderizar(arquivo, svg(MARINHO, corpo), tamanho);
  for (let i = 3; i < img.data.length; i += 4) img.data[i] = 255;
  salvar(img, arquivo);
}

/** Imagem transparente, recuperada pela diferença entre fundo preto e branco. */
function transparente(arquivo, corpo, tamanho) {
  const p = renderizar(`${arquivo}-preto`, svg("#000000", corpo), tamanho);
  const b = renderizar(`${arquivo}-branco`, svg("#FFFFFF", corpo), tamanho);
  const out = new PNG({ width: p.width, height: p.height });
  for (let i = 0; i < p.data.length; i += 4) {
    const dif = (b.data[i] - p.data[i] + b.data[i + 1] - p.data[i + 1] + b.data[i + 2] - p.data[i + 2]) / 3;
    const a = Math.max(0, Math.min(255, 255 - dif));
    for (let k = 0; k < 3; k++) out.data[i + k] = a ? Math.min(255, Math.round((p.data[i + k] * 255) / a)) : 0;
    out.data[i + 3] = a;
  }
  salvar(out, arquivo);
}

// iOS / ícone geral / logo da tela de login: quadrado cheio, glifo grande.
opaca("icon.png", posicionar(glifo(), 0.69), 1024);
// Android adaptativo: glifo dentro da zona segura (~61% do quadro) e fundo separado.
transparente("android-icon-foreground.png", posicionar(glifo(), 0.5), 1024);
opaca("android-icon-background.png", "", 1024);
// Android 13+ (ícone temático): uma cor só; a porta vira recorte transparente.
transparente("android-icon-monochrome.png", posicionar(glifo({ c: BRANCO, casa: BRANCO, porta: null }), 0.5), 1024);
// Tela de abertura: glifo transparente sobre fundo marinho (definido no app.json).
transparente("splash-icon.png", posicionar(glifo(), 0.8), 1024);
