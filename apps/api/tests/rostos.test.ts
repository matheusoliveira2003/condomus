import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { type Cenario, chamar, criarApp, criarCenario, limparBanco, prisma } from "./ajuda.js";
import { TERMO_ROSTO_VERSAO } from "../src/modules/rostos/routes.js";
import { LIMIAR_RECONHECIMENTO, PRAZO_DIAS_ROSTO, limparRostosVencidos } from "../src/modules/rostos/regras.js";

// Storage simulado: guarda os rostos em memória, pela chave (condomínio + documento).
const rostos = new Map<string, Buffer>();
const chave = (condominioId: string, documento: string) => `${condominioId}:${documento}`;
vi.mock("../src/lib/storage.js", () => ({
  uploadRosto: vi.fn(async (c: string, d: string, bytes: Buffer) => { rostos.set(chave(c, d), bytes); }),
  downloadRosto: vi.fn(async (c: string, d: string) => rostos.get(chave(c, d)) ?? null),
  deletarRosto: vi.fn(async (c: string, d: string) => { rostos.delete(chave(c, d)); }),
  uploadFoto: vi.fn(),
  downloadFoto: vi.fn(),
  deletarFoto: vi.fn(),
  StorageNaoConfiguradoError: class StorageNaoConfiguradoError extends Error {},
}));

/** Menor JPEG aceito pela API: só precisa começar com FF D8 FF. */
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]).toString("base64");
const DIA = 24 * 60 * 60 * 1000;

let app: FastifyInstance;
let c: Cenario;

beforeAll(async () => {
  app = await criarApp();
});
afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});
beforeEach(async () => {
  rostos.clear();
  await limparBanco();
  c = await criarCenario(app);
});

/** Visita registrada direto pela portaria, com o documento informado. */
async function visita(documento = "123.456.789-00") {
  const r = await chamar(app, "POST", "/visitas/entrada-direta", {
    token: c.tokens.porteiro,
    // Se o documento já tem rosto válido, a entrada exige verificação; aqui só importa registrar a visita.
    corpo: { nomeVisitante: "Visitante", documento, unidadeId: c.unidades.a101.id, verificacao: { tipo: "MANUAL", motivo: "Visita de apoio ao teste" } },
  });
  expect(r.status).toBe(201);
  return r.corpo.id as string;
}

const cadastrar = (id: string, corpo: Record<string, unknown> = {}, token = c.tokens.porteiro) =>
  chamar(app, "PUT", `/visitas/${id}/rosto`, {
    token,
    corpo: { imagem: JPEG, consentimento: true, termoVersao: TERMO_ROSTO_VERSAO, ...corpo },
  });

