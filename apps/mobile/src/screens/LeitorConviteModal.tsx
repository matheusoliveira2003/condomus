import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Linking, StyleSheet, Text, View } from "react-native";
import { api, enviar, type Visita } from "../api/client";
import { AVISO_ATUALIZAR, moduloCamera } from "../convite";
import { Botao, Campo, Card, MensagemErro, ModalFormulario, Selo, useEstilosTexto } from "../ui/componentes";
import { Avatar } from "../ui/Avatar";
import { data, dataHora, unidadeTexto } from "../ui/formatar";
import { DetalhesVisita, SeloVisita } from "../ui/visita";
import { useCores, useEstilos, type Paleta } from "../ui/tema";

/**
 * Portaria lê o QR code do convite (ou digita o código), confere os dados e registra a entrada.
 * Com `visitaEsperada` (botão de uma visita da lista), só aceita o convite dessa visita.
 */
export function LeitorConviteModal({
  visivel,
  visitaEsperada,
  onFechar,
  onEntrada,
}: {
  visivel: boolean;
  visitaEsperada?: Visita | null;
  onFechar: () => void;
  onEntrada: () => void;
}) {
  const cores = useCores();
  const estilosTexto = useEstilosTexto();
  const [visita, setVisita] = useState<Visita | null>(null);
  /** Código usado para encontrar a visita: a API exige ele de novo para registrar a entrada. */
  const [codigoLido, setCodigoLido] = useState<string | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [codigoDigitado, setCodigoDigitado] = useState("");
  const [registrando, setRegistrando] = useState(false);

  // Cada abertura começa do zero (câmera ligada, sem resultado anterior).
  useEffect(() => {
    if (!visivel) return;
    setVisita(null);
    setErro(null);
    setCodigoDigitado("");
  }, [visivel]);

  async function buscar(codigo: string) {
    setBuscando(true);
    setErro(null);
    try {
      const encontrada = await api<Visita>(`/visitas/codigo/${encodeURIComponent(codigo)}`);
      if (visitaEsperada && encontrada.id !== visitaEsperada.id) {
        setErro(`Este convite é de outra visita (${encontrada.nomeVisitante}), não de ${visitaEsperada.nomeVisitante}.`);
        return;
      }
      setCodigoLido(codigo);
      setVisita(encontrada);
    } catch (e) {
      setErro((e as Error).message === "Convite não encontrado(a)" ? "Convite não encontrado. Confira o código." : (e as Error).message);
    } finally {
      setBuscando(false);
    }
  }

  async function registrarEntrada() {
    if (!visita) return;
    setRegistrando(true);
    try {
      await enviar("PATCH", `/visitas/${visita.id}/entrada`, { codigo: codigoLido });
      onEntrada();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setRegistrando(false);
    }
  }

  return (
    <ModalFormulario visivel={visivel} titulo={visitaEsperada ? `Entrada de ${visitaEsperada.nomeVisitante}` : "Ler convite"} onFechar={onFechar}>
      {visitaEsperada && !visita && (
        <Text style={estilosTexto.corpo}>Leia o QR code do convite que o visitante recebeu, ou digite o código.</Text>
      )}
      {visita ? (
        <ResultadoConvite visita={visita} registrando={registrando} onRegistrar={registrarEntrada} onLerOutro={() => setVisita(null)} />
      ) : (
        <>
          {moduloCamera ? (
            <Leitor camera={moduloCamera} pausado={buscando || !!erro} onLido={buscar} />
          ) : (
            <Text style={estilosTexto.secundario}>{AVISO_ATUALIZAR} Enquanto isso, digite o código do convite.</Text>
          )}
          {buscando && <ActivityIndicator color={cores.primaria} />}
          <MensagemErro texto={erro} />
          {erro && <Botao titulo="Tentar de novo" variante="secundario" pequeno onPress={() => setErro(null)} />}
          <Campo
            rotulo="Ou digite o código do convite"
            value={codigoDigitado}
            onChangeText={setCodigoDigitado}
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder="Ex.: 7K9M2X"
            maxLength={12}
            onSubmitEditing={() => codigoDigitado.trim() && buscar(codigoDigitado)}
          />
          <Botao titulo="Buscar código" variante="secundario" onPress={() => buscar(codigoDigitado)} desabilitado={!codigoDigitado.trim() || buscando} />
        </>
      )}
    </ModalFormulario>
  );
}

