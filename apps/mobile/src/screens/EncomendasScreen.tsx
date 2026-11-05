import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api, type Encomenda, type Pessoa } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { adaptarQuery, useEncomendas, useRegistrarEncomenda, useRegistrarRetirada } from "../hooks/queries";
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
  useEstilosTexto,
} from "../ui/componentes";
import { dataHora, unidadeTexto } from "../ui/formatar";
import { SeletorUnidade } from "../ui/SeletorUnidade";
import { Avatar } from "../ui/Avatar";
import { useMensagens } from "../ui/mensagens";
import { useCores, useEstilos, type Paleta } from "../ui/tema";

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

  const statusQuery = ehPortaria ? filtro : "AGUARDANDO_RETIRADA";
  const { dados, carregando, recarregando, erro, recarregar } = adaptarQuery(useEncomendas(statusQuery));

  return (
    <View style={{ flex: 1 }}>
      <Lista
        dados={dados}
        carregando={carregando}
        recarregando={recarregando}
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
        onCriada={() => setRegistrando(false)}
      />
      <ModalTela visivel={vendoHistorico} titulo="Encomendas retiradas" onFechar={() => setVendoHistorico(false)}>
        <HistoricoEncomendas />
      </ModalTela>
      <RetiradaModal
        encomenda={retirando}
        onFechar={() => setRetirando(null)}
        onRetirada={() => setRetirando(null)}
      />
    </View>
  );
}

function CardEncomenda({ encomenda: e, ehPortaria, onRetirar }: { encomenda: Encomenda; ehPortaria?: boolean; onRetirar?: () => void }) {
  const estilosTexto = useEstilosTexto();
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
  const { dados, carregando, recarregando, erro, recarregar } = adaptarQuery(useEncomendas(`RETIRADA&limite=${LIMITE_HISTORICO}`));
  return (
    <Lista
      dados={dados}
      carregando={carregando}
        recarregando={recarregando}
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
  const registrar = useRegistrarEncomenda();

  async function enviar() {
    if (!unidadeId) return;
    setErro(null);
    try {
      await registrar.mutateAsync({ unidadeId, descricao: descricao.trim(), remetente: remetente.trim() || undefined });
      setUnidadeId(null);
      setDescricao("");
      setRemetente("");
      onCriada();
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  return (
    <ModalFormulario visivel={visivel} titulo="Registrar encomenda" onFechar={onFechar}>
      <SeletorUnidade valor={unidadeId} onChange={setUnidadeId} />
      <Campo rotulo="Descrição" value={descricao} onChangeText={setDescricao} placeholder="Ex.: Caixa média, envelope" />
      <Campo rotulo="Remetente (opcional)" value={remetente} onChangeText={setRemetente} placeholder="Ex.: Correios, Mercado Livre" />
      <MensagemErro texto={erro} />
      <Botao titulo="Registrar" onPress={enviar} carregando={registrar.isPending} desabilitado={!unidadeId || descricao.trim().length < 2} />
    </ModalFormulario>
  );
}

function RetiradaModal({ encomenda, onFechar, onRetirada }: { encomenda: Encomenda | null; onFechar: () => void; onRetirada: () => void }) {
  const cores = useCores();
  const styles = useEstilos(criarStyles);
  const estilosTexto = useEstilosTexto();
  const [nome, setNome] = useState("");
  const [moradores, setMoradores] = useState<Pessoa[]>([]);
  const retirar = useRegistrarRetirada();
  const mensagens = useMensagens();

  // Moradores da unidade, com foto, para o porteiro reconhecer quem veio buscar.
  useEffect(() => {
    setMoradores([]);
    if (encomenda) api<Pessoa[]>(`/unidades/${encomenda.unidade.id}/moradores`).then(setMoradores).catch(() => {});
  }, [encomenda]);

  async function confirmar() {
    if (!encomenda) return;
    try {
      await retirar.mutateAsync({ id: encomenda.id, retiradaPor: nome.trim() });
      setNome("");
      onRetirada();
      mensagens.sucesso("Retirada registrada.");
    } catch (e) {
      mensagens.erro((e as Error).message);
    }
  }

  return (
    <ModalFormulario visivel={!!encomenda} titulo="Registrar retirada" onFechar={onFechar}>
      {encomenda && (
        <Text style={estilosTexto.corpo}>
          {encomenda.descricao} — {unidadeTexto(encomenda.unidade)}
        </Text>
      )}
      {moradores.length > 0 && (
        <View style={{ gap: 8 }}>
          <Text style={estilosTexto.titulo}>Moradores da unidade</Text>
          {moradores.map((m) => (
            <Pressable
              key={m.id}
              onPress={() => setNome(m.nome)}
              style={[styles.morador, nome === m.nome && styles.moradorSelecionado]}
              accessibilityRole="button"
              accessibilityLabel={`Retirada por ${m.nome}`}
            >
              <Avatar pessoa={m} tamanho={44} />
              <Text style={[estilosTexto.corpo, { flex: 1 }]}>{m.nome}</Text>
              {nome === m.nome && <Ionicons name="checkmark-circle" size={22} color={cores.primaria} />}
            </Pressable>
          ))}
          <Text style={estilosTexto.secundario}>Toque em quem está retirando, ou digite outro nome abaixo.</Text>
        </View>
      )}
      <Campo rotulo="Retirada por" value={nome} onChangeText={setNome} placeholder="Nome de quem retirou" />
      <Botao titulo="Confirmar retirada" onPress={confirmar} carregando={retirar.isPending} desabilitado={nome.trim().length < 2} />
    </ModalFormulario>
  );
}

const criarStyles = (cores: Paleta) =>
  StyleSheet.create({
    morador: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      padding: 10,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: cores.borda,
      backgroundColor: cores.superficie,
    },
    moradorSelecionado: { borderColor: cores.primaria, backgroundColor: cores.primariaClara },
  });
