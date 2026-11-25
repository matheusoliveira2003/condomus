/**
 * Qual conversa do chat o usuário está lendo agora (a unidade dela), ou null. A `Conversa` preenche enquanto está na tela;
 * o tratador de notificações consulta para não mostrar o banner de uma mensagem que já está à vista.
 */
let emFoco: string | null = null;

export function definirConversaEmFoco(unidadeId: string | null) {
  emFoco = unidadeId;
}

/** Notificações do chat trazem `{ aba: "Chat", unidadeId }`. Verdadeiro quando é da conversa que está aberta. */
export function notificacaoDaConversaEmFoco(dados: Record<string, unknown> | undefined): boolean {
  return emFoco !== null && dados?.aba === "Chat" && dados.unidadeId === emFoco;
}
