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
} from "@condomus/types";

/** Sem resposta nesse tempo, a requisição é abortada (evita telas presas carregando). */
const TEMPO_LIMITE_MS = 15000;

let token: string | null = null;
let aoExpirarSessao: (() => void) | null = null;

export function definirToken(novo: string | null) {
  token = novo;
}

/** Token atual, para requisições feitas fora de `api()` (ex.: imagens com cabeçalho). */
export const obterToken = () => token;

/** Chamado quando a API responde 401 (token expirado ou inválido). */
export function definirAoExpirarSessao(callback: (() => void) | null) {
  aoExpirarSessao = callback;
}

export async function api<T>(caminho: string, opcoes: RequestInit = {}): Promise<T> {
  let resposta: Response;
  const controle = new AbortController();
  const limite = setTimeout(() => controle.abort(), TEMPO_LIMITE_MS);
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
    throw new Error("Não foi possível conectar ao servidor");
  } finally {
    clearTimeout(limite);
  }
  if (resposta.status === 204) return undefined as T;
  const corpo = await resposta.json();
  if (resposta.status === 401 && token) aoExpirarSessao?.();
  if (!resposta.ok) {
    // Erros de validação trazem o motivo por campo; mostra o primeiro.
    const detalhe = corpo.detalhes && (Object.values(corpo.detalhes) as string[][]).flat()[0];
    throw new Error(detalhe ?? corpo.erro ?? "Erro inesperado");
  }
  return corpo as T;
}

export const enviar = <T>(metodo: "POST" | "PUT" | "PATCH" | "DELETE", caminho: string, corpo?: unknown) =>
  api<T>(caminho, { method: metodo, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
