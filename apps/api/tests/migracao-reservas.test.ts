import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { readFileSync } from "node:fs";
import { type Cenario, criarApp, criarCenario, limparBanco, prisma } from "./ajuda.js";

/**
 * A migration `reservas_automaticas` resolve, uma única vez, as reservas que ficaram PENDENTES quando o síndico aprovava.
 * O teste lê o SQL real da migration e o executa sobre dados fabricados, para a regra não mudar sem ninguém ver.
 */
const SQL = readFileSync(new URL("../prisma/migrations/20261127000000_reservas_automaticas/migration.sql", import.meta.url), "utf8");
// O Prisma executa um comando por chamada (o `migrate deploy` roda o arquivo inteiro): o UPDATE e o bloco DO vão em sequência.
const COMANDOS = SQL.replace(/^--.*$/gm, "").split(/(?=^DO \$\$)/m).map((c) => c.trim()).filter(Boolean);
async function executar() {
  for (const comando of COMANDOS) await prisma.$executeRawUnsafe(comando);
}

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
const em = (dias: number, hora: number) => new Date(Date.now() + dias * DIA + hora * 60 * 60 * 1000);

async function reserva(
  status: "PENDENTE" | "CONFIRMADA",
  inicio: Date,
  horas: number,
  criadoEm: Date,
  { areaId = c.area.id, unidadeId = c.unidades.a101.id, usuarioId = c.usuarios.morador.id } = {},
) {
  return prisma.reserva.create({
    data: { status, inicio, fim: new Date(inicio.getTime() + horas * 60 * 60 * 1000), criadoEm, areaId, unidadeId, usuarioId },
  });
}
const situacao = async (id: string) => (await prisma.reserva.findUniqueOrThrow({ where: { id } })).status;

describe("migração das reservas pendentes", () => {
  it("confirma a pendente futura sem conflito e cancela a que já passou", async () => {
    const livre = await reserva("PENDENTE", em(10, 14), 2, em(-3, 0));
    const passada = await reserva("PENDENTE", em(-3, 10), 2, em(-8, 0));
    await executar();
    expect(await situacao(livre.id)).toBe("CONFIRMADA");
    expect(await situacao(passada.id)).toBe("CANCELADA");
  });

  it("cancela a pendente que conflita com uma confirmada, e mantém a confirmada", async () => {
    const confirmada = await reserva("CONFIRMADA", em(10, 10), 2, em(-5, 0));
    const conflitante = await reserva("PENDENTE", em(10, 11), 2, em(-4, 0), { unidadeId: c.unidades.b201.id, usuarioId: c.usuarios.vizinho.id });
    await executar();
    expect(await situacao(confirmada.id)).toBe("CONFIRMADA");
    expect(await situacao(conflitante.id)).toBe("CANCELADA");
  });

  it("reservas de outra área não conflitam entre si", async () => {
    const quadra = await prisma.areaComum.create({ data: { nome: "Quadra", condominioId: c.condominio.id } });
    await reserva("CONFIRMADA", em(10, 10), 2, em(-5, 0));
    const naOutraArea = await reserva("PENDENTE", em(10, 10), 2, em(-4, 0), { areaId: quadra.id });
    await executar();
    expect(await situacao(naOutraArea.id)).toBe("CONFIRMADA");
  });

  it("não deixa nenhuma reserva pendente, e rodar de novo não muda nada", async () => {
    await reserva("PENDENTE", em(10, 14), 2, em(-3, 0));
    await reserva("PENDENTE", em(11, 14), 2, em(-2, 0));
    await reserva("PENDENTE", em(-2, 14), 2, em(-9, 0));
    await executar();
    expect(await prisma.reserva.count({ where: { status: "PENDENTE" } })).toBe(0);
    const antes = await prisma.reserva.findMany({ orderBy: { id: "asc" }, select: { id: true, status: true } });
    await executar();
    expect(await prisma.reserva.findMany({ orderBy: { id: "asc" }, select: { id: true, status: true } })).toEqual(antes);
  });
});
