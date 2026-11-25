/**
 * Papéis que moram numa unidade e usam o app como morador: visitas, encomendas, reservas e o chat da própria unidade.
 * O síndico é um morador a mais, com a função de publicar avisos. O porteiro não mora: ele atende todas as unidades.
 */
export const PAPEIS_MORADOR = ["MORADOR", "SINDICO"] as const;

export const ehMorador = (papel: string) => (PAPEIS_MORADOR as readonly string[]).includes(papel);
