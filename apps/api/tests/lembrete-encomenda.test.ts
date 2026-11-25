import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { type Cenario, chamar, criarApp, criarCenario, limparBanco, prisma } from "./ajuda.js";
import {
  DIAS_ATE_LEMBRAR,
  MAX_LEMBRETES,
  PREFIXO_LEMBRETE,
  lembrarEncomendasParadas,
  textoDoLembrete,
} from "../src/modules/encomendas/lembretes.js";

const DIA = 24 * 60 * 60 * 1000;
const T0 = new Date("2026-12-01T12:00:00Z");
const depois = (dias: number) => new Date(T0.getTime() + dias * DIA);

let app: FastifyInstance;
let c: Cenario;
type Push = { to: string; title: string; body: string; data: Record<string, unknown> };
let pushes: Push[];

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
  pushes = [];
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init: { body: string }) => {
    const lote = JSON.parse(init.body) as Push[];
    pushes.push(...lote);
    return new Response(JSON.stringify({ data: lote.map(() => ({ status: "ok" })) }), { status: 200, headers: { "content-type": "application/json" } });
  }));
  await prisma.dispositivoPush.create({ data: { token: "ExponentPushToken[morador]", usuarioId: c.usuarios.morador.id } });
});
afterEach(() => vi.unstubAllGlobals());

/** Encomenda registrada pelo porteiro, com a chegada em T0. */
const encomenda = (descricao: string, extra: Record<string, unknown> = {}, unidadeId = c.unidades.a101.id) =>
  prisma.encomenda.create({ data: { descricao, unidadeId, recebidaPorId: c.usuarios.porteiro.id, recebidaEm: T0, ...extra } });
const mensagens = (unidadeId = c.unidades.a101.id) => prisma.mensagemChat.findMany({ where: { unidadeId }, orderBy: { criadaEm: "asc" } });
const esperarPush = () => new Promise((r) => setTimeout(r, 50));

