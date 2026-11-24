/**
 * Hooks de dados usando TanStack Query.
 *
 * Cada hook encapsula a query key, a função de busca e as opções relevantes.
 * Mutações que alteram dados chamam queryClient.invalidateQueries para
 * garantir que as listas fiquem sincronizadas sem refetch manual.
 */
import { useQueryClient, useQuery, useMutation, useInfiniteQuery } from "@tanstack/react-query";
import type { Aviso, AreaComum, Condominio, ConviteInfo, Contadores, Encomenda, Pagina, Reserva, Resumo, RostoPorDocumento, RostoVisitante, Unidade, Usuario, VerificacaoEntrada, Visita, VisitanteFrequente } from "@condomus/types";
import { api, enviar } from "../api/client";

// ---------------------------------------------------------------------------
// Query keys — centralizados para invalidação consistente
// ---------------------------------------------------------------------------
export const keys = {
  perfil: ["perfil"] as const,
  resumo: ["resumo"] as const,
  contadores: ["contadores"] as const,
  visitas: (filtro: string) => ["visitas", filtro] as const,
  encomendas: (status: string) => ["encomendas", status] as const,
  avisos: ["avisos"] as const,
  reservas: (filtro: string) => ["reservas", filtro] as const,
  reservasMinhas: ["reservas", "minhas"] as const,
  areas: ["areas"] as const,
  condominio: ["condominio"] as const,
  rosto: (visitaId: string) => ["rosto", visitaId] as const,
  /** Rosto pelo documento (portaria): o documento vai no corpo, mas a chave do cache precisa dele. */
  rostoPorDocumento: (documento: string) => ["rosto", "documento", documento] as const,
  visitantes: ["visitantes"] as const,
};

// ---------------------------------------------------------------------------
// Perfil do usuário autenticado (/auth/me)
// ---------------------------------------------------------------------------
export interface Perfil {
  nome: string;
  email: string;
  papel: Usuario["papel"];
  unidade: Unidade | null;
}

export function usePerfil(habilitado = true) {
  return useQuery({
    queryKey: keys.perfil,
    queryFn: () => api<Perfil>("/auth/me"),
    enabled: habilitado,
  });
}

// ---------------------------------------------------------------------------
// Condomínio (plano) e cadastro por convite
// ---------------------------------------------------------------------------
export function useCondominio(habilitado = true) {
  return useQuery({
    queryKey: keys.condominio,
    queryFn: () => api<Condominio>("/condominios/meu"),
    enabled: habilitado,
  });
}

/** Valida o código de convite (público); só consulta quando o código tem os 8 caracteres. */
export function useConvite(codigo: string) {
  return useQuery({
    queryKey: ["convite", codigo],
    queryFn: () => api<ConviteInfo>(`/convite/${codigo}`),
    enabled: codigo.length === 8,
    retry: false,
  });
}

/** Cria a conta do morador a partir do convite; a API devolve a mesma resposta do login. */
export function useCadastro() {
  return useMutation({
    mutationFn: (dados: { codigo: string; nome: string; email: string; senha: string }) =>
      enviar<{ token: string; usuario: Usuario }>("POST", "/cadastro", dados),
  });
}

// ---------------------------------------------------------------------------
// Início (resumo do morador)
// ---------------------------------------------------------------------------
export function useResumo() {
  return useQuery({
    queryKey: keys.resumo,
    queryFn: () => {
      const inicioDoDia = new Date();
      inicioDoDia.setHours(0, 0, 0, 0);
      return api<Resumo>(`/resumo?inicioDoDia=${inicioDoDia.toISOString()}`);
    },
  });
}

// ---------------------------------------------------------------------------
// Contadores (emblemas das abas)
// ---------------------------------------------------------------------------
/** Números que pedem ação de quem está logado; `habilitado` evita a chamada antes do login. */
export function useContadores(habilitado = true) {
  return useQuery({
    queryKey: keys.contadores,
    enabled: habilitado,
    // Atualiza sozinho: a portaria deixa o app aberto e novas visitas chegam de fora.
    refetchInterval: 60_000,
    queryFn: () => {
      const inicioDoDia = new Date();
      inicioDoDia.setHours(0, 0, 0, 0);
      return api<Contadores>(`/contadores?inicioDoDia=${inicioDoDia.toISOString()}`);
    },
  });
}

// ---------------------------------------------------------------------------
// Listas paginadas
// ---------------------------------------------------------------------------
/**
 * Lista que a API entrega em páginas (`{ itens, proximoCursor }`). Busca a primeira página e, a
 * pedido da tela (`carregarMais`), as seguintes, juntando tudo em `data`. Antes o app lia só a
 * primeira página, e o que passava dela (visitas e encomendas antigas) ficava inalcançável.
 */
