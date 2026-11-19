import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { type Cenario, chamar, criarApp, criarCenario, limparBanco, prisma, reservaEm } from "./ajuda.js";

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

/**
 * Pede a área no dia `dia` (1 = amanhã), de `de`h a `ate`h (horas cheias dentro do funcionamento,
 * 8h às 23h). Horário fixo, que não muda com a hora em que o teste roda.
 */
const pedir = (token: string, dia: number, de: number, ate: number, areaId = c.area.id) =>
  chamar(app, "POST", "/reservas", { token, corpo: { areaId, ...reservaEm(dia, de, ate) } });

describe("pedido de reserva", () => {
  it("nasce pendente", async () => {
    const r = await pedir(c.tokens.morador, 1, 10, 14);
    expect(r.status).toBe(201);
    expect(r.corpo.status).toBe("PENDENTE");
  });

  it("recusa horário no passado e fim antes do início", async () => {
    expect((await pedir(c.tokens.morador, -1, 10, 14)).status).toBe(400);
    expect((await pedir(c.tokens.morador, 1, 14, 10)).status).toBe(400);
  });

  it.each([
    ["mesmo horário", 10, 14],
    ["começa no meio", 12, 16],
    ["termina no meio", 8, 11],
    ["engloba", 9, 15],
  ])("um pedido pendente já segura o horário (%s)", async (_, de, ate) => {
    await pedir(c.tokens.morador, 1, 10, 14);
    expect((await pedir(c.tokens.vizinho, 1, de, ate)).status).toBe(409);
  });

  it("horários encostados não conflitam (um termina quando o outro começa)", async () => {
    await pedir(c.tokens.morador, 1, 10, 14);
    expect((await pedir(c.tokens.vizinho, 1, 14, 16)).status).toBe(201);
  });

  it("requisições simultâneas para o mesmo horário: apenas uma é aceita", async () => {
    // Dispara dois pedidos exatamente ao mesmo tempo para exercitar o advisory lock.
    const resultados = await Promise.all([
      pedir(c.tokens.morador, 1, 10, 14),
      pedir(c.tokens.vizinho, 1, 10, 14),
    ]);
    const aceitas = resultados.filter((r) => r.status === 201);
    const recusadas = resultados.filter((r) => r.status === 409);
    expect(aceitas).toHaveLength(1);
    expect(recusadas).toHaveLength(1);
  });
});

describe("aprovação pelo síndico", () => {
  it("aprovar confirma; não dá para analisar duas vezes", async () => {
    const { corpo: reserva } = await pedir(c.tokens.morador, 1, 10, 14);
    const aprovada = await chamar(app, "PATCH", `/reservas/${reserva.id}/aprovar`, { token: c.tokens.sindico });
    expect(aprovada.corpo.status).toBe("CONFIRMADA");
    expect(aprovada.corpo.decididaEm).toEqual(expect.any(String));
    expect((await chamar(app, "PATCH", `/reservas/${reserva.id}/recusar`, { token: c.tokens.sindico })).status).toBe(409);
  });

  it("recusar guarda o motivo e libera o horário", async () => {
    const { corpo: reserva } = await pedir(c.tokens.morador, 1, 10, 14);
    const recusada = await chamar(app, "PATCH", `/reservas/${reserva.id}/recusar`, { token: c.tokens.sindico, corpo: { motivo: "Manutenção" } });
    expect(recusada.corpo).toMatchObject({ status: "RECUSADA", motivoRecusa: "Manutenção" });
    expect((await pedir(c.tokens.vizinho, 1, 10, 14)).status).toBe(201);
  });

  it("só o síndico aprova", async () => {
    const { corpo: reserva } = await pedir(c.tokens.morador, 1, 10, 14);
    expect((await chamar(app, "PATCH", `/reservas/${reserva.id}/aprovar`, { token: c.tokens.morador })).status).toBe(403);
    expect((await chamar(app, "PATCH", `/reservas/${reserva.id}/aprovar`, { token: c.tokens.porteiro })).status).toBe(403);
  });
});

