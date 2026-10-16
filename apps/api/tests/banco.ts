/** Banco exclusivo dos testes: cada teste apaga os dados, então nunca aponte para o de desenvolvimento. */
export const BANCO_TESTE = process.env.TEST_DATABASE_URL ?? "postgresql://condomus:condomus@localhost:5432/condomus_teste";
