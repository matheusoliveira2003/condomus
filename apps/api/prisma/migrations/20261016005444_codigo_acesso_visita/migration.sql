-- AlterTable
ALTER TABLE "Visita" ADD COLUMN     "codigoAcesso" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Visita_codigoAcesso_key" ON "Visita"("codigoAcesso");

