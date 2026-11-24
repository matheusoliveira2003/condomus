import { buildApp } from "./app.js";
import { env } from "./lib/env.js";
import { cancelarVisitasVencidas } from "./lib/validadeVisita.js";
import { limparRostosVencidos } from "./modules/rostos/regras.js";
import { limparMensagensAntigas } from "./modules/chat/regras.js";

const app = await buildApp();
await app.listen({ port: env.PORT, host: "0.0.0.0" });

/**
 * Limpezas periódicas, no próprio processo: ao iniciar e a cada 6 horas, pois não há agendador
 * externo. Se o servidor ficar parado, elas atrasam, mas a API já não usa o que venceu (rosto
 * vencido não é servido e convite vencido não permite entrada), então nada vencido é usado nesse intervalo.
 * Cada limpeza é isolada: a falha de uma não impede a outra.
 */
const INTERVALO_LIMPEZA_MS = 6 * 60 * 60 * 1000;
async function limpar() {
  try {
    const { apagados, falhas } = await limparRostosVencidos();
    if (apagados || falhas) app.log.info({ apagados, falhas }, "Limpeza de rostos vencidos");
  } catch (e) {
    app.log.error(e, "Falha na limpeza de rostos vencidos");
  }
  try {
    const canceladas = await cancelarVisitasVencidas();
    if (canceladas) app.log.info({ canceladas }, "Convites vencidos cancelados");
  } catch (e) {
    app.log.error(e, "Falha ao cancelar convites vencidos");
  }
  try {
    const { apagadas, falhas } = await limparMensagensAntigas();
    if (apagadas || falhas) app.log.info({ apagadas, falhas }, "Mensagens do chat com mais de 90 dias apagadas");
  } catch (e) {
    app.log.error(e, "Falha ao apagar mensagens antigas do chat");
  }
}
void limpar();
setInterval(limpar, INTERVALO_LIMPEZA_MS).unref();
