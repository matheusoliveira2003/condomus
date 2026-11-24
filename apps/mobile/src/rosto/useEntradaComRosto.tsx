import { useState } from "react";
import type { VerificacaoEntrada } from "../api/client";
import { consultarRostoPorDocumento } from "../hooks/queries";
import { useMensagens } from "../ui/mensagens";
import { VerificarEntradaModal } from "./VerificarEntradaModal";

interface Pendente {
  nomeVisitante: string;
  documento: string;
  limiar: number;
  registrar: (verificacao: VerificacaoEntrada) => Promise<void>;
  aoRegistrar: () => void;
}

/**
 * Como a entrada deve tratar o rosto cadastrado:
 *  - "automatico": se o visitante tem rosto válido, abre a verificação; se não, registra direto;
 *  - "rosto": o porteiro escolheu entrar pelo rosto: abre a verificação (sem o código do convite);
 *  - "convite": o código do convite já foi lido e basta como prova: registra sem pedir o rosto.
 */
export type ModoEntrada = "automatico" | "rosto" | "convite";

/**
 * Registro de entrada que respeita o rosto cadastrado. Quem chama passa `registrar`, que faz a chamada
 * da API, e o modo (ver ModoEntrada).
 */
export function useEntradaComRosto() {
  const mensagens = useMensagens();
  const [pendente, setPendente] = useState<Pendente | null>(null);

  async function entrar({
    nomeVisitante,
    documento,
    registrar,
    aoRegistrar,
    modo = "automatico",
  }: {
    nomeVisitante: string;
    documento: string | null;
    registrar: (verificacao?: VerificacaoEntrada) => Promise<void>;
    aoRegistrar: () => void;
    modo?: ModoEntrada;
  }) {
    try {
      if (modo === "convite") {
        await registrar();
        aoRegistrar();
        return;
      }
      const rosto = documento && documento.trim().length >= 5 ? await consultarRostoPorDocumento(documento) : null;
      if (modo === "rosto" && !rosto?.cadastrado) {
        // O rosto venceu ou foi apagado entre a lista e o toque: avisa em vez de registrar sem prova.
        mensagens.erro("Este visitante não tem mais rosto cadastrado. Use o QR code do convite.");
        return;
      }
      if (rosto?.cadastrado && documento) {
        setPendente({ nomeVisitante, documento, limiar: rosto.limiar, registrar, aoRegistrar });
        return;
      }
      await registrar();
      aoRegistrar();
    } catch (e) {
      mensagens.erro((e as Error).message);
    }
  }

  const modal = pendente && (
    <VerificarEntradaModal
      visivel
      nomeVisitante={pendente.nomeVisitante}
      documento={pendente.documento}
      limiar={pendente.limiar}
      referenciaUrl="/rostos/imagem"
      corpoReferencia={{ documento: pendente.documento }}
      registrar={pendente.registrar}
      onFechar={() => setPendente(null)}
      onRegistrada={() => {
        const depois = pendente.aoRegistrar;
        setPendente(null);
        depois();
      }}
    />
  );

  return { entrar, modal };
}
