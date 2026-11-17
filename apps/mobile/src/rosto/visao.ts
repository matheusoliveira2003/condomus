/**
 * Módulos da câmera de captura ao vivo (react-native-vision-camera). Carregados sob demanda:
 * num app instalado antes deles, o import quebraria o app inteiro; assim, só a verificação
 * avisa que é preciso atualizar.
 */
function carregar<T>(nome: () => T): T | null {
  try {
    return nome();
  } catch {
    return null;
  }
}

export const moduloVisao: typeof import("react-native-vision-camera") | null = carregar(() =>
  require("react-native-vision-camera"),
);

export const moduloWorklets: typeof import("react-native-worklets") | null = carregar(() =>
  require("react-native-worklets"),
);
