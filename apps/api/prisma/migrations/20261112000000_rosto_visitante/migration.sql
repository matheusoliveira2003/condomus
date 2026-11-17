-- CreateTable
CREATE TABLE "RostoVisitante" (
    "id" TEXT NOT NULL,
    "documento" TEXT NOT NULL,
    "consentimentoEm" TIMESTAMP(3) NOT NULL,
    "termoVersao" TEXT NOT NULL,
    "ultimaVisitaEm" TIMESTAMP(3) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "condominioId" TEXT NOT NULL,
    "registradoPorId" TEXT NOT NULL,

    CONSTRAINT "RostoVisitante_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RostoVisitante_ultimaVisitaEm_idx" ON "RostoVisitante"("ultimaVisitaEm");

-- CreateIndex
CREATE UNIQUE INDEX "RostoVisitante_condominioId_documento_key" ON "RostoVisitante"("condominioId", "documento");

-- AddForeignKey
ALTER TABLE "RostoVisitante" ADD CONSTRAINT "RostoVisitante_condominioId_fkey" FOREIGN KEY ("condominioId") REFERENCES "Condominio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RostoVisitante" ADD CONSTRAINT "RostoVisitante_registradoPorId_fkey" FOREIGN KEY ("registradoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

