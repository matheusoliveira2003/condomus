import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { type Cenario, chamar, criarApp, criarCenario, entrar, limparBanco, prisma } from "./ajuda.js";
import { DIAS_RETENCAO_CHAT, limparMensagensAntigas } from "../src/modules/chat/regras.js";
import { apagarMensagensDoSindico, contarMensagensDoSindico } from "../src/modules/chat/limpezaSindico.js";
import { PREFIXO_LEMBRETE } from "../src/modules/encomendas/lembretes.js";

// Storage simulado: fotos do chat em memória, pela chave unidade/mensagem.
const fotos = new Map<string, Buffer>();
const chave = (u: string, m: string) => `${u}/${m}`;
vi.mock("../src/lib/storage.js", () => ({
  uploadFotoChat: vi.fn(async (u: string, m: string, b: Buffer) => { fotos.set(chave(u, m), b); }),
  downloadFotoChat: vi.fn(async (u: string, m: string) => fotos.get(chave(u, m)) ?? null),
  deletarFotoChat: vi.fn(async (u: string, m: string) => { fotos.delete(chave(u, m)); }),
  uploadFoto: vi.fn(), downloadFoto: vi.fn(), deletarFoto: vi.fn(),
  uploadRosto: vi.fn(), downloadRosto: vi.fn(), deletarRosto: vi.fn(),
  StorageNaoConfiguradoError: class StorageNaoConfiguradoError extends Error {},
}));

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]).toString("base64");
const DIA = 24 * 60 * 60 * 1000;

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
  fotos.clear();
  await limparBanco();
  c = await criarCenario(app);
  pushes = [];
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init: { body: string }) => {
    const lote = JSON.parse(init.body) as Push[];
    pushes.push(...lote);
    return new Response(JSON.stringify({ data: lote.map(() => ({ status: "ok" })) }), { status: 200, headers: { "content-type": "application/json" } });
  }));
  // Um celular para cada pessoa do cenário, para o push ter destino.
  for (const [nome, u] of Object.entries(c.usuarios)) {
    await prisma.dispositivoPush.create({ data: { token: `ExponentPushToken[${nome}]`, usuarioId: u.id } });
  }
});
afterEach(() => vi.unstubAllGlobals());

const doMorador = (corpo: Record<string, unknown>, token = c.tokens.morador) => chamar(app, "POST", "/chat/mensagens", { token, corpo });
const daPortaria = (unidadeId: string, corpo: Record<string, unknown>, token = c.tokens.porteiro) =>
  chamar(app, "POST", `/chat/conversas/${unidadeId}/mensagens`, { token, corpo });
const conversaDoMorador = (token = c.tokens.morador, query = "") => chamar(app, "GET", `/chat/mensagens${query}`, { token });
const contadores = (token: string) => chamar(app, "GET", `/contadores?inicioDoDia=${new Date().toISOString()}`, { token });
/** O push sai depois da resposta; espera a fila de push terminar. */
const esperarPush = () => new Promise((r) => setTimeout(r, 50));

