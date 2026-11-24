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
    `TRUNCATE "Administrador", "LeituraChat", "MensagemChat", "VisitanteOculto", "RostoVisitante", "DispositivoPush", "Reserva", "Visita", "Encomenda", "Aviso", "Usuario", "ConviteUnidade", "Unidade", "AreaComum", "Condominio" RESTART IDENTITY CASCADE`,
  );
}

export const SENHA = "123456";

/** Segredo das rotas /admin/*, igual ao definido em vitest.config.ts. */
export const ADMIN_SECRET = "segredo-admin-dos-testes";

/**
 * Condomínio mínimo para os testes: duas unidades, um morador em cada,
 * um porteiro, um síndico e uma área comum.
 */
export async function criarCenario(app: FastifyInstance) {
  const senhaHash = await bcrypt.hash(SENHA, 4); // custo baixo: só para os testes serem rápidos
  const condominio = await prisma.condominio.create({ data: { nome: "Condomínio Teste", planoStatus: "ATIVO" } });
  const condominioId = condominio.id;
  const [a101, b201] = await Promise.all([
    prisma.unidade.create({ data: { bloco: "A", numero: "101", condominioId } }),
    prisma.unidade.create({ data: { bloco: "B", numero: "201", condominioId } }),
  ]);
  const criar = (nome: string, email: string, papel: "MORADOR" | "PORTEIRO" | "SINDICO", unidadeId: string | null = null) =>
    prisma.usuario.create({ data: { nome, email, papel, unidadeId, senhaHash, condominioId } });
  const [morador, vizinho, porteiro, sindico] = await Promise.all([
    criar("Morador A", "morador@teste.dev", "MORADOR", a101.id),
    criar("Vizinho B", "vizinho@teste.dev", "MORADOR", b201.id),
    criar("Porteiro", "porteiro@teste.dev", "PORTEIRO"),
    criar("Síndico", "sindico@teste.dev", "SINDICO"),
  ]);
  const area = await prisma.areaComum.create({ data: { nome: "Salão de festas", condominioId } });

  const [tMorador, tVizinho, tPorteiro, tSindico] = await Promise.all(
    [morador, vizinho, porteiro, sindico].map((u) => entrar(app, u.email)),
  );
  return {
    condominio,
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
export async function criarApp({ limites = false }: { limites?: boolean } = {}) {
  // Sem limite de tentativas por padrão: os testes fazem login do mesmo IP o tempo todo.
  const app = await buildApp({ logger: false, limites });
  await app.ready();
  return app;
}

/** Uma data no futuro, em horas a partir de agora (reservas não podem ser no passado). */
export const daquiA = (horas: number) => new Date(Date.now() + horas * 60 * 60 * 1000).toISOString();

/**
 * Horário de reserva válido: `dias` dias à frente, de `de`h a `ate`h (horas cheias de Brasília, dentro do
 * funcionamento). Ao contrário de daquiA, não muda com a hora em que o teste roda.
 */
export function reservaEm(dias: number, de: number, ate: number) {
  // Meia-noite de Brasília de hoje (UTC-3, sem horário de verão) + dias, depois a hora cheia.
  const agora = new Date();
  const hojeLocal = new Date(agora.getTime() - 3 * 3600_000);
  const meiaNoite = Date.UTC(hojeLocal.getUTCFullYear(), hojeLocal.getUTCMonth(), hojeLocal.getUTCDate()) + 3 * 3600_000;
  const em = (h: number) => new Date(meiaNoite + dias * 86_400_000 + h * 3600_000).toISOString();
  return { inicio: em(de), fim: em(ate) };
}
