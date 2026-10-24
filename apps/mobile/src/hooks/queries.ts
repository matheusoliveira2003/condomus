/**
 * Hooks de dados usando TanStack Query.
 *
 * Cada hook encapsula a query key, a função de busca e as opções relevantes.
 * Mutações que alteram dados chamam queryClient.invalidateQueries para
 * garantir que as listas fiquem sincronizadas sem refetch manual.
 */
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import type { Aviso, AreaComum, Condominio, ConviteInfo, Encomenda, Pagina, Reserva, Resumo, Usuario, Visita } from "@condomus/types";
import { api, enviar } from "../api/client";

// ---------------------------------------------------------------------------
// Query keys — centralizados para invalidação consistente
// ---------------------------------------------------------------------------
export const keys = {
  resumo: ["resumo"] as const,
  visitas: (filtro: string) => ["visitas", filtro] as const,
  encomendas: (status: string) => ["encomendas", status] as const,
  avisos: ["avisos"] as const,
  reservas: (filtro: string) => ["reservas", filtro] as const,
  reservasMinhas: ["reservas", "minhas"] as const,
  areas: ["areas"] as const,
  condominio: ["condominio"] as const,
};

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
// Visitas
// ---------------------------------------------------------------------------
export function useVisitas(filtro: string) {
  return useQuery({
    queryKey: keys.visitas(filtro),
    queryFn: () => api<Pagina<Visita>>(`/visitas?${filtro}`).then((p) => p.itens),
  });
}

export function useCriarVisita() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dados: { nomeVisitante: string; documento?: string; placaVeiculo?: string; dataPrevista?: string }) =>
      enviar<Visita>("POST", "/visitas", dados),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["visitas"] }),
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
    mutationFn: ({ id, acao, codigo }: { id: string; acao: "entrada" | "saida"; codigo?: string }) =>
      enviar("PATCH", `/visitas/${id}/${acao}`, codigo ? { codigo } : undefined),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["visitas"] }),
  });
}

export function useEntradaDireta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dados: { unidadeId: string; nomeVisitante: string; documento?: string; placaVeiculo?: string }) =>
      enviar<Visita>("POST", "/visitas/entrada-direta", dados),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["visitas"] }),
  });
}

// ---------------------------------------------------------------------------
// Encomendas
// ---------------------------------------------------------------------------
export function useEncomendas(status: string) {
  return useQuery({
    queryKey: keys.encomendas(status),
    queryFn: () => api<Pagina<Encomenda>>(`/encomendas?status=${status}`).then((p) => p.itens),
  });
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
  return useQuery({
    queryKey: keys.avisos,
    queryFn: () => api<Pagina<Aviso>>("/avisos").then((p) => p.itens),
  });
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
export function adaptarQuery<T>(query: ReturnType<typeof useQuery<T>>) {
  return {
    dados: query.data ?? ([] as unknown as T),
    carregando: query.isFetching,
    erro: query.error ? (query.error as Error).message : null,
    recarregar: query.refetch as () => Promise<unknown>,
  };
}
