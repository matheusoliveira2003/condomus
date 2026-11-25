import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
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

describe("cadastros de usuários saíram da API do condomínio", () => {
  it("o síndico não cria, edita, desativa nem reenvia senha pela API do app", async () => {
    const { sindico } = c.tokens;
    expect((await chamar(app, "GET", "/usuarios", { token: sindico })).status).toBe(404);
    expect((await chamar(app, "POST", "/usuarios", { token: sindico, corpo: { nome: "Novo", email: "novo@teste.dev", papel: "PORTEIRO" } })).status).toBe(404);
    expect((await chamar(app, "PATCH", `/usuarios/${c.usuarios.morador.id}`, { token: sindico, corpo: { nome: "X" } })).status).toBe(404);
    expect((await chamar(app, "POST", `/usuarios/${c.usuarios.morador.id}/reenviar-senha`, { token: sindico })).status).toBe(404);
    expect((await chamar(app, "PATCH", `/usuarios/${c.usuarios.morador.id}/ativo`, { token: sindico, corpo: { ativo: false } })).status).toBe(404);
    // Nada mudou: o morador continua ativo e com a mesma senha.
    expect((await prisma.usuario.findUniqueOrThrow({ where: { id: c.usuarios.morador.id } })).ativo).toBe(true);
  });
});

describe("regras do cadastro, agora no painel do administrador", () => {
  const base = () => `/admin/painel/condominios/${c.condominio.id}/usuarios`;
  const painel = async (corpo: Record<string, unknown>) => {
    const token = (await chamar(app, "POST", "/admin/auth/login", { corpo: { email: "admin@condomus.dev", senha: "senha-forte-do-admin" } })).corpo.token;
    return chamar(app, "POST", base(), { token, corpo });
  };
  beforeEach(async () => {
    await prisma.administrador.create({ data: { nome: "Admin", email: "admin@condomus.dev", senhaHash: await bcrypt.hash("senha-forte-do-admin", 4) } });
  });

  it("cadastra morador e a senha temporária chega por e-mail, e ele consegue entrar", async () => {
    const r = await painel({ nome: "Nova Moradora", email: "Nova@Teste.dev", papel: "MORADOR", unidadeId: c.unidades.b201.id });
    expect(r.status).toBe(201);
    expect(r.corpo).toMatchObject({ email: "nova@teste.dev", papel: "MORADOR", unidade: { numero: "201" } });
    expect(r.corpo).not.toHaveProperty("senhaHash");
    expect(enviarBoasVindas).toHaveBeenCalledWith("nova@teste.dev", "Nova Moradora", r.corpo.senhaGerada);
    await expect(entrar(app, "nova@teste.dev", r.corpo.senhaGerada)).resolves.toEqual(expect.any(String));
  });

  it("morador e síndico precisam de unidade; porteiro não pode ter", async () => {
    expect((await painel({ nome: "Sem Unidade", email: "a@teste.dev", papel: "MORADOR" })).status).toBe(400);
    expect((await painel({ nome: "Síndico Sem Unidade", email: "s@teste.dev", papel: "SINDICO" })).status).toBe(400);
    expect((await painel({ nome: "Porteiro Dois", email: "b@teste.dev", papel: "PORTEIRO", unidadeId: c.unidades.a101.id })).status).toBe(400);
  });

  it("síndico é um morador com unidade, e entra com ela", async () => {
    const r = await painel({ nome: "Síndica Nova", email: "sindica@teste.dev", papel: "SINDICO", unidadeId: c.unidades.b201.id });
    expect(r.status).toBe(201);
    const token = await entrar(app, "sindica@teste.dev", r.corpo.senhaGerada);
    expect((await chamar(app, "GET", "/auth/me", { token })).corpo).toMatchObject({ papel: "SINDICO", unidade: { numero: "201" } });
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

  it("portaria vê a foto de moradores; o síndico, como morador, só a da própria unidade; morador não vê a de outros", async () => {
    await chamar(app, "PUT", "/auth/foto", { token: c.tokens.morador, corpo: { imagem: JPEG } });
    const url = `/usuarios/${c.usuarios.morador.id}/foto`;
    expect((await chamar(app, "GET", url, { token: c.tokens.porteiro })).status).toBe(200);
    expect((await chamar(app, "GET", url, { token: c.tokens.vizinho })).status).toBe(403);
    // O síndico é morador da unidade 301, então não vê a foto de outra unidade.
    expect((await chamar(app, "GET", url, { token: c.tokens.sindico })).status).toBe(403);
  });
});
