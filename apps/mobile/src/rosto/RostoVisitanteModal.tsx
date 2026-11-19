import { useState } from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { Visita } from "../api/client";
import { useApagarRosto, useCadastrarRosto, useRostoVisitante } from "../hooks/queries";
import { Botao, Card, MensagemErro, ModalFormulario, useEstilosTexto } from "../ui/componentes";
import { data } from "../ui/formatar";
import { useMensagens } from "../ui/mensagens";
import { useCores, useEstilos, type Paleta } from "../ui/tema";
import { CapturaRosto } from "./CapturaRosto";
import { TERMO_ROSTO_PARAGRAFOS, TERMO_ROSTO_VERSAO } from "./termo";

/**
 * Cadastro do rosto do visitante pela portaria. Sem rosto de referência, o porteiro lê o termo para
 * o visitante e, com o consentimento dele, cadastra o rosto. Com rosto cadastrado, a tela só mostra
 * a validade e permite apagar a pedido do visitante. A comparação acontece na entrada
 * (VerificarEntradaModal), sem o porteiro decidir pelo número.
 */
export function RostoVisitanteModal({ visita, onFechar }: { visita: Visita | null; onFechar: () => void }) {
  const visitaId = visita?.id ?? null;
  const { data: rosto, isLoading, error, refetch } = useRostoVisitante(visitaId);
  const titulo = visita ? `Rosto de ${visita.nomeVisitante}` : "Rosto do visitante";

  return (
    <ModalFormulario visivel={!!visita} titulo={titulo} onFechar={onFechar}>
      {/* key nas duas etapas: cada visita começa do zero, sem foto ou resultado de outra. */}
      {isLoading || !visitaId ? (
        <Carregando />
      ) : error ? (
        <>
          <MensagemErro texto={(error as Error).message} />
          <Botao titulo="Tentar de novo" variante="secundario" onPress={() => refetch()} />
        </>
      ) : rosto?.cadastrado ? (
        <Cadastrado key={visitaId} visitaId={visitaId} expiraEm={rosto.expiraEm} onApagado={onFechar} />
      ) : (
        <Cadastro key={visitaId} visitaId={visitaId} onCadastrado={onFechar} />
      )}
    </ModalFormulario>
  );
}

function Carregando() {
  const cores = useCores();
  return <ActivityIndicator color={cores.primaria} style={{ marginVertical: 32 }} />;
}

/** Primeira visita: termo, consentimento e captura do rosto de referência. */
function Cadastro({ visitaId, onCadastrado }: { visitaId: string; onCadastrado: () => void }) {
  const cores = useCores();
  const styles = useEstilos(criarStyles);
  const estilosTexto = useEstilosTexto();
  const mensagens = useMensagens();
  const cadastrar = useCadastrarRosto();
  const [consentiu, setConsentiu] = useState(false);
  const [capturando, setCapturando] = useState(false);
  const [foto, setFoto] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar() {
    if (!foto) return;
    setErro(null);
    try {
      await cadastrar.mutateAsync({ visitaId, imagem: foto, termoVersao: TERMO_ROSTO_VERSAO });
      mensagens.sucesso("Rosto cadastrado");
      onCadastrado();
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  if (capturando) {
    return (
      <Card>
        <Text style={estilosTexto.titulo}>Foto de referência</Text>
        <CapturaRosto
          onCapturada={(base64) => {
            setFoto(base64);
            setCapturando(false);
          }}
        />
        <Botao titulo="Cancelar" variante="discreto" onPress={() => setCapturando(false)} />
      </Card>
    );
  }

  return (
    <>
      <Card>
        <Text style={estilosTexto.titulo}>Leia para o visitante</Text>
        {TERMO_ROSTO_PARAGRAFOS.map((paragrafo) => (
          <Text key={paragrafo} style={estilosTexto.corpo}>
            {paragrafo}
          </Text>
        ))}
      </Card>

      <Pressable
        onPress={() => setConsentiu((c) => !c)}
        style={styles.consentimento}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: consentiu }}
      >
        <View style={[styles.caixa, consentiu && styles.caixaMarcada]}>
          {consentiu && <Ionicons name="checkmark" size={16} color={cores.textoSobreCor} />}
        </View>
        <Text style={[estilosTexto.corpo, { flex: 1 }]}>O visitante leu ou ouviu o termo e autorizou o cadastro do rosto.</Text>
      </Pressable>

      {foto && (
        <View style={styles.moldura}>
          <Image source={{ uri: `data:image/jpeg;base64,${foto}` }} style={styles.imagem} />
        </View>
      )}

      <MensagemErro texto={erro} />

      {foto ? (
        <>
          <Botao titulo="Cadastrar rosto" onPress={salvar} carregando={cadastrar.isPending} desabilitado={!consentiu} />
          <Botao titulo="Tirar de novo" variante="secundario" onPress={() => setCapturando(true)} desabilitado={cadastrar.isPending} />
        </>
      ) : (
        <Botao titulo="Tirar foto do rosto" onPress={() => setCapturando(true)} desabilitado={!consentiu} />
      )}
    </>
  );
}

/** Rosto já cadastrado: mostra até quando vale e permite apagar. Não exibe a foto nem a semelhança. */
function Cadastrado({ visitaId, expiraEm, onApagado }: { visitaId: string; expiraEm: string; onApagado: () => void }) {
  const estilosTexto = useEstilosTexto();
  const mensagens = useMensagens();
  const apagar = useApagarRosto();

  function pedirExclusao() {
    mensagens.confirmar({
      titulo: "Apagar rosto",
      texto: "A foto de referência deste visitante será apagada agora. Na próxima visita, o cadastro precisa ser feito de novo.",
      confirmar: "Apagar",
      perigo: true,
      aoConfirmar: async () => {
        try {
          await apagar.mutateAsync(visitaId);
          mensagens.sucesso("Rosto apagado");
          onApagado();
        } catch (e) {
          mensagens.erro((e as Error).message);
        }
      },
    });
  }

  return (
    <>
      <Card>
        <Text style={estilosTexto.titulo}>Rosto cadastrado</Text>
        <Text style={estilosTexto.corpo}>
          Na entrada, o app compara o rosto do visitante com o cadastro e libera sozinho quando reconhece.
        </Text>
        <Text style={estilosTexto.secundario}>Válido até {data(expiraEm)}. Cada nova entrada do visitante renova o prazo.</Text>
      </Card>
      <Botao titulo="Apagar rosto a pedido do visitante" variante="secundario" onPress={pedirExclusao} desabilitado={apagar.isPending} />
    </>
  );
}

const criarStyles = (cores: Paleta) =>
  StyleSheet.create({
    linha: { flexDirection: "row", gap: 12 },
    quadro: { flex: 1, gap: 8 },
    moldura: {
      aspectRatio: 3 / 4,
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
    consentimento: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 4 },
    caixa: {
      width: 22,
      height: 22,
      borderRadius: 6,
      borderWidth: 2,
      borderColor: cores.borda,
      alignItems: "center",
      justifyContent: "center",
    },
    caixaMarcada: { backgroundColor: cores.primaria, borderColor: cores.primaria },
  });
