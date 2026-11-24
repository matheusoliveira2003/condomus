/** Formas das respostas do painel. Espelham os campos que a API devolve. */

export type PlanoStatus = "TRIAL" | "ATIVO" | "EXPIRADO" | "SUSPENSO";
export type Papel = "MORADOR" | "PORTEIRO" | "SINDICO";

export interface Situacao {
  status: PlanoStatus;
  diasParaExpirar: number | null;
  emCarencia: boolean;
  diasDeCarencia: number | null;
}

export interface Condominio {
  id: string;
  nome: string;
  cnpj: string | null;
  endereco: string | null;
  planoStatus: PlanoStatus;
  planoExpiraEm: string | null;
  criadoEm: string;
  situacao: Situacao;
  _count: { unidades: number; usuarios: number; areas?: number };
}

export interface Unidade {
  id: string;
  bloco: string;
  numero: string;
  _count?: { moradores: number };
}

export interface Usuario {
  id: string;
  nome: string;
  email: string;
  papel: Papel;
  ativo: boolean;
  senhaTemporaria: boolean;
  unidade: Unidade | null;
}

export interface Area {
  id: string;
  nome: string;
  descricao: string | null;
  capacidade: number | null;
  ativa: boolean;
}

export const rotuloPapel: Record<Papel, string> = { MORADOR: "Morador", PORTEIRO: "Porteiro", SINDICO: "Síndico" };
export const rotuloPlano: Record<PlanoStatus, string> = { TRIAL: "Teste", ATIVO: "Ativo", EXPIRADO: "Expirado", SUSPENSO: "Suspenso" };
export const unidadeTexto = (u: { bloco: string; numero: string } | null) => (u ? `Bloco ${u.bloco} · ${u.numero}` : "Sem unidade");
