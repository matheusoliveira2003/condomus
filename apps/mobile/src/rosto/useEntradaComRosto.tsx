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
 * Registro de entrada que respeita o rosto cadastrado. Se o visitante não tem rosto válido, registra
 * direto, como sempre. Se tem, abre a verificação (foto ao vivo, comparação e, se preciso, liberação
 * manual) e só registra depois dela. Quem chama passa `registrar`, que faz a chamada da API.
 */
export function useEntradaComRosto() {
  const mensagens = useMensagens();
  const [pendente, setPendente] = useState<Pendente | null>(null);

  async function entrar({
    nomeVisitante,
    documento,
    registrar,
    aoRegistrar,
  }: {
    nomeVisitante: string;
    documento: string | null;
    registrar: (verificacao?: VerificacaoEntrada) => Promise<void>;
    aoRegistrar: () => void;
  }) {
    try {
      const rosto = documento && documento.trim().length >= 5 ? await consultarRostoPorDocumento(documento) : null;
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
