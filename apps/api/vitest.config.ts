import { defineConfig } from "vitest/config";

const BANCO_TESTE = process.env.TEST_DATABASE_URL ?? "postgresql://condomus:condomus@localhost:5432/condomus_teste";

export default defineConfig({
  test: {
    env: { DATABASE_URL: BANCO_TESTE, JWT_SECRET: "segredo-dos-testes", ADMIN_SECRET: "segredo-admin-dos-testes" },
    globalSetup: "./tests/preparar-banco.ts",
    // Os arquivos de teste compartilham o mesmo banco: rodar um por vez evita que um apague os dados do outro.
    fileParallelism: false,
    hookTimeout: 30000,
  },
});
