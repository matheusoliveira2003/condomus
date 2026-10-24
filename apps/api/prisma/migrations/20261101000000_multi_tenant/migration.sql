-- CreateEnum
CREATE TYPE "PlanoStatus" AS ENUM ('TRIAL', 'ATIVO', 'EXPIRADO', 'SUSPENSO');

-- DropIndex
DROP INDEX "AreaComum_nome_key";

-- DropIndex
DROP INDEX "Unidade_bloco_numero_key";

-- AlterTable
ALTER TABLE "AreaComum" ADD COLUMN     "condominioId" TEXT;

-- AlterTable
ALTER TABLE "Aviso" ADD COLUMN     "condominioId" TEXT;

-- AlterTable
ALTER TABLE "Unidade" ADD COLUMN     "condominioId" TEXT;

-- AlterTable
ALTER TABLE "Usuario" ADD COLUMN     "condominioId" TEXT;

-- CreateTable
CREATE TABLE "Condominio" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cnpj" TEXT,
    "endereco" TEXT,
    "planoStatus" "PlanoStatus" NOT NULL DEFAULT 'TRIAL',
    "planoExpiraEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Condominio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConviteUnidade" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "expiraEm" TIMESTAMP(3) NOT NULL,
    "usadoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unidadeId" TEXT NOT NULL,

    CONSTRAINT "ConviteUnidade_pkey" PRIMARY KEY ("id")
);

-- Backfill: dados existentes (apenas dev) são movidos para um condomínio padrão.
INSERT INTO "Condominio" ("id", "nome", "planoStatus")
SELECT 'condominio-padrao', 'Condomínio Padrão', 'ATIVO'
WHERE EXISTS (SELECT 1 FROM "Unidade") OR EXISTS (SELECT 1 FROM "Usuario")
   OR EXISTS (SELECT 1 FROM "AreaComum") OR EXISTS (SELECT 1 FROM "Aviso");

UPDATE "AreaComum" SET "condominioId" = 'condominio-padrao';
UPDATE "Aviso" SET "condominioId" = 'condominio-padrao';
UPDATE "Unidade" SET "condominioId" = 'condominio-padrao';
UPDATE "Usuario" SET "condominioId" = 'condominio-padrao';

ALTER TABLE "AreaComum" ALTER COLUMN "condominioId" SET NOT NULL;
ALTER TABLE "Aviso" ALTER COLUMN "condominioId" SET NOT NULL;
ALTER TABLE "Unidade" ALTER COLUMN "condominioId" SET NOT NULL;
ALTER TABLE "Usuario" ALTER COLUMN "condominioId" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Condominio_cnpj_key" ON "Condominio"("cnpj");

-- CreateIndex
CREATE UNIQUE INDEX "ConviteUnidade_codigo_key" ON "ConviteUnidade"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "AreaComum_condominioId_nome_key" ON "AreaComum"("condominioId", "nome");

-- CreateIndex
CREATE UNIQUE INDEX "Unidade_condominioId_bloco_numero_key" ON "Unidade"("condominioId", "bloco", "numero");

-- AddForeignKey
ALTER TABLE "ConviteUnidade" ADD CONSTRAINT "ConviteUnidade_unidadeId_fkey" FOREIGN KEY ("unidadeId") REFERENCES "Unidade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Unidade" ADD CONSTRAINT "Unidade_condominioId_fkey" FOREIGN KEY ("condominioId") REFERENCES "Condominio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Usuario" ADD CONSTRAINT "Usuario_condominioId_fkey" FOREIGN KEY ("condominioId") REFERENCES "Condominio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Aviso" ADD CONSTRAINT "Aviso_condominioId_fkey" FOREIGN KEY ("condominioId") REFERENCES "Condominio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AreaComum" ADD CONSTRAINT "AreaComum_condominioId_fkey" FOREIGN KEY ("condominioId") REFERENCES "Condominio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

