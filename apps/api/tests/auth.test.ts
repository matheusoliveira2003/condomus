import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { type Cenario, SENHA, chamar, criarApp, criarCenario, entrar, limparBanco, prisma } from "./ajuda.js";

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

describe("login", () => {
  it("entra com e-mail e senha corretos e devolve o perfil, sem a senha", async () => {
    const r = await chamar(app, "POST", "/auth/login", { corpo: { email: "morador@teste.dev", senha: SENHA } });
    expect(r.status).toBe(200);
    expect(r.corpo.token).toEqual(expect.any(String));
    expect(r.corpo.usuario).toMatchObject({ nome: "Morador A", papel: "MORADOR", unidadeId: c.unidades.a101.id });
    expect(JSON.stringify(r.corpo)).not.toContain("senhaHash");
  });

  it("ignora maiúsculas e espaços no e-mail", async () => {
    const r = await chamar(app, "POST", "/auth/login", { corpo: { email: "  MORADOR@Teste.DEV ", senha: SENHA } });
    expect(r.status).toBe(200);
  });

  it("recusa senha errada com a mesma mensagem de e-mail inexistente (não revela quem tem conta)", async () => {
    const senhaErrada = await chamar(app, "POST", "/auth/login", { corpo: { email: "morador@teste.dev", senha: "errada" } });
    const semConta = await chamar(app, "POST", "/auth/login", { corpo: { email: "ninguem@teste.dev", senha: SENHA } });
    expect(senhaErrada.status).toBe(401);
    expect(semConta.status).toBe(401);
    expect(senhaErrada.corpo.erro).toBe(semConta.corpo.erro);
  });

  it("valida os campos e responde em português", async () => {
    const r = await chamar(app, "POST", "/auth/login", { corpo: { email: "invalido" } });
    expect(r.status).toBe(400);
    expect(r.corpo.detalhes.email[0]).toMatch(/e-mail/i);
  });
});

describe("token", () => {
  it("rotas protegidas exigem token", async () => {
    expect((await chamar(app, "GET", "/auth/me")).status).toBe(401);
    expect((await chamar(app, "GET", "/avisos", { token: "token-falso" })).status).toBe(401);
  });

  it("/auth/me devolve os dados de quem está logado", async () => {
    const r = await chamar(app, "GET", "/auth/me", { token: c.tokens.porteiro });
    expect(r.corpo).toMatchObject({ nome: "Porteiro", papel: "PORTEIRO", unidade: null });
  });

  it("conta desativada perde o acesso na hora, mesmo com token válido", async () => {
    await prisma.usuario.update({ where: { id: c.usuarios.morador.id }, data: { ativo: false } });
    const r = await chamar(app, "GET", "/avisos", { token: c.tokens.morador });
    expect(r.status).toBe(401);
    expect(r.corpo.erro).toBe("Conta desativada");
  });
});

describe("troca de senha", () => {
  it("troca a senha: a antiga para de funcionar e a nova passa a valer", async () => {
    const r = await chamar(app, "PATCH", "/auth/senha", { token: c.tokens.morador, corpo: { senhaAtual: SENHA, novaSenha: "nova-senha" } });
    expect(r.status).toBe(204);
    await expect(entrar(app, "morador@teste.dev")).rejects.toThrow();
    await expect(entrar(app, "morador@teste.dev", "nova-senha")).resolves.toEqual(expect.any(String));
  });

  it("senha atual errada é 400, não 401 (não desloga o app)", async () => {
    const r = await chamar(app, "PATCH", "/auth/senha", { token: c.tokens.morador, corpo: { senhaAtual: "errada", novaSenha: "nova-senha" } });
    expect(r.status).toBe(400);
  });

  it("recusa nova senha curta ou igual à atual", async () => {
    const curta = await chamar(app, "PATCH", "/auth/senha", { token: c.tokens.morador, corpo: { senhaAtual: SENHA, novaSenha: "123" } });
    const igual = await chamar(app, "PATCH", "/auth/senha", { token: c.tokens.morador, corpo: { senhaAtual: SENHA, novaSenha: SENHA } });
    expect(curta.status).toBe(400);
    expect(igual.status).toBe(400);
  });
});

describe("permissões por perfil", () => {
  it.each([
    ["morador", "POST", "/avisos"],
    ["porteiro", "POST", "/avisos"],
    ["morador", "GET", "/usuarios"],
    ["porteiro", "GET", "/usuarios"],
    ["morador", "GET", "/unidades"],
    ["morador", "POST", "/encomendas"],
    ["porteiro", "POST", "/visitas"],
    ["sindico", "POST", "/reservas"],
  ] as const)("%s não pode %s %s", async (perfil, metodo, url) => {
    const r = await chamar(app, metodo, url, { token: c.tokens[perfil], corpo: {} });
    expect(r.status).toBe(403);
  });
});
