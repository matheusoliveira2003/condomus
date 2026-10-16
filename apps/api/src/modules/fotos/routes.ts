import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { HttpError, naoEncontrado, proibido } from "../../lib/errors.js";

/** O app envia a foto já reduzida (~30–50 KB); o limite só barra envios fora do padrão. */
const TAMANHO_MAXIMO = 500 * 1024;

const fotoSchema = z.object({ imagem: z.base64("Imagem inválida") });
const idParam = z.object({ id: z.uuid() });

/** JPEG começa com os bytes FF D8 FF. */
const ehJpeg = (b: Buffer) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;

export async function fotosRoutes(app: FastifyInstance) {
  app.put("/auth/foto", { preHandler: app.autorizar() }, async (req) => {
    const { imagem } = fotoSchema.parse(req.body);
    const bytes = Buffer.from(imagem, "base64");
    if (!ehJpeg(bytes)) throw new HttpError(400, "A foto deve ser uma imagem JPEG");
    if (bytes.length > TAMANHO_MAXIMO) throw new HttpError(400, "A foto deve ter no máximo 500 KB");
    const { fotoAtualizadaEm } = await prisma.usuario.update({
      where: { id: req.user.sub },
      data: { foto: bytes, fotoAtualizadaEm: new Date() },
      select: { fotoAtualizadaEm: true },
    });
    return { fotoAtualizadaEm };
  });

  app.delete("/auth/foto", { preHandler: app.autorizar() }, async (req, reply) => {
    await prisma.usuario.update({ where: { id: req.user.sub }, data: { foto: null, fotoAtualizadaEm: null } });
    return reply.status(204).send();
  });

  // A própria pessoa, a portaria e o síndico podem ver a foto (a portaria reconhece moradores por ela).
  app.get("/usuarios/:id/foto", { preHandler: app.autorizar() }, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    if (req.user.papel === "MORADOR" && id !== req.user.sub) throw proibido();
    const usuario = await prisma.usuario.findUnique({ where: { id }, select: { foto: true } });
    if (!usuario?.foto) throw naoEncontrado("Foto");
    // A URL do app inclui a versão (?v=...), então a imagem pode ficar em cache sem risco de ficar velha.
    return reply.header("Content-Type", "image/jpeg").header("Cache-Control", "private, max-age=86400").send(Buffer.from(usuario.foto));
  });

  // Moradores de uma unidade, para a portaria reconhecer quem retira uma encomenda.
  app.get("/unidades/:id/moradores", { preHandler: app.autorizar("PORTEIRO", "SINDICO") }, async (req) => {
    const { id } = idParam.parse(req.params);
    return prisma.usuario.findMany({
      where: { unidadeId: id, papel: "MORADOR", ativo: true },
      select: { id: true, nome: true, fotoAtualizadaEm: true },
      orderBy: { nome: "asc" },
    });
  });
}
