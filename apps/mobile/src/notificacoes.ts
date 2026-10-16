import { useEffect } from "react";
import { Platform } from "react-native";
import { isRunningInExpoGo } from "expo";
import Constants from "expo-constants";
import * as Device from "expo-device";
import type * as ExpoNotifications from "expo-notifications";
import type { NavigationContainerRefWithCurrent } from "@react-navigation/native";
import type { Papel } from "./api/client";

/** Mesmo id usado pela API ao enviar (campo channelId). */
const CANAL_ANDROID = "padrao";

/**
 * Desde o SDK 53 o Expo Go no Android não tem os módulos nativos de push: só importar
 * expo-notifications já derruba o app. Por isso a biblioteca só é carregada quando há
 * suporte (development build, ou Expo Go no iPhone); nos demais casos fica null.
 */
const Notifications: typeof ExpoNotifications | null =
  Platform.OS === "android" && isRunningInExpoGo() ? null : require("expo-notifications");

// Com o app aberto, a notificação também aparece como banner.
Notifications?.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * Pede permissão e devolve o token de push do Expo deste celular, ou null quando
 * não for possível (emulador, permissão negada, Expo Go no Android, projeto sem EAS).
 * Nunca lança erro: notificação é um recurso extra, o app funciona sem ela.
 */
export async function obterTokenPush(): Promise<string | null> {
  if (!Notifications || !Device.isDevice) return null;

  try {
    if (Platform.OS === "android") {
      // No Android 13+, o pedido de permissão só aparece depois que existe um canal.
      await Notifications.setNotificationChannelAsync(CANAL_ANDROID, {
        name: "Avisos do condomínio",
        importance: Notifications.AndroidImportance.HIGH,
      });
    }

    const atual = await Notifications.getPermissionsAsync();
    const permissao = atual.granted ? atual : await Notifications.requestPermissionsAsync();
    if (!permissao.granted) return null;

    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) {
      console.warn("[push] Projeto sem EAS projectId — rode `npx eas-cli init` em apps/mobile");
      return null;
    }
    return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  } catch (erro) {
    console.warn("[push] Não foi possível obter o token", erro);
    return null;
  }
}

/**
 * Ao tocar numa notificação, abre a aba indicada em `data.aba` (ex.: "Encomendas").
 * O morador não tem aba Avisos: nesse caso abre o Início com a lista de avisos aberta.
 */
export function useAbrirAbaDaNotificacao(
  navegacao: NavigationContainerRefWithCurrent<ReactNavigation.RootParamList>,
  ativo: boolean,
  papel: Papel | undefined,
) {
  useEffect(() => {
    if (!ativo || !Notifications) return;

    const abrir = (resposta: ExpoNotifications.NotificationResponse | null, tentativas = 10) => {
      const aba = resposta?.notification.request.content.data?.aba;
      if (typeof aba !== "string") return;
      // Logo após o login as abas ainda estão montando; tenta de novo em instantes.
      if (navegacao.isReady()) {
        // As rotas não são tipadas (as abas variam por perfil), daí a conversão.
        const ir = navegacao.navigate as unknown as (rota: string, params?: object) => void;
        if (aba === "Avisos" && papel === "MORADOR") ir("Início", { verAvisos: true });
        else ir(aba);
      }
      else if (tentativas > 0) setTimeout(() => abrir(resposta, tentativas - 1), 100);
    };

    // App aberto a partir de uma notificação (estava fechado).
    abrir(Notifications.getLastNotificationResponse());
    Notifications.clearLastNotificationResponse();

    const assinatura = Notifications.addNotificationResponseReceivedListener((r) => abrir(r));
    return () => assinatura.remove();
  }, [navegacao, ativo, papel]);
}
