import { cores } from "./tema";

/** Camadas do logo (mesmo enquadramento): o "C" e a casa, separados para a animação de abertura. */
export const LOGO_C = require("../../assets/logo-c.png");
export const LOGO_CASA = require("../../assets/logo-casa.png");

/** Família da fonte da marca, carregada em App.tsx (Inter Bold, a mesma da tela de abertura nativa). */
export const FONTE_MARCA = "Inter-Bold";

/** Fundo da abertura e das boas-vindas: igual ao da tela de abertura nativa, para não haver "piscada". */
export const FUNDO_MARCA = cores.primaria;

/** Corpo da palavra "Condomus" na abertura (Inter Bold). */
export const CORPO_PALAVRA = 56;
/** Altura das maiúsculas da Inter em relação ao corpo da fonte. */
const ALTURA_MAIUSCULA = 0.727;
/** O "C" desenhado ocupa 80% da altura da imagem do logo. */
const PROPORCAO_C = 0.8;

/**
 * Tamanho da imagem do logo para o "C" desenhado ter a mesma altura do "C" da palavra:
 * assim a letra "vira" o logo sem mudar de tamanho.
 */
export const TAMANHO_LOGO = (CORPO_PALAVRA * ALTURA_MAIUSCULA) / PROPORCAO_C;
