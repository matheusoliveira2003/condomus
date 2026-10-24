/**
 * Tipos de domínio compartilhados entre a API (@condomus/api) e o app mobile (@condomus/mobile).
 * Fonte única de verdade: qualquer alteração no modelo de dados deve refletir aqui.
 */

// ---------------------------------------------------------------------------
// Enums / unions
// ---------------------------------------------------------------------------

export type Papel = "MORADOR" | "PORTEIRO" | "SINDICO";

export type StatusVisita = "AGENDADA" | "EM_ANDAMENTO" | "FINALIZADA" | "CANCELADA";

export type StatusEncomenda = "AGUARDANDO_RETIRADA" | "RETIRADA";

export type StatusReserva = "PENDENTE" | "CONFIRMADA" | "RECUSADA" | "CANCELADA";

export type PlanoStatus = "TRIAL" | "ATIVO" | "EXPIRADO" | "SUSPENSO";

// ---------------------------------------------------------------------------
// Entidades base
// ---------------------------------------------------------------------------

export interface Unidade {
  id: string;
  bloco: string;
  numero: string;
}

export interface UnidadeComMoradores extends Unidade {
  _count: { moradores: number };
}

/** Dados mínimos para exibir o avatar de alguém. */
export interface Pessoa {
  id: string;
  nome: string;
  fotoAtualizadaEm: string | null;
}

export interface Usuario extends Pessoa {
  papel: Papel;
  unidadeId: string | null;
}

export interface UsuarioCadastro extends Pessoa {
  email: string;
  papel: Papel;
  ativo: boolean;
  unidade: Unidade | null;
}

// ---------------------------------------------------------------------------
// Visitas
// ---------------------------------------------------------------------------

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
  /** Morador que pré-autorizou (null quando a portaria registrou direto). */
  autorizadoPor: Pessoa | null;
  /** Só na visão da portaria: a visita tem convite, então a entrada exige ler o QR code. */
  temConvite?: boolean;
}

// ---------------------------------------------------------------------------
// Encomendas
// ---------------------------------------------------------------------------

export interface Encomenda {
  id: string;
  descricao: string;
  remetente: string | null;
  status: StatusEncomenda;
  recebidaEm: string;
  retiradaEm: string | null;
  retiradaPor: string | null;
  unidade: Unidade;
}

// ---------------------------------------------------------------------------
// Avisos
// ---------------------------------------------------------------------------

export interface Aviso {
  id: string;
  titulo: string;
  conteudo: string;
  fixado: boolean;
  criadoEm: string;
  autor: { nome: string };
}

// ---------------------------------------------------------------------------
// Áreas comuns e reservas
// ---------------------------------------------------------------------------

export interface AreaComum {
  id: string;
  nome: string;
  descricao: string | null;
  capacidade: number | null;
}

export interface Reserva {
  id: string;
  inicio: string;
  fim: string;
  status: StatusReserva;
  motivoRecusa: string | null;
  area: AreaComum;
  unidade: Unidade;
}

// ---------------------------------------------------------------------------
// Condomínio (tenant) e convites
// ---------------------------------------------------------------------------

/** Condomínio do usuário logado (GET /condominios/meu). */
export interface Condominio {
  id: string;
  nome: string;
  planoStatus: PlanoStatus;
  planoExpiraEm: string | null;
}

/** Dados públicos de um convite (GET /convite/:codigo), mostrados antes do cadastro do morador. */
export interface ConviteInfo {
  unidade: { bloco: string; numero: string };
  condominio: { nome: string };
}

// ---------------------------------------------------------------------------
// Paginação
// ---------------------------------------------------------------------------

/** Resposta paginada por cursor retornada por GET /visitas, /encomendas e /avisos. */
export interface Pagina<T> {
  itens: T[];
  /** ID do último item; passe como ?cursor= para buscar a próxima página. null = não há mais. */
  proximoCursor: string | null;
}

// ---------------------------------------------------------------------------
// Resumo (tela Início do morador)
// ---------------------------------------------------------------------------

export interface Resumo {
  unidade: Unidade | null;
  encomendas: {
    total: number;
    itens: { id: string; descricao: string; remetente: string | null; recebidaEm: string }[];
  };
  visitas: {
    noCondominio: { id: string; nomeVisitante: string; entradaEm: string }[];
    esperadasHoje: { id: string; nomeVisitante: string; dataPrevista: string | null }[];
  };
  proximaReserva: {
    id: string;
    inicio: string;
    fim: string;
    status: StatusReserva;
    area: { nome: string };
  } | null;
  avisos: { id: string; titulo: string; conteudo: string; fixado: boolean; criadoEm: string }[];
}
