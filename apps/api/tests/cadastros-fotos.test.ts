import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { type Cenario, chamar, criarApp, criarCenario, entrar, limparBanco, prisma } from "./ajuda.js";

// Mock do storage: as funções de upload/download/delete não precisam de bucket real nos testes.
// Cada teste que enviar uma foto recebe os bytes de volta via downloadFoto.
const fotoStorage = new Map<string, Buffer>();

vi.mock("../src/lib/storage.js", () => ({
  uploadFoto: vi.fn(async (usuarioId: string, bytes: Buffer) => { fotoStorage.set(usuarioId, bytes); }),
  downloadFoto: vi.fn(async (usuarioId: string) => fotoStorage.get(usuarioId) ?? null),
  deletarFoto: vi.fn(async (usuarioId: string) => { fotoStorage.delete(usuarioId); }),
  StorageNaoConfiguradoError: class StorageNaoConfiguradoError extends Error {},
}));

// Mock só do e-mail de boas-vindas: permite conferir a senha que seria enviada ao usuário.
const { enviarBoasVindas } = vi.hoisted(() => ({ enviarBoasVindas: vi.fn() }));
vi.mock("../src/lib/email.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/email.js")>()),
  enviarBoasVindas,
}));

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
  fotoStorage.clear();
  enviarBoasVindas.mockClear();
  await limparBanco();
  c = await criarCenario(app);
});

describe("cadastros pelo síndico", () => {
  const novoMorador = (corpo: Record<string, unknown>) => chamar(app, "POST", "/usuarios", { token: c.tokens.sindico, corpo });

  it("cadastra morador com unidade, e ele consegue entrar", async () => {
    const r = await novoMorador({ nome: "Nova Moradora", email: "Nova@Teste.dev", papel: "MORADOR", unidadeId: c.unidades.b201.id });
    expect(r.status).toBe(201);
    expect(r.corpo).toMatchObject({ email: "nova@teste.dev", papel: "MORADOR", unidade: { numero: "201" } });
    expect(r.corpo).not.toHaveProperty("senhaHash");
    // A API gera a senha automaticamente, a retorna em senhaGerada e a envia por e-mail.
    expect(enviarBoasVindas).toHaveBeenCalledWith("nova@teste.dev", "Nova Moradora", r.corpo.senhaGerada);
    await expect(entrar(app, "nova@teste.dev", r.corpo.senhaGerada)).resolves.toEqual(expect.any(String));
  });

  it("reenviar senha gera uma nova, envia por e-mail e invalida a anterior", async () => {
    const r = await novoMorador({ nome: "Nova Moradora", email: "nova@teste.dev", papel: "MORADOR", unidadeId: c.unidades.b201.id });
    const senhaAntiga = r.corpo.senhaGerada;
    const tokenAntigo = await entrar(app, "nova@teste.dev", senhaAntiga);
    expect(r.corpo.senhaTemporaria).toBe(true);

    const reenvio = await chamar(app, "POST", `/usuarios/${r.corpo.id}/reenviar-senha`, { token: c.tokens.sindico });
    expect(reenvio.status).toBe(204);
    expect(enviarBoasVindas).toHaveBeenCalledTimes(2);
    const [, , senhaNova] = enviarBoasVindas.mock.calls[1];
    expect(senhaNova).not.toBe(senhaAntiga);

    await expect(entrar(app, "nova@teste.dev", senhaAntiga)).rejects.toThrow();
    await expect(entrar(app, "nova@teste.dev", senhaNova)).resolves.toEqual(expect.any(String));
    expect((await chamar(app, "GET", "/avisos", { token: tokenAntigo })).status).toBe(401);
  });

  it("reenviar senha só vale para conta ativa que ainda não fez o primeiro acesso", async () => {
    // O morador do cenário já tem senha própria: o síndico não pode trocá-la.
    const jaAcessou = await chamar(app, "POST", `/usuarios/${c.usuarios.morador.id}/reenviar-senha`, { token: c.tokens.sindico });
    expect(jaAcessou.status).toBe(409);
    await expect(entrar(app, "morador@teste.dev")).resolves.toEqual(expect.any(String));

    const r = await novoMorador({ nome: "Nova Moradora", email: "nova@teste.dev", papel: "MORADOR", unidadeId: c.unidades.b201.id });
    await chamar(app, "PATCH", `/usuarios/${r.corpo.id}/ativo`, { token: c.tokens.sindico, corpo: { ativo: false } });
    const desativado = await chamar(app, "POST", `/usuarios/${r.corpo.id}/reenviar-senha`, { token: c.tokens.sindico });
    expect(desativado.status).toBe(409);

    const porMorador = await chamar(app, "POST", `/usuarios/${r.corpo.id}/reenviar-senha`, { token: c.tokens.morador });
    expect(porMorador.status).toBe(403);
    expect(enviarBoasVindas).toHaveBeenCalledTimes(1); // só o do cadastro
  });

  it("morador precisa de unidade e funcionário não pode ter", async () => {
    expect((await novoMorador({ nome: "Sem Unidade", email: "a@teste.dev", papel: "MORADOR" })).status).toBe(400);
    expect((await novoMorador({ nome: "Porteiro Dois", email: "b@teste.dev", papel: "PORTEIRO", unidadeId: c.unidades.a101.id })).status).toBe(400);
  });

  it("e-mail e unidade duplicados são 409", async () => {
    expect((await novoMorador({ nome: "Repetido", email: "morador@teste.dev", papel: "PORTEIRO" })).status).toBe(409);
    expect((await chamar(app, "POST", "/unidades", { token: c.tokens.sindico, corpo: { bloco: "a", numero: "101" } })).status).toBe(409);
  });

  it("desativar corta o acesso; síndico não desativa a si mesmo", async () => {
    const r = await chamar(app, "PATCH", `/usuarios/${c.usuarios.morador.id}/ativo`, { token: c.tokens.sindico, corpo: { ativo: false } });
    expect(r.corpo.ativo).toBe(false);
    expect((await chamar(app, "GET", "/avisos", { token: c.tokens.morador })).status).toBe(401);
    await expect(entrar(app, "morador@teste.dev")).rejects.toThrow();

    const proprio = await chamar(app, "PATCH", `/usuarios/${c.usuarios.sindico.id}/ativo`, { token: c.tokens.sindico, corpo: { ativo: false } });
    expect(proprio.status).toBe(409);
  });

  it("a lista de usuários nunca traz a senha nem os bytes da foto", async () => {
    const r = await chamar(app, "GET", "/usuarios", { token: c.tokens.sindico });
    expect(r.corpo).toHaveLength(4);
    for (const u of r.corpo) {
      expect(u).not.toHaveProperty("senhaHash");
      expect(u).not.toHaveProperty("foto");
    }
  });
});

