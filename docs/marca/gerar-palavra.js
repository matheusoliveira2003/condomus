// Gera a palavra "Condomus" (Inter Bold, branca, fundo transparente) para a tela de abertura nativa.
// Uso (na raiz do projeto): node docs/marca/gerar-palavra.js
// Mesma fonte e cor do texto inicial da animação de abertura, para a passagem ficar contínua.
const fs = require("fs");
const path = require("path");
const { Resvg } = require("@resvg/resvg-js");

const raiz = path.resolve(__dirname, "../..");
const fonte = path.join(raiz, "apps/api/assets/fontes/inter_bold.ttf");
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="300" viewBox="0 0 1200 300">
  <text x="600" y="200" text-anchor="middle" font-family="Inter" font-weight="700" font-size="200" letter-spacing="-1.8" fill="#FFFFFF">Condomus</text>
</svg>`;
const png = new Resvg(svg, { font: { fontFiles: [fonte], loadSystemFonts: false, defaultFontFamily: "Inter" } }).render().asPng();
const destino = path.join(raiz, "apps/mobile/assets/splash-condomus.png");
fs.writeFileSync(destino, png);
console.log(`${path.relative(raiz, destino)} 1200x300`);
