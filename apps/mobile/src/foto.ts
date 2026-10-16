import type * as ExpoImagePicker from "expo-image-picker";
import type * as ExpoImageManipulator from "expo-image-manipulator";

/** Lado da foto enviada à API: suficiente para o avatar e leve (~30–50 KB). */
const LADO = 400;

export type OrigemFoto = "galeria" | "camera";

/**
 * Abre a galeria ou a câmera, deixa recortar em quadrado e devolve a foto já
 * reduzida, em JPEG base64. Devolve null se a pessoa cancelar.
 *
 * As bibliotecas são carregadas só aqui: num app instalado antes delas existirem,
 * o import quebraria o app inteiro; assim, só esta ação avisa que é preciso atualizar.
 */
export async function escolherFoto(origem: OrigemFoto): Promise<string | null> {
  let ImagePicker: typeof ExpoImagePicker;
  let ImageManipulator: typeof ExpoImageManipulator;
  try {
    ImagePicker = require("expo-image-picker");
    ImageManipulator = require("expo-image-manipulator");
  } catch {
    throw new Error("Esta versão do app não tem suporte a fotos. Instale a versão mais recente do app.");
  }

  if (origem === "camera") {
    const permissao = await ImagePicker.requestCameraPermissionsAsync();
    if (!permissao.granted) throw new Error("Permita o acesso à câmera nas configurações do celular.");
  }
  const opcoes: ExpoImagePicker.ImagePickerOptions = { mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 1 };
  const escolha =
    origem === "camera" ? await ImagePicker.launchCameraAsync(opcoes) : await ImagePicker.launchImageLibraryAsync(opcoes);
  if (escolha.canceled) return null;

  const contexto = ImageManipulator.ImageManipulator.manipulate(escolha.assets[0].uri);
  contexto.resize({ width: LADO, height: null });
  const imagem = await contexto.renderAsync();
  const salva = await imagem.saveAsync({ format: ImageManipulator.SaveFormat.JPEG, compress: 0.7, base64: true });
  if (!salva.base64) throw new Error("Não foi possível processar a foto.");
  return salva.base64;
}
