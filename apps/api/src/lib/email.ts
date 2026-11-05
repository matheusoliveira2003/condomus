import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { env } from "./env.js";

const RESEND_URL = "https://api.resend.com/emails";

/** Paleta do app (apps/mobile/src/ui/tema.ts), com o âmbar do logo. */
const cor = {
  primaria: "#1E3A5F",
  primariaClara: "#E3ECF7",
  fundo: "#F5F7FA",
  borda: "#E2E8F0",
  texto: "#0F1B2D",
  secundario: "#5B6472",
  ambar: "#F5B544",
  alertaClaro: "#FEF3C7",
  alerta: "#B45309",
};

/**
 * Logo embutido no corpo do e-mail (imagem inline via cid). O Gmail não mostra a foto
 * do remetente sem BIMI, então a marca aparece no cabeçalho da mensagem.
 */
const LOGO_CID = "condomus-logo";
const logoBase64 = (() => {
  try {
    return readFileSync(fileURLToPath(new URL("../../assets/email/logo.png", import.meta.url))).toString("base64");
  } catch {
    return null; // sem o arquivo, o e-mail sai só com o nome da marca em texto
  }
})();

/**
 * Envia um e-mail via Resend. Nunca lança: se faltar a chave de API ou a Resend
 * recusar o envio, apenas registra no log — um e-mail de recuperação não deve
 * derrubar o pedido (a resposta à pessoa é sempre a mesma, com ou sem e-mail).
 */
async function enviarEmail({ para, assunto, html }: { para: string; assunto: string; html: string }) {
  if (!env.RESEND_API_KEY) {
    console.warn(`[email] RESEND_API_KEY não configurada — e-mail para ${para} não foi enviado. Assunto: ${assunto}`);
    return;
  }
  const anexos = logoBase64
    ? [{ filename: "logo.png", content: logoBase64, content_id: LOGO_CID, content_type: "image/png" }]
    : undefined;
  try {
    const resposta = await fetch(RESEND_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: env.EMAIL_REMETENTE, to: para, subject: assunto, html, attachments: anexos }),
    });
    if (!resposta.ok) console.error(`[email] Resend respondeu ${resposta.status}: ${await resposta.text()}`);
  } catch (erro) {
    console.error("[email] Falha ao enviar", erro);
  }
}

