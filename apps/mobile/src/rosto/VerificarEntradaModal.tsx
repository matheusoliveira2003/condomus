import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { API_URL, obterToken, type VerificacaoEntrada } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { Botao, Campo, Card, MensagemErro, ModalFormulario, useEstilosTexto } from "../ui/componentes";
import { useCores, useEstilos, type Paleta } from "../ui/tema";
import { bytesParaBase64 } from "./base64";
import { CapturaRosto } from "./CapturaRosto";
import { gerarAssinatura, semelhanca } from "./comparacao";

/**
 * Entrada de um visitante que já tem rosto cadastrado. O porteiro só tira a foto ao vivo: o app
 * compara com o rosto cadastrado e, se a semelhança passar do limiar, libera a entrada sozinho.
 * Se não reconhecer, o porteiro tenta de novo ou libera manualmente, com o motivo, depois de
 * conferir o documento. A semelhança não aparece para o porteiro: ela só é registrada.
 *
 * `registrar` é quem de fato registra a entrada com a verificação (lista, QR code ou entrada direta).
 * Se lançar erro, a mensagem aparece aqui e o porteiro pode tentar de novo.
 */
export function VerificarEntradaModal({
  visivel,
  nomeVisitante,
  documento,
  limiar,
  referenciaUrl,
  corpoReferencia,
  registrar,
  onFechar,
  onRegistrada,
}: {
  visivel: boolean;
  nomeVisitante: string;
  documento: string;
  limiar: number;
  /** Caminho (sem o domínio) que devolve a foto de referência. */
  referenciaUrl: string;
  /** Corpo da requisição POST da referência, quando o caminho é por documento. */
  corpoReferencia?: object;
  registrar: (verificacao: VerificacaoEntrada) => Promise<void>;
  onFechar: () => void;
  onRegistrada: () => void;
}) {
  const estilosTexto = useEstilosTexto();
  // Só o porteiro captura o rosto; o síndico só pode liberar manualmente.
  const ehPorteiro = useAuth().usuario?.papel === "PORTEIRO";
  const [etapa, setEtapa] = useState<"captura" | "comparando" | "recusado" | "manual">(ehPorteiro ? "captura" : "manual");
  const [valor, setValor] = useState<number | null>(null);
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const referencia = useReferencia(visivel && ehPorteiro, referenciaUrl, corpoReferencia);

  // Cada abertura recomeça do zero.
  useEffect(() => {
    if (!visivel) return;
    setEtapa(ehPorteiro ? "captura" : "manual");
    setValor(null);
    setMotivo("");
    setErro(null);
  }, [visivel, ehPorteiro]);

  async function aoCapturar(aoVivo: string) {
    if (!referencia.base64) {
      setErro(referencia.erro ?? "A foto de referência ainda não carregou");
      return;
    }
    setErro(null);
    setEtapa("comparando");
    try {
      // Em sequência: o interpretador do modelo é único, e chamadas paralelas se misturam.
      const a = await gerarAssinatura(referencia.base64);
      const b = await gerarAssinatura(aoVivo);
      const encontrado = semelhanca(a, b);
      setValor(encontrado);
      if (encontrado >= limiar) {
        await enviar({ tipo: "RECONHECIMENTO", semelhanca: encontrado });
      } else {
        setEtapa("recusado");
      }
    } catch (e) {
      setErro(`Não foi possível comparar: ${(e as Error).message}`);
      setEtapa("recusado");
    }
  }

  async function enviar(verificacao: VerificacaoEntrada) {
    setEnviando(true);
    setErro(null);
    try {
      await registrar(verificacao);
      onRegistrada();
    } catch (e) {
      setErro((e as Error).message);
      setEtapa("recusado");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <ModalFormulario visivel={visivel} titulo={`Entrada de ${nomeVisitante}`} onFechar={onFechar}>
      {etapa === "captura" && (
        <Card>
          <Text style={estilosTexto.titulo}>Foto ao vivo</Text>
          {referencia.carregando ? (
            <Carregando />
          ) : referencia.erro ? (
            <>
              <MensagemErro texto={referencia.erro} />
              <Botao titulo="Liberar manualmente" variante="secundario" onPress={() => setEtapa("manual")} />
            </>
          ) : (
            <CapturaRosto onCapturada={aoCapturar} />
          )}
          <MensagemErro texto={erro} />
        </Card>
      )}

      {etapa === "comparando" && (
        <>
          <Carregando />
          <Text style={[estilosTexto.secundario, { textAlign: "center" }]}>{enviando ? "Registrando a entrada…" : "Comparando a biometria…"}</Text>
        </>
      )}

      {etapa === "recusado" && (
        <>
          <Resultado icone="close-circle" cor="perigo" titulo="Biometria não reconhecida" />
          <MensagemErro texto={erro} />
          <Text style={estilosTexto.corpo}>
            Tente de novo com boa luz, de frente e sem boné. Se o visitante for mesmo quem diz ser, confira o documento e libere manualmente.
          </Text>
          <Botao titulo="Tentar de novo" onPress={() => setEtapa("captura")} desabilitado={enviando} />
          <Botao titulo="Liberar manualmente" variante="secundario" onPress={() => setEtapa("manual")} desabilitado={enviando} />
        </>
      )}

      {etapa === "manual" && (
        <>
          <Text style={estilosTexto.titulo}>Liberação manual</Text>
          <Text style={estilosTexto.corpo}>
            Documento do visitante: {documento}. Confira o documento antes de liberar. O motivo fica registrado junto com o seu nome.
          </Text>
          <Campo rotulo="Motivo" value={motivo} onChangeText={setMotivo} placeholder="Ex.: documento conferido; luz ruim na portaria" maxLength={200} />
          <MensagemErro texto={erro} />
          <Botao
            titulo="Liberar entrada"
            onPress={() => enviar({ tipo: "MANUAL", motivo: motivo.trim(), ...(valor !== null && { semelhanca: valor }) })}
            carregando={enviando}
            desabilitado={motivo.trim().length < 5}
          />
          {ehPorteiro && <Botao titulo="Voltar" variante="discreto" onPress={() => setEtapa("captura")} desabilitado={enviando} />}
        </>
      )}
    </ModalFormulario>
  );
}

function Carregando() {
  const cores = useCores();
  return <ActivityIndicator color={cores.primaria} style={{ marginVertical: 32 }} />;
}

function Resultado({ icone, cor, titulo }: { icone: keyof typeof Ionicons.glyphMap; cor: "perigo"; titulo: string }) {
  const cores = useCores();
  const styles = useEstilos(criarStyles);
  const estilosTexto = useEstilosTexto();
  return (
    <View style={styles.resultado}>
      <Ionicons name={icone} size={56} color={cores[cor]} />
      <Text style={[estilosTexto.titulo, { fontSize: 20 }]}>{titulo}</Text>
    </View>
  );
}

/**
 * Baixa a foto de referência com o token. A rota não permite cache, e a imagem fica só na
 * memória desta tela, para a comparação.
 */
function useReferencia(ativo: boolean, caminho: string, corpo?: object) {
  const [base64, setBase64] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const chaveCorpo = corpo ? JSON.stringify(corpo) : undefined;
  useEffect(() => {
    if (!ativo) return;
    let vivo = true;
    setBase64(null);
    setErro(null);
    setCarregando(true);
    (async () => {
      try {
        const resposta = await fetch(`${API_URL}${caminho}`, {
          method: chaveCorpo ? "POST" : "GET",
          headers: { Authorization: `Bearer ${obterToken()}`, ...(chaveCorpo ? { "Content-Type": "application/json" } : {}) },
          body: chaveCorpo,
        });
        if (!resposta.ok) throw new Error("Não foi possível carregar a foto de referência");
        const bytes = new Uint8Array(await resposta.arrayBuffer());
        if (vivo) setBase64(bytesParaBase64(bytes));
      } catch (e) {
        if (vivo) setErro((e as Error).message);
      } finally {
        if (vivo) setCarregando(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [ativo, caminho, chaveCorpo]);
  return { base64, carregando, erro };
}

const criarStyles = (_cores: Paleta) =>
  StyleSheet.create({
    resultado: { alignItems: "center", gap: 8, paddingVertical: 16 },
  });
