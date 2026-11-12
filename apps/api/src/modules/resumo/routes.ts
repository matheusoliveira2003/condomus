import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";

const consultaSchema = z.object({
  /** Meia-noite no fuso do celular; define o que é "hoje" para o morador. */
  inicioDoDia: z.coerce.date(),
});

/** Quantas encomendas listar no resumo (o total vem separado). */
const MAX_ENCOMENDAS = 3;
/** Quantos avisos mostrar no resumo; a lista completa fica em GET /avisos. */
const MAX_AVISOS = 3;

export async function resumoRoutes(app: FastifyInstance) {
  // Tudo o que a tela inicial do morador mostra, numa única chamada.
  app.get("/resumo", { preHandler: app.autorizar("MORADOR") }, async (req) => {
    const { inicioDoDia } = consultaSchema.parse(req.query);
    const fimDoDia = new Date(inicioDoDia.getTime() + 24 * 60 * 60 * 1000);
    const { condominioId } = req.user;

    // Busca o unidadeId direto do banco: o JWT pode estar desatualizado se a unidade
    // foi atribuída depois que o token foi emitido.
    const { unidadeId } = (await prisma.usuario.findUnique({
      where: { id: req.user.sub },
      select: { unidadeId: true },
    })) ?? { unidadeId: null };

    // Morador ainda sem unidade atribuída: retorna resumo vazio mas válido.
    if (!unidadeId) {
      const avisos = await prisma.aviso.findMany({
        where: { condominioId },
        select: { id: true, titulo: true, conteudo: true, fixado: true, criadoEm: true },
        orderBy: [{ fixado: "desc" }, { criadoEm: "desc" }],
        take: MAX_AVISOS,
      });
      return {
        unidade: null,
        encomendas: { total: 0, itens: [] },
        visitas: { noCondominio: [], esperadasHoje: [] },
        proximaReserva: null,
        avisos,
      };
    }

    const [unidade, encomendas, totalEncomendas, noCondominio, esperadas, proximaReserva, avisos] = await Promise.all([
      prisma.unidade.findUnique({ where: { id: unidadeId } }),
      prisma.encomenda.findMany({
        where: { unidadeId, status: "AGUARDANDO_RETIRADA", unidade: { condominioId } },
        select: { id: true, descricao: true, remetente: true, recebidaEm: true },
        orderBy: { recebidaEm: "desc" },
        take: MAX_ENCOMENDAS,
      }),
      prisma.encomenda.count({ where: { unidadeId, status: "AGUARDANDO_RETIRADA", unidade: { condominioId } } }),
      prisma.visita.findMany({
        where: { unidadeId, status: "EM_ANDAMENTO", unidade: { condominioId } },
        select: { id: true, nomeVisitante: true, entradaEm: true },
        orderBy: { entradaEm: "desc" },
      }),
      // Agendadas para hoje ou sem data definida ("qualquer dia").
      prisma.visita.findMany({
        where: {
          unidadeId,
          unidade: { condominioId },
          status: "AGENDADA",
          OR: [{ dataPrevista: null }, { dataPrevista: { gte: inicioDoDia, lt: fimDoDia } }],
        },
        select: { id: true, nomeVisitante: true, dataPrevista: true },
        orderBy: { criadoEm: "asc" },
      }),
      prisma.reserva.findFirst({
        where: { unidadeId, area: { condominioId }, status: { in: ["PENDENTE", "CONFIRMADA"] }, fim: { gt: new Date() } },
        select: { id: true, inicio: true, fim: true, status: true, area: { select: { nome: true } } },
        orderBy: { inicio: "asc" },
      }),
      // Mesma ordem do mural: fixados primeiro, depois os mais recentes.
      prisma.aviso.findMany({
        where: { condominioId },
        select: { id: true, titulo: true, conteudo: true, fixado: true, criadoEm: true },
        orderBy: [{ fixado: "desc" }, { criadoEm: "desc" }],
        take: MAX_AVISOS,
      }),
    ]);

    return {
      unidade,
      encomendas: { total: totalEncomendas, itens: encomendas },
      visitas: { noCondominio, esperadasHoje: esperadas },
      proximaReserva,
      avisos,
    };
  });

  // Números do emblema das abas: só o que pede uma ação de quem está logado.
  //  - morador: encomendas aguardando retirada na sua unidade;
  //  - portaria e síndico: visitantes esperados hoje ou sem data;
  //  - síndico: reservas pendentes de aprovação.
  app.get("/contadores", { preHandler: app.autorizar("MORADOR", "PORTEIRO", "SINDICO") }, async (req) => {
    const { inicioDoDia } = consultaSchema.parse(req.query);
    const fimDoDia = new Date(inicioDoDia.getTime() + 24 * 60 * 60 * 1000);
    const { condominioId, papel } = req.user;

    if (papel === "MORADOR") {
      const { unidadeId } = (await prisma.usuario.findUnique({
        where: { id: req.user.sub },
        select: { unidadeId: true },
      })) ?? { unidadeId: null };
      const encomendas = unidadeId
        ? await prisma.encomenda.count({ where: { unidadeId, status: "AGUARDANDO_RETIRADA", unidade: { condominioId } } })
        : 0;
      return { encomendas, visitasEsperadas: 0, reservasPendentes: 0 };
    }

    const [visitasEsperadas, reservasPendentes] = await Promise.all([
      prisma.visita.count({
        where: {
          unidade: { condominioId },
          status: "AGENDADA",
          OR: [{ dataPrevista: null }, { dataPrevista: { gte: inicioDoDia, lt: fimDoDia } }],
        },
      }),
      papel === "SINDICO"
        ? prisma.reserva.count({ where: { area: { condominioId }, status: "PENDENTE", fim: { gt: new Date() } } })
        : Promise.resolve(0),
    ]);
    return { encomendas: 0, visitasEsperadas, reservasPendentes };
  });
}
