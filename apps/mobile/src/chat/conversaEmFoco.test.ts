import { afterEach, describe, expect, it } from "vitest";
import { definirConversaEmFoco, notificacaoDaConversaEmFoco } from "./conversaEmFoco";

afterEach(() => definirConversaEmFoco(null));

describe("notificacaoDaConversaEmFoco", () => {
  it("sem conversa aberta, nenhuma notificação é suprimida", () => {
    expect(notificacaoDaConversaEmFoco({ aba: "Chat", unidadeId: "u1" })).toBe(false);
  });

  it("suprime só a notificação do chat da conversa que está aberta", () => {
    definirConversaEmFoco("u1");
    expect(notificacaoDaConversaEmFoco({ aba: "Chat", unidadeId: "u1" })).toBe(true);
    expect(notificacaoDaConversaEmFoco({ aba: "Chat", unidadeId: "u2" })).toBe(false);
    expect(notificacaoDaConversaEmFoco({ aba: "Encomendas", unidadeId: "u1" })).toBe(false);
    expect(notificacaoDaConversaEmFoco(undefined)).toBe(false);
  });
});
