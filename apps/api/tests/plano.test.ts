import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { type Cenario, chamar, criarApp, criarCenario, limparBanco, prisma } from "./ajuda.js";
import { DIAS_CARENCIA, deveAvisar, planoBloqueado, situacaoDoPlano } from "../src/lib/plano.js";

const DIA = 24 * 60 * 60 * 1000;
const expira = new Date("2026-12-01T12:00:00Z");
const quando = (diasDepoisDaData: number) => new Date(expira.getTime() + diasDepoisDaData * DIA);
const trial = { planoStatus: "TRIAL" as const, planoExpiraEm: expira };

describe("período de teste (funções puras, com o relógio injetado)", () => {
  it("longe da data: nada a fazer", () => {
    const s = situacaoDoPlano(trial, quando(-30));
    expect(s).toMatchObject({ status: "TRIAL", diasParaExpirar: 30, emCarencia: false });
    expect(deveAvisar(s)).toBe(false);
    expect(planoBloqueado(s)).toBe(false);
  });

  it("avisa o síndico a partir de 7 dias antes", () => {
    expect(deveAvisar(situacaoDoPlano(trial, quando(-8)))).toBe(false);
    expect(deveAvisar(situacaoDoPlano(trial, quando(-7)))).toBe(true);
    expect(deveAvisar(situacaoDoPlano(trial, quando(-1)))).toBe(true);
  });

  it("depois da data, há 3 dias de carência em que tudo funciona, e então bloqueia", () => {
    const logoDepois = situacaoDoPlano(trial, quando(0.5));
    expect(logoDepois).toMatchObject({ status: "TRIAL", emCarencia: true });
    expect(logoDepois.diasDeCarencia).toBe(3);
    expect(deveAvisar(logoDepois)).toBe(true);
    expect(planoBloqueado(logoDepois)).toBe(false);

    const ultimoDia = situacaoDoPlano(trial, new Date(quando(DIAS_CARENCIA).getTime() - 1));
    expect(ultimoDia).toMatchObject({ status: "TRIAL", emCarencia: true });
    expect(planoBloqueado(ultimoDia)).toBe(false);

    const fim = situacaoDoPlano(trial, quando(DIAS_CARENCIA));
    expect(fim.status).toBe("EXPIRADO");
    expect(planoBloqueado(fim)).toBe(true);
  });

  it("sem data, o teste não expira; plano ATIVO ou com data passada não é afetado", () => {
    expect(situacaoDoPlano({ planoStatus: "TRIAL", planoExpiraEm: null }, quando(999)).status).toBe("TRIAL");
    expect(situacaoDoPlano({ planoStatus: "ATIVO", planoExpiraEm: expira }, quando(999)).status).toBe("ATIVO");
    expect(situacaoDoPlano({ planoStatus: "SUSPENSO", planoExpiraEm: null }, quando(0))).toMatchObject({ status: "SUSPENSO" });
    expect(planoBloqueado(situacaoDoPlano({ planoStatus: "SUSPENSO", planoExpiraEm: null }))).toBe(true);
  });
});

describe("período de teste, pela API", () => {
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
  const meu = (token: string) => chamar(app, "GET", "/condominios/meu", { token });
  const definir = (planoStatus: "TRIAL" | "ATIVO", diasDepoisDaData: number | null) =>
    prisma.condominio.update({
      where: { id: c.condominio.id },
      // A data é fixada em relação a agora: (agora - diasDepoisDaData).
      data: { planoStatus, planoExpiraEm: diasDepoisDaData === null ? null : new Date(Date.now() - diasDepoisDaData * DIA) },
    });

  it("teste ainda dentro do prazo: todos entram e o síndico é avisado perto do fim", async () => {
    await definir("TRIAL", -5);
    for (const token of [c.tokens.morador, c.tokens.porteiro]) expect((await meu(token)).status).toBe(200);
    const r = await meu(c.tokens.sindico);
    expect(r.corpo).toMatchObject({ planoStatus: "TRIAL", avisarVencimento: true, emCarencia: false });
    expect(r.corpo.diasParaExpirar).toBe(5);
  });

  it("na carência todos ainda entram, com o aviso", async () => {
    await definir("TRIAL", 1);
    expect((await meu(c.tokens.morador)).status).toBe(200);
    expect((await meu(c.tokens.sindico)).corpo).toMatchObject({ emCarencia: true, avisarVencimento: true, planoStatus: "TRIAL" });
  });

  it("depois da carência morador e porteiro recebem 402, e o síndico continua entrando vendo EXPIRADO", async () => {
    await definir("TRIAL", 4);
    expect((await meu(c.tokens.morador)).status).toBe(402);
    expect((await meu(c.tokens.porteiro)).status).toBe(402);
    expect((await chamar(app, "GET", "/visitas", { token: c.tokens.porteiro })).status).toBe(402);
    const r = await meu(c.tokens.sindico);
    expect(r.status).toBe(200);
    expect(r.corpo.planoStatus).toBe("EXPIRADO");
  });

  it("converter para ATIVO desbloqueia, e teste sem data nunca expira", async () => {
    await definir("TRIAL", 10);
    expect((await meu(c.tokens.morador)).status).toBe(402);
    await definir("ATIVO", 10);
    expect((await meu(c.tokens.morador)).status).toBe(200);
    await definir("TRIAL", null);
    expect((await meu(c.tokens.morador)).status).toBe(200);
  });
});
