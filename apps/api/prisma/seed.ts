import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const senhaHash = await bcrypt.hash("123456", 10);

  const unidade = await prisma.unidade.upsert({
    where: { bloco_numero: { bloco: "A", numero: "101" } },
    update: {},
    create: { bloco: "A", numero: "101" },
  });

  // Unidades extras para a portaria ter opções ao registrar encomendas e visitas.
  for (const [bloco, numero] of [["A", "102"], ["A", "201"], ["B", "101"], ["B", "102"]]) {
    await prisma.unidade.upsert({ where: { bloco_numero: { bloco, numero } }, update: {}, create: { bloco, numero } });
  }

  const usuarios = [
    { nome: "Maria Moradora", email: "morador@condomus.dev", papel: "MORADOR" as const, unidadeId: unidade.id },
    { nome: "João Porteiro", email: "portaria@condomus.dev", papel: "PORTEIRO" as const, unidadeId: null },
    { nome: "Ana Síndica", email: "sindico@condomus.dev", papel: "SINDICO" as const, unidadeId: null },
  ];
  for (const u of usuarios) {
    await prisma.usuario.upsert({ where: { email: u.email }, update: {}, create: { ...u, senhaHash } });
  }

  for (const nome of ["Salão de festas", "Churrasqueira", "Quadra"]) {
    await prisma.areaComum.upsert({ where: { nome }, update: {}, create: { nome } });
  }

  console.log("Seed concluído. Senha de todos os usuários: 123456");
}

main().finally(() => prisma.$disconnect());