describe("cancelamento e consulta", () => {
  it("morador cancela as próprias; não as do vizinho; recusadas não se cancelam", async () => {
    const { corpo: minha } = await pedir(c.tokens.morador, 1, 10, 14);
    expect((await chamar(app, "PATCH", `/reservas/${minha.id}/cancelar`, { token: c.tokens.vizinho })).status).toBe(403);
    expect((await chamar(app, "PATCH", `/reservas/${minha.id}/cancelar`, { token: c.tokens.morador })).corpo.status).toBe("CANCELADA");

    const { corpo: outra } = await pedir(c.tokens.morador, 3, 10, 12);
    await chamar(app, "PATCH", `/reservas/${outra.id}/recusar`, { token: c.tokens.sindico });
    expect((await chamar(app, "PATCH", `/reservas/${outra.id}/cancelar`, { token: c.tokens.morador })).status).toBe(409);
  });

  it("/reservas/minhas traz pendentes, confirmadas e recusadas da unidade, sem canceladas", async () => {
    const { corpo: pendente } = await pedir(c.tokens.morador, 1, 10, 12);
    const { corpo: aprovar } = await pedir(c.tokens.morador, 2, 10, 12);
    const { corpo: recusar } = await pedir(c.tokens.morador, 4, 10, 12);
    const { corpo: cancelar } = await pedir(c.tokens.morador, 5, 10, 12);
    await pedir(c.tokens.vizinho, 3, 10, 12);
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
    await pedir(c.tokens.morador, 1, 10, 12);
    const { corpo: recusada } = await pedir(c.tokens.morador, 2, 10, 12);
    await chamar(app, "PATCH", `/reservas/${recusada.id}/recusar`, { token: c.tokens.sindico });
    const ocupadas = await chamar(app, "GET", `/reservas?areaId=${c.area.id}`, { token: c.tokens.vizinho });
    expect(ocupadas.corpo.map((r: { status: string }) => r.status)).toEqual(["PENDENTE"]);
  });

  it("GET /reservas com filtro status=PENDENTE traz só as pendentes do condomínio", async () => {
    const { corpo: r1 } = await pedir(c.tokens.morador, 1, 10, 12);
    const { corpo: r2 } = await pedir(c.tokens.morador, 2, 10, 12);
    await chamar(app, "PATCH", `/reservas/${r2.id}/aprovar`, { token: c.tokens.sindico });
    const pendentes = await chamar(app, "GET", `/reservas?status=PENDENTE&areaId=${c.area.id}`, { token: c.tokens.sindico });
    expect(pendentes.corpo.map((r: { id: string }) => r.id)).toEqual([r1.id]);
  });

  it("síndico cancela qualquer reserva confirmada do condomínio", async () => {
    const { corpo: r } = await pedir(c.tokens.vizinho, 1, 10, 12);
    await chamar(app, "PATCH", `/reservas/${r.id}/aprovar`, { token: c.tokens.sindico });
    const cancelada = await chamar(app, "PATCH", `/reservas/${r.id}/cancelar`, { token: c.tokens.sindico });
    expect(cancelada.corpo.status).toBe("CANCELADA");
  });
});

describe("cadastro de áreas", () => {
  it("só o síndico cria; a área aparece na lista de todos", async () => {
    const corpo = { nome: "Piscina", descricao: "Aberta das 8h às 20h", capacidade: 30 };
    for (const token of [c.tokens.morador, c.tokens.porteiro]) {
      expect((await chamar(app, "POST", "/areas", { token, corpo })).status).toBe(403);
    }
    const r = await chamar(app, "POST", "/areas", { token: c.tokens.sindico, corpo: { ...corpo, nome: "  Piscina " } });
    expect(r.status).toBe(201);
    expect(r.corpo).toMatchObject({ nome: "Piscina", descricao: "Aberta das 8h às 20h", capacidade: 30, ativa: true });

    const lista = await chamar(app, "GET", "/areas", { token: c.tokens.morador });
    expect(lista.corpo.map((a: { nome: string }) => a.nome)).toEqual(["Piscina", "Salão de festas"]);
  });

  it("recusa nome repetido e dados inválidos", async () => {
    const criar = (corpo: unknown) => chamar(app, "POST", "/areas", { token: c.tokens.sindico, corpo });
    expect((await criar({ nome: "Salão de festas" })).status).toBe(409);
    expect((await criar({ nome: "A" })).status).toBe(400);
    expect((await criar({ nome: "Sauna", capacidade: 0 })).status).toBe(400);
  });

  it("a área criada pode ser reservada pelo morador", async () => {
    const { corpo: area } = await chamar(app, "POST", "/areas", { token: c.tokens.sindico, corpo: { nome: "Quadra" } });
    const r = await chamar(app, "POST", "/reservas", {
      token: c.tokens.morador,
      corpo: { areaId: area.id, ...reservaEm(1, 10, 12) },
    });
    expect(r.status).toBe(201);
  });
});

