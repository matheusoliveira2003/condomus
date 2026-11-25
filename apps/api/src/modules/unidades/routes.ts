import type { FastifyInstance } from "fastify";
import { listarUnidades } from "./operacoes.js";

/**
 * Lista das unidades do condomínio, só para a portaria escolher a unidade (a lista traz a contagem de moradores).
 * Criar, editar e excluir unidades saiu da API do condomínio: quem faz isso é o administrador, pelo painel (/admin).
 */
export async function unidadesRoutes(app: FastifyInstance) {
  app.get("/unidades", { preHandler: app.autorizar("PORTEIRO") }, async (req) => listarUnidades(req.user.condominioId));
}
