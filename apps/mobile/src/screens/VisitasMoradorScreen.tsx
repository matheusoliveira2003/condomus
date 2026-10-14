import { useCallback, useState } from "react";
import { Alert, Text, View } from "react-native";
import { api, enviar, type Visita } from "../api/client";
import { useCarregar } from "../hooks/useCarregar";
import { BotaoFlutuante, Botao, Campo, Card, Chips, Lista, MensagemErro, ModalFormulario, estilosTexto } from "../ui/componentes";
import { DetalhesVisita, SeloVisita, proximosDias } from "../ui/visita";

export function VisitasMoradorScreen() {
  const { dados, carregando, erro, recarregar } = useCarregar(useCallback(() => api<Visita[]>("/visitas"), []), []);
  const [agendando, setAgendando] = useState(false);

  function cancelar(visita: Visita) {
    Alert.alert("Cancelar visita", `Cancelar a autorização de ${visita.nomeVisitante}?`, [
      { text: "Voltar", style: "cancel" },
      {
        text: "Cancelar visita",
        style: "destructive",
        onPress: () =>
          enviar("PATCH", `/visitas/${visita.id}/cancelar`).then(recarregar).catch((e: Error) => Alert.alert("Erro", e.message)),
      },
    ]);
  }

  return (
    <View style={{ flex: 1 }}>
      <Lista
        dados={dados}
        carregando={carregando}
        erro={erro}
        recarregar={recarregar}
        vazio="Nenhum visitante autorizado"
        renderItem={(visita) => (
          <Card>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={estilosTexto.titulo}>{visita.nomeVisitante}</Text>
              <SeloVisita status={visita.status} />
            </View>
            <DetalhesVisita visita={visita} />
            {visita.status === "AGENDADA" && (
              <Botao titulo="Cancelar autorização" variante="secundario" pequeno onPress={() => cancelar(visita)} />
            )}
          </Card>
        )}
      />
      <BotaoFlutuante icone="person-add" onPress={() => setAgendando(true)} />
      <AgendarVisitaModal
        visivel={agendando}
        onFechar={() => setAgendando(false)}
        onCriada={() => {
          setAgendando(false);
          void recarregar();
        }}
      />
    </View>
  );
}

const SEM_DATA = "sem-data";

function AgendarVisitaModal({ visivel, onFechar, onCriada }: { visivel: boolean; onFechar: () => void; onCriada: () => void }) {
  const [nome, setNome] = useState("");
  const [documento, setDocumento] = useState("");
  const [placa, setPlaca] = useState("");
  const [dia, setDia] = useState<string>(SEM_DATA);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function autorizar() {
    setSalvando(true);
    setErro(null);
    try {
      await enviar("POST", "/visitas", {
        nomeVisitante: nome.trim(),
        documento: documento.trim() || undefined,
        placaVeiculo: placa.trim().toUpperCase() || undefined,
        dataPrevista: dia === SEM_DATA ? undefined : dia,
      });
      setNome("");
      setDocumento("");
      setPlaca("");
      setDia(SEM_DATA);
      onCriada();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <ModalFormulario visivel={visivel} titulo="Autorizar visitante" onFechar={onFechar}>
      <Campo rotulo="Nome do visitante" value={nome} onChangeText={setNome} placeholder="Nome completo" />
      <Campo rotulo="Documento (opcional)" value={documento} onChangeText={setDocumento} placeholder="RG ou CPF" />
      <Campo rotulo="Placa do veículo (opcional)" value={placa} onChangeText={setPlaca} autoCapitalize="characters" placeholder="ABC1D23" />
      <View style={{ gap: 8 }}>
        <Text style={estilosTexto.titulo}>Quando?</Text>
        <Chips opcoes={[{ valor: SEM_DATA, rotulo: "Qualquer dia" }, ...proximosDias(7)]} valor={dia} onChange={setDia} />
      </View>
      <MensagemErro texto={erro} />
      <Botao titulo="Autorizar" onPress={autorizar} carregando={salvando} desabilitado={nome.trim().length < 2} />
    </ModalFormulario>
  );
}
