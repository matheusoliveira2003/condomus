import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
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

describe("token do condomínio", () => {
  it("o token carrega o condomínio e morador cadastrado por convite já entra autenticado", async () => {
    const convite = await chamar(app, "POST", `/unidades/${c.unidades.a101.id}/convite`, { token: c.tokens.sindico });
    const cadastro = await chamar(app, "POST", "/cadastro", {
      corpo: { codigo: convite.corpo.codigo, nome: "Morador Novo", email: "novo@teste.dev", senha: SENHA },
    });
    expect(cadastro.status).toBe(201);
    const payload = JSON.parse(Buffer.from(cadastro.corpo.token.split(".")[1], "base64url").toString());
    expect(payload.condominioId).toBe(c.condominio.id);
    expect((await chamar(app, "GET", "/auth/me", { token: cadastro.corpo.token })).status).toBe(200);
  });
});

describe("troca de senha", () => {
  it("troca a senha: a antiga para de funcionar e a nova passa a valer", async () => {
    const r = await chamar(app, "PATCH", "/auth/senha", { token: c.tokens.morador, corpo: { senhaAtual: SENHA, novaSenha: "nova-senha" } });
    expect(r.status).toBe(200);
    await expect(entrar(app, "morador@teste.dev")).rejects.toThrow();
    await expect(entrar(app, "morador@teste.dev", "nova-senha")).resolves.toEqual(expect.any(String));
  });

  it("token emitido antes da troca de senha fica inválido imediatamente", async () => {
    const tokenAntigo = c.tokens.morador;
    // Confirma que o token antigo ainda funciona antes da troca.
    expect((await chamar(app, "GET", "/auth/me", { token: tokenAntigo })).status).toBe(200);
    // Troca a senha.
    await chamar(app, "PATCH", "/auth/senha", { token: tokenAntigo, corpo: { senhaAtual: SENHA, novaSenha: "nova-senha" } });
    // O token antigo agora deve ser recusado.
    const r = await chamar(app, "GET", "/auth/me", { token: tokenAntigo });
    expect(r.status).toBe(401);
    expect(r.corpo.erro).toBe("Sessão inválida");
  });

  it("senha atual errada é 400, não 401 (não desloga o app)", async () => {
    const r = await chamar(app, "PATCH", "/auth/senha", { token: c.tokens.morador, corpo: { senhaAtual: "errada", novaSenha: "nova-senha" } });
    expect(r.status).toBe(400);
  });

  it("senha temporária: troca sem informar a senha atual e libera o acesso normal", async () => {
    await prisma.usuario.update({ where: { email: "morador@teste.dev" }, data: { senhaTemporaria: true } });
    // É o que a tela de troca obrigatória envia: senhaAtual vazia.
    const r = await chamar(app, "PATCH", "/auth/senha", { token: c.tokens.morador, corpo: { senhaAtual: "", novaSenha: "nova-senha" } });
    expect(r.status).toBe(200);
    expect(r.corpo.usuario.senhaTemporaria).toBe(false);
    const sessao = await chamar(app, "POST", "/auth/login", { corpo: { email: "morador@teste.dev", senha: "nova-senha" } });
    expect(sessao.status).toBe(200);
    expect(sessao.corpo.usuario.senhaTemporaria).toBe(false);
  });

  it("senha temporária: a nova senha não pode ser a própria temporária", async () => {
    await prisma.usuario.update({ where: { email: "morador@teste.dev" }, data: { senhaTemporaria: true } });
    const r = await chamar(app, "PATCH", "/auth/senha", { token: c.tokens.morador, corpo: { senhaAtual: "", novaSenha: SENHA } });
    expect(r.status).toBe(400);
  });

  it("conta com senha própria continua exigindo a senha atual (vazia é recusada)", async () => {
    const r = await chamar(app, "PATCH", "/auth/senha", { token: c.tokens.morador, corpo: { senhaAtual: "", novaSenha: "nova-senha" } });
    expect(r.status).toBe(400);
    await expect(entrar(app, "morador@teste.dev")).resolves.toEqual(expect.any(String));
  });

  it("a troca devolve uma sessão nova: o token novo vale e o anterior não", async () => {
    const tokenAntigo = c.tokens.morador;
    const r = await chamar(app, "PATCH", "/auth/senha", { token: tokenAntigo, corpo: { senhaAtual: SENHA, novaSenha: "nova-senha" } });
    expect(r.corpo.token).toEqual(expect.any(String));
    expect(r.corpo.usuario).toMatchObject({ nome: "Morador A", papel: "MORADOR", senhaTemporaria: false });
    expect((await chamar(app, "GET", "/auth/me", { token: r.corpo.token })).status).toBe(200);
    expect((await chamar(app, "GET", "/auth/me", { token: tokenAntigo })).status).toBe(401);
  });

  it("/auth/me informa senhaTemporaria, para o app restaurar a tela de troca obrigatória", async () => {
    expect((await chamar(app, "GET", "/auth/me", { token: c.tokens.morador })).corpo.senhaTemporaria).toBe(false);
    await prisma.usuario.update({ where: { email: "morador@teste.dev" }, data: { senhaTemporaria: true } });
    expect((await chamar(app, "GET", "/auth/me", { token: c.tokens.morador })).corpo.senhaTemporaria).toBe(true);
  });

  it("recusa nova senha curta ou igual à atual", async () => {
    const curta = await chamar(app, "PATCH", "/auth/senha", { token: c.tokens.morador, corpo: { senhaAtual: SENHA, novaSenha: "123" } });
    const igual = await chamar(app, "PATCH", "/auth/senha", { token: c.tokens.morador, corpo: { senhaAtual: SENHA, novaSenha: SENHA } });
    expect(curta.status).toBe(400);
    expect(igual.status).toBe(400);
  });
});

