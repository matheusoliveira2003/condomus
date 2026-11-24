import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { FastifyInstance, FastifyReply } from "fastify";
import estaticos from "@fastify/static";

/**
 * Serve a página do painel do administrador (build de apps/admin) em /admin. Só os arquivos de
 * /admin/assets e a página em /admin: as rotas da API em /admin/auth e /admin/painel não se misturam.
 * Sem o build (por exemplo, nos testes), a API sobe normalmente e só a página fica indisponível.
 */
const aqui = dirname(fileURLToPath(import.meta.url));
// src/painel.ts (tsx) ou dist/painel.js (node): nos dois, o painel fica em ../../admin/dist.
export const PASTA_PAINEL = join(aqui, "..", "..", "admin", "dist");

export async function servirPainel(app: FastifyInstance) {
  if (!existsSync(join(PASTA_PAINEL, "index.html"))) {
    app.log.warn({ pasta: PASTA_PAINEL }, "Build do painel não encontrado: /admin indisponível");
    return;
  }
  await app.register(estaticos, {
    root: join(PASTA_PAINEL, "assets"),
    prefix: "/admin/assets/",
    // Os nomes têm hash do conteúdo: podem ficar em cache por muito tempo.
    maxAge: "365d",
    immutable: true,
  });
  // A página em si nunca fica em cache, para pegar a versão nova logo após um deploy.
  const pagina = async (_req: unknown, reply: FastifyReply) => reply.header("Cache-Control", "no-store").sendFile("index.html", PASTA_PAINEL);
  app.get("/admin", pagina);
  app.get("/admin/", pagina);
}
