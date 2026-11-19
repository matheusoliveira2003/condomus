import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { type Cenario, SENHA, chamar, criarApp, criarCenario, limparBanco, prisma } from "./ajuda.js";

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

const login = (email: string, senha: string, condominioId?: string) =>
  chamar(app, "POST", "/auth/login", { corpo: { email, senha, ...(condominioId && { condominioId }) } });

/** Segundo condomínio, com um morador que usa o MESMO e-mail do morador do cenário. */
async function criarSegundoCondominio(senha = SENHA) {
  const condominio = await prisma.condominio.create({ data: { nome: "Residencial Aurora", planoStatus: "ATIVO" } });
  const unidade = await prisma.unidade.create({ data: { bloco: "A", numero: "101", condominioId: condominio.id } });
  const usuario = await prisma.usuario.create({
    data: {
      nome: "Morador A (Aurora)",
      email: "morador@teste.dev",
      papel: "MORADOR",
      senhaHash: await bcrypt.hash(senha, 4),
      condominioId: condominio.id,
      unidadeId: unidade.id,
    },
  });
  return { condominio, usuario };
}

describe("o mesmo e-mail em dois condomínios", () => {
  it("é permitido em condomínios diferentes, mas não repetido dentro do mesmo", async () => {
    const { condominio } = await criarSegundoCondominio();
    expect(await prisma.usuario.count({ where: { email: "morador@teste.dev" } })).toBe(2);
    // Dentro do mesmo condomínio continua sendo 409.
    const repetido = await chamar(app, "POST", "/usuarios", {
      token: c.tokens.sindico,
      corpo: { nome: "Outro", email: "morador@teste.dev", papel: "MORADOR", unidadeId: c.unidades.b201.id },
    });
    expect(repetido.status).toBe(409);
    expect(condominio.id).not.toBe(c.condominio.id);
  });

  it("login com uma conta só: entra direto, como sempre", async () => {
    const r = await login("morador@teste.dev", SENHA);
    expect(r.status).toBe(200);
    expect(r.corpo).toMatchObject({ token: expect.any(String), usuario: { papel: "MORADOR" } });
  });

  it("login com duas contas e a mesma senha: pede para escolher o condomínio, sem entrar ainda", async () => {
    const { condominio } = await criarSegundoCondominio();
    const r = await login("morador@teste.dev", SENHA);
    expect(r.status).toBe(200);
    expect(r.corpo.token).toBeUndefined();
    expect(r.corpo.escolherCondominio).toEqual(
      expect.arrayContaining([
        { condominioId: c.condominio.id, nome: "Condomínio Teste" },
        { condominioId: condominio.id, nome: "Residencial Aurora" },
      ]),
    );
    expect(r.corpo.escolherCondominio).toHaveLength(2);
  });

  it("reenviando com o condomínio escolhido, entra naquele e só naquele", async () => {
    const { condominio, usuario } = await criarSegundoCondominio();
    const a = await login("morador@teste.dev", SENHA, condominio.id);
    expect(a.corpo.usuario.id).toBe(usuario.id);
    const b = await login("morador@teste.dev", SENHA, c.condominio.id);
    expect(b.corpo.usuario.id).toBe(c.usuarios.morador.id);
    expect((await chamar(app, "GET", "/condominios/meu", { token: a.corpo.token })).corpo.nome).toBe("Residencial Aurora");
  });

  it("senhas diferentes: a senha decide qual conta, sem perguntar o condomínio", async () => {
    await criarSegundoCondominio("outra-senha");
    const r = await login("morador@teste.dev", "outra-senha");
    expect(r.corpo.usuario.nome).toBe("Morador A (Aurora)");
    expect((await login("morador@teste.dev", SENHA)).corpo.usuario.id).toBe(c.usuarios.morador.id);
  });

  it("a lista de condomínios só aparece com a senha certa: senha errada não revela nada", async () => {
    await criarSegundoCondominio();
    const r = await login("morador@teste.dev", "errada");
    expect(r.status).toBe(401);
    expect(r.corpo).toEqual({ erro: "E-mail ou senha inválidos" });
  });

  it("conta desativada não entra nem aparece na escolha", async () => {
    const { usuario } = await criarSegundoCondominio();
    await prisma.usuario.update({ where: { id: usuario.id }, data: { ativo: false } });
    const r = await login("morador@teste.dev", SENHA);
    expect(r.corpo.escolherCondominio).toBeUndefined();
    expect(r.corpo.usuario.id).toBe(c.usuarios.morador.id);
  });
});

