// No celular físico, use o IP da sua máquina na rede local (ex.: http://192.168.0.10:3333).
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3333";

// Re-exporta todos os tipos de domínio compartilhados — imports nas telas e hooks devem vir daqui.
export type {
  Papel,
  Usuario,
  Pessoa,
  Unidade,
  UnidadeComMoradores,
  UsuarioCadastro,
  Aviso,
  StatusVisita,
  Visita,
  Encomenda,
  StatusEncomenda,
  AreaComum,
  StatusReserva,
  Reserva,
  Pagina,
  Resumo,
  PlanoStatus,
  Condominio,
  ConviteInfo,
} from "@condomus/types";

/** Sem resposta nesse tempo, a requisição é abortada (evita telas presas carregando). */
const TEMPO_LIMITE_MS = 15000;

/**
 * Limite para a primeira requisição depois de um tempo parado (login, restaurar sessão). O servidor
 * gratuito dorme quando ninguém usa e leva cerca de 45 s para acordar.
 */
export const TEMPO_LIMITE_ACORDAR_MS = 60000;

/** Falha de rede ou tempo esgotado: a API não respondeu (diferente de a API recusar o pedido). */
export class ErroDeConexao extends Error {
  constructor() {
    super("Não foi possível conectar ao servidor");
  }
}

/** Acorda o servidor em segundo plano, para ele já estar de pé quando a pessoa tocar em Entrar. */
export function aquecerServidor() {
  const controle = new AbortController();
  const limite = setTimeout(() => controle.abort(), TEMPO_LIMITE_ACORDAR_MS);
  fetch(`${API_URL}/health`, { signal: controle.signal })
    .catch(() => {})
    .finally(() => clearTimeout(limite));
}

let token: string | null = null;
let aoExpirarSessao: (() => void) | null = null;
let aoPlanoInativo: (() => void) | null = null;

export function definirToken(novo: string | null) {
  token = novo;
}

/** Token atual, para requisições feitas fora de `api()` (ex.: imagens com cabeçalho). */
export const obterToken = () => token;

/** Chamado quando a API responde 401 (token expirado ou inválido). */
export function definirAoExpirarSessao(callback: (() => void) | null) {
  aoExpirarSessao = callback;
}

/** Chamado quando a API responde 402 (plano do condomínio expirado ou suspenso). */
export function definirAoPlanoInativo(callback: (() => void) | null) {
  aoPlanoInativo = callback;
}

export async function api<T>(caminho: string, opcoes: RequestInit = {}, limiteMs = TEMPO_LIMITE_MS): Promise<T> {
  let resposta: Response;
  const controle = new AbortController();
  const limite = setTimeout(() => controle.abort(), limiteMs);
  try {
    resposta = await fetch(`${API_URL}${caminho}`, {
      signal: controle.signal,
      ...opcoes,
      headers: {
        ...(opcoes.body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...opcoes.headers,
      },
    });
  } catch {
    throw new ErroDeConexao();
  } finally {
    clearTimeout(limite);
  }
  if (resposta.status === 204) return undefined as T;
  const corpo = await resposta.json();
  if (resposta.status === 401 && token) aoExpirarSessao?.();
  if (resposta.status === 402 && token) aoPlanoInativo?.();
  if (!resposta.ok) {
    // Erros de validação trazem o motivo por campo; mostra o primeiro.
    const detalhe = corpo.detalhes && (Object.values(corpo.detalhes) as string[][]).flat()[0];
    throw new Error(detalhe ?? corpo.erro ?? "Erro inesperado");
  }
  return corpo as T;
}

export const enviar = <T>(metodo: "POST" | "PUT" | "PATCH" | "DELETE", caminho: string, corpo?: unknown, limiteMs?: number) =>
  api<T>(caminho, { method: metodo, body: corpo === undefined ? undefined : JSON.stringify(corpo) }, limiteMs);
