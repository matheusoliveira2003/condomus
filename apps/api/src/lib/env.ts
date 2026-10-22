import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(8),
  PORT: z.coerce.number().default(3333),
  /// Chave da API do Resend (resend.com), para o e-mail de recuperação de senha.
  /// Sem ela, o pedido de recuperação continua funcionando, mas o e-mail não é enviado
  /// (fica só registrado no log) — útil para testar o resto do fluxo antes de configurar.
  RESEND_API_KEY: z.string().optional(),
  /// Remetente do e-mail de recuperação. O domínio onboarding@resend.dev funciona sem
  /// verificação de domínio, mas só envia para o e-mail da conta Resend (modo teste).
  EMAIL_REMETENTE: z.string().default("Condomus <onboarding@resend.dev>"),
});

export const env = schema.parse(process.env);
