-- AlterTable
ALTER TABLE "Reserva" ADD COLUMN     "decididaEm" TIMESTAMP(3),
ADD COLUMN     "motivoRecusa" TEXT,
ALTER COLUMN "status" SET DEFAULT 'PENDENTE';
