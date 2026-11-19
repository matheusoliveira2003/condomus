import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { type Cenario, chamar, criarApp, criarCenario, limparBanco, prisma, SENHA } from "./ajuda.js";

// App com o limite de tentativas LIGADO (os demais testes rodam sem ele). Um app por arquivo: o
// contador vive na memória do app e só zera quando ele é recriado.
let app: FastifyInstance;
let c: Cenario;

beforeAll(async () => {
  app = await criarApp({ limites: true });
});
afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await limparBanco();
  // O cenário faz logins para obter os tokens, o que gasta tentativas: usa um app sem limite só para isso.
  const semLimite = await criarApp();
  c = await criarCenario(semLimite);
  await semLimite.close();
});

const login = (email: string, senha: string) => chamar(app, "POST", "/auth/login", { corpo: { email, senha } });

describe("limite de tentativas", () => {
  it("bloqueia o login depois de 10 erros seguidos, com a mensagem no formato da API", async () => {
    for (let i = 0; i < 10; i++) expect((await login("morador@teste.dev", "errada")).status).toBe(401);
    const bloqueado = await login("morador@teste.dev", "errada");
    expect(bloqueado.status).toBe(429);
    expect(bloqueado.corpo.erro).toMatch(/Muitas tentativas/);
    // Mesmo com a senha certa, a conta fica bloqueada até a janela passar.
    expect((await login("morador@teste.dev", SENHA)).status).toBe(429);
  });

  it("conta por e-mail: errar a senha de uma conta não bloqueia outra", async () => {
    for (let i = 0; i < 11; i++) await login("morador@teste.dev", "errada");
    expect((await login("vizinho@teste.dev", SENHA)).status).toBe(200);
  });

  it("não deixa testar o código de 6 dígitos da recuperação à força", async () => {
    const tentar = (codigo: string) =>
      chamar(app, "POST", "/auth/redefinir-senha", { corpo: { email: "morador@teste.dev", codigo, novaSenha: "nova-senha" } });
    for (let i = 0; i < 5; i++) expect((await tentar(String(100000 + i))).status).toBe(400);
    expect((await tentar("100005")).status).toBe(429);
  });

  it("limita o pedido de recuperação, que dispara e-mails", async () => {
    const pedir = () => chamar(app, "POST", "/auth/recuperar-senha", { corpo: { email: "morador@teste.dev" } });
    for (let i = 0; i < 5; i++) expect((await pedir()).status).toBe(204);
    expect((await pedir()).status).toBe(429);
  });

  it("rotas sem limite não são afetadas", async () => {
    for (let i = 0; i < 30; i++) expect((await chamar(app, "GET", "/health")).status).toBe(200);
  });
});
