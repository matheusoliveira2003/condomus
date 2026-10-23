import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { type Cenario, chamar, criarApp, criarCenario, limparBanco, prisma } from "./ajuda.js";
import { normalizarCodigo } from "../src/lib/codigo.js";

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

const autorizar = (token: string, nomeVisitante = "Carlos") =>
  chamar(app, "POST", "/visitas", { token, corpo: { nomeVisitante } });

/**
 * Portaria registra a entrada apresentando o código do convite (como faz ao ler o QR code).
 * `null` = sem código (não usar `undefined`: ele ativaria o valor padrão, o código certo).
 */
const registrarEntrada = (visita: { id: string; codigoAcesso: string }, codigo: string | null = visita.codigoAcesso) =>
  chamar(app, "PATCH", `/visitas/${visita.id}/entrada`, { token: c.tokens.porteiro, corpo: codigo === null ? {} : { codigo } });

describe("ciclo da visita", () => {
  it("agendada → entrada → saída", async () => {
    const { corpo: visita } = await autorizar(c.tokens.morador);
    expect(visita).toMatchObject({ status: "AGENDADA", unidadeId: c.unidades.a101.id, autorizadoPorId: c.usuarios.morador.id });

    const entrada = await registrarEntrada(visita);
    expect(entrada.corpo).toMatchObject({ status: "EM_ANDAMENTO", registradoPorId: c.usuarios.porteiro.id });
    expect(entrada.corpo.entradaEm).toEqual(expect.any(String));

    const saida = await chamar(app, "PATCH", `/visitas/${visita.id}/saida`, { token: c.tokens.porteiro });
    expect(saida.corpo.status).toBe("FINALIZADA");
  });

  it("não registra entrada duas vezes nem saída de quem não entrou", async () => {
    const { corpo: visita } = await autorizar(c.tokens.morador);
    expect((await chamar(app, "PATCH", `/visitas/${visita.id}/saida`, { token: c.tokens.porteiro })).status).toBe(409);
    await registrarEntrada(visita);
    expect((await registrarEntrada(visita)).status).toBe(409);
  });

  it("entrada direta pela portaria já começa no condomínio, sem autorização prévia", async () => {
    const r = await chamar(app, "POST", "/visitas/entrada-direta", {
      token: c.tokens.porteiro,
      corpo: { unidadeId: c.unidades.b201.id, nomeVisitante: "Entregador" },
    });
    expect(r.status).toBe(201);
    expect(r.corpo).toMatchObject({ status: "EM_ANDAMENTO", autorizadoPorId: null, codigoAcesso: null });
  });

  it("morador só cancela visitas agendadas da própria unidade", async () => {
    const { corpo: visita } = await autorizar(c.tokens.morador);
    expect((await chamar(app, "PATCH", `/visitas/${visita.id}/cancelar`, { token: c.tokens.vizinho })).status).toBe(403);
    expect((await chamar(app, "PATCH", `/visitas/${visita.id}/cancelar`, { token: c.tokens.morador })).corpo.status).toBe("CANCELADA");
    expect((await chamar(app, "PATCH", `/visitas/${visita.id}/cancelar`, { token: c.tokens.morador })).status).toBe(409);
  });
});

describe("listagem", () => {
  it("morador vê só a própria unidade; portaria vê todas", async () => {
    await autorizar(c.tokens.morador, "Visita do A");
    await autorizar(c.tokens.vizinho, "Visita do B");
    const doMorador = await chamar(app, "GET", "/visitas", { token: c.tokens.morador });
    const daPortaria = await chamar(app, "GET", "/visitas", { token: c.tokens.porteiro });
    expect(doMorador.corpo.itens.map((v: { nomeVisitante: string }) => v.nomeVisitante)).toEqual(["Visita do A"]);
    expect(daPortaria.corpo.itens).toHaveLength(2);
  });

  it("situacao=ativas e situacao=historico separam visitas em aberto das encerradas", async () => {
    const { corpo: aberta } = await autorizar(c.tokens.morador, "Aberta");
    const { corpo: encerrada } = await autorizar(c.tokens.morador, "Encerrada");
    await chamar(app, "PATCH", `/visitas/${encerrada.id}/cancelar`, { token: c.tokens.morador });

    const ativas = await chamar(app, "GET", "/visitas?situacao=ativas", { token: c.tokens.morador });
    const historico = await chamar(app, "GET", "/visitas?situacao=historico", { token: c.tokens.morador });
    expect(ativas.corpo.itens.map((v: { id: string }) => v.id)).toEqual([aberta.id]);
    expect(historico.corpo.itens.map((v: { id: string }) => v.id)).toEqual([encerrada.id]);
  });

  it("o código do convite aparece para o morador e não para a portaria", async () => {
    await autorizar(c.tokens.morador);
    const [doMorador] = (await chamar(app, "GET", "/visitas", { token: c.tokens.morador })).corpo.itens;
    const [daPortaria] = (await chamar(app, "GET", "/visitas", { token: c.tokens.porteiro })).corpo.itens;
    expect(doMorador.codigoAcesso).toMatch(/^[A-Z0-9]{6}$/);
    expect(daPortaria).not.toHaveProperty("codigoAcesso");
    expect(daPortaria.temConvite).toBe(true);
  });
});

