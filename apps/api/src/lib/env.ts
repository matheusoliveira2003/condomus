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

  // --- Object Storage (S3 ou compatível) para fotos de perfil ---
  /// Nome do bucket onde as fotos são armazenadas.
  STORAGE_BUCKET: z.string().optional(),
  /// Região do bucket (ex.: us-east-1). Obrigatório para AWS; para R2/MinIO pode ser qualquer valor.
  STORAGE_REGION: z.string().default("us-east-1"),
  /// Endpoint customizado para serviços compatíveis (Cloudflare R2, MinIO, etc.).
  /// Para AWS S3 padrão, omitir.
  STORAGE_ENDPOINT: z.string().url().optional(),
  /// Access key ID da credencial com permissão no bucket.
  STORAGE_ACCESS_KEY_ID: z.string().optional(),
  /// Secret access key correspondente.
  STORAGE_SECRET_ACCESS_KEY: z.string().optional(),
});

export const env = schema.parse(process.env);
