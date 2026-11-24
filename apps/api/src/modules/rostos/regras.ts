import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { HttpError, proibido } from "../../lib/errors.js";
import { deletarRosto } from "../../lib/storage.js";

/**
 * O rosto de referência vale enquanto o visitante continuar vindo: o prazo conta a partir da
 * última entrada registrada. Passado esse prazo sem visitas, o rosto é apagado.
 */
export const PRAZO_DIAS_ROSTO = 30;
const MS_DIA = 24 * 60 * 60 * 1000;

/** Documento só com letras e dígitos, em maiúsculas: "123.456.789-00" e "12345678900" são o mesmo visitante. */
export const normalizarDocumento = (documento: string) => documento.toUpperCase().replace(/[^A-Z0-9]/g, "");

/** Data a partir da qual a última visita ainda mantém o rosto válido. */
export const limiteValidade = (agora: Date = new Date()) => new Date(agora.getTime() - PRAZO_DIAS_ROSTO * MS_DIA);

/** Data em que o rosto vence, se não houver nova visita. */
export const expiraEm = (ultimaVisitaEm: Date) => new Date(ultimaVisitaEm.getTime() + PRAZO_DIAS_ROSTO * MS_DIA);

/**
 * PROVISÓRIO: semelhança mínima (cosseno, de -1 a 1) para o app liberar a entrada sem o porteiro
 * decidir. Ainda não foi calibrado: nos testes, o maior valor entre pessoas diferentes foi 0,47 e o
 * menor entre a mesma pessoa foi 0,52, então a liberação manual existe justamente para os erros.
 * O app lê este valor da API (GET /visitas/:id/rosto), então mudar aqui não exige novo app.
 */
export const LIMIAR_RECONHECIMENTO = 0.6;

export const estaVencido = (ultimaVisitaEm: Date, agora: Date = new Date()) => ultimaVisitaEm < limiteValidade(agora);

/**
 * Chamado quando a portaria registra a entrada de um visitante. Renova o prazo só se o rosto
 * ainda estiver válido: um rosto já vencido não volta à vida; ele é apagado pela limpeza.
 */
export async function renovarPrazoRosto(condominioId: string, documento: string | null) {
  if (!documento) return;
  await prisma.rostoVisitante.updateMany({
    where: { condominioId, documento: normalizarDocumento(documento), ultimaVisitaEm: { gte: limiteValidade() } },
    data: { ultimaVisitaEm: new Date() },
  });
}

/**
 * Apaga os rostos vencidos. Primeiro remove a foto do bucket; só depois apaga a linha. Se a foto
 * não puder ser removida, a linha fica e a próxima rodada tenta de novo.
 */
export async function limparRostosVencidos(agora: Date = new Date()) {
  const vencidos = await prisma.rostoVisitante.findMany({
    where: { ultimaVisitaEm: { lt: limiteValidade(agora) } },
    select: { id: true, condominioId: true, documento: true },
  });
  let apagados = 0;
  let falhas = 0;
  for (const rosto of vencidos) {
    try {
      await deletarRosto(rosto.condominioId, rosto.documento);
      await prisma.rostoVisitante.delete({ where: { id: rosto.id } });
      apagados++;
    } catch {
      falhas++;
    }
  }
  return { apagados, falhas };
}

/** Rosto do visitante ainda dentro do prazo. Um rosto vencido não conta, mesmo que a limpeza não tenha rodado. */
export async function rostoValido(condominioId: string, documento: string) {
  return prisma.rostoVisitante.findFirst({
    where: { condominioId, documento, ultimaVisitaEm: { gte: limiteValidade() } },
    select: { consentimentoEm: true, ultimaVisitaEm: true },
  });
}

const semelhancaSchema = z.number().min(-1).max(1);

/** Como a entrada de um visitante com rosto cadastrado foi verificada, enviado pelo app. */
export const verificacaoSchema = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("RECONHECIMENTO"), semelhanca: semelhancaSchema }),
  z.object({
    tipo: z.literal("MANUAL"),
    motivo: z.string().trim().min(5, "Informe o motivo da liberação manual").max(200),
    /** Semelhança que o app calculou antes da recusa, quando houve tentativa. */
    semelhanca: semelhancaSchema.optional(),
  }),
]);
export type Verificacao = z.infer<typeof verificacaoSchema>;

/**
 * Regra da entrada de um visitante: se ele tem rosto cadastrado e válido, a entrada só é
 * registrada com reconhecimento (semelhança acima do limiar, enviada pelo porteiro) ou com
 * liberação manual e motivo. Sem rosto válido, nada muda. Devolve os campos a gravar na visita.
 *
 * A semelhança é calculada no aparelho: a API não consegue refazer a conta, só recusar um valor
 * abaixo do limiar e guardar o que foi informado e por quem.
 */
export async function dadosDaVerificacao(
  usuario: { papel: string; condominioId: string },
  documento: string | null,
  verificacao: Verificacao | undefined,
  /** O convite (QR code) já foi conferido: então o rosto é uma alternativa, não uma exigência. */
  { dispensavel = false }: { dispensavel?: boolean } = {},
) {
  const normalizado = documento ? normalizarDocumento(documento) : "";
  if (!normalizado || !(await rostoValido(usuario.condominioId, normalizado))) return {};
  if (!verificacao) {
    if (dispensavel) return {};
    throw new HttpError(409, "Este visitante tem biometria cadastrada: confira a biometria para registrar a entrada");
  }
  if (verificacao.tipo === "RECONHECIMENTO") {
    // Só o porteiro captura o rosto ao vivo; o síndico só pode liberar manualmente.
    if (usuario.papel !== "PORTEIRO") throw proibido();
    if (verificacao.semelhanca < LIMIAR_RECONHECIMENTO) {
      throw new HttpError(400, "A semelhança está abaixo do necessário: libere manualmente, com o motivo, ou tente de novo");
    }
    return { verificacao: "RECONHECIMENTO" as const, semelhanca: verificacao.semelhanca };
  }
  return { verificacao: "MANUAL" as const, semelhanca: verificacao.semelhanca ?? null, motivoLiberacao: verificacao.motivo };
}
