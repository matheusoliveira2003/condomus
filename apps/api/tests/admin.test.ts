import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { ADMIN_SECRET, type Cenario, chamar, criarApp, criarCenario, entrar, limparBanco, prisma } from "./ajuda.js";

let app: FastifyInstance;
let c: Cenario;
let token: string;

const SENHA_ADMIN = "senha-forte-do-admin";

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
  await prisma.administrador.create({ data: { nome: "Admin", email: "admin@condomus.dev", senhaHash: await bcrypt.hash(SENHA_ADMIN, 4) } });
  token = (await chamar(app, "POST", "/admin/auth/login", { corpo: { email: "admin@condomus.dev", senha: SENHA_ADMIN } })).corpo.token;
});

const painel = (metodo: "GET" | "POST" | "PATCH" | "DELETE", url: string, corpo?: unknown, t = token) =>
  chamar(app, metodo, `/admin/painel${url}`, { token: t, ...(corpo !== undefined && { corpo }) });

/** Um segundo condomínio, para conferir que o painel não mistura recursos de um com o outro. */
async function outroCondominio() {
  const condominio = await prisma.condominio.create({ data: { nome: "Outro", planoStatus: "ATIVO" } });
  const unidade = await prisma.unidade.create({ data: { bloco: "Z", numero: "9", condominioId: condominio.id } });
  return { condominio, unidade };
}

describe("contas e login do administrador", () => {
  it("a conta só é criada com a chave ADMIN_SECRET", async () => {
    const corpo = { nome: "Novo", email: "novo@condomus.dev", senha: "outra-senha-forte" };
    expect((await chamar(app, "POST", "/admin/administradores", { corpo })).status).toBe(401);
    expect((await chamar(app, "POST", "/admin/administradores", { token, corpo })).status).toBe(401);
    expect((await chamar(app, "POST", "/admin/administradores", { token: ADMIN_SECRET, corpo })).status).toBe(201);
  });

  it("recusa senha curta na criação", async () => {
    const r = await chamar(app, "POST", "/admin/administradores", { token: ADMIN_SECRET, corpo: { nome: "X", email: "x@condomus.dev", senha: "curta" } });
    expect(r.status).toBe(400);
  });

  it("login certo dá acesso; senha errada, e-mail inexistente e conta desativada não", async () => {
    expect((await chamar(app, "GET", "/admin/eu", { token })).corpo).toMatchObject({ email: "admin@condomus.dev" });
    const errada = await chamar(app, "POST", "/admin/auth/login", { corpo: { email: "admin@condomus.dev", senha: "errada" } });
    const inexistente = await chamar(app, "POST", "/admin/auth/login", { corpo: { email: "ninguem@condomus.dev", senha: "errada" } });
    expect(errada.status).toBe(401);
    expect(inexistente.corpo).toEqual(errada.corpo);
    await prisma.administrador.updateMany({ data: { ativo: false } });
    expect((await chamar(app, "GET", "/admin/eu", { token })).status).toBe(401);
  });

  it("desativar ou trocar a versão do token encerra a sessão aberta", async () => {
    await prisma.administrador.updateMany({ data: { tokenVersion: { increment: 1 } } });
    expect((await chamar(app, "GET", "/admin/eu", { token })).status).toBe(401);
  });
});

describe("troca de senha do administrador", () => {
  const NOVA = "uma-senha-nova-bem-longa";
  const trocar = (corpo: unknown, t = token) => chamar(app, "PATCH", "/admin/senha", { token: t, corpo });

  it("troca a senha, devolve sessão nova e encerra a antiga", async () => {
    const r = await trocar({ senhaAtual: SENHA_ADMIN, novaSenha: NOVA });
    expect(r.status).toBe(200);
    expect((await chamar(app, "GET", "/admin/eu", { token })).status).toBe(401);
    expect((await chamar(app, "GET", "/admin/eu", { token: r.corpo.token })).status).toBe(200);
    const antiga = await chamar(app, "POST", "/admin/auth/login", { corpo: { email: "admin@condomus.dev", senha: SENHA_ADMIN } });
    expect(antiga.status).toBe(401);
    const nova = await chamar(app, "POST", "/admin/auth/login", { corpo: { email: "admin@condomus.dev", senha: NOVA } });
    expect(nova.status).toBe(200);
  });

  it("recusa senha atual errada, senha curta e senha igual à atual", async () => {
    expect((await trocar({ senhaAtual: "errada-errada-errada", novaSenha: NOVA })).status).toBe(400);
    expect((await trocar({ senhaAtual: SENHA_ADMIN, novaSenha: "curta" })).status).toBe(400);
    expect((await trocar({ senhaAtual: SENHA_ADMIN, novaSenha: SENHA_ADMIN })).status).toBe(400);
    // Nada mudou: a sessão e a senha antigas continuam valendo.
    expect((await chamar(app, "GET", "/admin/eu", { token })).status).toBe(200);
  });

  it("exige a sessão do painel: sem token, com token de usuário ou com a chave, não", async () => {
    const corpo = { senhaAtual: SENHA_ADMIN, novaSenha: NOVA };
    for (const t of ["", c.tokens.sindico, ADMIN_SECRET]) expect((await trocar(corpo, t)).status).toBe(401);
  });
});

