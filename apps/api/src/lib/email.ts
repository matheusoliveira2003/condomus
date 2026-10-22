import { env } from "./env.js";

const RESEND_URL = "https://api.resend.com/emails";

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
  try {
    const resposta = await fetch(RESEND_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: env.EMAIL_REMETENTE, to: para, subject: assunto, html }),
    });
    if (!resposta.ok) console.error(`[email] Resend respondeu ${resposta.status}: ${await resposta.text()}`);
  } catch (erro) {
    console.error("[email] Falha ao enviar", erro);
  }
}

/** E-mail com o código de recuperação de senha (válido por 15 minutos). */
export function enviarCodigoRecuperacao(para: string, nome: string, codigo: string) {
  void enviarEmail({
    para,
    assunto: "Código para redefinir sua senha — Condomus",
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #1E3A5F;">Condomus</h2>
        <p>Olá, ${nome}!</p>
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