describe("recuperação de senha", () => {
  const CODIGO = "483920";

  /** Simula o estado que /auth/recuperar-senha deixaria: código válido por 15 min. */
  const definirCodigo = (userId: string, codigo = CODIGO, expiraEm = new Date(Date.now() + 15 * 60 * 1000)) =>
    prisma.usuario.update({
      where: { id: userId },
      data: { codigoRecuperacaoHash: bcrypt.hashSync(codigo, 4), codigoRecuperacaoExpira: expiraEm },
    });

  it("pedir recuperação grava um código com hash e validade futura", async () => {
    const antes = await prisma.usuario.findUniqueOrThrow({ where: { email: "morador@teste.dev" } });
    expect(antes.codigoRecuperacaoHash).toBeNull();

    const r = await chamar(app, "POST", "/auth/recuperar-senha", { corpo: { email: "morador@teste.dev" } });
    expect(r.status).toBe(204);

    const depois = await prisma.usuario.findUniqueOrThrow({ where: { email: "morador@teste.dev" } });
    expect(depois.codigoRecuperacaoHash).toEqual(expect.any(String));
    expect(depois.codigoRecuperacaoHash).not.toBe(antes.codigoRecuperacaoHash);
    expect(depois.codigoRecuperacaoExpira!.getTime()).toBeGreaterThan(Date.now());
  });

  it("resposta do pedido é idêntica para e-mail existente, inexistente ou desativado (não revela quem tem conta)", async () => {
    await prisma.usuario.update({ where: { id: c.usuarios.vizinho.id }, data: { ativo: false } });
    const existente = await chamar(app, "POST", "/auth/recuperar-senha", { corpo: { email: "morador@teste.dev" } });
    const inexistente = await chamar(app, "POST", "/auth/recuperar-senha", { corpo: { email: "ninguem@teste.dev" } });
    const desativado = await chamar(app, "POST", "/auth/recuperar-senha", { corpo: { email: "vizinho@teste.dev" } });
    expect([existente.status, inexistente.status, desativado.status]).toEqual([204, 204, 204]);
  });

  it("com o código certo, redefine a senha: a antiga para de valer e a nova passa a valer", async () => {
    await definirCodigo(c.usuarios.morador.id);
    const r = await chamar(app, "POST", "/auth/redefinir-senha", {
      corpo: { email: "morador@teste.dev", codigo: CODIGO, novaSenha: "nova-senha" },
    });
    expect(r.status).toBe(200);
    await expect(entrar(app, "morador@teste.dev", SENHA)).rejects.toThrow();
    await expect(entrar(app, "morador@teste.dev", "nova-senha")).resolves.toEqual(expect.any(String));
  });

  it("código errado, ou código de outra conta, é recusado", async () => {
    await definirCodigo(c.usuarios.morador.id);

    const errado = await chamar(app, "POST", "/auth/redefinir-senha", {
      corpo: { email: "morador@teste.dev", codigo: "000000", novaSenha: "nova-senha" },
    });
    expect(errado.status).toBe(400);

    // Código certo do morador, mas usado no e-mail do vizinho.
    const trocado = await chamar(app, "POST", "/auth/redefinir-senha", {
      corpo: { email: "vizinho@teste.dev", codigo: CODIGO, novaSenha: "nova-senha" },
    });
    expect(trocado.status).toBe(400);
  });

  it("sem nenhum pedido de recuperação, qualquer código é recusado", async () => {
    const r = await chamar(app, "POST", "/auth/redefinir-senha", {
      corpo: { email: "sindico@teste.dev", codigo: "123456", novaSenha: "nova-senha" },
    });
    expect(r.status).toBe(400);
  });

  it("o código não pode ser usado duas vezes", async () => {
    await definirCodigo(c.usuarios.morador.id);
    const primeira = await chamar(app, "POST", "/auth/redefinir-senha", {
      corpo: { email: "morador@teste.dev", codigo: CODIGO, novaSenha: "nova-senha" },
    });
    expect(primeira.status).toBe(200);

    const segunda = await chamar(app, "POST", "/auth/redefinir-senha", {
      corpo: { email: "morador@teste.dev", codigo: CODIGO, novaSenha: "outra-senha" },
    });
    expect(segunda.status).toBe(400);
  });

  it("código expirado é recusado", async () => {
    await definirCodigo(c.usuarios.morador.id, CODIGO, new Date(Date.now() - 1000));
    const r = await chamar(app, "POST", "/auth/redefinir-senha", {
      corpo: { email: "morador@teste.dev", codigo: CODIGO, novaSenha: "nova-senha" },
    });
    expect(r.status).toBe(400);
  });

  it("valida formato do código e tamanho da nova senha", async () => {
    await definirCodigo(c.usuarios.morador.id);
    const r = await chamar(app, "POST", "/auth/redefinir-senha", {
      corpo: { email: "morador@teste.dev", codigo: "abc", novaSenha: "123" },
    });
    expect(r.status).toBe(400);
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

describe("plano inativo", () => {
  it("plano suspenso: morador e porteiro recebem 402 em todas as rotas autenticadas", async () => {
    await prisma.condominio.update({ where: { id: c.condominio.id }, data: { planoStatus: "SUSPENSO" } });
    expect((await chamar(app, "GET", "/avisos", { token: c.tokens.morador })).status).toBe(402);
    expect((await chamar(app, "GET", "/encomendas", { token: c.tokens.porteiro })).status).toBe(402);
    expect((await chamar(app, "PATCH", "/auth/senha", { token: c.tokens.morador, corpo: { senhaAtual: SENHA, novaSenha: "nova123" } })).status).toBe(402);
  });

  it("plano expirado: síndico continua com acesso total", async () => {
    await prisma.condominio.update({ where: { id: c.condominio.id }, data: { planoStatus: "EXPIRADO" } });
    expect((await chamar(app, "GET", "/avisos", { token: c.tokens.sindico })).status).toBe(200);
    expect((await chamar(app, "GET", "/condominios/meu", { token: c.tokens.sindico })).corpo).toMatchObject({ planoStatus: "EXPIRADO" });
  });

  it("reativar o plano restaura o acesso sem novo login", async () => {
    await prisma.condominio.update({ where: { id: c.condominio.id }, data: { planoStatus: "SUSPENSO" } });
    expect((await chamar(app, "GET", "/avisos", { token: c.tokens.morador })).status).toBe(402);
    await prisma.condominio.update({ where: { id: c.condominio.id }, data: { planoStatus: "ATIVO" } });
    expect((await chamar(app, "GET", "/avisos", { token: c.tokens.morador })).status).toBe(200);
  });
});