describe("limites das reservas", () => {
  const esperar400 = async (dia: number, de: number, ate: number, texto: RegExp) => {
    const r = await pedir(c.tokens.morador, dia, de, ate);
    expect(r.status).toBe(400);
    expect(r.corpo.erro).toMatch(texto);
  };

  it("só aceita o horário de funcionamento (8h às 23h)", async () => {
    await esperar400(1, 6, 8, /funcionam das 8h às 23h/);
    await esperar400(1, 20, 24, /funcionam das 8h às 23h|mesmo dia/);
    expect((await pedir(c.tokens.morador, 1, 8, 10)).status).toBe(201);
    expect((await pedir(c.tokens.morador, 1, 21, 23)).status).toBe(201);
  });

  it("exige horas cheias", async () => {
    const r = await chamar(app, "POST", "/reservas", {
      token: c.tokens.morador,
      corpo: { areaId: c.area.id, ...(() => { const h = reservaEm(1, 10, 12); return { inicio: new Date(new Date(h.inicio).getTime() + 30 * 60_000).toISOString(), fim: h.fim }; })() },
    });
    expect(r.status).toBe(400);
    expect(r.corpo.erro).toMatch(/horas cheias/);
  });

  it("não deixa a reserva atravessar a meia-noite", async () => {
    const { inicio } = reservaEm(1, 22, 23);
    const { fim } = reservaEm(2, 1, 2);
    const r = await chamar(app, "POST", "/reservas", { token: c.tokens.morador, corpo: { areaId: c.area.id, inicio, fim } });
    expect(r.status).toBe(400);
  });

  it("duração máxima de 6 horas", async () => {
    expect((await pedir(c.tokens.morador, 1, 10, 16)).status).toBe(201);
    await esperar400(2, 9, 16, /no máximo 6 horas/);
  });

  it("antecedência máxima de 60 dias", async () => {
    expect((await pedir(c.tokens.morador, 59, 10, 12)).status).toBe(201);
    await esperar400(62, 10, 12, /60 dias/);
  });

  it("uma unidade tem no máximo 3 reservas pendentes ou futuras na mesma área", async () => {
    for (const dia of [1, 2, 3]) expect((await pedir(c.tokens.morador, dia, 10, 12)).status).toBe(201);
    const quarta = await pedir(c.tokens.morador, 4, 10, 12);
    expect(quarta.status).toBe(409);
    expect(quarta.corpo.erro).toMatch(/máximo 3/);
    // Outra unidade não é afetada pelo limite da primeira.
    expect((await pedir(c.tokens.vizinho, 4, 10, 12)).status).toBe(201);
  });

  it("cancelar ou ter uma recusada libera espaço no limite", async () => {
    const r = [];
    for (const dia of [1, 2, 3]) r.push((await pedir(c.tokens.morador, dia, 10, 12)).corpo);
    await chamar(app, "PATCH", `/reservas/${r[0].id}/cancelar`, { token: c.tokens.morador });
    await chamar(app, "PATCH", `/reservas/${r[1].id}/recusar`, { token: c.tokens.sindico });
    expect((await pedir(c.tokens.morador, 4, 10, 12)).status).toBe(201);
    expect((await pedir(c.tokens.morador, 5, 10, 12)).status).toBe(201);
    expect((await pedir(c.tokens.morador, 6, 10, 12)).status).toBe(409);
  });

  it("o limite vale por área: a mesma unidade pode ter 3 em outra área", async () => {
    const outra = await prisma.areaComum.create({ data: { nome: "Quadra", condominioId: c.condominio.id } });
    for (const dia of [1, 2, 3]) await pedir(c.tokens.morador, dia, 10, 12);
    expect((await pedir(c.tokens.morador, 1, 10, 12, outra.id)).status).toBe(201);
  });

  it("pedidos simultâneos não furam o limite", async () => {
    await pedir(c.tokens.morador, 1, 10, 12);
    await pedir(c.tokens.morador, 2, 10, 12);
    const resultados = await Promise.all([3, 4, 5].map((dia) => pedir(c.tokens.morador, dia, 10, 12)));
    expect(resultados.filter((r) => r.status === 201)).toHaveLength(1);
    expect(resultados.filter((r) => r.status === 409)).toHaveLength(2);
  });
});
