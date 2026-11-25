import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { type Cenario, chamar, criarApp, criarCenario, limparBanco, prisma } from "./ajuda.js";

/**
 * As unidades são cadastradas pelo administrador, no painel (/admin). As regras (lote, duplicidade, exclusão com vínculos)
 * ficam em unidades/operacoes.ts e são testadas aqui pelas rotas do painel. No app, o condomínio só lê a lista.
 */
let app: FastifyInstance;
let c: Cenario;
let admin: string;

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
  await prisma.administrador.create({ data: { nome: "Admin", email: "admin@condomus.dev", senhaHash: await bcrypt.hash("senha-forte-do-admin", 4) } });
  admin = (await chamar(app, "POST", "/admin/auth/login", { corpo: { email: "admin@condomus.dev", senha: "senha-forte-do-admin" } })).corpo.token;
});

const base = () => `/admin/painel/condominios/${c.condominio.id}/unidades`;
const painel = (metodo: "GET" | "POST" | "PATCH" | "DELETE", url: string, corpo?: unknown) =>
  chamar(app, metodo, url, { token: admin, ...(corpo !== undefined && { corpo }) });
const nova = (bloco: string, numero: string) => prisma.unidade.create({ data: { bloco, numero, condominioId: c.condominio.id } });
const outroCondominio = async () => {
  const outro = await prisma.condominio.create({ data: { nome: "Outro", planoStatus: "ATIVO" } });
  return prisma.unidade.create({ data: { bloco: "Z", numero: "1", condominioId: outro.id } });
};

describe("o app não cadastra mais unidades", () => {
  it("síndico, morador e porteiro não criam, editam nem excluem unidades pela API do condomínio", async () => {
    for (const token of [c.tokens.sindico, c.tokens.morador, c.tokens.porteiro]) {
      expect((await chamar(app, "POST", "/unidades", { token, corpo: { bloco: "Q", numero: "1" } })).status).toBe(404);
      expect((await chamar(app, "POST", "/unidades/lote", { token, corpo: { blocos: ["Q"], andarInicial: 1, andarFinal: 1, porAndar: 1 } })).status).toBe(404);
      expect((await chamar(app, "PATCH", `/unidades/${c.unidades.a101.id}`, { token, corpo: { bloco: "Q", numero: "1" } })).status).toBe(404);
      expect((await chamar(app, "DELETE", `/unidades/${c.unidades.b201.id}`, { token })).status).toBe(404);
    }
    expect(await prisma.unidade.count({ where: { bloco: "Q" } })).toBe(0);
  });

  it("só o porteiro lê a lista de unidades", async () => {
    expect((await chamar(app, "GET", "/unidades", { token: c.tokens.porteiro })).status).toBe(200);
    expect((await chamar(app, "GET", "/unidades", { token: c.tokens.sindico })).status).toBe(403);
    expect((await chamar(app, "GET", "/unidades", { token: c.tokens.morador })).status).toBe(403);
  });
});

describe("cadastro em lote", () => {
  it("gera blocos × andares × apartamentos e ignora as que já existem", async () => {
    // A101 já existe no cenário.
    const r = await painel("POST", `${base()}/lote`, { blocos: ["a", "C"], andarInicial: 1, andarFinal: 2, porAndar: 2 });
    expect(r.status).toBe(201);
    // 2 blocos × 2 andares × 2 = 8; A101 já existia.
    expect(r.corpo).toEqual({ criadas: 7, ignoradas: 1 });
    const nomes = (await prisma.unidade.findMany({ where: { bloco: "C" }, orderBy: { numero: "asc" } })).map((u) => u.numero);
    expect(nomes).toEqual(["101", "102", "201", "202"]);
  });

  it("recusa lote grande demais e andares invertidos", async () => {
    const grande = await painel("POST", `${base()}/lote`, { blocos: ["A", "B", "C", "D", "E", "F"], andarInicial: 1, andarFinal: 30, porAndar: 4 });
    expect(grande.status).toBe(400);
    expect(grande.corpo.erro).toMatch(/máximo/);
    const invertido = await painel("POST", `${base()}/lote`, { blocos: ["A"], andarInicial: 5, andarFinal: 1, porAndar: 2 });
    expect(invertido.status).toBe(400);
    expect(await prisma.unidade.count({ where: { bloco: "A", numero: { not: "101" } } })).toBe(0);
  });
});

describe("editar unidade", () => {
  it("troca bloco e número", async () => {
    const r = await painel("PATCH", `${base()}/${c.unidades.a101.id}`, { bloco: "c", numero: "301" });
    expect(r.status).toBe(200);
    expect(r.corpo).toMatchObject({ bloco: "C", numero: "301" });
  });

  it("recusa bloco e número de outra unidade (409)", async () => {
    const r = await painel("PATCH", `${base()}/${c.unidades.a101.id}`, { bloco: "B", numero: "201" });
    expect(r.status).toBe(409);
  });

  it("não edita unidade de outro condomínio", async () => {
    const alheia = await outroCondominio();
    const r = await painel("PATCH", `${base()}/${alheia.id}`, { bloco: "Y", numero: "2" });
    expect(r.status).toBe(404);
    expect((await prisma.unidade.findUnique({ where: { id: alheia.id } }))?.bloco).toBe("Z");
  });
});

describe("excluir unidade", () => {
  it("exclui unidade vazia e leva junto os convites", async () => {
    const vazia = await nova("D", "401");
    await prisma.conviteUnidade.create({ data: { codigo: "ABC123", expiraEm: new Date(Date.now() + 86_400_000), unidadeId: vazia.id } });
    const r = await painel("DELETE", `${base()}/${vazia.id}`);
    expect(r.status).toBe(204);
    expect(await prisma.unidade.findUnique({ where: { id: vazia.id } })).toBeNull();
    expect(await prisma.conviteUnidade.count({ where: { unidadeId: vazia.id } })).toBe(0);
  });

  it("recusa unidade com morador e diz o que impede", async () => {
    const r = await painel("DELETE", `${base()}/${c.unidades.a101.id}`);
    expect(r.status).toBe(409);
    expect(r.corpo.erro).toContain("1 morador");
    expect(await prisma.unidade.findUnique({ where: { id: c.unidades.a101.id } })).not.toBeNull();
  });

  it("recusa a unidade onde mora o síndico", async () => {
    const r = await painel("DELETE", `${base()}/${c.unidades.s100.id}`);
    expect(r.status).toBe(409);
    expect(r.corpo.erro).toContain("1 morador");
  });

  it("recusa unidade com histórico de visita, encomenda ou reserva, mesmo sem moradores", async () => {
    const u = await nova("E", "501");
    await prisma.visita.create({ data: { nomeVisitante: "Fulano", unidadeId: u.id, status: "FINALIZADA" } });
    await prisma.encomenda.create({ data: { descricao: "Caixa", unidadeId: u.id, recebidaPorId: c.usuarios.porteiro.id } });
    const r = await painel("DELETE", `${base()}/${u.id}`);
    expect(r.status).toBe(409);
    expect(r.corpo.erro).toContain("1 visita");
    expect(r.corpo.erro).toContain("1 encomenda");
  });

  it("não exclui unidade de outro condomínio", async () => {
    const alheia = await outroCondominio();
    expect((await painel("DELETE", `${base()}/${alheia.id}`)).status).toBe(404);
    expect(await prisma.unidade.findUnique({ where: { id: alheia.id } })).not.toBeNull();
  });
});
