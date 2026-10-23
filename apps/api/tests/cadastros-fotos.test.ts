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
  await limparBanco();
  c = await criarCenario(app);
});

describe("cadastros pelo síndico", () => {
  const novoMorador = (corpo: Record<string, unknown>) => chamar(app, "POST", "/usuarios", { token: c.tokens.sindico, corpo });

  it("cadastra morador com unidade, e ele consegue entrar", async () => {
    const r = await novoMorador({ nome: "Nova Moradora", email: "Nova@Teste.dev", senha: "abcdef", papel: "MORADOR", unidadeId: c.unidades.b201.id });
    expect(r.status).toBe(201);
    expect(r.corpo).toMatchObject({ email: "nova@teste.dev", papel: "MORADOR", unidade: { numero: "201" } });
    expect(r.corpo).not.toHaveProperty("senhaHash");
    await expect(entrar(app, "nova@teste.dev", "abcdef")).resolves.toEqual(expect.any(String));
  });

  it("morador precisa de unidade e funcionário não pode ter", async () => {
    expect((await novoMorador({ nome: "Sem Unidade", email: "a@teste.dev", senha: "abcdef", papel: "MORADOR" })).status).toBe(400);
    expect((await novoMorador({ nome: "Porteiro Dois", email: "b@teste.dev", senha: "abcdef", papel: "PORTEIRO", unidadeId: c.unidades.a101.id })).status).toBe(400);
  });

  it("e-mail e unidade duplicados são 409", async () => {
    expect((await novoMorador({ nome: "Repetido", email: "morador@teste.dev", senha: "abcdef", papel: "PORTEIRO" })).status).toBe(409);
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
