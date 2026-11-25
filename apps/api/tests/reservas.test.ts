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
  it("nasce confirmada, sem aprovação do síndico", async () => {
    const r = await pedir(c.tokens.morador, 1, 10, 14);
    expect(r.status).toBe(201);
    expect(r.corpo.status).toBe("CONFIRMADA");
    expect(r.corpo.decididaEm).toEqual(expect.any(String));
  });

  it("o síndico reserva como qualquer morador, pela própria unidade", async () => {
    const r = await pedir(c.tokens.sindico, 1, 10, 14);
    expect(r.status).toBe(201);
    expect(r.corpo).toMatchObject({ status: "CONFIRMADA", unidade: { id: c.unidades.s100.id } });
  });

  it("o porteiro não reserva", async () => {
    expect((await pedir(c.tokens.porteiro, 1, 10, 14)).status).toBe(403);
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
  ])("uma reserva confirmada segura o horário (%s)", async (_, de, ate) => {
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

describe("sem aprovação manual", () => {
  it("as rotas de aprovar e recusar não existem mais", async () => {
    const { corpo: reserva } = await pedir(c.tokens.morador, 1, 10, 14);
    for (const token of [c.tokens.sindico, c.tokens.morador, c.tokens.porteiro]) {
      expect((await chamar(app, "PATCH", `/reservas/${reserva.id}/aprovar`, { token })).status).toBe(404);
      expect((await chamar(app, "PATCH", `/reservas/${reserva.id}/recusar`, { token })).status).toBe(404);
    }
    expect((await prisma.reserva.findUniqueOrThrow({ where: { id: reserva.id } })).status).toBe("CONFIRMADA");
  });
});

describe("cancelamento e consulta", () => {
  it("morador cancela as próprias; não as do vizinho; cancelada não se cancela de novo", async () => {
    const { corpo: minha } = await pedir(c.tokens.morador, 1, 10, 14);
    expect((await chamar(app, "PATCH", `/reservas/${minha.id}/cancelar`, { token: c.tokens.vizinho })).status).toBe(403);
    expect((await chamar(app, "PATCH", `/reservas/${minha.id}/cancelar`, { token: c.tokens.morador })).corpo.status).toBe("CANCELADA");
    expect((await chamar(app, "PATCH", `/reservas/${minha.id}/cancelar`, { token: c.tokens.morador })).status).toBe(409);
  });

  it("o síndico cancela só as reservas da própria unidade, como qualquer morador", async () => {
    const { corpo: dele } = await pedir(c.tokens.sindico, 1, 10, 12);
    const { corpo: do_vizinho } = await pedir(c.tokens.vizinho, 2, 10, 12);
    expect((await chamar(app, "PATCH", `/reservas/${do_vizinho.id}/cancelar`, { token: c.tokens.sindico })).status).toBe(403);
    expect((await prisma.reserva.findUniqueOrThrow({ where: { id: do_vizinho.id } })).status).toBe("CONFIRMADA");
    expect((await chamar(app, "PATCH", `/reservas/${dele.id}/cancelar`, { token: c.tokens.sindico })).corpo.status).toBe("CANCELADA");
  });

  it("o porteiro não cancela reservas", async () => {
    const { corpo: r } = await pedir(c.tokens.morador, 1, 10, 12);
    expect((await chamar(app, "PATCH", `/reservas/${r.id}/cancelar`, { token: c.tokens.porteiro })).status).toBe(403);
  });

  it("/reservas/minhas traz as confirmadas e as pendentes antigas da unidade, sem canceladas", async () => {
    const { corpo: primeira } = await pedir(c.tokens.morador, 1, 10, 12);
    const { corpo: segunda } = await pedir(c.tokens.morador, 2, 10, 12);
    const { corpo: cancelar } = await pedir(c.tokens.morador, 4, 10, 12);
    await pedir(c.tokens.vizinho, 3, 10, 12);
    await chamar(app, "PATCH", `/reservas/${cancelar.id}/cancelar`, { token: c.tokens.morador });

    const minhas = await chamar(app, "GET", "/reservas/minhas", { token: c.tokens.morador });
    expect(minhas.corpo.map((r: { id: string; status: string }) => [r.id, r.status])).toEqual([
      [primeira.id, "CONFIRMADA"],
      [segunda.id, "CONFIRMADA"],
    ]);
  });

  it("a disponibilidade (GET /reservas) mostra só as que ocupam horário, de todas as unidades", async () => {
    await pedir(c.tokens.morador, 1, 10, 12);
    const { corpo: cancelada } = await pedir(c.tokens.morador, 2, 10, 12);
    await chamar(app, "PATCH", `/reservas/${cancelada.id}/cancelar`, { token: c.tokens.morador });
    const ocupadas = await chamar(app, "GET", `/reservas?areaId=${c.area.id}`, { token: c.tokens.vizinho });
    expect(ocupadas.corpo.map((r: { status: string }) => r.status)).toEqual(["CONFIRMADA"]);
  });

  it("uma reserva cancelada libera o horário para outro", async () => {
    const { corpo: r } = await pedir(c.tokens.morador, 1, 10, 14);
    await chamar(app, "PATCH", `/reservas/${r.id}/cancelar`, { token: c.tokens.morador });
    expect((await pedir(c.tokens.vizinho, 1, 10, 14)).status).toBe(201);
  });
});

describe("áreas comuns", () => {
  it("o cadastro saiu da API do condomínio: ninguém cria área pelo app", async () => {
    for (const token of [c.tokens.sindico, c.tokens.morador, c.tokens.porteiro]) {
      expect((await chamar(app, "POST", "/areas", { token, corpo: { nome: "Piscina" } })).status).toBe(404);
    }
    expect(await prisma.areaComum.count()).toBe(1);
  });

  it("todos veem a lista de áreas ativas", async () => {
    for (const token of [c.tokens.sindico, c.tokens.morador, c.tokens.porteiro]) {
      const lista = await chamar(app, "GET", "/areas", { token });
      expect(lista.corpo.map((a: { nome: string }) => a.nome)).toEqual(["Salão de festas"]);
    }
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

  it("uma unidade tem no máximo 3 reservas futuras na mesma área", async () => {
    for (const dia of [1, 2, 3]) expect((await pedir(c.tokens.morador, dia, 10, 12)).status).toBe(201);
    const quarta = await pedir(c.tokens.morador, 4, 10, 12);
    expect(quarta.status).toBe(409);
    expect(quarta.corpo.erro).toMatch(/máximo 3/);
    // Outra unidade não é afetada pelo limite da primeira.
    expect((await pedir(c.tokens.vizinho, 4, 10, 12)).status).toBe(201);
  });

  it("cancelar uma reserva libera espaço no limite", async () => {
    const r = [];
    for (const dia of [1, 2, 3]) r.push((await pedir(c.tokens.morador, dia, 10, 12)).corpo);
    await chamar(app, "PATCH", `/reservas/${r[0].id}/cancelar`, { token: c.tokens.morador });
    expect((await pedir(c.tokens.morador, 4, 10, 12)).status).toBe(201);
    expect((await pedir(c.tokens.morador, 5, 10, 12)).status).toBe(409);
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
