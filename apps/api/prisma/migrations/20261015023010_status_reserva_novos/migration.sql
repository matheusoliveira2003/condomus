-- Novos status de reserva. Ficam numa migration separada porque o PostgreSQL
-- não permite usar um valor de enum na mesma transação em que ele é criado.
ALTER TYPE "StatusReserva" ADD VALUE 'PENDENTE';
ALTER TYPE "StatusReserva" ADD VALUE 'RECUSADA';