function usePaginada<T>(chave: readonly unknown[], caminho: string) {
  const separador = caminho.includes("?") ? "&" : "?";
  return useInfiniteQuery({
    queryKey: chave,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      api<Pagina<T>>(pageParam ? `${caminho}${separador}cursor=${pageParam}` : caminho),
    getNextPageParam: (ultima) => ultima.proximoCursor,
    select: (resultado) => resultado.pages.flatMap((pagina) => pagina.itens),
  });
}

// ---------------------------------------------------------------------------
// Visitas
// ---------------------------------------------------------------------------
export function useVisitas(filtro: string) {
  return usePaginada<Visita>(keys.visitas(filtro), `/visitas?${filtro}`);
}

export function useCriarVisita() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dados: { nomeVisitante: string; documento: string; placaVeiculo?: string; dataPrevista?: string }) =>
      enviar<Visita>("POST", "/visitas", dados),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["visitas"] });
      // Quem foi autorizado entra (ou volta) na lista de visitantes frequentes.
      qc.invalidateQueries({ queryKey: keys.visitantes });
    },
  });
}

/** Visitantes que a unidade autorizou nos últimos 90 dias (só o morador). */
export function useVisitantes(habilitado = true) {
  return useQuery({
    queryKey: keys.visitantes,
    queryFn: () => api<VisitanteFrequente[]>("/visitantes"),
    enabled: habilitado,
  });
}

/** Tira o visitante da lista da unidade; não apaga o histórico. */
export function useOcultarVisitante() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (documento: string) => enviar("POST", "/visitantes/ocultar", { documento }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.visitantes }),
  });
}

/**
 * Se o visitante tem rosto cadastrado e válido, para a portaria oferecer a entrada pelo rosto.
 * Só consulta quando há documento e quem chama habilita (o porteiro, nas visitas com convite).
 */
export function useTemRosto(documento: string | null, habilitado: boolean) {
  const doc = documento?.trim() ?? "";
  return useQuery({
    queryKey: keys.rostoPorDocumento(doc),
    queryFn: () => consultarRostoPorDocumento(doc),
    enabled: habilitado && doc.length >= 5,
    // O rosto pode vencer ou ser apagado: não guarda por muito tempo.
    staleTime: 30_000,
  });
}

export function useCancelarVisita() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => enviar("PATCH", `/visitas/${id}/cancelar`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["visitas"] }),
  });
}

export function useRegistrarEntradaSaida() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, acao, codigo, verificacao }: { id: string; acao: "entrada" | "saida"; codigo?: string; verificacao?: VerificacaoEntrada }) =>
      enviar("PATCH", `/visitas/${id}/${acao}`, codigo || verificacao ? { codigo, verificacao } : undefined),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["visitas"] }),
  });
}

// ---------------------------------------------------------------------------
// Rosto de referência do visitante (só a portaria)
// ---------------------------------------------------------------------------
export function useRostoVisitante(visitaId: string | null) {
  return useQuery({
    queryKey: keys.rosto(visitaId ?? ""),
    queryFn: () => api<RostoVisitante>(`/visitas/${visitaId}/rosto`),
    enabled: !!visitaId,
    // O rosto pode vencer ou ser apagado a qualquer momento: sempre consulta de novo ao abrir.
    staleTime: 0,
    gcTime: 0,
  });
}

/** Consulta pelo documento, para saber se o visitante já tem rosto antes de a visita existir. */
export function consultarRostoPorDocumento(documento: string) {
  return enviar<RostoPorDocumento>("POST", "/rostos/consulta", { documento });
}

export function useCadastrarRosto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ visitaId, imagem, termoVersao }: { visitaId: string; imagem: string; termoVersao: string }) =>
      enviar("PUT", `/visitas/${visitaId}/rosto`, { imagem, consentimento: true, termoVersao }, 30000),
    onSuccess: (_r, { visitaId }) => qc.invalidateQueries({ queryKey: keys.rosto(visitaId) }),
  });
}

export function useApagarRosto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (visitaId: string) => enviar("DELETE", `/visitas/${visitaId}/rosto`),
    onSuccess: (_r, visitaId) => qc.invalidateQueries({ queryKey: keys.rosto(visitaId) }),
  });
}

export function useEntradaDireta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dados: { unidadeId: string; nomeVisitante: string; documento: string; placaVeiculo?: string; verificacao?: VerificacaoEntrada }) =>
      enviar<Visita>("POST", "/visitas/entrada-direta", dados),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["visitas"] }),
  });
}

