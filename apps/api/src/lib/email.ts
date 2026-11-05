import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { env } from "./env.js";

const RESEND_URL = "https://api.resend.com/emails";

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

/** Cabeçalho com o logo inline e o nome da marca. */
function cabecalho() {
  const imagem = logoBase64
    ? `<img src="cid:${LOGO_CID}" width="44" height="44" alt="Condomus" style="display: block; border-radius: 10px;" />`
    : "";
  return `
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom: 16px;">
          <tr>
            ${imagem ? `<td style="padding-right: 12px;">${imagem}</td>` : ""}
            <td style="font-size: 22px; font-weight: bold; color: #1E3A5F;">Condomus</td>
          </tr>
        </table>`;
}

/** Só o primeiro nome, já escapado para entrar no HTML (o nome vem de um cadastro). */
export function saudacaoNome(nomeCompleto: string) {
  const primeiro = nomeCompleto.trim().split(/\s+/)[0] ?? "";
  return primeiro.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** E-mail com o código de recuperação de senha (válido por 15 minutos). */
export function enviarCodigoRecuperacao(para: string, nome: string, codigo: string) {
  void enviarEmail({
    para,
    assunto: "Código para redefinir sua senha — Condomus",
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        ${cabecalho()}
        <p>Olá, ${saudacaoNome(nome)}</p>
        <p>Use o código abaixo para redefinir sua senha. Ele vale por 15 minutos.</p>
        <p style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #1E3A5F; text-align: center; padding: 16px; background: #F5F7FA; border-radius: 8px;">
          ${codigo}
        </p>
        <p style="color: #5B6472; font-size: 14px;">
          Se você não pediu essa recuperação, pode ignorar este e-mail — sua senha continua a mesma.
        </p>
      </div>
    `,
  });
}

/** E-mail de boas-vindas enviado quando o síndico cadastra um novo usuário. */
export function enviarBoasVindas(para: string, nome: string, senhaTemporaria: string) {
  void enviarEmail({
    para,
    assunto: "Bem-vindo ao Condomus — sua conta foi criada",
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        ${cabecalho()}
        <p>Olá, ${saudacaoNome(nome)}</p>
        <p>Sua conta foi criada pelo síndico do seu condomínio. Use as credenciais abaixo para fazer seu primeiro acesso pelo app.</p>
        <p style="font-size: 13px; color: #5B6472;">Seu e-mail de acesso:</p>
        <p style="font-size: 16px; font-weight: bold; color: #1E3A5F;">${para}</p>
        <p style="font-size: 13px; color: #5B6472; margin-top: 16px;">Senha temporária:</p>
        <p style="font-size: 28px; font-weight: bold; letter-spacing: 6px; color: #1E3A5F; text-align: center; padding: 16px; background: #F5F7FA; border-radius: 8px;">
          ${senhaTemporaria}
        </p>
        <p style="color: #5B6472; font-size: 14px;">
          Você será solicitado a trocar essa senha no primeiro acesso.
        </p>
      </div>
    `,
  });
}

/** E-mail com o código de confirmação de troca de e-mail (válido por 15 minutos). */
export function enviarCodigoTrocaEmail(para: string, nome: string, codigo: string) {
  void enviarEmail({
    para,
    assunto: "Confirme seu novo e-mail — Condomus",
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        ${cabecalho()}
        <p>Olá, ${saudacaoNome(nome)}</p>
        <p>Use o código abaixo para confirmar seu novo endereço de e-mail. Ele vale por 15 minutos.</p>
        <p style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #1E3A5F; text-align: center; padding: 16px; background: #F5F7FA; border-radius: 8px;">
          ${codigo}
        </p>
        <p style="color: #5B6472; font-size: 14px;">
          Se você não pediu essa alteração, ignore este e-mail — seu e-mail continua o mesmo.
        </p>
      </div>
    `,
  });
}