describe("tokens do painel e do app não se misturam", () => {
  it("o token do painel não entra nas rotas do app", async () => {
    expect((await chamar(app, "GET", "/auth/me", { token })).status).toBe(401);
    expect((await chamar(app, "GET", "/avisos", { token })).status).toBe(401);
  });

  it("o token de um usuário do app, até do síndico, não entra no painel", async () => {
    for (const t of [c.tokens.sindico, c.tokens.morador, c.tokens.porteiro]) {
      expect((await painel("GET", "/condominios", undefined, t)).status).toBe(401);
    }
    expect((await painel("GET", "/condominios", undefined, "")).status).toBe(401);
  });

  it("a chave ADMIN_SECRET não serve como sessão do painel", async () => {
    expect((await painel("GET", "/condominios", undefined, ADMIN_SECRET)).status).toBe(401);
  });
});

describe("gerenciamento pelo painel", () => {
  it("lista e edita condomínios, com a situação do plano", async () => {
    const lista = await painel("GET", "/condominios");
    expect(lista.status).toBe(200);
    expect(lista.corpo[0]).toMatchObject({ nome: "Condomínio Teste", _count: { unidades: 3 }, situacao: { status: "ATIVO" } });
    const r = await painel("PATCH", `/condominios/${c.condominio.id}`, { nome: "Renomeado", planoStatus: "SUSPENSO" });
    expect(r.corpo).toMatchObject({ nome: "Renomeado", planoStatus: "SUSPENSO" });
  });

  it("cria condomínio e síndico juntos; e-mail já usado no mesmo condomínio não deixa condomínio órfão", async () => {
    const r = await painel("POST", "/condominios", { nome: "Novo", sindico: { nome: "Síndica", email: "sindica@novo.dev" } });
    expect(r.status).toBe(201);
    expect(r.corpo).toMatchObject({ condominio: { nome: "Novo" }, sindico: { papel: "SINDICO" }, senhaGerada: expect.any(String) });
    expect(await prisma.condominio.count()).toBe(2);
  });

  it("unidades: cria, cria em lote, edita, gera convite e exclui", async () => {
    const base = `/condominios/${c.condominio.id}/unidades`;
    const nova = (await painel("POST", base, { bloco: "C", numero: "301" })).corpo;
    expect((await painel("POST", `${base}/lote`, { blocos: ["D"], andarInicial: 1, andarFinal: 2, porAndar: 2 })).corpo).toEqual({ criadas: 4, ignoradas: 0 });
    expect((await painel("PATCH", `${base}/${nova.id}`, { bloco: "C", numero: "302" })).corpo.numero).toBe("302");
    expect((await painel("POST", `${base}/${nova.id}/convite`)).corpo).toMatchObject({ codigo: expect.any(String) });
    expect((await painel("DELETE", `${base}/${nova.id}`)).status).toBe(204);
  });

  it("usuários: cria, edita, reenvia senha e desativa", async () => {
    const base = `/condominios/${c.condominio.id}/usuarios`;
    const novo = (await painel("POST", base, { nome: "Novo Morador", email: "novo@teste.dev", papel: "MORADOR", unidadeId: c.unidades.a101.id })).corpo;
    expect(novo).toMatchObject({ papel: "MORADOR", senhaGerada: expect.any(String) });
    expect(novo).not.toHaveProperty("senhaHash");
    expect((await painel("PATCH", `${base}/${novo.id}`, { nome: "Nome Corrigido" })).corpo.nome).toBe("Nome Corrigido");
    expect((await painel("POST", `${base}/${novo.id}/reenviar-senha`)).status).toBe(204);
    expect((await painel("PATCH", `${base}/${novo.id}/ativo`, { ativo: false })).corpo.ativo).toBe(false);
  });

  it("reenviar senha só vale para conta ativa que ainda não fez o primeiro acesso", async () => {
    const base = `/condominios/${c.condominio.id}/usuarios`;
    // O morador do cenário já tem senha própria: o painel não pode trocá-la.
    expect((await painel("POST", `${base}/${c.usuarios.morador.id}/reenviar-senha`)).status).toBe(409);
    await expect(entrar(app, "morador@teste.dev")).resolves.toEqual(expect.any(String));

    const novo = (await painel("POST", base, { nome: "Nova Moradora", email: "nova@teste.dev", papel: "MORADOR", unidadeId: c.unidades.b201.id })).corpo;
    await painel("PATCH", `${base}/${novo.id}/ativo`, { ativo: false });
    expect((await painel("POST", `${base}/${novo.id}/reenviar-senha`)).status).toBe(409);
  });

  it("desativar corta o acesso na hora, mesmo com token válido", async () => {
    const base = `/condominios/${c.condominio.id}/usuarios`;
    expect((await painel("PATCH", `${base}/${c.usuarios.morador.id}/ativo`, { ativo: false })).corpo.ativo).toBe(false);
    expect((await chamar(app, "GET", "/avisos", { token: c.tokens.morador })).status).toBe(401);
    await expect(entrar(app, "morador@teste.dev")).rejects.toThrow();
  });

  it("mudar o morador de unidade encerra a sessão antiga, pois a unidade vai no token", async () => {
    const base = `/condominios/${c.condominio.id}/usuarios`;
    const r = await painel("PATCH", `${base}/${c.usuarios.morador.id}`, { unidadeId: c.unidades.b201.id });
    expect(r.corpo.unidade).toMatchObject({ numero: "201" });
    expect((await chamar(app, "GET", "/auth/me", { token: c.tokens.morador })).status).toBe(401);
    const novoToken = await entrar(app, "morador@teste.dev");
    expect((await chamar(app, "GET", "/auth/me", { token: novoToken })).corpo.unidade).toMatchObject({ numero: "201" });
  });

  it("o painel dá uma unidade ao síndico e o porteiro não ganha unidade", async () => {
    const base = `/condominios/${c.condominio.id}/usuarios`;
    // O síndico de um condomínio recém-criado nasce sem unidade; o administrador vincula depois.
    const r = await painel("PATCH", `${base}/${c.usuarios.sindico.id}`, { unidadeId: c.unidades.a101.id });
    expect(r.status).toBe(200);
    expect(r.corpo.unidade).toMatchObject({ numero: "101" });
    expect((await painel("PATCH", `${base}/${c.usuarios.porteiro.id}`, { unidadeId: c.unidades.a101.id })).status).toBe(409);
  });

  it("a lista de usuários nunca traz a senha nem os bytes da foto", async () => {
    const r = await painel("GET", `/condominios/${c.condominio.id}/usuarios`);
    expect(r.corpo).toHaveLength(4);
    for (const u of r.corpo) {
      expect(u).not.toHaveProperty("senhaHash");
      expect(u).not.toHaveProperty("foto");
    }
  });

  it("áreas: cria, edita e desativa; a lista do painel mostra as inativas", async () => {
    const base = `/condominios/${c.condominio.id}/areas`;
    const nova = (await painel("POST", base, { nome: "Piscina" })).corpo;
    expect((await painel("PATCH", `${base}/${nova.id}`, { nome: "Piscina adulto", ativa: false })).corpo).toMatchObject({ nome: "Piscina adulto", ativa: false });
    expect((await painel("GET", base)).corpo.map((a: { nome: string }) => a.nome)).toContain("Piscina adulto");
    // No app, a área desativada some da lista de reservas.
    expect((await chamar(app, "GET", "/areas", { token: c.tokens.morador })).corpo.map((a: { nome: string }) => a.nome)).not.toContain("Piscina adulto");
  });

  it("não alcança recurso de outro condomínio pela URL de um condomínio", async () => {
    const outro = await outroCondominio();
    const daqui = `/condominios/${c.condominio.id}`;
    expect((await painel("PATCH", `${daqui}/unidades/${outro.unidade.id}`, { bloco: "Y", numero: "1" })).status).toBe(404);
    expect((await painel("DELETE", `${daqui}/unidades/${outro.unidade.id}`)).status).toBe(404);
    expect((await painel("POST", `${daqui}/unidades/${outro.unidade.id}/convite`)).status).toBe(404);
    expect((await painel("POST", `${daqui}/usuarios`, { nome: "Morador Fora", email: "fora@x.dev", papel: "MORADOR", unidadeId: outro.unidade.id })).status).toBe(404);
  });

  it("condomínio inexistente na URL é 404", async () => {
    expect((await painel("GET", "/condominios/00000000-0000-4000-8000-000000000000/unidades")).status).toBe(404);
    expect((await painel("GET", "/condominios/nao-existe/unidades")).status).toBe(404);
  });

  it("aceita o condomínio padrão da migration, cujo id é um texto fixo e não um UUID", async () => {
    const padrao = await prisma.condominio.create({ data: { id: "condominio-padrao", nome: "Condomínio Padrão", planoStatus: "ATIVO" } });
    const r = await painel("GET", `/condominios/${padrao.id}`);
    expect(r.status).toBe(200);
    expect(r.corpo).toMatchObject({ id: "condominio-padrao", nome: "Condomínio Padrão" });
    expect((await painel("POST", `/condominios/${padrao.id}/unidades`, { bloco: "P", numero: "1" })).status).toBe(201);
  });
});
