import { useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { Botao, Card, MensagemErro, ModalFormulario, Selo, useEstilosTexto } from "../ui/componentes";
import { useCores, useEstilos, type Paleta } from "../ui/tema";
import { gerarAssinatura, semelhanca, type Medidas } from "./comparacao";
import { CapturaRosto, type Camera } from "./CapturaRosto";

/**
 * PROVA TÉCNICA (branch feature/reconhecimento-facial-prova). Compara duas capturas ao vivo
 * no aparelho e mostra a semelhança, para calibrar o limiar. Não é o fluxo final da portaria.
 */
export function ProvaRostoModal({ visivel, onFechar }: { visivel: boolean; onFechar: () => void }) {
  const cores = useCores();
  const styles = useEstilos(criarStyles);
  const estilosTexto = useEstilosTexto();
  const [fotoA, setFotoA] = useState<string | null>(null);
  const [fotoB, setFotoB] = useState<string | null>(null);
  const [resultado, setResultado] = useState<number | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [tempoMs, setTempoMs] = useState<number | null>(null);
  const [detalhes, setDetalhes] = useState<string>("");
  /** PROVA TÉCNICA: câmera usada nas capturas; remover junto com este modal. */
  const [camera, setCamera] = useState<Camera>("front");
  /** Qual foto está sendo tirada agora, ou null. Só uma captura por vez. */
  const [capturando, setCapturando] = useState<"A" | "B" | null>(null);

  function capturada(base64: string) {
    if (capturando === "A") setFotoA(base64);
    else if (capturando === "B") setFotoB(base64);
    setCapturando(null);
    setResultado(null);
  }

  async function comparar() {
    if (!fotoA || !fotoB) return;
    setErro(null);
    setOcupado(true);
    try {
      const inicio = Date.now();
      // Em sequência: o interpretador do modelo é único, e chamadas paralelas se misturam.
      const ma: Medidas = {};
      const mb: Medidas = {};
      const a = await gerarAssinatura(fotoA, ma);
      const b = await gerarAssinatura(fotoB, mb);
      const texto = (m: Medidas) => Object.entries(m).map(([k, v]) => `${k} ${v}`).join(" · ");
      setDetalhes(`Foto 1: ${texto(ma)}\nFoto 2: ${texto(mb)}`);
      setTempoMs(Date.now() - inicio);
      setResultado(semelhanca(a, b));
    } catch (e) {
      setErro(`Falha ao comparar: ${(e as Error).message}`);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <ModalFormulario visivel={visivel} titulo="Teste de reconhecimento" onFechar={onFechar}>
      <Card>
        <Text style={estilosTexto.secundario}>
          Siga as orientações da câmera: a foto é tirada sozinha quando o rosto estiver centralizado e parado. A comparação roda no aparelho. Anote o valor para calibrar o limiar.
        </Text>
      </Card>

      {capturando ? (
        <Card>
          <Text style={estilosTexto.titulo}>Foto {capturando === "A" ? "1" : "2"}</Text>
          {/* key: ao trocar de câmera, o visor recomeça do zero (orientador e detecção). */}
          <CapturaRosto key={camera} onCapturada={capturada} camera={camera} />
          <Botao
            titulo={camera === "front" ? "Usar câmera traseira" : "Usar câmera frontal"}
            variante="secundario"
            onPress={() => setCamera((atual) => (atual === "front" ? "back" : "front"))}
          />
          <Botao titulo="Cancelar" variante="discreto" onPress={() => setCapturando(null)} />
        </Card>
      ) : (
        <View style={styles.linha}>
          <Quadro titulo="Foto 1" foto={fotoA} onTirar={() => setCapturando("A")} styles={styles} cores={cores} />
          <Quadro titulo="Foto 2" foto={fotoB} onTirar={() => setCapturando("B")} styles={styles} cores={cores} />
        </View>
      )}

      <MensagemErro texto={erro} />

      <Botao titulo="Comparar" onPress={comparar} carregando={ocupado} desabilitado={!fotoA || !fotoB || ocupado || !!capturando} />

      {resultado !== null && (
        <Card>
          <Text style={styles.valor}>{resultado.toFixed(4)}</Text>
          <Text style={estilosTexto.secundario}>
            Semelhança de cosseno (1 = idêntico). Tempo: {tempoMs} ms para as duas fotos.
          </Text>
          <Text style={estilosTexto.secundario}>{detalhes}</Text>
          <View style={{ flexDirection: "row", marginTop: 8 }}>
            <Selo texto="Limiar ainda não calibrado" tom="alerta" />
          </View>
        </Card>
      )}
    </ModalFormulario>
  );
}

function Quadro({
  titulo,
  foto,
  onTirar,
  styles,
  cores,
}: {
  titulo: string;
  foto: string | null;
  onTirar: () => void;
  styles: ReturnType<typeof criarStyles>;
  cores: Paleta;
}) {
  const estilosTexto = useEstilosTexto();
  return (
    <View style={styles.quadro}>
      <Text style={estilosTexto.titulo}>{titulo}</Text>
      <View style={styles.moldura}>
        {foto ? (
          <Image source={{ uri: `data:image/jpeg;base64,${foto}` }} style={styles.imagem} />
        ) : (
          <Text style={{ color: cores.textoSecundario }}>Sem foto</Text>
        )}
      </View>
      <Botao titulo={foto ? "Tirar de novo" : "Tirar foto"} variante="secundario" pequeno onPress={onTirar} />
    </View>
  );
}

const criarStyles = (cores: Paleta) =>
  StyleSheet.create({
    linha: { flexDirection: "row", gap: 12 },
    quadro: { flex: 1, gap: 8 },
    moldura: {
      aspectRatio: 1,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: cores.borda,
      backgroundColor: cores.neutroClaro,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
    },
    imagem: { width: "100%", height: "100%" },
    valor: { fontSize: 32, fontWeight: "700", color: cores.texto },
  });
