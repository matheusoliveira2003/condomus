import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { ADMIN_SECRET, type Cenario, SENHA, criarApp, criarCenario, entrar, limparBanco, prisma } from "./ajuda.js";

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

/** Requisição com cabeçalho de autorização arbitrário (admin ou usuário). */
async function chamar(metodo: "GET" | "POST" | "PATCH", url: string, { auth, corpo }: { auth?: string; corpo?: unknown } = {}) {
  const r = await app.inject({
    method: metodo,
    url,
    headers: auth ? { authorization: `Bearer ${auth}` } : {},
    ...(corpo !== undefined && { payload: corpo as object }),
  });
  return { status: r.statusCode, corpo: r.body ? (r.json() as Record<string, any>) : undefined };
}

const novoCondominio = {
  nome: "Residencial Aurora",
  cnpj: "12.345.678/0001-90",
  planoStatus: "TRIAL",
  sindico: { nome: "Síndica Aurora", email: "aurora@teste.dev" },
};

describe("POST /admin/condominios", () => {
  it("cria o condomínio e o primeiro síndico, sem expor o hash da senha", async () => {
    const r = await chamar("POST", "/admin/condominios", { auth: ADMIN_SECRET, corpo: novoCondominio });
    expect(r.status).toBe(201);
    expect(r.corpo!.condominio).toMatchObject({ nome: "Residencial Aurora", planoStatus: "TRIAL" });
    expect(r.corpo!.sindico).toMatchObject({ email: "aurora@teste.dev", papel: "SINDICO", condominioId: r.corpo!.condominio.id });
    expect(JSON.stringify(r.corpo)).not.toContain("senhaHash");
    // A API gera a senha automaticamente e a retorna em senhaGerada.
    await expect(entrar(app, "aurora@teste.dev", r.corpo!.senhaGerada)).resolves.toEqual(expect.any(String));
  });

  it("exige o segredo de administração", async () => {
    expect((await chamar("POST", "/admin/condominios", { corpo: novoCondominio })).status).toBe(401);
    expect((await chamar("POST", "/admin/condominios", { auth: "segredo-errado", corpo: novoCondominio })).status).toBe(401);
    // Token de síndico comum não serve como credencial de administração.
    expect((await chamar("POST", "/admin/condominios", { auth: c.tokens.sindico, corpo: novoCondominio })).status).toBe(401);
    expect(await prisma.condominio.count()).toBe(1);
  });

  it("e-mail do síndico já em uso: 409 e nenhum condomínio órfão", async () => {
    const r = await chamar("POST", "/admin/condominios", {
      auth: ADMIN_SECRET,
      corpo: { ...novoCondominio, sindico: { ...novoCondominio.sindico, email: "sindico@teste.dev" } },
    });
    expect(r.status).toBe(409);
    expect(await prisma.condominio.count()).toBe(1);
  });
});

describe("PATCH /admin/condominios/:id/plano", () => {
  it("altera o status e a validade do plano", async () => {
    const expira = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const r = await chamar("PATCH", `/admin/condominios/${c.condominio.id}/plano`, {
      auth: ADMIN_SECRET,
      corpo: { planoStatus: "ATIVO", planoExpiraEm: expira },
    });
    expect(r.status).toBe(200);
    expect(r.corpo).toMatchObject({ planoStatus: "ATIVO", planoExpiraEm: expira });
  });

  it("exige o segredo e valida o status", async () => {
    const url = `/admin/condominios/${c.condominio.id}/plano`;
    expect((await chamar("PATCH", url, { corpo: { planoStatus: "ATIVO" } })).status).toBe(401);
    expect((await chamar("PATCH", url, { auth: ADMIN_SECRET, corpo: { planoStatus: "QUALQUER" } })).status).toBe(400);
  });
});

