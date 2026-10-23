import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { env } from "./env.js";

/**
 * Retorna null quando o storage não está configurado (variáveis ausentes).
 * Nesse caso, as rotas de foto devem recusar uploads com 503.
 */
function criarCliente(): S3Client | null {
  if (!env.STORAGE_BUCKET || !env.STORAGE_ACCESS_KEY_ID || !env.STORAGE_SECRET_ACCESS_KEY) return null;
  return new S3Client({
    region: env.STORAGE_REGION,
    ...(env.STORAGE_ENDPOINT && { endpoint: env.STORAGE_ENDPOINT, forcePathStyle: true }),
    credentials: { accessKeyId: env.STORAGE_ACCESS_KEY_ID, secretAccessKey: env.STORAGE_SECRET_ACCESS_KEY },
  });
}

let _cliente: S3Client | null | undefined;

/** Instância única do cliente S3 (lazy). */
function cliente(): S3Client {
  if (_cliente === undefined) _cliente = criarCliente();
  if (!_cliente) throw new StorageNaoConfiguradoError();
  return _cliente;
}

export class StorageNaoConfiguradoError extends Error {
  constructor() {
    super("O serviço de armazenamento de fotos não está configurado");
  }
}

/** Chave do objeto no bucket para a foto de um usuário. */
export const chavefoto = (usuarioId: string) => `fotos/${usuarioId}.jpg`;

/**
 * Faz upload de uma foto JPEG para o bucket.
 * Lança StorageNaoConfiguradoError se as variáveis de ambiente não estiverem configuradas.
 */
export async function uploadFoto(usuarioId: string, bytes: Buffer): Promise<void> {
  await cliente().send(
    new PutObjectCommand({
      Bucket: env.STORAGE_BUCKET,
      Key: chavefoto(usuarioId),
      Body: bytes,
      ContentType: "image/jpeg",
      // Impede acesso público direto: as fotos só são servidas pela API, que verifica permissão.
      ACL: "private",
    }),
  );
}

/**
 * Baixa a foto de um usuário do bucket.
 * Retorna null se o objeto não existir (NoSuchKey).
 */
export async function downloadFoto(usuarioId: string): Promise<Buffer | null> {
  try {
    const resposta = await cliente().send(
      new GetObjectCommand({ Bucket: env.STORAGE_BUCKET, Key: chavefoto(usuarioId) }),
    );
    const chunks: Uint8Array[] = [];
    for await (const chunk of resposta.Body as AsyncIterable<Uint8Array>) chunks.push(chunk);
    return Buffer.concat(chunks);
  } catch (e: unknown) {
    if (e instanceof Error && (e.name === "NoSuchKey" || e.name === "NotFound")) return null;
    throw e;
  }
}

/** Remove a foto de um usuário do bucket. Não lança erro se o objeto não existir. */
export async function deletarFoto(usuarioId: string): Promise<void> {
  await cliente().send(new DeleteObjectCommand({ Bucket: env.STORAGE_BUCKET, Key: chavefoto(usuarioId) }));
}
