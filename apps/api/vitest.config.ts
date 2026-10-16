import { defineConfig } from "vitest/config";
import { BANCO_TESTE } from "./tests/banco.js";

export default defineConfig({
  test: {
    env: { DATABASE_URL: BANCO_TESTE, JWT_SECRET: "segredo-dos-testes" },
    globalSetup: "./tests/preparar-banco.ts",
    // Os arquivos de teste compartilham o mesmo banco: rodar um por vez evita que um apague os dados do outro.
    fileParallelism: false,
    hookTimeout: 30000,
  },
});
