import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { type Cenario, chamar, criarApp, criarCenario, limparBanco, prisma } from "./ajuda.js";

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
  await limparBanco();
  c = await criarCenario(app);
});

const sindico = () => c.tokens.sindico;
const nova = async (bloco: string, numero: string) =>
  prisma.unidade.create({ data: { bloco, numero, condominioId: c.condominio.id } });

describe("cadastro em lote", () => {
  it("gera blocos × andares × apartamentos e ignora as que já existem", async () => {
    // A101 já existe no cenário.
    const r = await chamar(app, "POST", "/unidades/lote", {
      token: sindico(),
      corpo: { blocos: ["a", "C"], andarInicial: 1, andarFinal: 2, porAndar: 2 },
    });
    expect(r.status).toBe(201);
    // 2 blocos × 2 andares × 2 = 8; A101 já existia.
    expect(r.corpo).toEqual({ criadas: 7, ignoradas: 1 });
    const nomes = (await prisma.unidade.findMany({ where: { bloco: "C" }, orderBy: { numero: "asc" } })).map((u) => u.numero);
    expect(nomes).toEqual(["101", "102", "201", "202"]);
  });

  it("recusa lote grande demais, andares invertidos e perfis sem permissão", async () => {
    const grande = await chamar(app, "POST", "/unidades/lote", {
      token: sindico(),
      corpo: { blocos: ["A", "B", "C", "D", "E", "F"], andarInicial: 1, andarFinal: 30, porAndar: 4 },
    });
    expect(grande.status).toBe(400);
    expect(grande.corpo.erro).toMatch(/máximo/);
    const invertido = await chamar(app, "POST", "/unidades/lote", {
      token: sindico(),
      corpo: { blocos: ["A"], andarInicial: 5, andarFinal: 1, porAndar: 2 },
    });
    expect(invertido.status).toBe(400);
    const porteiro = await chamar(app, "POST", "/unidades/lote", {
      token: c.tokens.porteiro,
      corpo: { blocos: ["Z"], andarInicial: 1, andarFinal: 1, porAndar: 1 },
    });
    expect(porteiro.status).toBe(403);
    expect(await prisma.unidade.count({ where: { bloco: "Z" } })).toBe(0);
  });
});

describe("editar unidade", () => {
  it("troca bloco e número", async () => {
    const r = await chamar(app, "PATCH", `/unidades/${c.unidades.a101.id}`, { token: sindico(), corpo: { bloco: "c", numero: "301" } });
    expect(r.status).toBe(200);
    expect(r.corpo).toMatchObject({ bloco: "C", numero: "301" });
  });

  it("recusa bloco e número de outra unidade (409)", async () => {
    const r = await chamar(app, "PATCH", `/unidades/${c.unidades.a101.id}`, { token: sindico(), corpo: { bloco: "B", numero: "201" } });
    expect(r.status).toBe(409);
  });

  it("não edita unidade de outro condomínio nem aceita perfil sem permissão", async () => {
    const outro = await prisma.condominio.create({ data: { nome: "Outro", planoStatus: "ATIVO" } });
    const alheia = await prisma.unidade.create({ data: { bloco: "Z", numero: "1", condominioId: outro.id } });
    const r = await chamar(app, "PATCH", `/unidades/${alheia.id}`, { token: sindico(), corpo: { bloco: "Y", numero: "2" } });
    expect(r.status).toBe(404);
    expect((await prisma.unidade.findUnique({ where: { id: alheia.id } }))?.bloco).toBe("Z");
    const morador = await chamar(app, "PATCH", `/unidades/${c.unidades.a101.id}`, { token: c.tokens.morador, corpo: { bloco: "Y", numero: "2" } });
    expect(morador.status).toBe(403);
  });
});

describe("excluir unidade", () => {
  it("exclui unidade vazia e leva junto os convites", async () => {
    const vazia = await nova("D", "401");
    await prisma.conviteUnidade.create({ data: { codigo: "ABC123", expiraEm: new Date(Date.now() + 86_400_000), unidadeId: vazia.id } });
    const r = await chamar(app, "DELETE", `/unidades/${vazia.id}`, { token: sindico() });
    expect(r.status).toBe(204);
    expect(await prisma.unidade.findUnique({ where: { id: vazia.id } })).toBeNull();
    expect(await prisma.conviteUnidade.count({ where: { unidadeId: vazia.id } })).toBe(0);
  });

  it("recusa unidade com morador e diz o que impede", async () => {
    const r = await chamar(app, "DELETE", `/unidades/${c.unidades.a101.id}`, { token: sindico() });
    expect(r.status).toBe(409);
    expect(r.corpo.erro).toContain("1 morador");
    expect(await prisma.unidade.findUnique({ where: { id: c.unidades.a101.id } })).not.toBeNull();
  });

  it("recusa unidade com histórico de visita, encomenda ou reserva, mesmo sem moradores", async () => {
    const u = await nova("E", "501");
    await prisma.visita.create({ data: { nomeVisitante: "Fulano", unidadeId: u.id, status: "FINALIZADA" } });
    await prisma.encomenda.create({ data: { descricao: "Caixa", unidadeId: u.id, recebidaPorId: c.usuarios.porteiro.id } });
    const r = await chamar(app, "DELETE", `/unidades/${u.id}`, { token: sindico() });
    expect(r.status).toBe(409);
    expect(r.corpo.erro).toContain("1 visita");
    expect(r.corpo.erro).toContain("1 encomenda");
  });

  it("não exclui unidade de outro condomínio nem aceita porteiro", async () => {
    const outro = await prisma.condominio.create({ data: { nome: "Outro", planoStatus: "ATIVO" } });
    const alheia = await prisma.unidade.create({ data: { bloco: "Z", numero: "1", condominioId: outro.id } });
    expect((await chamar(app, "DELETE", `/unidades/${alheia.id}`, { token: sindico() })).status).toBe(404);
    expect((await chamar(app, "DELETE", `/unidades/${c.unidades.b201.id}`, { token: c.tokens.porteiro })).status).toBe(403);
    expect(await prisma.unidade.findUnique({ where: { id: alheia.id } })).not.toBeNull();
  });
});
