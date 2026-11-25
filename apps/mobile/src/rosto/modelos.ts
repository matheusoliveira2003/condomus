import { loadTensorflowModel, type TensorflowModel } from "react-native-fast-tflite";
import { Asset } from "expo-asset";

/**
 * Modelos TensorFlow Lite do reconhecimento facial, carregados uma vez por sessão.
 * - blazeface: detecção de rosto (MediaPipe BlazeFace short range, Apache-2.0).
 * - mobilefacenet: assinatura facial. Arquitetura e código do sirius-ai/MobileFaceNet_TF
 *   (Apache-2.0); os pesos foram treinados no MS1M-refine-v2, que é só para pesquisa. Projeto acadêmico apresentado no Tech Day 2026 2° Semestre | Unimax - Centro Universitário Max Planck, sem uso comercial.
 */
const FONTES = {
  blazeface: () => require("../../assets/modelos/blazeface.tflite"),
  mobilefacenet: () => require("../../assets/modelos/mobilefacenet.tflite"),
} as const;

export type NomeModelo = keyof typeof FONTES;

const carregados: Partial<Record<NomeModelo, Promise<TensorflowModel>>> = {};

export function carregarModelo(nome: NomeModelo): Promise<TensorflowModel> {
  // No Android, o require do .tflite vira um nome de recurso, não um arquivo. O expo-asset
  // copia o modelo para o cache e devolve uma URI de arquivo, que o módulo nativo consegue abrir.
  const promessa = (carregados[nome] ??= (async () => {
    const [asset] = await Asset.loadAsync(FONTES[nome]());
    return loadTensorflowModel({ url: asset.localUri ?? asset.uri }, []);
  })());
  promessa.catch(() => {
    delete carregados[nome]; // permite tentar de novo após um erro
  });
  return promessa;
}
