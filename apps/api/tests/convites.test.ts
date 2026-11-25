import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { type Cenario, SENHA, chamar, criarApp, criarCenario, entrar, gerarConvite as gerarConviteDoPainel, limparBanco, prisma } from "./ajuda.js";

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

// O convite nasce pela função que o painel do administrador usa; o app do síndico não gera mais convites.
const gerarConvite = async (unidadeId: string) => {
  const { codigo, expiraEm } = await gerarConviteDoPainel(c.condominio.id, unidadeId);
  // A rota devolve a data como texto (JSON); aqui ela vem como Date da função, então converte para o mesmo formato.
  return { codigo, expiraEm: expiraEm.toISOString() };
};

const dadosCadastro = (codigo: string, email = "novo@teste.dev") => ({ codigo, nome: "Novo Morador", email, senha: SENHA });

describe("gerar convite", () => {
  it("síndico gera um código de 8 caracteres sem ambíguos, válido por 7 dias", async () => {
    const { codigo, expiraEm } = await gerarConvite(c.unidades.a101.id);
    expect(codigo).toMatch(/^[A-HJ-KM-NP-Z2-9]{8}$/);
    const dias = (new Date(expiraEm).getTime() - Date.now()) / (24 * 60 * 60 * 1000);
    expect(dias).toBeGreaterThan(6.99);
    expect(dias).toBeLessThanOrEqual(7);
  });

  it("um novo convite descarta o anterior ainda não usado", async () => {
    const primeiro = await gerarConvite(c.unidades.a101.id);
    const segundo = await gerarConvite(c.unidades.a101.id);
    expect(segundo.codigo).not.toBe(primeiro.codigo);
    expect((await chamar(app, "GET", `/convite/${primeiro.codigo}`)).status).toBe(404);
    expect((await chamar(app, "GET", `/convite/${segundo.codigo}`)).status).toBe(200);
  });

  it("nenhum perfil do app gera convite: a rota saiu da API do condomínio", async () => {
    for (const token of [c.tokens.sindico, c.tokens.morador, c.tokens.porteiro]) {
      expect((await chamar(app, "POST", `/unidades/${c.unidades.a101.id}/convite`, { token })).status).toBe(404);
    }
  });

  it("o painel não gera convite para unidade de outro condomínio", async () => {
    const outro = await prisma.condominio.create({ data: { nome: "Outro", planoStatus: "ATIVO" } });
    const unidade = await prisma.unidade.create({ data: { bloco: "Z", numero: "1", condominioId: outro.id } });
    await expect(gerarConviteDoPainel(c.condominio.id, unidade.id)).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("consultar convite (público)", () => {
  it("mostra condomínio e unidade, sem expor ids", async () => {
    const { codigo } = await gerarConvite(c.unidades.a101.id);
    const r = await chamar(app, "GET", `/convite/${codigo}`);
    expect(r.status).toBe(200);
    expect(r.corpo).toEqual({ unidade: { bloco: "A", numero: "101" }, condominio: { nome: "Condomínio Teste" } });
  });

  it("código inexistente é 404", async () => {
    expect((await chamar(app, "GET", "/convite/ZZZZZZZZ")).status).toBe(404);
  });

  it("aceita o código em minúsculas", async () => {
    const { codigo } = await gerarConvite(c.unidades.a101.id);
    expect((await chamar(app, "GET", `/convite/${codigo.toLowerCase()}`)).status).toBe(200);
  });
});

describe("cadastro por convite", () => {
  it("cria o morador na unidade e no condomínio do convite, devolve a sessão e o login funciona", async () => {
    const { codigo } = await gerarConvite(c.unidades.a101.id);
    const r = await chamar(app, "POST", "/cadastro", { corpo: dadosCadastro(codigo) });
    expect(r.status).toBe(201);
    expect(r.corpo.token).toEqual(expect.any(String));
    expect(r.corpo.usuario).toMatchObject({ nome: "Novo Morador", papel: "MORADOR", unidadeId: c.unidades.a101.id });
    expect(JSON.stringify(r.corpo)).not.toContain("senhaHash");

    const criado = await prisma.usuario.findUniqueOrThrow({ where: { condominioId_email: { condominioId: c.condominio.id, email: "novo@teste.dev" } } });
    expect(criado.condominioId).toBe(c.condominio.id);

    // O token devolvido já é válido e o login com a senha cadastrada também.
    expect((await chamar(app, "GET", "/auth/me", { token: r.corpo.token })).status).toBe(200);
    await expect(entrar(app, "novo@teste.dev")).resolves.toEqual(expect.any(String));
  });

  it("convite usado não vale de novo", async () => {
    const { codigo } = await gerarConvite(c.unidades.a101.id);
    expect((await chamar(app, "POST", "/cadastro", { corpo: dadosCadastro(codigo) })).status).toBe(201);

    const segunda = await chamar(app, "POST", "/cadastro", { corpo: dadosCadastro(codigo, "outro@teste.dev") });
    expect(segunda.status).toBe(410);
    expect((await chamar(app, "GET", `/convite/${codigo}`)).status).toBe(410);
    expect(await prisma.usuario.findUnique({ where: { condominioId_email: { condominioId: c.condominio.id, email: "outro@teste.dev" } } })).toBeNull();
  });

  it("convite expirado é recusado", async () => {
    const { codigo } = await gerarConvite(c.unidades.a101.id);
    await prisma.conviteUnidade.update({ where: { codigo }, data: { expiraEm: new Date(Date.now() - 1000) } });

    expect((await chamar(app, "GET", `/convite/${codigo}`)).status).toBe(410);
    const r = await chamar(app, "POST", "/cadastro", { corpo: dadosCadastro(codigo) });
    expect(r.status).toBe(410);
    expect(await prisma.usuario.findUnique({ where: { condominioId_email: { condominioId: c.condominio.id, email: "novo@teste.dev" } } })).toBeNull();
  });

  it("código inválido é 404", async () => {
    const r = await chamar(app, "POST", "/cadastro", { corpo: dadosCadastro("ZZZZZZZZ") });
    expect(r.status).toBe(404);
  });

  it("e-mail já cadastrado é 409 e o convite continua livre", async () => {
    const { codigo } = await gerarConvite(c.unidades.a101.id);
    const r = await chamar(app, "POST", "/cadastro", { corpo: dadosCadastro(codigo, "morador@teste.dev") });
    expect(r.status).toBe(409);
    expect((await chamar(app, "GET", `/convite/${codigo}`)).status).toBe(200);
  });

  it("valida nome, e-mail e senha", async () => {
    const { codigo } = await gerarConvite(c.unidades.a101.id);
    const r = await chamar(app, "POST", "/cadastro", { corpo: { codigo, nome: "A", email: "invalido", senha: "123" } });
    expect(r.status).toBe(400);
  });
});
