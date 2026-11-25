import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { semDataValida } from "../../lib/validadeVisita.js";
import { naoLidas } from "../chat/regras.js";
import { ehMorador, PAPEIS_MORADOR } from "../../lib/papeis.js";

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
  app.get("/resumo", { preHandler: app.autorizar(...PAPEIS_MORADOR) }, async (req) => {
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
          // Hoje, ou sem data e ainda dentro da validade (não aparece convite velho para sempre).
          OR: [semDataValida(), { dataPrevista: { gte: inicioDoDia, lt: fimDoDia } }],
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
  //  - morador e síndico (que mora numa unidade): encomendas aguardando retirada na sua unidade e o chat dela;
  //  - portaria: visitantes esperados hoje ou sem data e o chat de todas as unidades.
  app.get("/contadores", { preHandler: app.autorizar("MORADOR", "SINDICO", "PORTEIRO") }, async (req) => {
    const { inicioDoDia } = consultaSchema.parse(req.query);
    const fimDoDia = new Date(inicioDoDia.getTime() + 24 * 60 * 60 * 1000);
    const { condominioId, papel } = req.user;

    if (ehMorador(papel)) {
      const { unidadeId } = (await prisma.usuario.findUnique({
        where: { id: req.user.sub },
        select: { unidadeId: true },
      })) ?? { unidadeId: null };
      const encomendas = unidadeId
        ? await prisma.encomenda.count({ where: { unidadeId, status: "AGUARDANDO_RETIRADA", unidade: { condominioId } } })
        : 0;
      const chatNaoLidas = unidadeId ? await naoLidas(req.user.sub, unidadeId, "MORADOR") : 0;
      return { encomendas, visitasEsperadas: 0, reservasPendentes: 0, chatNaoLidas };
    }

    const visitasEsperadas = await prisma.visita.count({
      where: {
        unidade: { condominioId },
        status: "AGENDADA",
        OR: [semDataValida(), { dataPrevista: { gte: inicioDoDia, lt: fimDoDia } }],
      },
    });
    // Portaria: soma das não lidas de todas as conversas do condomínio.
    const unidadesComMensagem = await prisma.mensagemChat.findMany({
      where: { unidade: { condominioId } },
      distinct: ["unidadeId"],
      select: { unidadeId: true },
    });
    const chatNaoLidas = (
      await Promise.all(unidadesComMensagem.map((u) => naoLidas(req.user.sub, u.unidadeId, "PORTARIA")))
    ).reduce((total, n) => total + n, 0);
    return { encomendas: 0, visitasEsperadas, reservasPendentes: 0, chatNaoLidas };
  });
}
