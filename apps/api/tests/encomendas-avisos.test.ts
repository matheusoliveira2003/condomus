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

const registrar = (unidadeId: string, descricao = "Caixa") =>
  chamar(app, "POST", "/encomendas", { token: c.tokens.porteiro, corpo: { unidadeId, descricao } });

describe("encomendas", () => {
  it("portaria registra, morador vê só as da unidade, portaria registra a retirada", async () => {
    const { corpo: minha } = await registrar(c.unidades.a101.id, "Minha caixa");
    await registrar(c.unidades.b201.id, "Caixa do vizinho");

    const doMorador = await chamar(app, "GET", "/encomendas", { token: c.tokens.morador });
    expect(doMorador.corpo.itens.map((e: { descricao: string }) => e.descricao)).toEqual(["Minha caixa"]);

    const retirada = await chamar(app, "PATCH", `/encomendas/${minha.id}/retirada`, { token: c.tokens.porteiro, corpo: { retiradaPor: "Morador A" } });
    expect(retirada.corpo).toMatchObject({ status: "RETIRADA", retiradaPor: "Morador A" });
    expect((await chamar(app, "PATCH", `/encomendas/${minha.id}/retirada`, { token: c.tokens.porteiro, corpo: { retiradaPor: "X Y" } })).status).toBe(409);
  });

  it("filtra por status", async () => {
    const { corpo: e1 } = await registrar(c.unidades.a101.id, "Retirada");
    await registrar(c.unidades.a101.id, "Na portaria");
    await chamar(app, "PATCH", `/encomendas/${e1.id}/retirada`, { token: c.tokens.porteiro, corpo: { retiradaPor: "Morador A" } });
    const naPortaria = await chamar(app, "GET", "/encomendas?status=AGUARDANDO_RETIRADA", { token: c.tokens.morador });
    expect(naPortaria.corpo.itens.map((e: { descricao: string }) => e.descricao)).toEqual(["Na portaria"]);
  });

  it("porteiro vê os moradores da unidade para reconhecer quem retira", async () => {
    const r = await chamar(app, "GET", `/unidades/${c.unidades.a101.id}/moradores`, { token: c.tokens.porteiro });
    expect(r.corpo).toEqual([{ id: c.usuarios.morador.id, nome: "Morador A", fotoAtualizadaEm: null }]);
  });
});

describe("avisos", () => {
  it("síndico publica e remove; fixados aparecem primeiro", async () => {
    await chamar(app, "POST", "/avisos", { token: c.tokens.sindico, corpo: { titulo: "Comum", conteudo: "..." } });
    const { corpo: fixado } = await chamar(app, "POST", "/avisos", { token: c.tokens.sindico, corpo: { titulo: "Fixado", conteudo: "...", fixado: true } });
    await chamar(app, "POST", "/avisos", { token: c.tokens.sindico, corpo: { titulo: "Mais novo", conteudo: "..." } });

    const lista = await chamar(app, "GET", "/avisos", { token: c.tokens.morador });
    expect(lista.corpo.itens.map((a: { titulo: string }) => a.titulo)).toEqual(["Fixado", "Mais novo", "Comum"]);

    expect((await chamar(app, "DELETE", `/avisos/${fixado.id}`, { token: c.tokens.sindico })).status).toBe(204);
    expect((await chamar(app, "DELETE", `/avisos/${fixado.id}`, { token: c.tokens.sindico })).status).toBe(404);
  });
});

describe("resumo do Início", () => {
  it("junta encomendas, visitantes, próxima reserva e os 3 avisos mais recentes da unidade", async () => {
    await registrar(c.unidades.a101.id, "Minha caixa");
    await registrar(c.unidades.b201.id, "Do vizinho");
    await chamar(app, "POST", "/visitas", { token: c.tokens.morador, corpo: { nomeVisitante: "Esperado" } });
    for (const titulo of ["1", "2", "3", "4"]) await chamar(app, "POST", "/avisos", { token: c.tokens.sindico, corpo: { titulo: `Aviso ${titulo}`, conteudo: "..." } });

    const inicioDoDia = new Date();
    inicioDoDia.setHours(0, 0, 0, 0);
    const r = await chamar(app, "GET", `/resumo?inicioDoDia=${inicioDoDia.toISOString()}`, { token: c.tokens.morador });
    expect(r.corpo.unidade.numero).toBe("101");
    expect(r.corpo.encomendas.total).toBe(1);
    expect(r.corpo.visitas.esperadasHoje.map((v: { nomeVisitante: string }) => v.nomeVisitante)).toEqual(["Esperado"]);
    expect(r.corpo.proximaReserva).toBeNull();
    expect(r.corpo.avisos).toHaveLength(3);
  });
});
