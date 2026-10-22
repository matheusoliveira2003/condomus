-- AlterTable
ALTER TABLE "Usuario" ADD COLUMN     "codigoRecuperacaoExpira" TIMESTAMP(3),
ADD COLUMN     "codigoRecuperacaoHash" TEXT;
