-- CreateTable
CREATE TABLE "VisitanteOculto" (
    "id" TEXT NOT NULL,
    "documento" TEXT NOT NULL,
    "ocultoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unidadeId" TEXT NOT NULL,

    CONSTRAINT "VisitanteOculto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VisitanteOculto_unidadeId_documento_key" ON "VisitanteOculto"("unidadeId", "documento");

-- AddForeignKey
ALTER TABLE "VisitanteOculto" ADD CONSTRAINT "VisitanteOculto_unidadeId_fkey" FOREIGN KEY ("unidadeId") REFERENCES "Unidade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

