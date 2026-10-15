-- CreateTable
CREATE TABLE "DispositivoPush" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "usuarioId" TEXT NOT NULL,

    CONSTRAINT "DispositivoPush_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DispositivoPush_token_key" ON "DispositivoPush"("token");

-- AddForeignKey
ALTER TABLE "DispositivoPush" ADD CONSTRAINT "DispositivoPush_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
