import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { type Cenario, chamar, criarApp, criarCenario, limparBanco, prisma } from "./ajuda.js";

let app: FastifyInstance;
let c: Cenario;

// Nada sai para o servidor do Expo: o fetch é substituído e as mensagens ficam registradas aqui.
type Mensagem = { to: string; title: string; body: string; data: Record<string, unknown> };
let enviadas: Mensagem[];
let tokensInvalidos: Set<string>;

beforeAll(async () => {
  app = await criarApp();
});
afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await limparBanco();
  c = await criarCenario(app);
  enviadas = [];
  tokensInvalidos = new Set();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: { body: string }) => {
      const lote = JSON.parse(init.body) as Mensagem[];
      enviadas.push(...lote);
      const data = lote.map((m) =>
        tokensInvalidos.has(m.to) ? { status: "error", details: { error: "DeviceNotRegistered" } } : { status: "ok", id: "x" },
      );
      return new Response(JSON.stringify({ data }), { status: 200, headers: { "content-type": "application/json" } });
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const TOKEN_MORADOR = "ExponentPushToken[morador]";
const TOKEN_VIZINHO = "ExponentPushToken[vizinho]";
const TOKEN_SINDICO = "ExponentPushToken[sindico]";

async function registrarCelulares() {
  await chamar(app, "PUT", "/dispositivos", { token: c.tokens.morador, corpo: { token: TOKEN_MORADOR } });
  await chamar(app, "PUT", "/dispositivos", { token: c.tokens.vizinho, corpo: { token: TOKEN_VIZINHO } });
  await chamar(app, "PUT", "/dispositivos", { token: c.tokens.sindico, corpo: { token: TOKEN_SINDICO } });
}

/** O envio acontece em segundo plano (a resposta não espera); aguarda até ele terminar. */
const aguardarEnvio = (quantidade: number) => vi.waitFor(() => expect(enviadas.length).toBeGreaterThanOrEqual(quantidade));

describe("notificações push", () => {
  it("encomenda avisa só os moradores da unidade, com a aba a abrir", async () => {
    await registrarCelulares();
    await chamar(app, "POST", "/encomendas", { token: c.tokens.porteiro, corpo: { unidadeId: c.unidades.a101.id, descricao: "Caixa", remetente: "Correios" } });
    await aguardarEnvio(1);
    expect(enviadas).toEqual([expect.objectContaining({ to: TOKEN_MORADOR, body: "Caixa (Correios)", data: { aba: "Encomendas" } })]);
  });

  it("aviso vai para todos, menos para quem publicou", async () => {
    await registrarCelulares();
    await chamar(app, "POST", "/avisos", { token: c.tokens.sindico, corpo: { titulo: "Reunião", conteudo: "Sábado" } });
    await aguardarEnvio(2);
    expect(enviadas.map((m) => m.to).sort()).toEqual([TOKEN_MORADOR, TOKEN_VIZINHO].sort());
  });

  it("pedido de reserva avisa o síndico", async () => {
    await registrarCelulares();
    const inicio = new Date(Date.now() + 86400000).toISOString();
    const fim = new Date(Date.now() + 90000000).toISOString();
    await chamar(app, "POST", "/reservas", { token: c.tokens.morador, corpo: { areaId: c.area.id, inicio, fim } });
    await aguardarEnvio(1);
    expect(enviadas[0]).toMatchObject({ to: TOKEN_SINDICO, data: { aba: "Reservas" } });
  });

  it("celular que deixou de existir é removido automaticamente", async () => {
    await registrarCelulares();
    tokensInvalidos.add(TOKEN_MORADOR);
    await chamar(app, "POST", "/encomendas", { token: c.tokens.porteiro, corpo: { unidadeId: c.unidades.a101.id, descricao: "Caixa" } });
    await vi.waitFor(async () => expect(await prisma.dispositivoPush.count({ where: { token: TOKEN_MORADOR } })).toBe(0));
  });

  it("sair da conta desvincula o celular; o mesmo celular passa para quem entrar depois", async () => {
    await chamar(app, "PUT", "/dispositivos", { token: c.tokens.morador, corpo: { token: TOKEN_MORADOR } });
    await chamar(app, "PUT", "/dispositivos", { token: c.tokens.vizinho, corpo: { token: TOKEN_MORADOR } });
    expect((await prisma.dispositivoPush.findUnique({ where: { token: TOKEN_MORADOR } }))?.usuarioId).toBe(c.usuarios.vizinho.id);

    await chamar(app, "DELETE", `/dispositivos/${encodeURIComponent(TOKEN_MORADOR)}`, { token: c.tokens.vizinho });
    expect(await prisma.dispositivoPush.count()).toBe(0);
  });

  it("recusa tokens que não são do Expo", async () => {
    expect((await chamar(app, "PUT", "/dispositivos", { token: c.tokens.morador, corpo: { token: "qualquer-coisa" } })).status).toBe(400);
  });
});
