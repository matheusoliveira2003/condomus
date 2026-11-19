-- CreateEnum
CREATE TYPE "VerificacaoEntrada" AS ENUM ('RECONHECIMENTO', 'MANUAL');

-- AlterTable
ALTER TABLE "Visita" ADD COLUMN     "motivoLiberacao" TEXT,
ADD COLUMN     "semelhanca" DOUBLE PRECISION,
ADD COLUMN     "verificacao" "VerificacaoEntrada";

