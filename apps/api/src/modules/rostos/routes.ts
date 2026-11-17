import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { HttpError, naoEncontrado } from "../../lib/errors.js";
import { ehJpeg } from "../../lib/imagem.js";
import { StorageNaoConfiguradoError, deletarRosto, downloadRosto, uploadRosto } from "../../lib/storage.js";
import { LIMIAR_RECONHECIMENTO, expiraEm, normalizarDocumento, rostoValido } from "./regras.js";

/**
 * Versão do termo de consentimento mostrado ao visitante. O app precisa enviar exatamente esta
 * versão, para que a API grave o termo que de fato foi lido. Ao mudar o texto, mude a versão.
 */
export const TERMO_ROSTO_VERSAO = "2026-11b";

/** Mesmo limite da foto de perfil: o app já envia a imagem reduzida. */
const TAMANHO_MAXIMO = 500 * 1024;
const DOCUMENTO_MINIMO = 5;

const idParam = z.object({ id: z.uuid() });

const cadastroSchema = z.object({
  imagem: z.base64("Imagem inválida"),
  consentimento: z.literal(true, "O visitante precisa consentir com o uso do rosto"),
  termoVersao: z.string(),
});

/**
 * Rosto de referência do visitante. Só o porteiro cadastra, consulta e apaga: a foto ao vivo
 * é tirada por ele, de frente para o visitante, e a presença dele é o que impede o uso de uma
 * foto impressa ou de tela (o app não tem detecção de vivacidade).
 */