// ---------------------------------------------------------------------------
// Encomendas
// ---------------------------------------------------------------------------
export function useEncomendas(status: string) {
  return usePaginada<Encomenda>(keys.encomendas(status), `/encomendas?status=${status}`);
}

export function useRegistrarEncomenda() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dados: { unidadeId: string; descricao: string; remetente?: string }) =>
      enviar<Encomenda>("POST", "/encomendas", dados),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["encomendas"] }),
  });
}

export function useRegistrarRetirada() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, retiradaPor }: { id: string; retiradaPor: string }) =>
      enviar("PATCH", `/encomendas/${id}/retirada`, { retiradaPor }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["encomendas"] }),
  });
}

// ---------------------------------------------------------------------------
// Avisos
// ---------------------------------------------------------------------------
export function useAvisos() {
  return usePaginada<Aviso>(keys.avisos, "/avisos");
}

export function useCriarAviso() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dados: { titulo: string; conteudo: string; fixado?: boolean }) =>
      enviar<Aviso>("POST", "/avisos", dados),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.avisos });
      qc.invalidateQueries({ queryKey: keys.resumo });
    },
  });
}

export function useEditarAviso() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...dados }: { id: string; titulo?: string; conteudo?: string; fixado?: boolean }) =>
      enviar<Aviso>("PATCH", `/avisos/${id}`, dados),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.avisos }),
  });
}

export function useRemoverAviso() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => enviar("DELETE", `/avisos/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.avisos });
      qc.invalidateQueries({ queryKey: keys.resumo });
    },
  });
}

// ---------------------------------------------------------------------------
// Reservas
// ---------------------------------------------------------------------------
export function useReservasMinhas() {
  return useQuery({
    queryKey: keys.reservasMinhas,
    queryFn: () => api<Reserva[]>("/reservas/minhas"),
  });
}

export function useReservas(filtro: string) {
  return useQuery({
    queryKey: keys.reservas(filtro),
    queryFn: () => api<Reserva[]>(`/reservas?${filtro}`),
  });
}

export function useAreas() {
  return useQuery({
    queryKey: keys.areas,
    queryFn: () => api<AreaComum[]>("/areas"),
    // Áreas raramente mudam — cache de 5 minutos.
    staleTime: 5 * 60_000,
  });
}

export function useCriarReserva() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dados: { areaId: string; inicio: string; fim: string }) =>
      enviar<Reserva>("POST", "/reservas", dados),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reservas"] });
      qc.invalidateQueries({ queryKey: keys.resumo });
    },
  });
}

export function useCancelarReserva() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => enviar("PATCH", `/reservas/${id}/cancelar`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reservas"] });
      qc.invalidateQueries({ queryKey: keys.resumo });
    },
  });
}

export function useAprovarReserva() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => enviar("PATCH", `/reservas/${id}/aprovar`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reservas"] }),
  });
}

export function useRecusarReserva() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, motivo }: { id: string; motivo?: string }) =>
      enviar("PATCH", `/reservas/${id}/recusar`, { motivo }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reservas"] }),
  });
}

// ---------------------------------------------------------------------------
// Helpers para uso nas telas — mapeiam para a interface esperada pelo componente Lista
// ---------------------------------------------------------------------------

/** Converte o estado do useQuery para o formato { dados, carregando, erro, recarregar } do componente Lista. */
export function adaptarQuery<T>(query: ReturnType<typeof useQuery<T>>): {
  dados: T;
  carregando: boolean;
  recarregando: boolean;
  erro: string | null;
  recarregar: () => Promise<unknown>;
  carregarMais?: undefined;
  carregandoMais?: undefined;
};
export function adaptarQuery<T>(query: ReturnType<typeof useInfiniteQuery<Pagina<T>, Error, T[]>>): {
  dados: T[];
  carregando: boolean;
  recarregando: boolean;
  erro: string | null;
  recarregar: () => Promise<unknown>;
  /** Pede a próxima página; não faz nada se não há mais ou se já está buscando. */
  carregarMais: () => void;
  carregandoMais: boolean;
};
export function adaptarQuery(query: any) {
  return {
    dados: query.data ?? [],
    // isLoading: só true na primeira busca (sem dados). Evita spinner infinito em refetches.
    carregando: query.isLoading,
    // recarregando: true em qualquer fetch ativo, para o pull-to-refresh girar. Buscar a página
    // seguinte não conta: é o rodapé da lista que mostra isso.
    recarregando: query.isFetching && !query.isFetchingNextPage,
    erro: query.error ? (query.error as Error).message : null,
    recarregar: query.refetch as () => Promise<unknown>,
    ...("fetchNextPage" in query && {
      carregarMais: () => {
        if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
      },
      carregandoMais: query.isFetchingNextPage as boolean,
    }),
  };
}
