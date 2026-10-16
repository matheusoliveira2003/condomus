import bcrypt from "bcryptjs";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

export { prisma };

/** Apaga todos os dados (o esquema continua). Chamado antes de cada teste. */
export async function limparBanco() {
  // Trava de segurança: nunca apagar dados de um banco que não seja o de testes.
  const [{ current_database: nome }] = await prisma.$queryRawUnsafe<{ current_database: string }[]>("SELECT current_database()");
  if (!nome.endsWith("_teste")) throw new Error(`Recusando limpar o banco "${nome}": os testes só rodam em bancos *_teste`);
  await prisma.$executeRawUnsafe(
    `TRUNCATE "DispositivoPush", "Reserva", "Visita", "Encomenda", "Aviso", "Usuario", "Unidade", "AreaComum" RESTART IDENTITY CASCADE`,
  );
}

export const SENHA = "123456";

/**
 * Condomínio mínimo para os testes: duas unidades, um morador em cada,
 * um porteiro, um síndico e uma área comum.
 */
export async function criarCenario(app: FastifyInstance) {
  const senhaHash = await bcrypt.hash(SENHA, 4); // custo baixo: só para os testes serem rápidos
  const [a101, b201] = await Promise.all([
    prisma.unidade.create({ data: { bloco: "A", numero: "101" } }),
    prisma.unidade.create({ data: { bloco: "B", numero: "201" } }),
  ]);
  const criar = (nome: string, email: string, papel: "MORADOR" | "PORTEIRO" | "SINDICO", unidadeId: string | null = null) =>
    prisma.usuario.create({ data: { nome, email, papel, unidadeId, senhaHash } });
  const [morador, vizinho, porteiro, sindico] = await Promise.all([
    criar("Morador A", "morador@teste.dev", "MORADOR", a101.id),
    criar("Vizinho B", "vizinho@teste.dev", "MORADOR", b201.id),
    criar("Porteiro", "porteiro@teste.dev", "PORTEIRO"),
    criar("Síndico", "sindico@teste.dev", "SINDICO"),
  ]);
  const area = await prisma.areaComum.create({ data: { nome: "Salão de festas" } });

  const [tMorador, tVizinho, tPorteiro, tSindico] = await Promise.all(
    [morador, vizinho, porteiro, sindico].map((u) => entrar(app, u.email)),
  );
  return {
    unidades: { a101, b201 },
    area,
    usuarios: { morador, vizinho, porteiro, sindico },
    tokens: { morador: tMorador, vizinho: tVizinho, porteiro: tPorteiro, sindico: tSindico },
  };
}

export type Cenario = Awaited<ReturnType<typeof criarCenario>>;

export async function entrar(app: FastifyInstance, email: string, senha = SENHA) {
  const resposta = await app.inject({ method: "POST", url: "/auth/login", payload: { email, senha } });
  if (resposta.statusCode !== 200) throw new Error(`Login falhou para ${email}: ${resposta.body}`);
  return resposta.json().token as string;
}

/** Requisição à API sem rede (Fastify inject). Devolve status e corpo já interpretado. */
export async function chamar(
  app: FastifyInstance,
  metodo: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  url: string,
  { token, corpo }: { token?: string; corpo?: unknown } = {},
) {
  const resposta = await app.inject({
    method: metodo,
    url,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    ...(corpo !== undefined && { payload: corpo as object }),
  });
  const tipo = String(resposta.headers["content-type"] ?? "");
  return {
    status: resposta.statusCode,
    corpo: tipo.includes("application/json") ? resposta.json() : undefined,
    bytes: resposta.rawPayload,
    tipo,
  };
}

/** App pronto para os testes de um arquivo (sem logs). */
export async function criarApp() {
  const app = await buildApp({ logger: false });
  await app.ready();
  return app;
}

/** Uma data no futuro, em horas a partir de agora (reservas não podem ser no passado). */
export const daquiA = (horas: number) => new Date(Date.now() + horas * 60 * 60 * 1000).toISOString();