describe("chat entre portaria e unidade", () => {
  it("morador e portaria conversam na mesma conversa da unidade, com o lado de cada um", async () => {
    expect((await doMorador({ texto: "Chegou uma encomenda para mim?" })).status).toBe(201);
    expect((await daPortaria(c.unidades.a101.id, { texto: "Sim, está aqui na portaria." })).status).toBe(201);
    const r = await conversaDoMorador();
    expect(r.corpo.itens.map((m: { lado: string; texto: string }) => [m.lado, m.texto])).toEqual([
      ["PORTARIA", "Sim, está aqui na portaria."],
      ["MORADOR", "Chegou uma encomenda para mim?"],
    ]);
    expect(r.corpo.itens[0].autor).toMatchObject({ nome: "Porteiro" });
  });

  it("o síndico não responde como portaria: tem a conversa da própria unidade, como morador", async () => {
    // As rotas da portaria são só do porteiro.
    expect((await daPortaria(c.unidades.a101.id, { texto: "Aviso do síndico" }, c.tokens.sindico)).status).toBe(403);
    expect((await chamar(app, "GET", "/chat/conversas", { token: c.tokens.sindico })).status).toBe(403);
    expect((await chamar(app, "GET", `/chat/conversas/${c.unidades.a101.id}/mensagens`, { token: c.tokens.sindico })).status).toBe(403);
    // Pela conversa da própria unidade (S 100), ele escreve do lado do morador.
    const r = await doMorador({ texto: "Oi, portaria" }, c.tokens.sindico);
    expect(r.status).toBe(201);
    expect(r.corpo.lado).toBe("MORADOR");
    expect((await conversaDoMorador(c.tokens.sindico)).corpo.itens).toHaveLength(1);
    // A conversa do síndico é a dele: o morador da 101 não a vê.
    expect((await conversaDoMorador(c.tokens.morador)).corpo.itens).toHaveLength(0);
  });

  it("todos os moradores da unidade veem a mesma conversa; o vizinho não", async () => {
    const colega = await prisma.usuario.create({
      data: { nome: "Colega A101", email: "colega@teste.dev", papel: "MORADOR", senhaHash: await bcrypt.hash("123456", 4), condominioId: c.condominio.id, unidadeId: c.unidades.a101.id },
    });
    await doMorador({ texto: "Oi portaria" });
    const tokenColega = await entrar(app, colega.email);
    expect((await conversaDoMorador(tokenColega)).corpo.itens).toHaveLength(1);
    expect((await conversaDoMorador(c.tokens.vizinho)).corpo.itens).toHaveLength(0);
  });

  it("a portaria não acessa unidade de outro condomínio; o morador não usa as rotas da portaria", async () => {
    const outro = await prisma.condominio.create({ data: { nome: "Outro", planoStatus: "ATIVO" } });
    const fora = await prisma.unidade.create({ data: { bloco: "Z", numero: "1", condominioId: outro.id } });
    expect((await daPortaria(fora.id, { texto: "x" })).status).toBe(404);
    expect((await chamar(app, "GET", `/chat/conversas/${fora.id}/mensagens`, { token: c.tokens.porteiro })).status).toBe(404);
    expect((await daPortaria(c.unidades.a101.id, { texto: "x" }, c.tokens.morador)).status).toBe(403);
    expect((await chamar(app, "GET", "/chat/conversas", { token: c.tokens.morador })).status).toBe(403);
  });

  it("recusa mensagem vazia, texto longo demais e foto que não é JPEG", async () => {
    expect((await doMorador({})).status).toBe(400);
    expect((await doMorador({ texto: "   " })).status).toBe(400);
    expect((await doMorador({ texto: "a".repeat(1001) })).status).toBe(400);
    expect((await doMorador({ foto: Buffer.from("não é jpeg").toString("base64") })).status).toBe(400);
    expect(await prisma.mensagemChat.count()).toBe(0);
  });

  it("envia foto, e só quem participa da conversa consegue vê-la", async () => {
    const r = await doMorador({ foto: JPEG });
    expect(r.status).toBe(201);
    expect(r.corpo).toMatchObject({ temFoto: true, texto: null });
    const url = `/chat/mensagens/${r.corpo.id}/foto`;
    for (const token of [c.tokens.morador, c.tokens.porteiro]) {
      const foto = await chamar(app, "GET", url, { token });
      expect(foto.status).toBe(200);
      expect(foto.bytes.toString("base64")).toBe(JPEG);
    }
    // Quem não participa da conversa não vê: o vizinho e o síndico (que é morador de outra unidade).
    expect((await chamar(app, "GET", url, { token: c.tokens.vizinho })).status).toBe(403);
    expect((await chamar(app, "GET", url, { token: c.tokens.sindico })).status).toBe(403);
  });

  it("polling com depoisDe traz só as mensagens novas", async () => {
    const primeira = (await doMorador({ texto: "1" })).corpo;
    await daPortaria(c.unidades.a101.id, { texto: "2" });
    await daPortaria(c.unidades.a101.id, { texto: "3" });
    const r = await conversaDoMorador(c.tokens.morador, `?depoisDe=${primeira.id}`);
    expect(r.corpo.itens.map((m: { texto: string }) => m.texto)).toEqual(["3", "2"]);
  });

  it("não lidas: contam só as do outro lado e zeram ao marcar como lida", async () => {
    await doMorador({ texto: "Pergunta" });
    await daPortaria(c.unidades.a101.id, { texto: "Resposta 1" });
    await daPortaria(c.unidades.a101.id, { texto: "Resposta 2" });
    expect((await contadores(c.tokens.morador)).corpo.chatNaoLidas).toBe(2);
    // Quem responde leu o que veio antes: a portaria respondeu, então a pergunta do morador não conta para ela.
    expect((await contadores(c.tokens.porteiro)).corpo.chatNaoLidas).toBe(0);
    expect((await chamar(app, "POST", "/chat/lida", { token: c.tokens.morador })).status).toBe(204);
    expect((await contadores(c.tokens.morador)).corpo.chatNaoLidas).toBe(0);
    // Uma pergunta nova do morador conta para a portaria até ela marcar a conversa como lida.
    await doMorador({ texto: "Outra pergunta" });
    expect((await contadores(c.tokens.porteiro)).corpo.chatNaoLidas).toBe(1);
    expect((await chamar(app, "POST", "/chat/lida", { token: c.tokens.porteiro, corpo: { unidadeId: c.unidades.a101.id } })).status).toBe(204);
    expect((await contadores(c.tokens.porteiro)).corpo.chatNaoLidas).toBe(0);
    // O síndico é outra unidade e não vê nada da conversa da 101.
    expect((await contadores(c.tokens.sindico)).corpo.chatNaoLidas).toBe(0);
  });

  it("a lista de conversas da portaria traz a última mensagem de cada unidade, mais recente primeiro", async () => {
    await doMorador({ texto: "da A101" });
    await doMorador({ texto: "da B201" }, c.tokens.vizinho);
    const r = await chamar(app, "GET", "/chat/conversas", { token: c.tokens.porteiro });
    expect(r.corpo.map((cv: { unidade: { numero: string }; ultima: { texto: string }; naoLidas: number }) => [cv.unidade.numero, cv.ultima.texto, cv.naoLidas])).toEqual([
      ["201", "da B201", 1],
      ["101", "da A101", 1],
    ]);
  });

  it("avisa por push o outro lado: a mensagem do morador vai para o porteiro, a da portaria para a unidade", async () => {
    await doMorador({ texto: "Oi" });
    await esperarPush();
    // Só a portaria recebe: o síndico é um morador de outra unidade e não participa dessa conversa.
    expect(pushes.map((p) => p.to)).toEqual(["ExponentPushToken[porteiro]"]);
    expect(pushes[0]).toMatchObject({ body: "Oi", data: { aba: "Chat" } });

    pushes = [];
    await daPortaria(c.unidades.a101.id, { foto: JPEG });
    await esperarPush();
    expect(pushes.map((p) => p.to)).toEqual(["ExponentPushToken[morador]"]);
    expect(pushes[0].body).toBe("📷 Foto");
  });

  it("a limpeza apaga as mensagens com mais de 90 dias, com a foto", async () => {
    const antiga = (await doMorador({ texto: "antiga", foto: JPEG })).corpo;
    await doMorador({ texto: "recente" });
    await prisma.mensagemChat.update({ where: { id: antiga.id }, data: { criadaEm: new Date(Date.now() - (DIAS_RETENCAO_CHAT + 1) * DIA) } });
    expect(await limparMensagensAntigas()).toEqual({ apagadas: 1, falhas: 0 });
    expect((await conversaDoMorador()).corpo.itens.map((m: { texto: string }) => m.texto)).toEqual(["recente"]);
    expect(fotos.size).toBe(0);
  });
});