describe("rosto de referência do visitante", () => {
  it("porteiro cadastra na primeira visita e consulta a foto", async () => {
    const id = await visita();
    expect((await chamar(app, "GET", `/visitas/${id}/rosto`, { token: c.tokens.porteiro })).corpo).toEqual({ cadastrado: false });

    expect((await cadastrar(id)).status).toBe(204);

    const status = await chamar(app, "GET", `/visitas/${id}/rosto`, { token: c.tokens.porteiro });
    expect(status.corpo).toMatchObject({ cadastrado: true, consentimentoEm: expect.any(String), expiraEm: expect.any(String) });
    const imagem = await chamar(app, "GET", `/visitas/${id}/rosto/imagem`, { token: c.tokens.porteiro });
    expect(imagem.status).toBe(200);
    expect(imagem.tipo).toContain("image/jpeg");
    expect(imagem.bytes.toString("base64")).toBe(JPEG);

    const registro = await prisma.rostoVisitante.findFirstOrThrow();
    expect(registro).toMatchObject({ documento: "12345678900", termoVersao: TERMO_ROSTO_VERSAO, registradoPorId: c.usuarios.porteiro.id });
  });

  it("reaproveita o rosto na visita seguinte do mesmo documento, com outra formatação", async () => {
    await cadastrar(await visita("123.456.789-00"));
    const segunda = await visita("12345678900");
    expect((await chamar(app, "GET", `/visitas/${segunda}/rosto`, { token: c.tokens.porteiro })).corpo).toMatchObject({ cadastrado: true });
  });

  it("só o porteiro acessa o rosto", async () => {
    const id = await visita();
    await cadastrar(id);
    for (const token of [c.tokens.sindico, c.tokens.morador]) {
      expect((await cadastrar(id, {}, token)).status).toBe(403);
      expect((await chamar(app, "GET", `/visitas/${id}/rosto`, { token })).status).toBe(403);
      expect((await chamar(app, "GET", `/visitas/${id}/rosto/imagem`, { token })).status).toBe(403);
      expect((await chamar(app, "DELETE", `/visitas/${id}/rosto`, { token })).status).toBe(403);
    }
  });

  it("exige consentimento, a versão atual do termo e foto JPEG", async () => {
    const id = await visita();
    expect((await cadastrar(id, { consentimento: false })).status).toBe(400);
    expect((await cadastrar(id, { consentimento: undefined })).status).toBe(400);
    expect((await cadastrar(id, { termoVersao: "antigo" })).status).toBe(409);
    expect((await cadastrar(id, { imagem: Buffer.from("não é jpeg").toString("base64") })).status).toBe(400);
    expect(await prisma.rostoVisitante.count()).toBe(0);
    expect(rostos.size).toBe(0);
  });

  it("não cadastra rosto de visita de outro condomínio", async () => {
    const id = await visita();
    const outro = await prisma.condominio.create({ data: { nome: "Outro", planoStatus: "ATIVO" } });
    const unidade = await prisma.unidade.create({ data: { bloco: "Z", numero: "1", condominioId: outro.id } });
    await prisma.visita.update({ where: { id }, data: { unidadeId: unidade.id } });
    expect((await cadastrar(id)).status).toBe(404);
  });

  it("recusa visita sem documento utilizável", async () => {
    const id = await visita();
    await prisma.visita.update({ where: { id }, data: { documento: null } });
    expect((await cadastrar(id)).status).toBe(409);
  });

  it("não sobrescreve um rosto ainda válido: é preciso apagar antes", async () => {
    const id = await visita();
    await cadastrar(id);
    const outra = await cadastrar(id, { imagem: Buffer.from([0xff, 0xd8, 0xff, 9, 9]).toString("base64") });
    expect(outra.status).toBe(409);
    expect(rostos.get(chave(c.condominio.id, "12345678900"))).toEqual(Buffer.from(JPEG, "base64"));
    await chamar(app, "DELETE", `/visitas/${id}/rosto`, { token: c.tokens.porteiro });
    expect((await cadastrar(id)).status).toBe(204);
  });

  it("se o registro falha depois da foto, apaga a foto para não deixar biometria órfã", async () => {
    const id = await visita();
    const falha = vi.spyOn(prisma.rostoVisitante, "upsert").mockRejectedValueOnce(new Error("banco fora"));
    const r = await cadastrar(id);
    expect(r.status).toBe(500);
    expect(rostos.size).toBe(0);
    falha.mockRestore();
  });

  it("apaga a pedido do visitante", async () => {
    const id = await visita();
    await cadastrar(id);
    expect((await chamar(app, "DELETE", `/visitas/${id}/rosto`, { token: c.tokens.porteiro })).status).toBe(204);
    expect(await prisma.rostoVisitante.count()).toBe(0);
    expect(rostos.size).toBe(0);
    expect((await chamar(app, "GET", `/visitas/${id}/rosto/imagem`, { token: c.tokens.porteiro })).status).toBe(404);
  });
});

