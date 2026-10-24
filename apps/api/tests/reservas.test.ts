import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { type Cenario, chamar, criarApp, criarCenario, daquiA, limparBanco, prisma } from "./ajuda.js";

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

/** Pede a área de `de` a `ate` horas a partir de agora. */
const pedir = (token: string, de: number, ate: number) =>
  chamar(app, "POST", "/reservas", { token, corpo: { areaId: c.area.id, inicio: daquiA(de), fim: daquiA(ate) } });

describe("pedido de reserva", () => {
  it("nasce pendente", async () => {
    const r = await pedir(c.tokens.morador, 24, 28);
    expect(r.status).toBe(201);
    expect(r.corpo.status).toBe("PENDENTE");
  });

  it("recusa horário no passado e fim antes do início", async () => {
    expect((await pedir(c.tokens.morador, -5, -1)).status).toBe(400);
    expect((await pedir(c.tokens.morador, 28, 24)).status).toBe(400);
  });

  it.each([
    ["mesmo horário", 24, 28],
    ["começa no meio", 26, 30],
    ["termina no meio", 22, 25],
    ["engloba", 23, 29],
  ])("um pedido pendente já segura o horário (%s)", async (_, de, ate) => {
    await pedir(c.tokens.morador, 24, 28);
    expect((await pedir(c.tokens.vizinho, de, ate)).status).toBe(409);
  });

  it("horários encostados não conflitam (um termina quando o outro começa)", async () => {
    await pedir(c.tokens.morador, 24, 28);
    expect((await pedir(c.tokens.vizinho, 28, 30)).status).toBe(201);
  });

  it("requisições simultâneas para o mesmo horário: apenas uma é aceita", async () => {
    // Dispara dois pedidos exatamente ao mesmo tempo para exercitar o advisory lock.
    const resultados = await Promise.all([
      pedir(c.tokens.morador, 24, 28),
      pedir(c.tokens.vizinho, 24, 28),
    ]);
    const aceitas = resultados.filter((r) => r.status === 201);
    const recusadas = resultados.filter((r) => r.status === 409);
    expect(aceitas).toHaveLength(1);
    expect(recusadas).toHaveLength(1);
  });
});

describe("aprovação pelo síndico", () => {
  it("aprovar confirma; não dá para analisar duas vezes", async () => {
    const { corpo: reserva } = await pedir(c.tokens.morador, 24, 28);
    const aprovada = await chamar(app, "PATCH", `/reservas/${reserva.id}/aprovar`, { token: c.tokens.sindico });
    expect(aprovada.corpo.status).toBe("CONFIRMADA");
    expect(aprovada.corpo.decididaEm).toEqual(expect.any(String));
    expect((await chamar(app, "PATCH", `/reservas/${reserva.id}/recusar`, { token: c.tokens.sindico })).status).toBe(409);
  });

  it("recusar guarda o motivo e libera o horário", async () => {
    const { corpo: reserva } = await pedir(c.tokens.morador, 24, 28);
    const recusada = await chamar(app, "PATCH", `/reservas/${reserva.id}/recusar`, { token: c.tokens.sindico, corpo: { motivo: "Manutenção" } });
    expect(recusada.corpo).toMatchObject({ status: "RECUSADA", motivoRecusa: "Manutenção" });
    expect((await pedir(c.tokens.vizinho, 24, 28)).status).toBe(201);
  });

  it("só o síndico aprova", async () => {
    const { corpo: reserva } = await pedir(c.tokens.morador, 24, 28);
    expect((await chamar(app, "PATCH", `/reservas/${reserva.id}/aprovar`, { token: c.tokens.morador })).status).toBe(403);
    expect((await chamar(app, "PATCH", `/reservas/${reserva.id}/aprovar`, { token: c.tokens.porteiro })).status).toBe(403);
  });
});

describe("cancelamento e consulta", () => {
  it("morador cancela as próprias; não as do vizinho; recusadas não se cancelam", async () => {
    const { corpo: minha } = await pedir(c.tokens.morador, 24, 28);
    expect((await chamar(app, "PATCH", `/reservas/${minha.id}/cancelar`, { token: c.tokens.vizinho })).status).toBe(403);
    expect((await chamar(app, "PATCH", `/reservas/${minha.id}/cancelar`, { token: c.tokens.morador })).corpo.status).toBe("CANCELADA");

    const { corpo: outra } = await pedir(c.tokens.morador, 48, 50);
    await chamar(app, "PATCH", `/reservas/${outra.id}/recusar`, { token: c.tokens.sindico });
    expect((await chamar(app, "PATCH", `/reservas/${outra.id}/cancelar`, { token: c.tokens.morador })).status).toBe(409);
  });

  it("/reservas/minhas traz pendentes, confirmadas e recusadas da unidade, sem canceladas", async () => {
    const { corpo: pendente } = await pedir(c.tokens.morador, 24, 26);
    const { corpo: aprovar } = await pedir(c.tokens.morador, 30, 32);
    const { corpo: recusar } = await pedir(c.tokens.morador, 36, 38);
    const { corpo: cancelar } = await pedir(c.tokens.morador, 42, 44);
    await pedir(c.tokens.vizinho, 48, 50);
    await chamar(app, "PATCH", `/reservas/${aprovar.id}/aprovar`, { token: c.tokens.sindico });
    await chamar(app, "PATCH", `/reservas/${recusar.id}/recusar`, { token: c.tokens.sindico });
    await chamar(app, "PATCH", `/reservas/${cancelar.id}/cancelar`, { token: c.tokens.morador });

    const minhas = await chamar(app, "GET", "/reservas/minhas", { token: c.tokens.morador });
    expect(minhas.corpo.map((r: { id: string; status: string }) => [r.id, r.status])).toEqual([
      [pendente.id, "PENDENTE"],
      [aprovar.id, "CONFIRMADA"],
      [recusar.id, "RECUSADA"],
    ]);
  });

  it("a disponibilidade (GET /reservas) considera pendentes e confirmadas", async () => {
    await pedir(c.tokens.morador, 24, 26);
    const { corpo: recusada } = await pedir(c.tokens.morador, 30, 32);
    await chamar(app, "PATCH", `/reservas/${recusada.id}/recusar`, { token: c.tokens.sindico });
    const ocupadas = await chamar(app, "GET", `/reservas?areaId=${c.area.id}`, { token: c.tokens.vizinho });
    expect(ocupadas.corpo.map((r: { status: string }) => r.status)).toEqual(["PENDENTE"]);
  });

  it("GET /reservas com filtro status=PENDENTE traz só as pendentes do condomínio", async () => {
    const { corpo: r1 } = await pedir(c.tokens.morador, 24, 26);
    const { corpo: r2 } = await pedir(c.tokens.morador, 30, 32);
    await chamar(app, "PATCH", `/reservas/${r2.id}/aprovar`, { token: c.tokens.sindico });
    const pendentes = await chamar(app, "GET", `/reservas?status=PENDENTE&areaId=${c.area.id}`, { token: c.tokens.sindico });
    expect(pendentes.corpo.map((r: { id: string }) => r.id)).toEqual([r1.id]);
  });

  it("síndico cancela qualquer reserva confirmada do condomínio", async () => {
    const { corpo: r } = await pedir(c.tokens.vizinho, 24, 26);
    await chamar(app, "PATCH", `/reservas/${r.id}/aprovar`, { token: c.tokens.sindico });
    const cancelada = await chamar(app, "PATCH", `/reservas/${r.id}/cancelar`, { token: c.tokens.sindico });
    expect(cancelada.corpo.status).toBe("CANCELADA");
  });
});