/** Escapa texto que vem de fora (nome, e-mail) antes de entrar no HTML. */
function escapar(texto: string) {
  return texto.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** Só o primeiro nome, já escapado (o nome vem de um cadastro). */
export function saudacaoNome(nomeCompleto: string) {
  return escapar(nomeCompleto.trim().split(/\s+/)[0] ?? "");
}

/**
 * Moldura comum dos e-mails: cartão branco sobre o fundo claro do app, com a marca
 * no topo, filete âmbar e rodapé. Tabelas e estilos inline porque é o que os clientes
 * de e-mail (Gmail, Outlook) renderizam de forma confiável.
 */
function moldura(conteudo: string) {
  const imagem = logoBase64
    ? `<td style="padding-right: 12px; vertical-align: middle;"><img src="cid:${LOGO_CID}" width="40" height="40" alt="" style="display: block; border-radius: 10px;" /></td>`
    : "";
  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background: ${cor.fundo}; padding: 32px 12px;">
  <tr>
    <td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 480px; background: #FFFFFF; border: 1px solid ${cor.borda}; border-radius: 16px; font-family: Arial, Helvetica, sans-serif;">
        <tr>
          <td style="padding: 24px 32px 20px 32px; border-bottom: 3px solid ${cor.ambar}; border-radius: 16px 16px 0 0;">
            <table role="presentation" cellpadding="0" cellspacing="0">
              <tr>
                ${imagem}
                <td style="font-size: 20px; font-weight: bold; color: ${cor.primaria}; vertical-align: middle;">Condomus</td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding: 28px 32px; font-size: 15px; line-height: 22px; color: ${cor.texto};">
            ${conteudo}
          </td>
        </tr>
        <tr>
          <td style="padding: 16px 32px 24px 32px; font-size: 12px; line-height: 18px; color: ${cor.secundario}; border-top: 1px solid ${cor.borda};">
            Mensagem automática do Condomus. Este endereço não recebe respostas.
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;
}

/** Bloco azul claro que destaca um código ou uma senha. */
function destaque(valor: string, tamanho: number) {
  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 20px 0;">
  <tr>
    <td align="center" style="background: ${cor.primariaClara}; border-radius: 12px; padding: 18px 12px; font-size: ${tamanho}px; font-weight: bold; letter-spacing: 8px; color: ${cor.primaria};">
      ${valor}
    </td>
  </tr>
</table>`;
}

/** Aviso em âmbar claro, para o que exige ação ou cuidado. */
function aviso(texto: string) {
  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 20px 0 0 0;">
  <tr>
    <td style="background: ${cor.alertaClaro}; border-radius: 10px; padding: 12px 14px; font-size: 14px; line-height: 20px; color: ${cor.alerta};">
      ${texto}
    </td>
  </tr>
</table>`;
}

const rotulo = (texto: string) => `<p style="margin: 0 0 4px 0; font-size: 13px; color: ${cor.secundario};">${texto}</p>`;
const nota = (texto: string) => `<p style="margin: 16px 0 0 0; font-size: 13px; line-height: 19px; color: ${cor.secundario};">${texto}</p>`;

/** E-mail com o código de recuperação de senha (válido por 15 minutos). */
export function enviarCodigoRecuperacao(para: string, nome: string, codigo: string) {
  void enviarEmail({
    para,
    assunto: "Código para redefinir sua senha — Condomus",
    html: moldura(`
      <p style="margin: 0;">Olá, ${saudacaoNome(nome)}</p>
      <p style="margin: 12px 0 0 0;">Use o código abaixo para redefinir sua senha. Ele vale por 15 minutos.</p>
      ${destaque(codigo, 30)}
      ${nota("Se você não pediu essa recuperação, pode ignorar este e-mail. Sua senha continua a mesma.")}
    `),
  });
}

/** E-mail de boas-vindas enviado quando o síndico cadastra um novo usuário. */
export function enviarBoasVindas(para: string, nome: string, senhaTemporaria: string) {
  void enviarEmail({
    para,
    assunto: "Bem-vindo ao Condomus — sua conta foi criada",
    html: moldura(`
      <p style="margin: 0;">Olá, ${saudacaoNome(nome)}</p>
      <p style="margin: 12px 0 0 0;">Sua conta foi criada pelo síndico do seu condomínio. Use as credenciais abaixo para fazer seu primeiro acesso pelo app.</p>
      <div style="margin-top: 20px;">
        ${rotulo("E-mail de acesso")}
        <p style="margin: 0; font-size: 16px; font-weight: bold; color: ${cor.primaria};">${escapar(para)}</p>
      </div>
      <div style="margin-top: 16px;">
        ${rotulo("Senha temporária")}
      </div>
      ${destaque(escapar(senhaTemporaria), 26)}
      ${aviso("Você será solicitado a trocar essa senha no primeiro acesso.")}
    `),
  });
}

/** E-mail com o código de confirmação de troca de e-mail (válido por 15 minutos). */
export function enviarCodigoTrocaEmail(para: string, nome: string, codigo: string) {
  void enviarEmail({
    para,
    assunto: "Confirme seu novo e-mail — Condomus",
    html: moldura(`
      <p style="margin: 0;">Olá, ${saudacaoNome(nome)}</p>
      <p style="margin: 12px 0 0 0;">Use o código abaixo para confirmar seu novo endereço de e-mail. Ele vale por 15 minutos.</p>
      ${destaque(codigo, 30)}
      ${nota("Se você não pediu essa alteração, ignore este e-mail. Seu e-mail continua o mesmo.")}
    `),
  });
}