describe("prazo do rosto", () => {
  const recuar = (dias: number) =>
    prisma.rostoVisitante.updateMany({ data: { ultimaVisitaEm: new Date(Date.now() - dias * DIA) } });

  it("nova entrada do visitante renova o prazo", async () => {
    await cadastrar(await visita());
    await recuar(PRAZO_DIAS_ROSTO - 1);
    await visita();
    const { ultimaVisitaEm } = await prisma.rostoVisitante.findFirstOrThrow();
    expect(Date.now() - ultimaVisitaEm.getTime()).toBeLessThan(60_000);
  });

  it("rosto vencido não é servido nem renovado, e a limpeza apaga foto e registro", async () => {
    const id = await visita();
    await cadastrar(id);
    await recuar(PRAZO_DIAS_ROSTO + 1);

    expect((await chamar(app, "GET", `/visitas/${id}/rosto`, { token: c.tokens.porteiro })).corpo).toEqual({ cadastrado: false });
    expect((await chamar(app, "GET", `/visitas/${id}/rosto/imagem`, { token: c.tokens.porteiro })).status).toBe(404);
    // Uma nova visita não ressuscita o rosto vencido.
    await visita();
    expect(await prisma.rostoVisitante.count({ where: { ultimaVisitaEm: { gte: new Date(Date.now() - DIA) } } })).toBe(0);

    expect(await limparRostosVencidos()).toEqual({ apagados: 1, falhas: 0 });
    expect(await prisma.rostoVisitante.count()).toBe(0);
    expect(rostos.size).toBe(0);
  });

  it("limpeza mantém os rostos dentro do prazo", async () => {
    await cadastrar(await visita());
    await recuar(PRAZO_DIAS_ROSTO - 1);
    expect(await limparRostosVencidos()).toEqual({ apagados: 0, falhas: 0 });
    expect(await prisma.rostoVisitante.count()).toBe(1);
  });

  it("recadastro depois de vencido volta a valer, com novo consentimento", async () => {
    const id = await visita();
    await cadastrar(id);
    await recuar(PRAZO_DIAS_ROSTO + 1);
    expect((await cadastrar(id)).status).toBe(204);
    expect((await chamar(app, "GET", `/visitas/${id}/rosto`, { token: c.tokens.porteiro })).corpo).toMatchObject({ cadastrado: true });
  });
});

