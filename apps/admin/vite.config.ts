import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Servido pela API em /admin: os arquivos vão para dist/ com esse caminho base.
export default defineConfig({
  base: "/admin/",
  plugins: [react()],
  server: {
    // Em desenvolvimento, as chamadas /admin/painel e /admin/auth vão para a API local.
    proxy: { "/admin/painel": "http://localhost:3333", "/admin/auth": "http://localhost:3333" },
  },
});