/** Visor da câmera; lê um QR code por vez (para enquanto a busca do anterior acontece). */
function Leitor({ camera, pausado, onLido }: { camera: NonNullable<typeof moduloCamera>; pausado: boolean; onLido: (codigo: string) => void }) {
  const cores = useCores();
  const styles = useEstilos(criarStyles);
  const estilosTexto = useEstilosTexto();
  const [permissao, pedirPermissao] = camera.useCameraPermissions();
  // O evento de leitura dispara várias vezes por segundo; a trava evita buscas repetidas.
  const travado = useRef(false);
  useEffect(() => {
    if (!pausado) travado.current = false;
  }, [pausado]);

  if (!permissao) return <ActivityIndicator color={cores.primaria} />;
  if (!permissao.granted) {
    return (
      <View style={{ gap: 8 }}>
        <Text style={estilosTexto.corpo}>Para ler o QR code, o app precisa de acesso à câmera.</Text>
        {permissao.canAskAgain ? (
          <Botao titulo="Permitir câmera" onPress={pedirPermissao} />
        ) : (
          <Botao titulo="Abrir configurações" variante="secundario" onPress={() => Linking.openSettings()} />
        )}
      </View>
    );
  }

  return (
    <View style={styles.visor}>
      <camera.CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={
          pausado
            ? undefined
            : ({ data: conteudo }) => {
                if (travado.current) return;
                travado.current = true;
                onLido(conteudo);
              }
        }
      />
      <View style={styles.mira} pointerEvents="none" />
      <Text style={styles.dica}>Aponte para o QR code do convite</Text>
    </View>
  );
}

function ResultadoConvite({
  visita,
  registrando,
  onRegistrar,
  onLerOutro,
}: {
  visita: Visita;
  registrando: boolean;
  onRegistrar: () => void;
  onLerOutro: () => void;
}) {
  const cores = useCores();
  const estilosTexto = useEstilosTexto();
  const valido = visita.status === "AGENDADA";
  const hoje = new Date().toDateString();
  const outroDia = visita.dataPrevista && new Date(visita.dataPrevista).toDateString() !== hoje;
  const motivo: Record<Visita["status"], string> = {
    AGENDADA: "",
    EM_ANDAMENTO: `Convite já utilizado: o visitante entrou em ${visita.entradaEm ? dataHora(visita.entradaEm) : "—"}.`,
    FINALIZADA: "Convite já utilizado: esta visita já foi encerrada.",
    CANCELADA: "Convite cancelado pelo morador.",
  };

  return (
    <>
      <Card>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <Text style={[estilosTexto.titulo, { flex: 1, fontSize: 18 }]}>{visita.nomeVisitante}</Text>
          <SeloVisita status={visita.status} />
        </View>
        <Text style={estilosTexto.corpo}>{unidadeTexto(visita.unidade)}</Text>
        <DetalhesVisita visita={visita} />
        {visita.autorizadoPor && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 4 }}>
            <Avatar pessoa={visita.autorizadoPor} tamanho={40} />
            <Text style={estilosTexto.secundario}>Autorizado por {visita.autorizadoPor.nome}</Text>
          </View>
        )}
        {valido && outroDia && <Selo texto={`Atenção: visita prevista para ${data(visita.dataPrevista!)}`} tom="alerta" />}
      </Card>
      {valido ? (
        <Botao titulo="Registrar entrada" onPress={onRegistrar} carregando={registrando} />
      ) : (
        <Text style={[estilosTexto.corpo, { color: cores.perigo }]}>{motivo[visita.status]}</Text>
      )}
      <Botao titulo="Ler outro convite" variante="secundario" onPress={onLerOutro} />
    </>
  );
}

const criarStyles = (cores: Paleta) =>
  StyleSheet.create({
    visor: {
      height: 300,
      borderRadius: 16,
      overflow: "hidden",
      backgroundColor: "#000",
      alignItems: "center",
      justifyContent: "center",
    },
    mira: { width: 200, height: 200, borderWidth: 3, borderColor: "#fff", borderRadius: 20 },
    dica: { position: "absolute", bottom: 12, color: "#fff", fontWeight: "600", textShadowColor: "#000", textShadowRadius: 4 },
  });