describe("entrada de visitante com rosto cadastrado", () => {
  const entrar = (id: string, verificacao?: unknown, token = c.tokens.porteiro) =>
    chamar(app, "PATCH", `/visitas/${id}/entrada`, { token, corpo: verificacao === undefined ? {} : { verificacao } });

  /** Visita agendada (sem convite, como as antigas) do mesmo documento que já tem rosto cadastrado. */
  async function agendada(documento = "12345678900") {
    return (await prisma.visita.create({
      data: { nomeVisitante: "Visitante", documento, unidadeId: c.unidades.a101.id },
    })).id;
  }

  beforeEach(async () => {
    // Primeira visita: o porteiro cadastra o rosto.
    expect((await cadastrar(await visita())).status).toBe(204);
  });

  it("exige verificação quando o visitante tem rosto válido", async () => {
    const id = await agendada();
    expect((await entrar(id)).status).toBe(409);
    expect((await prisma.visita.findUniqueOrThrow({ where: { id } })).status).toBe("AGENDADA");
  });

  it("libera com reconhecimento acima do limiar e registra a semelhança", async () => {
    const id = await agendada();
    expect((await entrar(id, { tipo: "RECONHECIMENTO", semelhanca: 0.9 })).status).toBe(200);
    expect(await prisma.visita.findUniqueOrThrow({ where: { id } })).toMatchObject({
      status: "EM_ANDAMENTO",
      verificacao: "RECONHECIMENTO",
      semelhanca: 0.9,
      motivoLiberacao: null,
    });
  });

  it("recusa reconhecimento abaixo do limiar", async () => {
    const id = await agendada();
    expect((await entrar(id, { tipo: "RECONHECIMENTO", semelhanca: 0.3 })).status).toBe(400);
    expect((await prisma.visita.findUniqueOrThrow({ where: { id } })).status).toBe("AGENDADA");
  });

  it("libera manualmente com motivo, guardando a semelhança recusada", async () => {
    const id = await agendada();
    expect((await entrar(id, { tipo: "MANUAL", motivo: "" })).status).toBe(400);
    const r = await entrar(id, { tipo: "MANUAL", motivo: "Documento conferido, luz ruim", semelhanca: 0.31 });
    expect(r.status).toBe(200);
    expect(await prisma.visita.findUniqueOrThrow({ where: { id } })).toMatchObject({
      verificacao: "MANUAL",
      semelhanca: 0.31,
      motivoLiberacao: "Documento conferido, luz ruim",
      registradoPorId: c.usuarios.porteiro.id,
    });
  });

  it("síndico só libera manualmente", async () => {
    const id = await agendada();
    expect((await entrar(id, { tipo: "RECONHECIMENTO", semelhanca: 0.99 }, c.tokens.sindico)).status).toBe(403);
    expect((await entrar(id, { tipo: "MANUAL", motivo: "Porteiro ausente" }, c.tokens.sindico)).status).toBe(200);
  });

  it("não exige nada de visitante sem rosto, nem com o rosto vencido", async () => {
    expect((await entrar(await agendada("99999999999"))).status).toBe(200);
    await prisma.rostoVisitante.updateMany({ data: { ultimaVisitaEm: new Date(Date.now() - (PRAZO_DIAS_ROSTO + 1) * DIA) } });
    const id = await agendada();
    expect((await entrar(id)).status).toBe(200);
    expect(await prisma.visita.findUniqueOrThrow({ where: { id } })).toMatchObject({ verificacao: null, semelhanca: null });
  });

  it("vale também na entrada direta, com o documento em outra formatação", async () => {
    const direta = (verificacao?: unknown) =>
      chamar(app, "POST", "/visitas/entrada-direta", {
        token: c.tokens.porteiro,
        corpo: { nomeVisitante: "Visitante", documento: "123.456.789-00", unidadeId: c.unidades.a101.id, ...(verificacao ? { verificacao } : {}) },
      });
    expect((await direta()).status).toBe(409);
    expect((await direta({ tipo: "RECONHECIMENTO", semelhanca: 0.2 })).status).toBe(400);
    const ok = await direta({ tipo: "RECONHECIMENTO", semelhanca: 0.8 });
    expect(ok.status).toBe(201);
    expect(ok.corpo).toMatchObject({ verificacao: "RECONHECIMENTO", semelhanca: 0.8 });
  });

  it("informa o limiar na consulta do rosto", async () => {
    const id = await agendada();
    const r = await chamar(app, "GET", `/visitas/${id}/rosto`, { token: c.tokens.porteiro });
    expect(r.corpo).toMatchObject({ cadastrado: true, limiar: LIMIAR_RECONHECIMENTO });
  });
});

describe("consulta do rosto por documento", () => {
  const consultar = (documento: string, token = c?.tokens.porteiro) =>
    chamar(app, "POST", "/rostos/consulta", { token, corpo: { documento } });

  it("informa se há rosto válido e devolve a foto, só ao porteiro", async () => {
    expect((await consultar("123.456.789-00")).corpo).toEqual({ cadastrado: false });
    await cadastrar(await visita());
    expect((await consultar("123.456.789-00")).corpo).toEqual({ cadastrado: true, limiar: LIMIAR_RECONHECIMENTO });
    const imagem = await chamar(app, "POST", "/rostos/imagem", { token: c.tokens.porteiro, corpo: { documento: "12345678900" } });
    expect(imagem.status).toBe(200);
    expect(imagem.bytes.toString("base64")).toBe(JPEG);
    // O síndico sabe que há rosto (para liberar manualmente), mas não vê a foto; o morador não acessa nada.
    expect((await consultar("12345678900", c.tokens.sindico)).corpo).toMatchObject({ cadastrado: true });
    expect((await consultar("12345678900", c.tokens.morador)).status).toBe(403);
    for (const token of [c.tokens.sindico, c.tokens.morador]) {
      expect((await chamar(app, "POST", "/rostos/imagem", { token, corpo: { documento: "12345678900" } })).status).toBe(403);
    }
    expect((await consultar("123")).status).toBe(400);
  });
});
