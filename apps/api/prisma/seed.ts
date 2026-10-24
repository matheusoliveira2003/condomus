import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const senhaHash = await bcrypt.hash("123456", 10);

  // Condomínio de demonstração (plano ativo). Em produção, condomínios são criados via POST /admin/condominios.
  const condominio =
    (await prisma.condominio.findFirst({ where: { nome: "Condomínio Demo" } })) ??
    (await prisma.condominio.create({ data: { nome: "Condomínio Demo", planoStatus: "ATIVO" } }));
  const condominioId = condominio.id;

  const unidade = await prisma.unidade.upsert({
    where: { condominioId_bloco_numero: { condominioId, bloco: "A", numero: "101" } },
    update: {},
    create: { condominioId, bloco: "A", numero: "101" },
  });

  // Unidades extras para a portaria ter opções ao registrar encomendas e visitas.
  for (const [bloco, numero] of [["A", "102"], ["A", "201"], ["B", "101"], ["B", "102"]]) {
    await prisma.unidade.upsert({
      where: { condominioId_bloco_numero: { condominioId, bloco, numero } },
      update: {},
      create: { condominioId, bloco, numero },
    });
  }

  const usuarios = [
    { nome: "Matheus Paulo Oliveira", email: "matheuspo@condomus.dev", papel: "SINDICO" as const, unidadeId: null },
    { nome: "Gabriel Lopes Ramos", email: "gabriellr@condomus.dev", papel: "MORADOR" as const, unidadeId: unidade.id },
    { nome: "Nathan Martinez Lazarete", email: "nathanml@condomus.dev", papel: "PORTEIRO" as const, unidadeId: null },
  ];
  for (const u of usuarios) {
    await prisma.usuario.upsert({ where: { email: u.email }, update: {}, create: { ...u, condominioId, senhaHash } });
  }

  for (const nome of ["Salão de festas", "Churrasqueira", "Quadra"]) {
    await prisma.areaComum.upsert({
      where: { condominioId_nome: { condominioId, nome } },
      update: {},
      create: { condominioId, nome },
    });
  }

  console.log("Seed concluído. Senha de todos os usuários: 123456");
}

main().finally(() => prisma.$disconnect());
