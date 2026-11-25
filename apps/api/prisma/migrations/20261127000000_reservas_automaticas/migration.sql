-- Reservas automáticas: o síndico não aprova mais. As reservas que ficaram PENDENTES são resolvidas uma única vez aqui.
--
-- Regra, por área e na ordem em que foram pedidas (a mais antiga primeiro):
--   1. PENDENTE que já passou          -> CANCELADA (ninguém vai mais usar esse horário)
--   2. PENDENTE futura sem conflito    -> CONFIRMADA
--   3. PENDENTE futura em conflito com uma CONFIRMADA (inclusive as confirmadas por este mesmo passo) -> CANCELADA
-- Como as pendentes já seguravam o horário, dois pedidos pendentes nunca se sobrepunham: o conflito só existe com uma
-- CONFIRMADA anterior, o que o passo 3 resolve. A migration não muda o schema e é idempotente (sem PENDENTE, não faz nada).

UPDATE "Reserva"
SET "status" = 'CANCELADA', "decididaEm" = now()
WHERE "status" = 'PENDENTE' AND "fim" <= now();

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT "id", "areaId", "inicio", "fim"
    FROM "Reserva"
    WHERE "status" = 'PENDENTE'
    ORDER BY "criadoEm" ASC, "id" ASC
  LOOP
    IF EXISTS (
      SELECT 1 FROM "Reserva" o
      WHERE o."areaId" = r."areaId" AND o."status" = 'CONFIRMADA' AND o."id" <> r."id"
        AND o."inicio" < r."fim" AND o."fim" > r."inicio"
    ) THEN
      UPDATE "Reserva" SET "status" = 'CANCELADA', "decididaEm" = now() WHERE "id" = r."id";
    ELSE
      UPDATE "Reserva" SET "status" = 'CONFIRMADA', "decididaEm" = now() WHERE "id" = r."id";
    END IF;
  END LOOP;
END $$;
