import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { type Cenario, chamar, criarApp, criarCenario, limparBanco, prisma } from "./ajuda.js";
import { antesDoDia, cancelarVisitasVencidas, inicioDoDia, venceEm, venceu } from "../src/lib/validadeVisita.js";

const HORA = 60 * 60 * 1000;
const DIA = 24 * HORA;

describe("validade do convite (funções puras, fuso de Brasília)", () => {
  // O app manda "hoje" como meia-noite local; em Brasília (UTC-3) isso chega como 03:00Z.
  const diaPrevisto = new Date("2026-11-20T03:00:00Z");

  it("o dia começa à meia-noite de Brasília, não de UTC", () => {
    expect(inicioDoDia(new Date("2026-11-20T02:59:00Z")).toISOString()).toBe("2026-11-19T03:00:00.000Z");
    expect(inicioDoDia(new Date("2026-11-20T03:00:00Z")).toISOString()).toBe("2026-11-20T03:00:00.000Z");
    expect(inicioDoDia(new Date("2026-11-21T02:59:59Z")).toISOString()).toBe("2026-11-20T03:00:00.000Z");
  });

  it("com data, vale do começo ao fim do dia previsto e vence na meia-noite seguinte", () => {
    const v = { dataPrevista: diaPrevisto, criadoEm: new Date("2026-11-10T12:00:00Z") };
    expect(venceEm(v).toISOString()).toBe("2026-11-21T03:00:00.000Z");
    expect(venceu(v, new Date("2026-11-21T02:59:59Z"))).toBe(false);
    expect(venceu(v, new Date("2026-11-21T03:00:00Z"))).toBe(true);
    expect(antesDoDia(v, new Date("2026-11-20T02:59:59Z"))).toBe(true);
    expect(antesDoDia(v, new Date("2026-11-20T03:00:00Z"))).toBe(false);
  });

  it("sem data, vale 30 dias a partir do agendamento", () => {
    const criadoEm = new Date("2026-11-01T12:00:00Z");
    const v = { dataPrevista: null, criadoEm };
    expect(venceu(v, new Date(criadoEm.getTime() + 30 * DIA - 1))).toBe(false);
    expect(venceu(v, new Date(criadoEm.getTime() + 30 * DIA))).toBe(true);
    expect(antesDoDia(v, criadoEm)).toBe(false);
  });
});

describe("convites que vencem, pela API", () => {
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

  const agendada = (extra: Record<string, unknown> = {}) =>
    prisma.visita.create({
      data: { nomeVisitante: "Visitante", documento: "11122233344", unidadeId: c.unidades.a101.id, ...extra },
    });
  const entrar = (id: string) => chamar(app, "PATCH", `/visitas/${id}/entrada`, { token: c.tokens.porteiro, corpo: {} });
  const hoje0h = () => inicioDoDia(new Date());

  it("o morador não agenda para um dia que já passou, mas agenda para hoje", async () => {
    const agendar = (dataPrevista: Date) =>
      chamar(app, "POST", "/visitas", {
        token: c.tokens.morador,
        corpo: { nomeVisitante: "Ana", documento: "12345678", dataPrevista: dataPrevista.toISOString() },
      });
    expect((await agendar(new Date(hoje0h().getTime() - DIA))).status).toBe(400);
    expect((await agendar(hoje0h())).status).toBe(201);
    expect((await agendar(new Date(hoje0h().getTime() + DIA))).status).toBe(201);
  });

  it("recusa a entrada de convite vencido e de convite para outro dia", async () => {
    const ontem = await agendada({ dataPrevista: new Date(hoje0h().getTime() - DIA) });
    const amanha = await agendada({ dataPrevista: new Date(hoje0h().getTime() + DIA) });
    const velhoSemData = await agendada({ criadoEm: new Date(Date.now() - 31 * DIA) });
    const r1 = await entrar(ontem.id);
    expect(r1.status).toBe(409);
    expect(r1.corpo.erro).toMatch(/venceu/);
    const r2 = await entrar(amanha.id);
    expect(r2.status).toBe(409);
    expect(r2.corpo.erro).toMatch(/só vale a partir de/);
    expect((await entrar(velhoSemData.id)).status).toBe(409);
  });

  it("aceita a entrada no dia previsto e de convite sem data recente", async () => {
    const hoje = await agendada({ dataPrevista: hoje0h() });
    const semData = await agendada();
    expect((await entrar(hoje.id)).status).toBe(200);
    expect((await entrar(semData.id)).status).toBe(200);
  });

  it("a lista de esperados e o contador ignoram o convite vencido, antes mesmo da limpeza", async () => {
    await agendada({ dataPrevista: new Date(hoje0h().getTime() - DIA) });
    await agendada({ criadoEm: new Date(Date.now() - 31 * DIA) });
    const valido = await agendada();
    const lista = await chamar(app, "GET", "/visitas?status=AGENDADA", { token: c.tokens.porteiro });
    expect(lista.corpo.itens.map((v: { id: string }) => v.id)).toEqual([valido.id]);
    const contadores = await chamar(app, "GET", `/contadores?inicioDoDia=${hoje0h().toISOString()}`, { token: c.tokens.porteiro });
    expect(contadores.corpo.visitasEsperadas).toBe(1);
  });

  it("a limpeza cancela só as vencidas", async () => {
    const vencida = await agendada({ dataPrevista: new Date(hoje0h().getTime() - DIA) });
    const vencidaSemData = await agendada({ criadoEm: new Date(Date.now() - 31 * DIA) });
    const valida = await agendada();
    const emAndamento = await agendada({ status: "EM_ANDAMENTO", dataPrevista: new Date(hoje0h().getTime() - 5 * DIA) });
    expect(await cancelarVisitasVencidas()).toBe(2);
    const status = async (id: string) => (await prisma.visita.findUniqueOrThrow({ where: { id } })).status;
    expect(await status(vencida.id)).toBe("CANCELADA");
    expect(await status(vencidaSemData.id)).toBe("CANCELADA");
    expect(await status(valida.id)).toBe("AGENDADA");
    expect(await status(emAndamento.id)).toBe("EM_ANDAMENTO");
  });

  it("marca como 'sem saída' quem entrou há mais de 24 h, sem mudar o status", async () => {
    const velho = await agendada({ status: "EM_ANDAMENTO", entradaEm: new Date(Date.now() - 25 * HORA) });
    const recente = await agendada({ status: "EM_ANDAMENTO", entradaEm: new Date(Date.now() - 2 * HORA) });
    const r = await chamar(app, "GET", "/visitas?status=EM_ANDAMENTO", { token: c.tokens.porteiro });
    const porId = Object.fromEntries(r.corpo.itens.map((v: { id: string; semSaida: boolean; status: string }) => [v.id, v]));
    expect(porId[velho.id]).toMatchObject({ semSaida: true, status: "EM_ANDAMENTO" });
    expect(porId[recente.id]).toMatchObject({ semSaida: false, status: "EM_ANDAMENTO" });
  });
});
