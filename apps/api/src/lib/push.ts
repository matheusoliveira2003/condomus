import type { Papel } from "@prisma/client";
import { prisma } from "./prisma.js";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
/** Limite de mensagens por requisição da API de push do Expo. */
const LOTE = 100;

interface Mensagem {
  titulo: string;
  corpo: string;
  /** Dados repassados ao app ao tocar na notificação (ex.: qual aba abrir). */
  dados?: Record<string, unknown>;
}

interface Ticket {
  status: "ok" | "error";
  message?: string;
  details?: { error?: string };
}

/**
 * Envia uma notificação para todos os celulares registrados dos usuários informados.
 * Falhas são apenas registradas no log: a notificação nunca deve impedir a operação
 * que a originou (ex.: registrar uma encomenda).
 */
export async function enviarPush(usuarioIds: string[], { titulo, corpo, dados }: Mensagem) {
  try {
    const dispositivos = await prisma.dispositivoPush.findMany({
      where: { usuarioId: { in: usuarioIds }, usuario: { ativo: true } },
      select: { token: true },
    });
    const tokens = dispositivos.map((d) => d.token);

    for (let i = 0; i < tokens.length; i += LOTE) {
      const lote = tokens.slice(i, i + LOTE);
      const resposta = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: { accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify(
          lote.map((to) => ({ to, title: titulo, body: corpo, data: dados, sound: "default", channelId: "padrao" })),
        ),
      });
      if (!resposta.ok) {
        console.error(`[push] Expo respondeu ${resposta.status}: ${await resposta.text()}`);
        continue;
      }

      // Os tickets vêm na mesma ordem dos tokens enviados.
      const { data: tickets } = (await resposta.json()) as { data: Ticket[] };
      const invalidos = lote.filter((_, j) => tickets[j]?.details?.error === "DeviceNotRegistered");
      if (invalidos.length) await prisma.dispositivoPush.deleteMany({ where: { token: { in: invalidos } } });
      tickets
        .filter((t) => t.status === "error" && t.details?.error !== "DeviceNotRegistered")
        .forEach((t) => console.error(`[push] ${t.message}`));
    }
  } catch (erro) {
    console.error("[push] Falha ao enviar notificação", erro);
  }
}

/** Envia uma notificação para todos os moradores de uma unidade. Não espera o envio. */
export function notificarUnidade(unidadeId: string, mensagem: Mensagem) {
  void prisma.usuario
    .findMany({ where: { unidadeId, papel: "MORADOR" }, select: { id: true } })
    .then((moradores) => enviarPush(moradores.map((m) => m.id), mensagem))
    .catch((erro) => console.error("[push] Falha ao buscar moradores da unidade", erro));
}

/** Envia uma notificação para todos os usuários ativos de um perfil (ex.: síndicos). */
export function notificarPapel(papel: Papel, mensagem: Mensagem) {
  void prisma.usuario
    .findMany({ where: { papel, ativo: true }, select: { id: true } })
    .then((usuarios) => enviarPush(usuarios.map((u) => u.id), mensagem))
    .catch((erro) => console.error(`[push] Falha ao buscar usuários do perfil ${papel}`, erro));
}
