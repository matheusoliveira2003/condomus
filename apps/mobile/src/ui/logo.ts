import { paletaClara } from "./tema";

/** Camadas do logo (mesmo enquadramento): o "C" e a casa, separados para a animação de abertura. */
export const LOGO_C = require("../../assets/logo-c.png");
export const LOGO_CASA = require("../../assets/logo-casa.png");

/** Fundo da abertura e das boas-vindas: igual ao da tela de abertura nativa, para não haver "piscada". */
export const FUNDO_MARCA = paletaClara.primaria;

/** Gradiente da marca (topo das Boas-vindas e do Login): claro em cima, bem escuro embaixo. */
export const GRADIENTE_MARCA = ["#2E5687", "#0A1628"] as const;
