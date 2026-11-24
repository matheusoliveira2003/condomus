-- CreateEnum
CREATE TYPE "LadoChat" AS ENUM ('MORADOR', 'PORTARIA');

-- CreateTable
CREATE TABLE "MensagemChat" (
    "id" TEXT NOT NULL,
    "lado" "LadoChat" NOT NULL,
    "texto" TEXT,
    "temFoto" BOOLEAN NOT NULL DEFAULT false,
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unidadeId" TEXT NOT NULL,
    "autorId" TEXT NOT NULL,

    CONSTRAINT "MensagemChat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeituraChat" (
    "lidaEm" TIMESTAMP(3) NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "unidadeId" TEXT NOT NULL,

    CONSTRAINT "LeituraChat_pkey" PRIMARY KEY ("usuarioId","unidadeId")
);

-- CreateIndex
CREATE INDEX "MensagemChat_unidadeId_criadaEm_idx" ON "MensagemChat"("unidadeId", "criadaEm");

-- CreateIndex
CREATE INDEX "MensagemChat_criadaEm_idx" ON "MensagemChat"("criadaEm");

-- AddForeignKey
ALTER TABLE "MensagemChat" ADD CONSTRAINT "MensagemChat_unidadeId_fkey" FOREIGN KEY ("unidadeId") REFERENCES "Unidade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MensagemChat" ADD CONSTRAINT "MensagemChat_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeituraChat" ADD CONSTRAINT "LeituraChat_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeituraChat" ADD CONSTRAINT "LeituraChat_unidadeId_fkey" FOREIGN KEY ("unidadeId") REFERENCES "Unidade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

