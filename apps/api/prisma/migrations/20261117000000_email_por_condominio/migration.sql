-- DropIndex
DROP INDEX "Usuario_email_key";

-- CreateIndex
CREATE INDEX "Usuario_email_idx" ON "Usuario"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_condominioId_email_key" ON "Usuario"("condominioId", "email");

