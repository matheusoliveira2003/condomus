import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { HttpError } from "../../lib/errors.js";
import {
  alterarAtivo,
  ativoSchema,
  criarUsuario,
  editarSchema,
  editarUsuario,
  filtroSchema,
  listarUsuarios,
  reenviarSenha,
  usuarioSchema,
} from "./operacoes.js";

const idParam = z.object({ id: z.uuid() });

/** Cadastros feitos pelo síndico, no condomínio do próprio token. As regras ficam em ./operacoes.ts. */
export async function usuariosRoutes(app: FastifyInstance) {
  app.get("/usuarios", { preHandler: app.autorizar("SINDICO") }, async (req) =>
    listarUsuarios(req.user.condominioId, filtroSchema.parse(req.query).papel),
  );

  app.post("/usuarios", { preHandler: app.autorizar("SINDICO") }, async (req, reply) =>
    reply.status(201).send(await criarUsuario(req.user.condominioId, usuarioSchema.parse(req.body))),
  );

  app.patch("/usuarios/:id", { preHandler: app.autorizar("SINDICO") }, async (req) =>
    editarUsuario(req.user.condominioId, idParam.parse(req.params).id, editarSchema.parse(req.body)),
  );

  app.post("/usuarios/:id/reenviar-senha", { preHandler: app.autorizar("SINDICO") }, async (req, reply) => {
    await reenviarSenha(req.user.condominioId, idParam.parse(req.params).id);
    return reply.status(204).send();
  });

  app.patch("/usuarios/:id/ativo", { preHandler: app.autorizar("SINDICO") }, async (req) => {
    const { id } = idParam.parse(req.params);
    const { ativo } = ativoSchema.parse(req.body);
    if (id === req.user.sub && !ativo) throw new HttpError(409, "Você não pode desativar a própria conta");
    return alterarAtivo(req.user.condominioId, id, ativo);
  });
}