export async function rostosRoutes(app: FastifyInstance) {
  app.get("/visitas/:id/rosto", { preHandler: app.autorizar("PORTEIRO") }, async (req) => {
    const { documento } = await visitaDoRosto(req.params, req.user.condominioId);
    const rosto = await rostoValido(req.user.condominioId, documento);
    if (!rosto) return { cadastrado: false };
    return {
      cadastrado: true,
      consentimentoEm: rosto.consentimentoEm,
      ultimaVisitaEm: rosto.ultimaVisitaEm,
      expiraEm: expiraEm(rosto.ultimaVisitaEm),
      limiar: LIMIAR_RECONHECIMENTO,
    };
  });

  // A imagem é devolvida só à portaria, pela API, e nunca fica em cache.
  app.get("/visitas/:id/rosto/imagem", { preHandler: app.autorizar("PORTEIRO") }, async (req, reply) => {
    const { documento } = await visitaDoRosto(req.params, req.user.condominioId);
    if (!(await rostoValido(req.user.condominioId, documento))) throw naoEncontrado("Rosto de referência");
    const bytes = await lerStorage(() => downloadRosto(req.user.condominioId, documento));
    if (!bytes) throw naoEncontrado("Rosto de referência");
    return reply.header("Content-Type", "image/jpeg").header("Cache-Control", "private, no-store").send(bytes);
  });

  // Entrada direta: a visita ainda não existe, então a consulta é pelo documento. Ele vai no corpo,
  // e não na URL, para não aparecer nos logs de acesso.
  // O síndico também consulta (sem ver a foto): se há rosto, ele só pode liberar a entrada manualmente.
  app.post("/rostos/consulta", { preHandler: app.autorizar("PORTEIRO", "SINDICO") }, async (req) => {
    const documento = documentoDoCorpo(req.body);
    const rosto = await rostoValido(req.user.condominioId, documento);
    return rosto ? { cadastrado: true, limiar: LIMIAR_RECONHECIMENTO } : { cadastrado: false };
  });

  app.post("/rostos/imagem", { preHandler: app.autorizar("PORTEIRO") }, async (req, reply) => {
    const documento = documentoDoCorpo(req.body);
    if (!(await rostoValido(req.user.condominioId, documento))) throw naoEncontrado("Rosto de referência");
    const bytes = await lerStorage(() => downloadRosto(req.user.condominioId, documento));
    if (!bytes) throw naoEncontrado("Rosto de referência");
    return reply.header("Content-Type", "image/jpeg").header("Cache-Control", "private, no-store").send(bytes);
  });

  // Cadastra ou atualiza o rosto. Só grava se o visitante consentiu e a foto for JPEG.
  app.put("/visitas/:id/rosto", { preHandler: app.autorizar("PORTEIRO") }, async (req, reply) => {
    const { documento } = await visitaDoRosto(req.params, req.user.condominioId);
    const { imagem, termoVersao } = cadastroSchema.parse(req.body);
    if (termoVersao !== TERMO_ROSTO_VERSAO) {
      throw new HttpError(409, "O termo de consentimento mudou: atualize o app para ver a versão atual");
    }
    const bytes = Buffer.from(imagem, "base64");
    if (!ehJpeg(bytes)) throw new HttpError(400, "A foto deve ser uma imagem JPEG");
    if (bytes.length > TAMANHO_MAXIMO) throw new HttpError(400, "A foto deve ter no máximo 500 KB");

    // Um rosto ainda válido não é sobrescrito: trocar a foto exige apagar antes (e o consentimento
    // do visitante vale para a foto que ele viu ser tirada, não para outra no lugar dela).
    if (await rostoValido(req.user.condominioId, documento)) {
      throw new HttpError(409, "Este visitante já tem rosto cadastrado: apague o cadastro antes de fazer outro");
    }

    // Primeiro a foto, depois o registro: o banco só diz que há rosto quando o objeto existe.
    await lerStorage(() => uploadRosto(req.user.condominioId, documento, bytes));

    const agora = new Date();
    try {
      await prisma.rostoVisitante.upsert({
        where: { condominioId_documento: { condominioId: req.user.condominioId, documento } },
        create: {
          condominioId: req.user.condominioId,
          documento,
          consentimentoEm: agora,
          termoVersao,
          ultimaVisitaEm: agora,
          registradoPorId: req.user.sub,
        },
        update: { consentimentoEm: agora, termoVersao, ultimaVisitaEm: agora, registradoPorId: req.user.sub },
      });
    } catch (e) {
      // Sem registro no banco, a limpeza nunca acharia esta foto: apaga o objeto para não deixar biometria órfã.
      await deletarRosto(req.user.condominioId, documento).catch(() => {});
      throw e;
    }
    return reply.status(204).send();
  });

  // Apaga a pedido do visitante. Não exige o prazo: o rosto some na hora.
  app.delete("/visitas/:id/rosto", { preHandler: app.autorizar("PORTEIRO") }, async (req, reply) => {
    const { documento } = await visitaDoRosto(req.params, req.user.condominioId);
    await lerStorage(() => deletarRosto(req.user.condominioId, documento));
    await prisma.rostoVisitante.deleteMany({ where: { condominioId: req.user.condominioId, documento } });
    return reply.status(204).send();
  });
}

/** Visita do condomínio, com o documento normalizado. Recusa visitas sem documento utilizável. */
async function visitaDoRosto(params: unknown, condominioId: string) {
  const { id } = idParam.parse(params);
  const visita = await prisma.visita.findFirst({ where: { id, unidade: { condominioId } }, select: { documento: true } });
  if (!visita) throw naoEncontrado("Visita", "f");
  const documento = visita.documento ? normalizarDocumento(visita.documento) : "";
  if (documento.length < DOCUMENTO_MINIMO) {
    throw new HttpError(409, "Esta visita não tem documento válido, então o rosto não pode ser cadastrado");
  }
  return { documento };
}

const documentoSchema = z.object({ documento: z.string() });

/** Documento do corpo, normalizado; recusa o que é curto demais para identificar alguém. */
function documentoDoCorpo(corpo: unknown) {
  const documento = normalizarDocumento(documentoSchema.parse(corpo).documento);
  if (documento.length < DOCUMENTO_MINIMO) throw new HttpError(400, "Informe o documento do visitante");
  return documento;
}

/** Traduz a falta de configuração do storage em 503, como nas rotas de foto. */
async function lerStorage<T>(operacao: () => Promise<T>): Promise<T> {
  try {
    return await operacao();
  } catch (e) {
    if (e instanceof StorageNaoConfiguradoError) throw new HttpError(503, e.message);
    throw e;
  }
}
