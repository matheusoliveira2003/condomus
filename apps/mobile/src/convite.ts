import type * as ExpoCamera from "expo-camera";
import type * as ExpoFileSystem from "expo-file-system";
import type * as ExpoSharing from "expo-sharing";
import { API_URL, obterToken } from "./api/client";

// As bibliotecas nativas são carregadas sob demanda: num app instalado antes delas,
// o import quebraria o app inteiro; assim, só a funcionalidade avisa que é preciso atualizar.
const AVISO_ATUALIZAR = "Esta versão do app não tem suporte a esta função. Instale a versão mais recente do app.";

function carregar<T>(nome: () => T): T | null {
  try {
    return nome();
  } catch {
    return null;
  }
}

/** Módulo de câmera, ou null se o app instalado não o tiver. Resultado fixo durante a execução. */
export const moduloCamera: typeof ExpoCamera | null = carregar(() => require("expo-camera"));

/** URL da imagem do QR code do convite (exige o cabeçalho de login). */
export const urlQrConvite = (visitaId: string) => `${API_URL}/visitas/${visitaId}/convite.png`;

/** Baixa a imagem do QR code e abre o menu de compartilhamento (WhatsApp, e-mail…). */
export async function compartilharConvite(visitaId: string, nomeVisitante: string) {
  const FS = carregar<typeof ExpoFileSystem>(() => require("expo-file-system"));
  const Sharing = carregar<typeof ExpoSharing>(() => require("expo-sharing"));
  if (!FS || !Sharing) throw new Error(AVISO_ATUALIZAR);
  if (!(await Sharing.isAvailableAsync())) throw new Error("Compartilhamento indisponível neste aparelho.");

  const destino = new FS.File(FS.Paths.cache, `convite-condomus-${visitaId}.png`);
  const arquivo = await FS.File.downloadFileAsync(urlQrConvite(visitaId), destino, {
    headers: { Authorization: `Bearer ${obterToken()}` },
    idempotent: true,
  });
  await Sharing.shareAsync(arquivo.uri, { mimeType: "image/png", dialogTitle: `Convite para ${nomeVisitante}` });
}

export { AVISO_ATUALIZAR };
