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

const inicioDoDia = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
};
const contadores = (token: string) => chamar(app, "GET", `/contadores?inicioDoDia=${inicioDoDia()}`, { token });

const amanha = () => new Date(new Date(inicioDoDia()).getTime() + 36 * 60 * 60 * 1000);

describe("contadores das abas", () => {
  it("morador: só as encomendas aguardando retirada da própria unidade", async () => {
    const registrar = (unidadeId: string) =>
      chamar(app, "POST", "/encomendas", { token: c.tokens.porteiro, corpo: { unidadeId, descricao: "Caixa" } });
    const { corpo: retirada } = await registrar(c.unidades.a101.id);
    await registrar(c.unidades.a101.id);
    await registrar(c.unidades.b201.id);
    await chamar(app, "PATCH", `/encomendas/${retirada.id}/retirada`, { token: c.tokens.porteiro, corpo: { retiradaPor: "Morador A" } });

    const r = await contadores(c.tokens.morador);
    expect(r.status).toBe(200);
    expect(r.corpo).toEqual({ encomendas: 1, visitasEsperadas: 0, reservasPendentes: 0, chatNaoLidas: 0 });
  });

  it("portaria: visitantes de hoje ou sem data, não os de outro dia nem os já finalizados", async () => {
    const base = { unidadeId: c.unidades.a101.id };
    await prisma.visita.createMany({
      data: [
        { ...base, nomeVisitante: "Sem data" },
        { ...base, nomeVisitante: "Hoje", dataPrevista: new Date() },
        { ...base, nomeVisitante: "Amanhã", dataPrevista: amanha() },
        { ...base, nomeVisitante: "Já saiu", status: "FINALIZADA" },
      ],
    });
    const r = await contadores(c.tokens.porteiro);
    expect(r.corpo).toEqual({ encomendas: 0, visitasEsperadas: 2, reservasPendentes: 0, chatNaoLidas: 0 });
  });

  it("o síndico tem os números de morador: as encomendas da própria unidade, e nada de reservas pendentes", async () => {
    // Uma encomenda para a unidade do síndico e outra para a de um vizinho: ele conta só a dele.
    await prisma.encomenda.createMany({
      data: [
        { descricao: "Do síndico", unidadeId: c.unidades.s100.id, recebidaPorId: c.usuarios.porteiro.id },
        { descricao: "Do vizinho", unidadeId: c.unidades.b201.id, recebidaPorId: c.usuarios.porteiro.id },
      ],
    });
    // Uma reserva antiga ainda PENDENTE não vira número: ninguém aprova mais.
    const inicio = new Date(Date.now() + 48 * 60 * 60 * 1000);
    await prisma.reserva.create({
      data: { areaId: c.area.id, unidadeId: c.unidades.a101.id, usuarioId: c.usuarios.morador.id, inicio, fim: new Date(inicio.getTime() + 60 * 60 * 1000), status: "PENDENTE" },
    });
    const r = await contadores(c.tokens.sindico);
    expect(r.corpo).toEqual({ encomendas: 1, visitasEsperadas: 0, reservasPendentes: 0, chatNaoLidas: 0 });
    expect((await contadores(c.tokens.porteiro)).corpo.reservasPendentes).toBe(0);
  });

  it("exige login e o início do dia", async () => {
    expect((await chamar(app, "GET", `/contadores?inicioDoDia=${inicioDoDia()}`)).status).toBe(401);
    expect((await chamar(app, "GET", "/contadores", { token: c.tokens.morador })).status).toBe(400);
  });
});
