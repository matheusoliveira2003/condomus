import { randomInt } from "node:crypto";

/** Sem 0/O, 1/I/L: fácil de ditar e de digitar quando o QR code não lê. */
const ALFABETO = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const TAMANHO = 6;

/** Código aleatório criptograficamente seguro (31^6 ≈ 887 milhões de combinações). */
export const gerarCodigo = () => Array.from({ length: TAMANHO }, () => ALFABETO[randomInt(ALFABETO.length)]).join("");

/** Aceita o conteúdo do QR code ("CONDOMUS:ABC123") ou o código digitado, com ou sem espaços/minúsculas. */
export const normalizarCodigo = (entrada: string) => entrada.trim().toUpperCase().replace(/^CONDOMUS:/, "").replace(/[^A-Z0-9]/g, "");

/** Conteúdo gravado no QR code. */
export const conteudoQr = (codigo: string) => `CONDOMUS:${codigo}`;

/** Código numérico de 6 dígitos (recuperação de senha) — mais familiar que o alfanumérico acima. */
export const gerarCodigoNumerico = () => Array.from({ length: 6 }, () => randomInt(10)).join("");