describe("convite com QR code", () => {
  it("cada visita recebe um código diferente", async () => {
    const codigos = new Set<string>();
    for (let i = 0; i < 20; i++) codigos.add((await autorizar(c.tokens.morador, `Visitante ${i}`)).corpo.codigoAcesso);
    expect(codigos.size).toBe(20);
  });

  it("portaria encontra a visita pelo conteúdo do QR code ou pelo código digitado", async () => {
    const { corpo: visita } = await autorizar(c.tokens.morador, "Carlos");
    for (const lido of [`CONDOMUS:${visita.codigoAcesso}`, visita.codigoAcesso.toLowerCase(), ` ${visita.codigoAcesso.slice(0, 3)} ${visita.codigoAcesso.slice(3)} `]) {
      const r = await chamar(app, "GET", `/visitas/codigo/${encodeURIComponent(lido)}`, { token: c.tokens.porteiro });
      expect(r.status).toBe(200);
      expect(r.corpo).toMatchObject({ id: visita.id, nomeVisitante: "Carlos", autorizadoPor: { nome: "Morador A" } });
      expect(r.corpo).not.toHaveProperty("codigoAcesso");
    }
  });

  it("código inexistente é 404 e morador não pode consultar códigos", async () => {
    expect((await chamar(app, "GET", "/visitas/codigo/ZZZZZZ", { token: c.tokens.porteiro })).status).toBe(404);
    const { corpo: visita } = await autorizar(c.tokens.morador);
    expect((await chamar(app, "GET", `/visitas/codigo/${visita.codigoAcesso}`, { token: c.tokens.vizinho })).status).toBe(403);
  });

  it("convite (código e imagem) só para o morador da unidade e só enquanto agendada", async () => {
    const { corpo: visita } = await autorizar(c.tokens.morador);
    const convite = await chamar(app, "GET", `/visitas/${visita.id}/convite`, { token: c.tokens.morador });
    expect(convite.corpo).toEqual({ codigo: visita.codigoAcesso, nomeVisitante: "Carlos" });
    expect((await chamar(app, "GET", `/visitas/${visita.id}/convite`, { token: c.tokens.vizinho })).status).toBe(403);

    await registrarEntrada(visita);
    expect((await chamar(app, "GET", `/visitas/${visita.id}/convite`, { token: c.tokens.morador })).status).toBe(409);
  });

  it("a imagem do convite é um PNG 1080x1350", async () => {
    const { corpo: visita } = await autorizar(c.tokens.morador);
    const r = await chamar(app, "GET", `/visitas/${visita.id}/convite.png`, { token: c.tokens.morador });
    expect(r.status).toBe(200);
    expect(r.tipo).toBe("image/png");
    expect(r.bytes.subarray(1, 4).toString()).toBe("PNG");
    // Largura e altura ficam nos bytes 16–23 do cabeçalho IHDR do PNG.
    expect([r.bytes.readUInt32BE(16), r.bytes.readUInt32BE(20)]).toEqual([1080, 1350]);
  });

  it("visitas antigas, criadas antes do convite existir, ganham código ao pedir o convite", async () => {
    const antiga = await prisma.visita.create({
      data: { nomeVisitante: "Antiga", unidadeId: c.unidades.a101.id, autorizadoPorId: c.usuarios.morador.id },
    });
    const r = await chamar(app, "GET", `/visitas/${antiga.id}/convite`, { token: c.tokens.morador });
    expect(r.corpo.codigo).toMatch(/^[A-Z0-9]{6}$/);
  });
});

describe("entrada exige o convite", () => {
  it("sem o código, a entrada é recusada", async () => {
    const { corpo: visita } = await autorizar(c.tokens.morador);
    const r = await registrarEntrada(visita, null);
    expect(r.status).toBe(400);
    expect(r.corpo.erro).toMatch(/QR code/);
    expect((await prisma.visita.findUnique({ where: { id: visita.id } }))?.status).toBe("AGENDADA");
  });

  it("o convite de outra visita não libera esta", async () => {
    const { corpo: esta } = await autorizar(c.tokens.morador, "Esta");
    const { corpo: outra } = await autorizar(c.tokens.morador, "Outra");
    const r = await registrarEntrada(esta, outra.codigoAcesso);
    expect(r.status).toBe(400);
    expect(r.corpo.erro).toBe("Este convite não é desta visita");
  });

  it("aceita o código no formato do QR code ou digitado em minúsculas", async () => {
    const { corpo: v1 } = await autorizar(c.tokens.morador, "Pelo QR");
    const { corpo: v2 } = await autorizar(c.tokens.morador, "Digitado");
    expect((await registrarEntrada(v1, `CONDOMUS:${v1.codigoAcesso}`)).status).toBe(200);
    expect((await registrarEntrada(v2, v2.codigoAcesso.toLowerCase())).status).toBe(200);
  });

  it("visita antiga, sem convite, continua entrando sem código", async () => {
    const antiga = await prisma.visita.create({
      data: { nomeVisitante: "Antiga", unidadeId: c.unidades.a101.id, autorizadoPorId: c.usuarios.morador.id },
    });
    const [daPortaria] = (await chamar(app, "GET", "/visitas", { token: c.tokens.porteiro })).corpo.itens;
    expect(daPortaria.temConvite).toBe(false);
    expect((await chamar(app, "PATCH", `/visitas/${antiga.id}/entrada`, { token: c.tokens.porteiro })).corpo.status).toBe("EM_ANDAMENTO");
  });
});

describe("normalizarCodigo", () => {
  it.each([
    ["CONDOMUS:AB12CD", "AB12CD"],
    ["condomus:ab12cd", "AB12CD"],
    [" ab1 2cd ", "AB12CD"],
    ["AB-12-CD", "AB12CD"],
  ])("%j → %s", (entrada, esperado) => {
    expect(normalizarCodigo(entrada)).toBe(esperado);
  });
});
