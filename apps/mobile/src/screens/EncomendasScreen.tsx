import { useCallback, useState } from "react";
import { Alert, Text, View } from "react-native";
import { api, enviar, type Encomenda } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { useCarregar } from "../hooks/useCarregar";
import {
  BotaoFlutuante,
  Botao,
  Campo,
  Card,
  Chips,
  LinkHistorico,
  Lista,
  MensagemErro,
  ModalFormulario,
  ModalTela,
  Selo,
  estilosTexto,
} from "../ui/componentes";
import { dataHora, unidadeTexto } from "../ui/formatar";
import { SeletorUnidade } from "../ui/SeletorUnidade";

type Filtro = Encomenda["status"];

/** Quantos itens o histórico mostra (os mais recentes). */
const LIMITE_HISTORICO = 50;

export function EncomendasScreen() {
  const { usuario } = useAuth();
  const ehPortaria = usuario?.papel !== "MORADOR";
  const [filtro, setFiltro] = useState<Filtro>("AGUARDANDO_RETIRADA");
  const [registrando, setRegistrando] = useState(false);
  const [retirando, setRetirando] = useState<Encomenda | null>(null);
  const [vendoHistorico, setVendoHistorico] = useState(false);
  const { dados, carregando, erro, recarregar } = useCarregar(
    // O morador vê só o que está na portaria (retiradas ficam no histórico); a portaria filtra por status.
    useCallback(() => api<Encomenda[]>(`/encomendas?status=${ehPortaria ? filtro : "AGUARDANDO_RETIRADA"}`), [ehPortaria, filtro]),
    [],
  );

  return (
    <View style={{ flex: 1 }}>
      <Lista
        dados={dados}
        carregando={carregando}
        erro={erro}
        recarregar={recarregar}
        vazio={ehPortaria ? "Nenhuma encomenda nesta lista" : "Nenhuma encomenda esperando por você"}
        cabecalho={
          ehPortaria ? (
            <View style={{ marginBottom: 4 }}>
              <Chips
                opcoes={[
                  { valor: "AGUARDANDO_RETIRADA" as const, rotulo: "Aguardando retirada" },
                  { valor: "RETIRADA" as const, rotulo: "Retiradas" },
                ]}
                valor={filtro}
                onChange={setFiltro}
              />
            </View>
          ) : (
            <LinkHistorico texto="Ver histórico de retiradas" onPress={() => setVendoHistorico(true)} />
          )
        }
        renderItem={(e) => <CardEncomenda encomenda={e} ehPortaria={ehPortaria} onRetirar={() => setRetirando(e)} />}
      />
      {ehPortaria && <BotaoFlutuante icone="cube" onPress={() => setRegistrando(true)} />}
      <NovaEncomendaModal
        visivel={registrando}
        onFechar={() => setRegistrando(false)}
        onCriada={() => {
          setRegistrando(false);
          if (filtro === "AGUARDANDO_RETIRADA") void recarregar();
          else setFiltro("AGUARDANDO_RETIRADA");
        }}
      />
      <ModalTela visivel={vendoHistorico} titulo="Encomendas retiradas" onFechar={() => setVendoHistorico(false)}>
        <HistoricoEncomendas />
      </ModalTela>
      <RetiradaModal
        encomenda={retirando}
        onFechar={() => setRetirando(null)}
        onRetirada={() => {
          setRetirando(null);
          void recarregar();
        }}
      />
    </View>
  );
}

function CardEncomenda({ encomenda: e, ehPortaria, onRetirar }: { encomenda: Encomenda; ehPortaria?: boolean; onRetirar?: () => void }) {
  return (
    <Card>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <Text style={[estilosTexto.titulo, { flex: 1 }]}>{e.descricao}</Text>
        {e.status === "AGUARDANDO_RETIRADA" ? <Selo texto="Na portaria" tom="alerta" /> : <Selo texto="Retirada" tom="sucesso" />}
      </View>
      {ehPortaria && <Text style={estilosTexto.corpo}>{unidadeTexto(e.unidade)}</Text>}
      {e.remetente && <Text style={estilosTexto.secundario}>Remetente: {e.remetente}</Text>}
      <Text style={estilosTexto.secundario}>Recebida em {dataHora(e.recebidaEm)}</Text>
      {e.retiradaEm && (
        <Text style={estilosTexto.secundario}>
          Retirada em {dataHora(e.retiradaEm)} por {e.retiradaPor}
        </Text>
      )}
      {ehPortaria && onRetirar && e.status === "AGUARDANDO_RETIRADA" && <Botao titulo="Registrar retirada" pequeno onPress={onRetirar} />}
    </Card>
  );
}

/** Últimas encomendas retiradas da unidade do morador. */
function HistoricoEncomendas() {
  const { dados, carregando, erro, recarregar } = useCarregar(
    useCallback(() => api<Encomenda[]>(`/encomendas?status=RETIRADA&limite=${LIMITE_HISTORICO}`), []),
    [],
  );
  return (
    <Lista
      dados={dados}
      carregando={carregando}
      erro={erro}
      recarregar={recarregar}
      vazio="Nenhuma encomenda retirada ainda"
      renderItem={(e) => <CardEncomenda encomenda={e} />}
    />
  );
}

function NovaEncomendaModal({ visivel, onFechar, onCriada }: { visivel: boolean; onFechar: () => void; onCriada: () => void }) {
  const [unidadeId, setUnidadeId] = useState<string | null>(null);
  const [descricao, setDescricao] = useState("");
  const [remetente, setRemetente] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function registrar() {
    setSalvando(true);
    setErro(null);
    try {
      await enviar("POST", "/encomendas", { unidadeId, descricao: descricao.trim(), remetente: remetente.trim() || undefined });
      setUnidadeId(null);
      setDescricao("");
      setRemetente("");
      onCriada();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <ModalFormulario visivel={visivel} titulo="Registrar encomenda" onFechar={onFechar}>
      <SeletorUnidade valor={unidadeId} onChange={setUnidadeId} />
      <Campo rotulo="Descrição" value={descricao} onChangeText={setDescricao} placeholder="Ex.: Caixa média, envelope" />
      <Campo rotulo="Remetente (opcional)" value={remetente} onChangeText={setRemetente} placeholder="Ex.: Correios, Mercado Livre" />
      <MensagemErro texto={erro} />
      <Botao titulo="Registrar" onPress={registrar} carregando={salvando} desabilitado={!unidadeId || descricao.trim().length < 2} />
    </ModalFormulario>
  );
}

function RetiradaModal({ encomenda, onFechar, onRetirada }: { encomenda: Encomenda | null; onFechar: () => void; onRetirada: () => void }) {
  const [nome, setNome] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function confirmar() {
    if (!encomenda) return;
    setSalvando(true);
    try {
      await enviar("PATCH", `/encomendas/${encomenda.id}/retirada`, { retiradaPor: nome.trim() });
      setNome("");
      onRetirada();
    } catch (e) {
      Alert.alert("Erro", (e as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <ModalFormulario visivel={!!encomenda} titulo="Registrar retirada" onFechar={onFechar}>
      {encomenda && (
        <Text style={estilosTexto.corpo}>
          {encomenda.descricao} — {unidadeTexto(encomenda.unidade)}
        </Text>
      )}
      <Campo rotulo="Retirada por" value={nome} onChangeText={setNome} placeholder="Nome de quem retirou" />
      <Botao titulo="Confirmar retirada" onPress={confirmar} carregando={salvando} desabilitado={nome.trim().length < 2} />
    </ModalFormulario>
  );
}