describe("o login não revela quais e-mails existem", () => {
  it("e-mail inexistente e senha errada têm a mesma resposta e gastam a mesma comparação de senha", async () => {
    const comparar = vi.spyOn(bcrypt, "compare");
    try {
      const comSenhaErrada = await login("morador@teste.dev", "errada");
      const chamadasComConta = comparar.mock.calls.length;
      comparar.mockClear();
      const semConta = await login("ninguem@teste.dev", "errada");
      const chamadasSemConta = comparar.mock.calls.length;

      expect(comSenhaErrada.status).toBe(401);
      expect(semConta.status).toBe(401);
      expect(semConta.corpo).toEqual(comSenhaErrada.corpo);
      // Uma comparação bcrypt nos dois casos: o tempo de resposta não distingue os dois.
      expect(chamadasComConta).toBe(1);
      expect(chamadasSemConta).toBe(1);
    } finally {
      comparar.mockRestore();
    }
  });
});

describe("recuperar a senha com o mesmo e-mail em dois condomínios", () => {
  it("cada conta recebe o próprio código, e o código redefine só a conta a que pertence", async () => {
    const { usuario } = await criarSegundoCondominio();
    expect((await chamar(app, "POST", "/auth/recuperar-senha", { corpo: { email: "morador@teste.dev" } })).status).toBe(204);
    const contas = await prisma.usuario.findMany({ where: { email: "morador@teste.dev" } });
    expect(contas.every((u) => u.codigoRecuperacaoHash)).toBe(true);
    expect(contas[0].codigoRecuperacaoHash).not.toBe(contas[1].codigoRecuperacaoHash);

    // Troca o hash da conta do segundo condomínio por um código conhecido.
    await prisma.usuario.update({
      where: { id: usuario.id },
      data: { codigoRecuperacaoHash: bcrypt.hashSync("123456", 4), codigoRecuperacaoExpira: new Date(Date.now() + 60_000) },
    });
    const r = await chamar(app, "POST", "/auth/redefinir-senha", {
      corpo: { email: "morador@teste.dev", codigo: "123456", novaSenha: "senha-nova" },
    });
    expect(r.status).toBe(200);

    // Só a conta do segundo condomínio mudou de senha; a do primeiro continua com a antiga.
    expect((await login("morador@teste.dev", "senha-nova")).corpo.usuario.id).toBe(usuario.id);
    expect((await login("morador@teste.dev", SENHA)).corpo.usuario.id).toBe(c.usuarios.morador.id);
  });

  it("código que não é de nenhuma conta é recusado, com a mesma resposta de e-mail inexistente", async () => {
    await criarSegundoCondominio();
    await chamar(app, "POST", "/auth/recuperar-senha", { corpo: { email: "morador@teste.dev" } });
    const errado = await chamar(app, "POST", "/auth/redefinir-senha", {
      corpo: { email: "morador@teste.dev", codigo: "000000", novaSenha: "senha-nova" },
    });
    const semConta = await chamar(app, "POST", "/auth/redefinir-senha", {
      corpo: { email: "ninguem@teste.dev", codigo: "000000", novaSenha: "senha-nova" },
    });
    expect(errado.status).toBe(400);
    expect(semConta.corpo).toEqual(errado.corpo);
  });
});

describe("trocar de e-mail", () => {
  it("pode adotar um e-mail que existe em outro condomínio, mas não em um já usado no próprio", async () => {
    await criarSegundoCondominio();
    const pedir = (novoEmail: string) =>
      chamar(app, "POST", "/auth/trocar-email", { token: c.tokens.morador, corpo: { novoEmail, senhaAtual: SENHA } });
    // vizinho@teste.dev já existe no MESMO condomínio.
    expect((await pedir("vizinho@teste.dev")).status).toBe(400);
    // O e-mail do síndico do segundo condomínio existe só lá: aqui é livre.
    await prisma.usuario.create({
      data: { nome: "Fora", email: "so-la@teste.dev", papel: "SINDICO", senhaHash: "x", condominioId: (await prisma.condominio.findFirstOrThrow({ where: { nome: "Residencial Aurora" } })).id },
    });
    expect((await pedir("so-la@teste.dev")).status).toBe(204);
  });
});