describe("lembrete automático de encomenda parada", () => {
  it("antes de 3 dias não envia nada; com 3 dias envia uma mensagem da portaria, em nome de quem registrou", async () => {
    await encomenda("Caixa Amazon");
    expect(await lembrarEncomendasParadas(depois(DIAS_ATE_LEMBRAR - 0.1))).toBe(0);
    expect(await mensagens()).toHaveLength(0);

    expect(await lembrarEncomendasParadas(depois(DIAS_ATE_LEMBRAR))).toBe(1);
    const [msg] = await mensagens();
    expect(msg).toMatchObject({ lado: "PORTARIA", autorId: c.usuarios.porteiro.id });
    expect(msg.texto).toContain(PREFIXO_LEMBRETE);
    expect(msg.texto).toContain("Caixa Amazon (há 3 dias)");
  });

  it("não duplica na mesma hora, repete a cada 3 dias e para depois de 3 lembretes", async () => {
    const e = await encomenda("Caixa");
    expect(await lembrarEncomendasParadas(depois(3))).toBe(1);
    expect(await lembrarEncomendasParadas(depois(3.1))).toBe(0);
    expect(await lembrarEncomendasParadas(depois(5.9))).toBe(0);
    expect(await lembrarEncomendasParadas(depois(6))).toBe(1);
    expect(await lembrarEncomendasParadas(depois(9))).toBe(1);
    // Já recebeu os 3: não envia mais, por mais tempo que passe.
    expect(await lembrarEncomendasParadas(depois(12))).toBe(0);
    expect(await lembrarEncomendasParadas(depois(60))).toBe(0);
    expect(await mensagens()).toHaveLength(MAX_LEMBRETES);
    expect(await prisma.encomenda.findUniqueOrThrow({ where: { id: e.id } })).toMatchObject({ lembretesEnviados: MAX_LEMBRETES });
  });

  it("encomenda retirada não gera lembrete, e a retirada para os seguintes", async () => {
    const e = await encomenda("Caixa");
    await prisma.encomenda.update({ where: { id: e.id }, data: { status: "RETIRADA", retiradaEm: depois(1), retiradaPor: "Morador" } });
    expect(await lembrarEncomendasParadas(depois(10))).toBe(0);

    const outra = await encomenda("Envelope");
    expect(await lembrarEncomendasParadas(depois(3))).toBe(1);
    await prisma.encomenda.update({ where: { id: outra.id }, data: { status: "RETIRADA", retiradaEm: depois(4), retiradaPor: "Morador" } });
    expect(await lembrarEncomendasParadas(depois(6))).toBe(0);
  });

  it("junta as encomendas da mesma unidade numa mensagem só, e separa por unidade", async () => {
    await encomenda("Caixa Amazon");
    await encomenda("Envelope", { recebidaEm: new Date(T0.getTime() + DIA) });
    await encomenda("Pacote do vizinho", {}, c.unidades.b201.id);
    expect(await lembrarEncomendasParadas(depois(5))).toBe(2);

    const a101 = await mensagens();
    expect(a101).toHaveLength(1);
    expect(a101[0].texto).toContain("2 encomendas aguardando retirada");
    expect(a101[0].texto).toContain("Caixa Amazon (há 5 dias)");
    expect(a101[0].texto).toContain("Envelope (há 4 dias)");
    const b201 = await mensagens(c.unidades.b201.id);
    expect(b201).toHaveLength(1);
    expect(b201[0].texto).toContain("1 encomenda aguardando retirada");
  });

  it("avisa por push os moradores da unidade, com o chat como destino", async () => {
    await encomenda("Caixa Amazon");
    await lembrarEncomendasParadas(depois(3));
    // O push sai em segundo plano: espera a mensagem aparecer, em vez de um tempo fixo (que falha em máquinas mais lentas).
    await vi.waitFor(() => expect(pushes).toHaveLength(1), { timeout: 5000 });
    expect(pushes[0]).toMatchObject({ to: "ExponentPushToken[morador]", body: "Caixa Amazon", data: { aba: "Chat" } });
  });

  it("o morador vê o lembrete na conversa e ele conta como não lido", async () => {
    await encomenda("Caixa Amazon");
    await lembrarEncomendasParadas(depois(3));
    const conversa = await chamar(app, "GET", "/chat/mensagens", { token: c.tokens.morador });
    expect(conversa.corpo.itens).toHaveLength(1);
    expect(conversa.corpo.itens[0]).toMatchObject({ lado: "PORTARIA", autor: { nome: "Porteiro" } });
    const contadores = await chamar(app, "GET", `/contadores?inicioDoDia=${new Date().toISOString()}`, { token: c.tokens.morador });
    expect(contadores.corpo.chatNaoLidas).toBe(1);
  });

  it("duas execuções ao mesmo tempo enviam um lembrete só", async () => {
    await encomenda("Caixa");
    const resultados = await Promise.all([lembrarEncomendasParadas(depois(3)), lembrarEncomendasParadas(depois(3))]);
    expect(resultados.reduce((a, b) => a + b, 0)).toBe(1);
    expect(await mensagens()).toHaveLength(1);
  });

  it("unidade sem moradores grava a mensagem sem erro", async () => {
    const vazia = await prisma.unidade.create({ data: { bloco: "C", numero: "301", condominioId: c.condominio.id } });
    await encomenda("Caixa", {}, vazia.id);
    expect(await lembrarEncomendasParadas(depois(3))).toBe(1);
    expect(await mensagens(vazia.id)).toHaveLength(1);
  });

  it("o texto concorda no singular e no plural", () => {
    expect(textoDoLembrete([{ descricao: "Caixa", recebidaEm: T0 }], depois(1))).toContain("1 encomenda aguardando retirada");
    expect(textoDoLembrete([{ descricao: "Caixa", recebidaEm: T0 }], depois(1))).toContain("(há 1 dia)");
    expect(textoDoLembrete([{ descricao: "Caixa", recebidaEm: T0 }, { descricao: "Pacote", recebidaEm: T0 }], depois(4))).toContain("2 encomendas aguardando retirada");
  });
});
