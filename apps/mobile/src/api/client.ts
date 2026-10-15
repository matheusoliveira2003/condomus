// No celular físico, use o IP da sua máquina na rede local (ex.: http://192.168.0.10:3333).
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3333";

let token: string | null = null;
let aoExpirarSessao: (() => void) | null = null;

export function definirToken(novo: string | null) {
  token = novo;
}

/** Chamado quando a API responde 401 (token expirado ou inválido). */
export function definirAoExpirarSessao(callback: (() => void) | null) {
  aoExpirarSessao = callback;
}

export async function api<T>(caminho: string, opcoes: RequestInit = {}): Promise<T> {
  let resposta: Response;
  try {
    resposta = await fetch(`${API_URL}${caminho}`, {
      ...opcoes,
      headers: {
        ...(opcoes.body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...opcoes.headers,
      },
    });
  } catch {
    throw new Error("Não foi possível conectar ao servidor");
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

export type Papel = "MORADOR" | "PORTEIRO" | "SINDICO";

export interface Usuario {
  id: string;
  nome: string;
  papel: Papel;
  unidadeId: string | null;
}

export interface Unidade {
  id: string;
  bloco: string;
  numero: string;
}

export interface UnidadeComMoradores extends Unidade {
  _count: { moradores: number };
}

export interface UsuarioCadastro {
  id: string;
  nome: string;
  email: string;
  papel: Papel;
  ativo: boolean;
  unidade: Unidade | null;
}

export interface Aviso {
  id: string;
  titulo: string;
  conteudo: string;
  fixado: boolean;
  criadoEm: string;
  autor: { nome: string };
}

export type StatusVisita = "AGENDADA" | "EM_ANDAMENTO" | "FINALIZADA" | "CANCELADA";

export interface Visita {
  id: string;
  nomeVisitante: string;
  documento: string | null;
  placaVeiculo: string | null;
  dataPrevista: string | null;
  status: StatusVisita;
  entradaEm: string | null;
  saidaEm: string | null;
  criadoEm: string;
  unidade: Unidade;
}

export interface Encomenda {
  id: string;
  descricao: string;
  remetente: string | null;
  status: "AGUARDANDO_RETIRADA" | "RETIRADA";
  recebidaEm: string;
  retiradaEm: string | null;
  retiradaPor: string | null;
  unidade: Unidade;
}

export interface AreaComum {
  id: string;
  nome: string;
  descricao: string | null;
  capacidade: number | null;
}

export type StatusReserva = "PENDENTE" | "CONFIRMADA" | "RECUSADA" | "CANCELADA";

export interface Reserva {
  id: string;
  inicio: string;
  fim: string;
  status: StatusReserva;
  motivoRecusa: string | null;
  area: AreaComum;
  unidade: Unidade;
}

export interface Resumo {
  unidade: Unidade;
  encomendas: { total: number; itens: { id: string; descricao: string; remetente: string | null; recebidaEm: string }[] };
  visitas: {
    noCondominio: { id: string; nomeVisitante: string; entradaEm: string }[];
    esperadasHoje: { id: string; nomeVisitante: string; dataPrevista: string | null }[];
  };
  proximaReserva: { id: string; inicio: string; fim: string; status: StatusReserva; area: { nome: string } } | null;
  ultimoAviso: { id: string; titulo: string; conteudo: string; fixado: boolean; criadoEm: string } | null;
}
