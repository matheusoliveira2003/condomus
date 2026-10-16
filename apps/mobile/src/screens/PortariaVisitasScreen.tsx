import { useCallback, useMemo, useState } from "react";
import { Alert, Text, View } from "react-native";
import { api, enviar, type StatusVisita, type Visita } from "../api/client";
import { useCarregar } from "../hooks/useCarregar";
import { BotaoFlutuante, Botao, Campo, Card, Chips, Lista, MensagemErro, ModalFormulario, estilosTexto } from "../ui/componentes";
import { unidadeTexto } from "../ui/formatar";
import { SeletorUnidade } from "../ui/SeletorUnidade";
import { Avatar } from "../ui/Avatar";
import { DetalhesVisita, SeloVisita } from "../ui/visita";

const abas: { valor: StatusVisita; rotulo: string }[] = [
  { valor: "AGENDADA", rotulo: "Esperados" },
  { valor: "EM_ANDAMENTO", rotulo: "No condomínio" },
  { valor: "FINALIZADA", rotulo: "Histórico" },
];

export function PortariaVisitasScreen() {
  const [status, setStatus] = useState<StatusVisita>("AGENDADA");
  const [busca, setBusca] = useState("");
  const [registrando, setRegistrando] = useState(false);
  const { dados, carregando, erro, recarregar } = useCarregar(
    useCallback(() => api<Visita[]>(`/visitas?status=${status}`), [status]),
    [],
  );

  // Busca por nome do visitante, documento, placa ou unidade (ex.: "A-101").
  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return dados;
    return dados.filter((v) =>
      [v.nomeVisitante, v.documento, v.placaVeiculo, `${v.unidade.bloco}-${v.unidade.numero}`]
        .filter(Boolean)
        .some((campo) => campo!.toLowerCase().includes(termo)),
    );
  }, [dados, busca]);

  async function registrar(visita: Visita, acao: "entrada" | "saida") {
    try {
      await enviar("PATCH", `/visitas/${visita.id}/${acao}`);
      await recarregar();
    } catch (e) {
      Alert.alert("Erro", (e as Error).message);
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <Lista
        dados={filtradas}
        carregando={carregando}
        erro={erro}
        recarregar={recarregar}
        vazio={busca ? "Nenhum resultado para a busca" : "Nenhum visitante nesta lista"}
        cabecalho={
          <View style={{ gap: 12, marginBottom: 4 }}>
            <Chips opcoes={abas} valor={status} onChange={setStatus} />
            <Campo rotulo="Buscar" value={busca} onChangeText={setBusca} placeholder="Nome, documento, placa ou unidade" />
          </View>
        }
        renderItem={(visita) => (
          <Card>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={estilosTexto.titulo}>{visita.nomeVisitante}</Text>
              <SeloVisita status={visita.status} />
            </View>
            <Text style={estilosTexto.corpo}>{unidadeTexto(visita.unidade)}</Text>
            <DetalhesVisita visita={visita} />
            {visita.autorizadoPor && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Avatar pessoa={visita.autorizadoPor} tamanho={28} />
                <Text style={estilosTexto.secundario}>Autorizado por {visita.autorizadoPor.nome}</Text>
              </View>
            )}
            {visita.status === "AGENDADA" && <Botao titulo="Registrar entrada" pequeno onPress={() => registrar(visita, "entrada")} />}
            {visita.status === "EM_ANDAMENTO" && (
              <Botao titulo="Registrar saída" variante="secundario" pequeno onPress={() => registrar(visita, "saida")} />
            )}
          </Card>
        )}
      />
      <BotaoFlutuante icone="person-add" onPress={() => setRegistrando(true)} />
      <EntradaDiretaModal
        visivel={registrando}
        onFechar={() => setRegistrando(false)}
        onRegistrada={() => {
          setRegistrando(false);
          setStatus("EM_ANDAMENTO");
        }}
      />
    </View>
  );
}

/** Visitante que chegou sem pré-autorização (a portaria confirmou com o morador). */
function EntradaDiretaModal({ visivel, onFechar, onRegistrada }: { visivel: boolean; onFechar: () => void; onRegistrada: () => void }) {
  const [unidadeId, setUnidadeId] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [documento, setDocumento] = useState("");
  const [placa, setPlaca] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function registrar() {
    setSalvando(true);
    setErro(null);
    try {
      await enviar("POST", "/visitas/entrada-direta", {
        unidadeId,
        nomeVisitante: nome.trim(),
        documento: documento.trim() || undefined,
        placaVeiculo: placa.trim().toUpperCase() || undefined,
      });
      setUnidadeId(null);
      setNome("");
      setDocumento("");
      setPlaca("");
      onRegistrada();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <ModalFormulario visivel={visivel} titulo="Registrar entrada" onFechar={onFechar}>
      <SeletorUnidade valor={unidadeId} onChange={setUnidadeId} />
      <Campo rotulo="Nome do visitante" value={nome} onChangeText={setNome} placeholder="Nome completo" />
      <Campo rotulo="Documento" value={documento} onChangeText={setDocumento} placeholder="RG ou CPF" />
      <Campo rotulo="Placa do veículo (opcional)" value={placa} onChangeText={setPlaca} autoCapitalize="characters" />
      <MensagemErro texto={erro} />
      <Botao titulo="Registrar entrada" onPress={registrar} carregando={salvando} desabilitado={!unidadeId || nome.trim().length < 2} />
    </ModalFormulario>
  );
}
