import { defineConfig } from "vitest/config";

// Só as regras puras do app (sem React Native nem banco): datas da agenda de reservas.
export default defineConfig({ test: { include: ["src/**/*.test.ts"] } });
