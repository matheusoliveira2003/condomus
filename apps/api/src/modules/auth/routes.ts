import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { HttpError, naoEncontrado } from "../../lib/errors.js";
import { enviarCodigoRecuperacao, enviarCodigoTrocaEmail } from "../../lib/email.js";
import { gerarCodigoNumerico } from "../../lib/codigo.js";
import { emitirSessao } from "../../lib/sessao.js";

/** O código de recuperação vale por este tempo após ser gerado. */
const VALIDADE_CODIGO_MINUTOS = 15;

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  senha: z.string().min(1),
});

const trocarSenhaSchema = z
  .object({
    senhaAtual: z.string().min(1),
    novaSenha: z.string().min(6, "A nova senha deve ter pelo menos 6 caracteres"),
  })
  .refine((s) => s.senhaAtual !== s.novaSenha, { message: "A nova senha deve ser diferente da atual", path: ["novaSenha"] });

const trocarEmailSchema = z.object({
  novoEmail: z.string().trim().toLowerCase().pipe(z.email("E-mail inválido")),
  senhaAtual: z.string().min(1, "Informe sua senha atual"),
});

const confirmarEmailSchema = z.object({
  codigo: z.string().trim().regex(/^\d{6}$/, "O código tem 6 números"),
});

const pedirRecuperacaoSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
});

const redefinirSenhaSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  codigo: z.string().trim().regex(/^\d{6}$/, "O código tem 6 números"),
  novaSenha: z.string().min(6, "A nova senha deve ter pelo menos 6 caracteres"),
});

