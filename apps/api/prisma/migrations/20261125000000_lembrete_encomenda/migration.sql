-- AlterTable
ALTER TABLE "Encomenda" ADD COLUMN     "lembretesEnviados" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "ultimoLembreteEm" TIMESTAMP(3);

