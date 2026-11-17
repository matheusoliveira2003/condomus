const ALFABETO = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Base64 para bytes, sem depender de Buffer (o React Native não tem). */
export function base64ParaBytes(base64: string): Uint8Array {
  const limpo = base64.replace(/[^A-Za-z0-9+/]/g, "");
  const bytes = new Uint8Array(Math.floor((limpo.length * 3) / 4));
  let acumulado = 0;
  let bits = 0;
  let posicao = 0;
  for (const caractere of limpo) {
    acumulado = (acumulado << 6) | ALFABETO.indexOf(caractere);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[posicao++] = (acumulado >> bits) & 0xff;
    }
  }
  return bytes.subarray(0, posicao);
}

/** Bytes para base64, sem depender de Buffer. */
export function bytesParaBase64(bytes: Uint8Array): string {
  let saida = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const trio = (a << 16) | (b << 8) | c;
    saida += ALFABETO[(trio >> 18) & 63] + ALFABETO[(trio >> 12) & 63];
    saida += i + 1 < bytes.length ? ALFABETO[(trio >> 6) & 63] : "=";
    saida += i + 2 < bytes.length ? ALFABETO[trio & 63] : "=";
  }
  return saida;
}
