-- AlterTable
ALTER TABLE "Usuario" ADD COLUMN     "codigoEmailExpira" TIMESTAMP(3),
ADD COLUMN     "codigoEmailHash" TEXT,
ADD COLUMN     "emailPendente" TEXT;
