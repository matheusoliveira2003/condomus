/**
 * Chamadas ao painel. O token fica em sessionStorage: some quando a aba fecha, e não vai para o disco.
 * Qualquer 401 encerra a sessão e volta para o login.
 */

const CHAVE = "condomus-admin-token";

export const obterToken = () => sessionStorage.getItem(CHAVE);
export const guardarToken = (token: string) => sessionStorage.setItem(CHAVE, token);
export const sairDoPainel = () => sessionStorage.removeItem(CHAVE);

export class ErroApi extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** Avisa a interface que a sessão acabou (o App troca para a tela de login). */
let aoExpirar: (() => void) | null = null;
export const aoExpirarSessao = (fn: () => void) => (aoExpirar = fn);

export async function api<T>(caminho: string, opcoes: { metodo?: string; corpo?: unknown } = {}): Promise<T> {
  const token = obterToken();
  const resposta = await fetch(`/admin${caminho}`, {
    method: opcoes.metodo ?? "GET",
    headers: {
      ...(opcoes.corpo !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(token && !caminho.startsWith("/auth") ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: opcoes.corpo !== undefined ? JSON.stringify(opcoes.corpo) : undefined,
  });
  if (resposta.status === 204) return undefined as T;
  const corpo = await resposta.json().catch(() => ({}));
  if (resposta.status === 401 && token && !caminho.startsWith("/auth")) {
    sairDoPainel();
    aoExpirar?.();
  }
  if (!resposta.ok) {
    const detalhe = corpo.detalhes && (Object.values(corpo.detalhes) as string[][]).flat()[0];
    throw new ErroApi(detalhe ?? corpo.erro ?? "Erro inesperado", resposta.status);
  }
  return corpo as T;
}
