import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { type Cenario, chamar, criarApp, criarCenario, limparBanco, prisma } from "./ajuda.js";

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

const DIA = 24 * 60 * 60 * 1000;
const lista = (token = c.tokens.morador) => chamar(app, "GET", "/visitantes", { token });
const ocultar = (documento: string, token = c.tokens.morador) =>
  chamar(app, "POST", "/visitantes/ocultar", { token, corpo: { documento } });
const autorizar = (nomeVisitante: string, documento: string, placaVeiculo?: string, token = c.tokens.morador) =>
  chamar(app, "POST", "/visitas", { token, corpo: { nomeVisitante, documento, ...(placaVeiculo && { placaVeiculo }) } });
/** Visita antiga, criada direto no banco com a data do agendamento no passado. */
const antiga = (nomeVisitante: string, documento: string, diasAtras: number, unidadeId = c.unidades.a101.id) =>
  prisma.visita.create({ data: { nomeVisitante, documento, unidadeId, criadoEm: new Date(Date.now() - diasAtras * DIA) } });

describe("visitantes frequentes do morador", () => {
  it("lista um por documento, com os dados da visita mais recente, mesmo com formatação diferente", async () => {
    await antiga("Ana Souza", "123.456.789-00", 10);
    await autorizar("Ana S. Souza", "12345678900", "ABC1D23");
    await autorizar("Bruno Lima", "98765432100");
    const r = await lista();
    expect(r.status).toBe(200);
    expect(r.corpo).toHaveLength(2);
    // Mais recente primeiro; a Ana aparece com o nome e a placa da última autorização.
    expect(r.corpo[0]).toMatchObject({ nomeVisitante: "Bruno Lima", temRosto: false });
    expect(r.corpo[1]).toMatchObject({ nomeVisitante: "Ana S. Souza", documento: "12345678900", placaVeiculo: "ABC1D23" });
  });

  it("só mostra quem foi autorizado nos últimos 90 dias", async () => {
    await antiga("Recente", "11111111111", 89);
    await antiga("Antigo", "22222222222", 91);
    const nomes = (await lista()).corpo.map((v: { nomeVisitante: string }) => v.nomeVisitante);
    expect(nomes).toEqual(["Recente"]);
  });

  it("só mostra os visitantes da unidade do morador", async () => {
    await autorizar("Da A101", "11111111111");
    await autorizar("Da B201", "22222222222", undefined, c.tokens.vizinho);
    expect((await lista()).corpo.map((v: { nomeVisitante: string }) => v.nomeVisitante)).toEqual(["Da A101"]);
    expect((await lista(c.tokens.vizinho)).corpo.map((v: { nomeVisitante: string }) => v.nomeVisitante)).toEqual(["Da B201"]);
  });

  it("ocultar tira da lista sem apagar o histórico, e autorizar de novo traz de volta", async () => {
    await autorizar("Ana", "12345678900");
    expect((await ocultar("123.456.789-00")).status).toBe(204);
    expect((await lista()).corpo).toHaveLength(0);
    expect(await prisma.visita.count({ where: { documento: "12345678900" } })).toBe(1);

    await autorizar("Ana", "12345678900");
    expect((await lista()).corpo).toHaveLength(1);
  });

  it("ocultar numa unidade não esconde da outra", async () => {
    await autorizar("Ana", "12345678900");
    await autorizar("Ana", "12345678900", undefined, c.tokens.vizinho);
    await ocultar("12345678900");
    expect((await lista()).corpo).toHaveLength(0);
    expect((await lista(c.tokens.vizinho)).corpo).toHaveLength(1);
  });

  it("indica quem tem rosto cadastrado e válido", async () => {
    await autorizar("Com rosto", "12345678900");
    await prisma.rostoVisitante.create({
      data: {
        condominioId: c.condominio.id,
        documento: "12345678900",
        consentimentoEm: new Date(),
        termoVersao: "teste",
        ultimaVisitaEm: new Date(),
        registradoPorId: c.usuarios.porteiro.id,
      },
    });
    expect((await lista()).corpo[0]).toMatchObject({ nomeVisitante: "Com rosto", temRosto: true });
  });

  it("só o morador acessa, e documento curto é recusado", async () => {
    for (const token of [c.tokens.porteiro, c.tokens.sindico]) {
      expect((await lista(token)).status).toBe(403);
      expect((await ocultar("12345678900", token)).status).toBe(403);
    }
    expect((await ocultar("123")).status).toBe(400);
  });
});
