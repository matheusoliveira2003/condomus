import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

/**
 * Roda uma vez antes de todos os testes: cria o banco de testes (se não existir)
 * e aplica as migrations, para ele ter exatamente o mesmo esquema do app.
 */
export default async function prepararBanco() {
  const url = process.env.TEST_DATABASE_URL ?? "postgresql://condomus:condomus@localhost:5432/condomus_teste";
  const nome = new URL(url).pathname.slice(1);
  if (!nome.endsWith("_teste")) throw new Error(`Por segurança, o banco de testes precisa terminar em "_teste" (recebido: ${nome})`);

  // Conecta no banco padrão "postgres" só para criar o de testes.
  const admin = new PrismaClient({ datasourceUrl: url.replace(`/${nome}`, "/postgres") });
  try {
    await admin.$executeRawUnsafe(`CREATE DATABASE "${nome}"`);
  } catch (erro) {
    if (!String(erro).includes("already exists")) throw erro;
  } finally {
    await admin.$disconnect();
  }

  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: url }, stdio: "ignore" });
}