describe("limpeza das mensagens do síndico na portaria (uma vez)", () => {
  const msg = (autorId: string, unidadeId: string, lado: "MORADOR" | "PORTARIA", texto: string, temFoto = false) =>
    prisma.mensagemChat.create({ data: { autorId, unidadeId, lado, texto, temFoto } });

  /** Cenário: o que deve sumir (síndico como portaria) misturado com o que deve ficar. */
  async function montar() {
    const { sindico, porteiro, morador } = c.usuarios;
    const a101 = c.unidades.a101.id;
    const s100 = c.unidades.s100.id;
    const alvo1 = await msg(sindico.id, a101, "PORTARIA", "Aviso do síndico à unidade");
    const alvo2 = await msg(sindico.id, a101, "PORTARIA", "Com foto", true);
    fotos.set(chave(a101, alvo2.id), Buffer.from("foto"));
    const ficam = [
      await msg(porteiro.id, a101, "PORTARIA", "Resposta do porteiro"),
      await msg(morador.id, a101, "MORADOR", "Pergunta do morador"),
      await msg(sindico.id, s100, "MORADOR", "O síndico como morador da própria unidade"),
      await msg(sindico.id, a101, "PORTARIA", `${PREFIXO_LEMBRETE} você tem 1 encomenda aguardando retirada`),
    ];
    return { alvo: [alvo1.id, alvo2.id], ficam: ficam.map((m) => m.id) };
  }

  it("só conta, sem apagar nada, no modo de conferência", async () => {
    const { ficam, alvo } = await montar();
    expect(await contarMensagensDoSindico()).toBe(2);
    expect(await prisma.mensagemChat.count({ where: { id: { in: [...alvo, ...ficam] } } })).toBe(6);
  });

  it("apaga só o que o síndico mandou como portaria, com a foto, e preserva todo o resto", async () => {
    const { alvo, ficam } = await montar();
    expect(await apagarMensagensDoSindico()).toEqual({ apagadas: 2, falhas: 0 });
    expect(await prisma.mensagemChat.count({ where: { id: { in: alvo } } })).toBe(0);
    // Porteiro, morador, o síndico como morador e o lembrete automático de encomenda continuam.
    expect(await prisma.mensagemChat.count({ where: { id: { in: ficam } } })).toBe(4);
    expect(fotos.size).toBe(0);
  });

  it("é idempotente: rodar de novo não apaga mais nada", async () => {
    const { ficam } = await montar();
    await apagarMensagensDoSindico();
    expect(await apagarMensagensDoSindico()).toEqual({ apagadas: 0, falhas: 0 });
    expect(await contarMensagensDoSindico()).toBe(0);
    expect(await prisma.mensagemChat.count({ where: { id: { in: ficam } } })).toBe(4);
  });
});
