/**
 * Papéis que moram numa unidade e usam o app como morador: visitas, encomendas, reservas e o chat da própria unidade.
 * O síndico é um morador a mais, com a função de publicar avisos. O porteiro não mora: ele atende todas as unidades.
 *
 * A mesma regra existe em packages/types (PAPEIS_MORADOR), usada pelo app. Ela fica escrita aqui de novo, e não importada, porque
 * o pacote compartilhado é TypeScript e o `node dist/server.js` do Render não carrega `.ts` de dependência de workspace
 * (o Node 24 local carrega, o que esconde o problema). O teste papeis.test.ts garante que as duas listas não divergem.
 */
export const PAPEIS_MORADOR = ["MORADOR", "SINDICO"] as const;

export const ehMorador = (papel: string) => (PAPEIS_MORADOR as readonly string[]).includes(papel);
