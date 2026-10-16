import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";
import QRCode from "qrcode";
import { conteudoQr } from "./codigo.js";

/**
 * Cartão de convite em PNG: o texto vai dentro da imagem porque o compartilhamento do
 * Android envia só o arquivo. Assim nada se perde se o visitante encaminhar ou salvar.
 * Por privacidade, não mostra unidade nem nome do morador.
 */

const MARINHO = "#1E3A5F";
const AMBAR = "#F5B544";
const TEXTO_SECUNDARIO = "#5B6472";
const LARGURA = 1080;
const ALTURA = 1350; // 4:5, proporção que o WhatsApp exibe sem cortar

// Fonte embutida (Inter, OFL): o servidor não depende das fontes instaladas no sistema.
const fonte = (arquivo: string) => fileURLToPath(new URL(`../../assets/fontes/${arquivo}`, import.meta.url));
const FONTES = ["inter_regular.ttf", "inter_semibold.ttf", "inter_bold.ttf"].map(fonte);

const escaparXml = (texto: string) =>
  texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const encurtar = (texto: string, maximo: number) => (texto.length > maximo ? `${texto.slice(0, maximo - 1)}…` : texto);

const formatarData = (data: Date) =>
  data.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Sao_Paulo" });

/** Monograma "C" do logo (mesmo desenho de docs/marca/logo.svg), no espaço 512x512. */
const LOGO = `
  <rect width="512" height="512" rx="112" fill="#FFFFFF"/>
  <path d="M 362 150 A 150 150 0 1 0 362 362" fill="none" stroke="${MARINHO}" stroke-width="52" stroke-linecap="round"/>
  <polyline points="186,258 256,200 326,258" fill="none" stroke="${AMBAR}" stroke-width="24" stroke-linecap="round" stroke-linejoin="round"/>
  <rect x="208" y="252" width="96" height="76" rx="10" fill="${AMBAR}"/>
  <rect x="241" y="282" width="30" height="46" rx="5" fill="#FFFFFF"/>`;

export async function gerarCartaoConvite({
  codigo,
  nomeVisitante,
  dataPrevista,
}: {
  codigo: string;
  nomeVisitante: string;
  dataPrevista: Date | null;
}) {
  const ladoQr = 500;
  const qrSvg = await QRCode.toString(conteudoQr(codigo), {
    type: "svg",
    margin: 0,
    errorCorrectionLevel: "M",
    color: { dark: MARINHO, light: "#FFFFFF" },
  });
  // Posiciona o SVG do QR code dentro do cartão.
  const qrPosicionado = qrSvg.replace("<svg ", `<svg x="${(LARGURA - ladoQr) / 2}" y="555" width="${ladoQr}" height="${ladoQr}" `);
  const quando = dataPrevista ? `Para ${formatarData(dataPrevista)}` : "Válido até ser utilizado";
  // Nomes longos: diminui a fonte antes de cortar, para caber o nome completo sempre que possível.
  const tamanhoNome = nomeVisitante.length <= 22 ? 60 : 46;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${LARGURA}" height="${ALTURA}" viewBox="0 0 ${LARGURA} ${ALTURA}">
  <rect width="${LARGURA}" height="${ALTURA}" fill="#F5F7FA"/>
  <rect width="${LARGURA}" height="220" fill="${MARINHO}"/>
  <g transform="translate(72 62) scale(0.1875)">${LOGO}</g>
  <text x="192" y="142" font-family="Inter" font-weight="700" font-size="56" fill="#FFFFFF">Condomus</text>

  <rect x="60" y="270" width="${LARGURA - 120}" height="1030" rx="40" fill="#FFFFFF"/>
  <text x="${LARGURA / 2}" y="370" text-anchor="middle" font-family="Inter" font-weight="600" font-size="40" fill="${TEXTO_SECUNDARIO}">Convite de visita</text>
  <text x="${LARGURA / 2}" y="450" text-anchor="middle" font-family="Inter" font-weight="700" font-size="${tamanhoNome}" fill="${MARINHO}">${escaparXml(encurtar(nomeVisitante, 34))}</text>
  <text x="${LARGURA / 2}" y="515" text-anchor="middle" font-family="Inter" font-weight="400" font-size="36" fill="${TEXTO_SECUNDARIO}">${escaparXml(quando)}</text>

  ${qrPosicionado}

  <text x="${LARGURA / 2}" y="1125" text-anchor="middle" font-family="Inter" font-weight="400" font-size="32" fill="${TEXTO_SECUNDARIO}">Código de acesso</text>
  <text x="${LARGURA / 2}" y="1190" text-anchor="middle" font-family="Inter" font-weight="700" font-size="56" letter-spacing="14" fill="${MARINHO}">${codigo}</text>
  <text x="${LARGURA / 2}" y="1255" text-anchor="middle" font-family="Inter" font-weight="400" font-size="30" fill="${TEXTO_SECUNDARIO}">Mostre este convite na portaria ao chegar.</text>
</svg>`;

  return new Resvg(svg, { font: { fontFiles: FONTES, loadSystemFonts: false, defaultFontFamily: "Inter" } }).render().asPng();
}
