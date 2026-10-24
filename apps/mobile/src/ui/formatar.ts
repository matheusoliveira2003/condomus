import type { Unidade } from "../api/client";

export const unidadeTexto = (u: Unidade | null | undefined) =>
  u ? `Bloco ${u.bloco} · ${u.numero}` : "";

export const dataHora = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export const data = (iso: string | Date) =>
  new Date(iso).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });

export const hora = (iso: string | Date) =>
  new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
