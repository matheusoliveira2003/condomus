import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { naoEncontrado } from "../../lib/errors.js";
import { notificarTodos } from "../../lib/push.js";

const PAGE_SIZE = 20;

const avisoSchema = z.object({
  titulo: z.string().min(3),
  conteudo: z.string().min(1),
  fixado: z.boolean().optional(),
});

const filtroSchema = z.object({
  limite: z.coerce.number().int().min(1).max(100).default(PAGE_SIZE),
  /** ID do último aviso recebido; omitir para a primeira página. */
  cursor: z.uuid().optional(),
});

const idParam = z.object({ id: z.uuid() });

export async function avisosRoutes(app: FastifyInstance) {
  app.get("/avisos", { preHandler: app.autorizar() }, async (req) => {
    const { limite, cursor } = filtroSchema.parse(req.query);

    // Avisos fixados sempre aparecem antes dos não-fixados.
    // O cursor precisa saber se o item âncora era fixado para paginar corretamente:
    // - Se era fixado: próxima página começa nos fixados mais antigos + todos os não-fixados.
    // - Se não era fixado: próxima página são apenas não-fixados mais antigos.
    const ancoraCursor = cursor
      ? await prisma.aviso.findUnique({ where: { id: cursor }, select: { fixado: true, criadoEm: true } })
      : null;

    const avisos = await prisma.aviso.findMany({
      where: ancoraCursor
        ? ancoraCursor.fixado
          // Âncora é fixado: pega fixados mais antigos OU todos os não-fixados.
          ? { OR: [
              { fixado: true, criadoEm: { lt: ancoraCursor.criadoEm } },
              { fixado: true, criadoEm: ancoraCursor.criadoEm, id: { lt: cursor! } },
              { fixado: false },
            ]}
          // Âncora não é fixado: só pega não-fixados mais antigos.
          : { fixado: false, OR: [
              { criadoEm: { lt: ancoraCursor.criadoEm } },
              { criadoEm: ancoraCursor.criadoEm, id: { lt: cursor! } },
            ]}
        : {},
      include: { autor: { select: { nome: true } } },
      orderBy: [{ fixado: "desc" }, { criadoEm: "desc" }, { id: "desc" }],
      take: limite + 1,
    });

    const temMais = avisos.length > limite;
    const itens = temMais ? avisos.slice(0, limite) : avisos;
    return { itens, proximoCursor: temMais ? itens[itens.length - 1].id : null };
  });

  app.post("/avisos", { preHandler: app.autorizar("SINDICO") }, async (req, reply) => {
    const dados = avisoSchema.parse(req.body);
    const aviso = await prisma.aviso.create({ data: { ...dados, autorId: req.user.sub } });
    notificarTodos(req.user.sub, {
      titulo: `📢 ${aviso.titulo}`,
      // O corpo da notificação é curto; o texto completo fica na aba Avisos.
      corpo: aviso.conteudo.length > 120 ? `${aviso.conteudo.slice(0, 117)}…` : aviso.conteudo,
      dados: { aba: "Avisos" },
    });
    return reply.status(201).send(aviso);
  });

  app.delete("/avisos/:id", { preHandler: app.autorizar("SINDICO") }, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const { count } = await prisma.aviso.deleteMany({ where: { id } });
    if (count === 0) throw naoEncontrado("Aviso");
    return reply.status(204).send();
  });
}