describe("GET /condominios/meu", () => {
  it("qualquer perfil vê o próprio condomínio e o plano", async () => {
    for (const perfil of ["morador", "porteiro", "sindico"] as const) {
      const r = await chamar("GET", "/condominios/meu", { auth: c.tokens[perfil] });
      expect(r.status).toBe(200);
      expect(r.corpo).toEqual({ id: c.condominio.id, nome: "Condomínio Teste", planoStatus: "ATIVO", planoExpiraEm: null });
    }
  });
});

describe("enforcement do plano", () => {
  it.each(["EXPIRADO", "SUSPENSO"] as const)("plano %s: morador e porteiro recebem 402, síndico continua entrando", async (planoStatus) => {
    await prisma.condominio.update({ where: { id: c.condominio.id }, data: { planoStatus } });

    for (const perfil of ["morador", "porteiro"] as const) {
      const r = await chamar("GET", "/avisos", { auth: c.tokens[perfil] });
      expect(r.status).toBe(402);
      expect(r.corpo!.erro).toBe("Plano do condomínio inativo");
    }
    expect((await chamar("GET", "/avisos", { auth: c.tokens.sindico })).status).toBe(200);
    expect((await chamar("GET", "/condominios/meu", { auth: c.tokens.sindico })).corpo).toMatchObject({ planoStatus });
  });

  it("TRIAL e ATIVO funcionam normalmente", async () => {
    await prisma.condominio.update({ where: { id: c.condominio.id }, data: { planoStatus: "TRIAL" } });
    expect((await chamar("GET", "/avisos", { auth: c.tokens.morador })).status).toBe(200);
  });

  it("reativar o plano libera o acesso sem novo login", async () => {
    await prisma.condominio.update({ where: { id: c.condominio.id }, data: { planoStatus: "SUSPENSO" } });
    expect((await chamar("GET", "/avisos", { auth: c.tokens.morador })).status).toBe(402);
    await chamar("PATCH", `/admin/condominios/${c.condominio.id}/plano`, { auth: ADMIN_SECRET, corpo: { planoStatus: "ATIVO" } });
    expect((await chamar("GET", "/avisos", { auth: c.tokens.morador })).status).toBe(200);
  });
});

