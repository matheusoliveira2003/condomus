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
  /** true quando a senha foi gerada automaticamente; o app exige troca antes de continuar. */
  senhaTemporaria?: boolean;
}

export interface UsuarioCadastro extends Pessoa {
  email: string;
  papel: Papel;
  ativo: boolean;
  unidade: Unidade | null;
  senhaTemporaria: boolean;
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
  /** Entrou há mais de 24 h e a saída não foi registrada: a portaria precisa conferir. */
  semSaida?: boolean;
}

/** Rosto de referência do visitante (só a portaria vê). Vale enquanto ele continuar vindo. */
export type RostoVisitante =
  | { cadastrado: false }
  | { cadastrado: true; consentimentoEm: string; ultimaVisitaEm: string; expiraEm: string; limiar: number };

/** Consulta pelo documento (entrada direta, antes de a visita existir). */
export type RostoPorDocumento = { cadastrado: false } | { cadastrado: true; limiar: number };

/** Como a portaria verificou um visitante com rosto cadastrado; enviado junto do registro da entrada. */
export type VerificacaoEntrada =
  | { tipo: "RECONHECIMENTO"; semelhanca: number }
  | { tipo: "MANUAL"; motivo: string; semelhanca?: number };

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
  /** Os campos abaixo vêm da API mais nova; ficam opcionais para o app não quebrar contra uma API antiga. */
  diasParaExpirar?: number | null;
  /** O teste passou da data, mas ainda está na carência: tudo funciona e o síndico vê o aviso. */
  emCarencia?: boolean;
  diasDeCarencia?: number | null;
  /** Mostrar o aviso de vencimento do teste (faltam 7 dias ou menos, ou em carência). */
  avisarVencimento?: boolean;
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

/** Números do emblema das abas (GET /contadores); zero onde não se aplica ao perfil. */
export interface Contadores {
  /** Morador: encomendas aguardando retirada. */
  encomendas: number;
  /** Portaria e síndico: visitantes esperados hoje ou sem data. */
  visitasEsperadas: number;
  /** Síndico: reservas pendentes de aprovação. */
  reservasPendentes: number;
}

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