describe("foto de perfil", () => {
  // Menor JPEG válido o suficiente para o teste: começa com FF D8 FF.
  const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]).toString("base64");
  const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString("base64");

  it("envia, vê, e remove a própria foto", async () => {
    const envio = await chamar(app, "PUT", "/auth/foto", { token: c.tokens.morador, corpo: { imagem: JPEG } });
    expect(envio.corpo.fotoAtualizadaEm).toEqual(expect.any(String));

    const foto = await chamar(app, "GET", `/usuarios/${c.usuarios.morador.id}/foto`, { token: c.tokens.morador });
    expect(foto.tipo).toBe("image/jpeg");
    expect(foto.bytes.toString("base64")).toBe(JPEG);

    expect((await chamar(app, "DELETE", "/auth/foto", { token: c.tokens.morador })).status).toBe(204);
    expect((await chamar(app, "GET", `/usuarios/${c.usuarios.morador.id}/foto`, { token: c.tokens.morador })).status).toBe(404);
  });

  it("aceita só JPEG", async () => {
    expect((await chamar(app, "PUT", "/auth/foto", { token: c.tokens.morador, corpo: { imagem: PNG } })).status).toBe(400);
    expect((await chamar(app, "PUT", "/auth/foto", { token: c.tokens.morador, corpo: { imagem: "não é base64!" } })).status).toBe(400);
  });

  it("portaria e síndico veem a foto de moradores; morador não vê a de outros", async () => {
    await chamar(app, "PUT", "/auth/foto", { token: c.tokens.morador, corpo: { imagem: JPEG } });
    const url = `/usuarios/${c.usuarios.morador.id}/foto`;
    expect((await chamar(app, "GET", url, { token: c.tokens.porteiro })).status).toBe(200);
    expect((await chamar(app, "GET", url, { token: c.tokens.sindico })).status).toBe(200);
    expect((await chamar(app, "GET", url, { token: c.tokens.vizinho })).status).toBe(403);
  });
});