describe("isolamento entre condomínios", () => {
  /** Cria um segundo condomínio completo (síndico, unidade, morador, área e aviso) e devolve os tokens. */
  async function criarOutro() {
    const senhaHash = await bcrypt.hash(SENHA, 4);
    const condominio = await prisma.condominio.create({ data: { nome: "Outro Condomínio", planoStatus: "ATIVO" } });
    const condominioId = condominio.id;
    const unidade = await prisma.unidade.create({ data: { bloco: "A", numero: "101", condominioId } }); // mesmo bloco/número do cenário
    const sindico = await prisma.usuario.create({
      data: { nome: "Síndico Outro", email: "sindico2@teste.dev", papel: "SINDICO", senhaHash, condominioId },
    });
    const morador = await prisma.usuario.create({
      data: { nome: "Morador Outro", email: "morador2@teste.dev", papel: "MORADOR", senhaHash, condominioId, unidadeId: unidade.id },
    });
    const area = await prisma.areaComum.create({ data: { nome: "Salão de festas", condominioId } }); // mesmo nome do cenário
    const aviso = await prisma.aviso.create({ data: { titulo: "Aviso do outro", conteudo: "x", autorId: sindico.id, condominioId } });
    return {
      unidade,
      morador,
      area,
      aviso,
      tokens: { sindico: await entrar(app, sindico.email), morador: await entrar(app, morador.email) },
    };
  }

  it("unidade e área comum podem repetir bloco/número e nome em condomínios diferentes", async () => {
    await expect(criarOutro()).resolves.toBeDefined();
  });

  it("listas só trazem dados do próprio condomínio", async () => {
    const o = await criarOutro();
    await prisma.aviso.create({ data: { titulo: "Aviso daqui", conteudo: "y", autorId: c.usuarios.sindico.id, condominioId: c.condominio.id } });

    const avisos = await chamar("GET", "/avisos", { auth: c.tokens.sindico });
    expect(avisos.corpo!.itens.map((a: { titulo: string }) => a.titulo)).toEqual(["Aviso daqui"]);

    const unidades = await chamar("GET", "/unidades", { auth: c.tokens.sindico });
    expect(unidades.corpo).toHaveLength(2);
    expect(unidades.corpo!.map((u: { id: string }) => u.id)).not.toContain(o.unidade.id);

    const usuarios = await chamar("GET", "/usuarios", { auth: c.tokens.sindico });
    expect(usuarios.corpo!.map((u: { email: string }) => u.email)).not.toContain("morador2@teste.dev");

    const areas = await chamar("GET", "/areas", { auth: c.tokens.morador });
    expect(areas.corpo!.map((a: { id: string }) => a.id)).toEqual([c.area.id]);
  });

  it("não é possível agir sobre registros de outro condomínio", async () => {
    const o = await criarOutro();

    // Apagar aviso alheio.
    expect((await chamar("GET", "/avisos", { auth: o.tokens.sindico })).corpo!.itens).toHaveLength(1);
    expect((await app.inject({ method: "DELETE", url: `/avisos/${o.aviso.id}`, headers: { authorization: `Bearer ${c.tokens.sindico}` } })).statusCode).toBe(404);

    // Desativar usuário alheio.
    const desativar = await app.inject({
      method: "PATCH",
      url: `/usuarios/${o.morador.id}/ativo`,
      headers: { authorization: `Bearer ${c.tokens.sindico}` },
      payload: { ativo: false },
    });
    expect(desativar.statusCode).toBe(404);

    // Cadastrar morador numa unidade alheia.
    const criarMorador = await chamar("POST", "/usuarios", {
      auth: c.tokens.sindico,
      corpo: { nome: "Intruso", email: "intruso@teste.dev", senha: SENHA, papel: "MORADOR", unidadeId: o.unidade.id },
    });
    expect(criarMorador.status).toBe(404);

    // Reservar área alheia.
    const inicio = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString();
    const fim = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();
    const reserva = await chamar("POST", "/reservas", { auth: c.tokens.morador, corpo: { areaId: o.area.id, inicio, fim } });
    expect(reserva.status).toBe(404);

    // Registrar encomenda e entrada direta em unidade alheia.
    const encomenda = await chamar("POST", "/encomendas", {
      auth: c.tokens.porteiro,
      corpo: { unidadeId: o.unidade.id, descricao: "Caixa" },
    });
    expect(encomenda.status).toBe(404);
    const visita = await chamar("POST", "/visitas/entrada-direta", {
      auth: c.tokens.porteiro,
      corpo: { unidadeId: o.unidade.id, nomeVisitante: "Fulano" },
    });
    expect(visita.status).toBe(404);

    // Moradores de unidade alheia não aparecem.
    const moradores = await chamar("GET", `/unidades/${o.unidade.id}/moradores`, { auth: c.tokens.porteiro });
    expect(moradores.corpo).toEqual([]);
  });

  it("visitas e encomendas de outro condomínio não aparecem para a portaria", async () => {
    const o = await criarOutro();
    await prisma.visita.create({ data: { nomeVisitante: "Visita alheia", unidadeId: o.unidade.id } });
    await prisma.visita.create({ data: { nomeVisitante: "Visita daqui", unidadeId: c.unidades.a101.id } });

    const r = await chamar("GET", "/visitas", { auth: c.tokens.porteiro });
    expect(r.corpo!.itens.map((v: { nomeVisitante: string }) => v.nomeVisitante)).toEqual(["Visita daqui"]);
  });

  it("token de um condomínio não vale se o usuário trocar de condomínio", async () => {
    const o = await criarOutro();
    await prisma.usuario.update({ where: { id: c.usuarios.sindico.id }, data: { condominioId: o.area.condominioId } });
    expect((await chamar("GET", "/avisos", { auth: c.tokens.sindico })).status).toBe(401);
  });
});
