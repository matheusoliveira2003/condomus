import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { HttpError, naoEncontrado } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";

const unidadeSchema = z.object({
  bloco: z.string().trim().min(1).toUpperCase(),
  numero: z.string().trim().min(1),
});

/** Teto de unidades por chamada em lote: evita uma digitação errada gerar milhares de registros. */
const MAX_LOTE = 500;

const loteSchema = z
  .object({
    /** Um ou mais blocos (ex.: ["A", "B"]); cada um recebe todos os andares. */
    blocos: z.array(z.string().trim().min(1).toUpperCase()).min(1).max(50),
    andarInicial: z.number().int().min(0).max(200),
    andarFinal: z.number().int().min(0).max(200),
    /** Apartamentos por andar; o número é andar × 100 + posição (101, 102, 201...). */
    porAndar: z.number().int().min(1).max(99),
  })
  .refine((l) => l.andarFinal >= l.andarInicial, { message: "O andar final deve ser maior ou igual ao inicial", path: ["andarFinal"] });

export async function unidadesRoutes(app: FastifyInstance) {
  app.get("/unidades", { preHandler: app.autorizar("PORTEIRO", "SINDICO") }, async (req) =>
    prisma.unidade.findMany({
      where: { condominioId: req.user.condominioId },
      include: { _count: { select: { moradores: { where: { ativo: true } } } } },
      orderBy: [{ bloco: "asc" }, { numero: "asc" }],
    }),
  );

  app.post("/unidades", { preHandler: app.autorizar("SINDICO") }, async (req, reply) => {
    const unidade = await prisma.unidade.create({ data: { ...unidadeSchema.parse(req.body), condominioId: req.user.condominioId } });
    return reply.status(201).send(unidade);
  });

  // Cadastro em lote: blocos × andares × apartamentos por andar. As que já existem são ignoradas.
  app.post("/unidades/lote", { preHandler: app.autorizar("SINDICO") }, async (req, reply) => {
    const { blocos, andarInicial, andarFinal, porAndar } = loteSchema.parse(req.body);
    const numeros: string[] = [];
    for (let andar = andarInicial; andar <= andarFinal; andar++) {
      for (let posicao = 1; posicao <= porAndar; posicao++) numeros.push(String(andar * 100 + posicao));
    }
    const blocosUnicos = [...new Set(blocos)];
    const total = blocosUnicos.length * numeros.length;
    if (total > MAX_LOTE) throw new HttpError(400, `O lote geraria ${total} unidades; o máximo por vez é ${MAX_LOTE}`);

    const { condominioId } = req.user;
    const { count } = await prisma.unidade.createMany({
      data: blocosUnicos.flatMap((bloco) => numeros.map((numero) => ({ bloco, numero, condominioId }))),
      skipDuplicates: true,
    });
    return reply.status(201).send({ criadas: count, ignoradas: total - count });
  });

  app.patch("/unidades/:id", { preHandler: app.autorizar("SINDICO") }, async (req) => {
    const { id } = z.object({ id: z.uuid() }).parse(req.params);
    const dados = unidadeSchema.parse(req.body);
    const unidade = await prisma.unidade.findFirst({ where: { id, condominioId: req.user.condominioId } });
    if (!unidade) throw naoEncontrado("Unidade", "f");
    // Se bloco/número já pertencem a outra unidade, o P2002 vira 409 no manipulador global.
    return prisma.unidade.update({ where: { id }, data: dados });
  });

  // Só exclui unidade sem histórico: moradores, visitas, encomendas e reservas ficam como estão.
  // Convites são descartáveis (o botão "Gerar convite" cria outro quando preciso).
  app.delete("/unidades/:id", { preHandler: app.autorizar("SINDICO") }, async (req, reply) => {
    const { id } = z.object({ id: z.uuid() }).parse(req.params);
    const unidade = await prisma.unidade.findFirst({
      where: { id, condominioId: req.user.condominioId },
      select: { _count: { select: { moradores: true, visitas: true, encomendas: true, reservas: true } } },
    });
    if (!unidade) throw naoEncontrado("Unidade", "f");

    const { moradores, visitas, encomendas, reservas } = unidade._count;
    const vinculos = [
      moradores && `${moradores} ${moradores === 1 ? "morador" : "moradores"}`,
      visitas && `${visitas} ${visitas === 1 ? "visita" : "visitas"}`,
      encomendas && `${encomendas} ${encomendas === 1 ? "encomenda" : "encomendas"}`,
      reservas && `${reservas} ${reservas === 1 ? "reserva" : "reservas"}`,
    ].filter(Boolean);
    if (vinculos.length > 0) {
      throw new HttpError(409, `Não é possível excluir: a unidade tem ${vinculos.join(", ")}`);
    }

    await prisma.$transaction([
      prisma.conviteUnidade.deleteMany({ where: { unidadeId: id } }),
      prisma.unidade.delete({ where: { id } }),
    ]);
    return reply.status(204).send();
  });
}