export async function authRoutes(app: FastifyInstance) {
  app.post("/auth/login", async (req) => {
    const { email, senha } = loginSchema.parse(req.body);
    const usuario = await prisma.usuario.findUnique({ where: { email } });
    if (!usuario || !usuario.ativo || !(await bcrypt.compare(senha, usuario.senhaHash))) {
      throw new HttpError(401, "E-mail ou senha inválidos");
    }
    // Limpa código de recuperação expirado que porventura ficou para trás (fire-and-forget).
    if (usuario.codigoRecuperacaoExpira && usuario.codigoRecuperacaoExpira < new Date()) {
      prisma.usuario
        .update({ where: { id: usuario.id }, data: { codigoRecuperacaoHash: null, codigoRecuperacaoExpira: null } })
        .catch(() => {});
    }
    return emitirSessao(app, usuario);
  });

  app.get("/auth/me", { preHandler: app.autorizar() }, async (req) => {
    const usuario = await prisma.usuario.findUnique({
      where: { id: req.user.sub },
      select: { id: true, nome: true, email: true, papel: true, unidade: true, fotoAtualizadaEm: true, senhaTemporaria: true },
    });
    if (!usuario) throw naoEncontrado("Usuário");
    return usuario;
  });

  app.patch("/auth/senha", { preHandler: app.autorizar() }, async (req, reply) => {
    const { senhaAtual, novaSenha } = trocarSenhaSchema.parse(req.body);
    const usuario = await prisma.usuario.findUnique({ where: { id: req.user.sub } });
    if (!usuario) throw naoEncontrado("Usuário");
    // Senha temporária: não exige verificação da senha atual (o usuário não a conhece).
    // Senha normal: verifica a senha atual antes de trocar.
    if (!usuario.senhaTemporaria) {
      if (!(await bcrypt.compare(senhaAtual, usuario.senhaHash))) throw new HttpError(400, "Senha atual incorreta");
    }
    // Incrementa tokenVersion: invalida tokens antigos. Zera senhaTemporaria no primeiro login.
    await prisma.usuario.update({
      where: { id: usuario.id },
      data: { senhaHash: await bcrypt.hash(novaSenha, 10), tokenVersion: { increment: 1 }, senhaTemporaria: false },
    });
    return reply.status(204).send();
  });

  // Esqueci a senha — passo 1: pede o código por e-mail. A resposta é sempre a mesma, exista ou
  // não o e-mail (e exista ou não erro no envio), para não revelar quais e-mails têm conta.
  app.post("/auth/recuperar-senha", async (req, reply) => {
    const { email } = pedirRecuperacaoSchema.parse(req.body);
    const usuario = await prisma.usuario.findUnique({ where: { email } });
    if (usuario?.ativo) {
      const codigo = gerarCodigoNumerico();
      await prisma.usuario.update({
        where: { id: usuario.id },
        data: {
          codigoRecuperacaoHash: await bcrypt.hash(codigo, 10),
          codigoRecuperacaoExpira: new Date(Date.now() + VALIDADE_CODIGO_MINUTOS * 60 * 1000),
        },
      });
      enviarCodigoRecuperacao(usuario.email, usuario.nome, codigo);
    }
    return reply.status(204).send();
  });

  // Esqueci a senha — passo 2: confere o código e define a nova senha.
  app.post("/auth/redefinir-senha", async (req) => {
    const { email, codigo, novaSenha } = redefinirSenhaSchema.parse(req.body);
    const usuario = await prisma.usuario.findUnique({ where: { email } });
    const codigoValido =
      usuario?.ativo &&
      usuario.codigoRecuperacaoHash &&
      usuario.codigoRecuperacaoExpira &&
      usuario.codigoRecuperacaoExpira > new Date() &&
      (await bcrypt.compare(codigo, usuario.codigoRecuperacaoHash));
    if (!codigoValido) throw new HttpError(400, "Código inválido ou expirado");
    // Invalida o código: ele não pode ser usado de novo.
    await prisma.usuario.update({
      where: { id: usuario.id },
      data: { senhaHash: await bcrypt.hash(novaSenha, 10), codigoRecuperacaoHash: null, codigoRecuperacaoExpira: null },
    });
    return { ok: true };
  });

  // Trocar e-mail — passo 1: valida senha atual, salva e-mail pendente e envia código para o novo e-mail.
  app.post("/auth/trocar-email", { preHandler: app.autorizar() }, async (req, reply) => {
    const { novoEmail, senhaAtual } = trocarEmailSchema.parse(req.body);
    const usuario = await prisma.usuario.findUnique({ where: { id: req.user.sub } });
    if (!usuario) throw naoEncontrado("Usuário");
    if (novoEmail === usuario.email) throw new HttpError(400, "O novo e-mail deve ser diferente do atual");
    if (!(await bcrypt.compare(senhaAtual, usuario.senhaHash))) throw new HttpError(400, "Senha incorreta");
    // Verifica se o novo e-mail já está em uso por outra conta.
    const existente = await prisma.usuario.findUnique({ where: { email: novoEmail } });
    if (existente) throw new HttpError(400, "Este e-mail já está em uso");
    const codigo = gerarCodigoNumerico();
    await prisma.usuario.update({
      where: { id: usuario.id },
      data: {
        emailPendente: novoEmail,
        codigoEmailHash: await bcrypt.hash(codigo, 10),
        codigoEmailExpira: new Date(Date.now() + VALIDADE_CODIGO_MINUTOS * 60 * 1000),
      },
    });
    enviarCodigoTrocaEmail(novoEmail, usuario.nome, codigo);
    return reply.status(204).send();
  });

  // Trocar e-mail — passo 2: valida o código e efetiva a troca de e-mail.
  app.post("/auth/confirmar-email", { preHandler: app.autorizar() }, async (req) => {
    const { codigo } = confirmarEmailSchema.parse(req.body);
    const usuario = await prisma.usuario.findUnique({ where: { id: req.user.sub } });
    if (!usuario) throw naoEncontrado("Usuário");
    const codigoValido =
      usuario.emailPendente &&
      usuario.codigoEmailHash &&
      usuario.codigoEmailExpira &&
      usuario.codigoEmailExpira > new Date() &&
      (await bcrypt.compare(codigo, usuario.codigoEmailHash));
    if (!codigoValido) throw new HttpError(400, "Código inválido ou expirado");
    // Efetiva a troca: atualiza e-mail, limpa campos pendentes e invalida tokens antigos.
    await prisma.usuario.update({
      where: { id: usuario.id },
      data: {
        email: usuario.emailPendente!,
        emailPendente: null,
        codigoEmailHash: null,
        codigoEmailExpira: null,
        tokenVersion: { increment: 1 },
      },
    });
    return { ok: true };
  });
}
