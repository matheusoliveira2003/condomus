import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { type StatusVisita, type Visita } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { adaptarQuery, useEntradaDireta, useRegistrarEntradaSaida, useVisitas } from "../hooks/queries";
import { BotaoFlutuante, Botao, Campo, Card, Chips, Lista, MensagemErro, ModalFormulario, Selo, useEstilosTexto } from "../ui/componentes";
import { unidadeTexto } from "../ui/formatar";
import { SeletorUnidade } from "../ui/SeletorUnidade";
import { Avatar } from "../ui/Avatar";
import { useMensagens } from "../ui/mensagens";
import { DetalhesVisita, SeloVisita } from "../ui/visita";
import { RostoVisitanteModal } from "../rosto/RostoVisitanteModal";
import { useEntradaComRosto } from "../rosto/useEntradaComRosto";
import { LeitorConviteModal } from "./LeitorConviteModal";

const abas: { valor: StatusVisita; rotulo: string }[] = [
  { valor: "AGENDADA", rotulo: "Esperados" },
  { valor: "EM_ANDAMENTO", rotulo: "No condomínio" },
  { valor: "FINALIZADA", rotulo: "Histórico" },
];

export function PortariaVisitasScreen() {
  const estilosTexto = useEstilosTexto();
  const [status, setStatus] = useState<StatusVisita>("AGENDADA");
  const [busca, setBusca] = useState("");
  const [registrando, setRegistrando] = useState(false);
  const [lendo, setLendo] = useState(false);
  /** Visita da lista cujo convite está sendo conferido. */
  const [conferindo, setConferindo] = useState<Visita | null>(null);
  /** Visita cujo rosto está sendo cadastrado ou conferido. */
  const [verificandoRosto, setVerificandoRosto] = useState<Visita | null>(null);
  const { dados, carregando, recarregando, erro, recarregar, carregarMais, carregandoMais } = adaptarQuery(useVisitas(`status=${status}`));
  const registrarAcao = useRegistrarEntradaSaida();
  const mensagens = useMensagens();
  // Só o porteiro cadastra e confere o rosto; o síndico usa esta tela sem esse botão.
  const ehPorteiro = useAuth().usuario?.papel === "PORTEIRO";

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

  const { entrar, modal: modalRosto } = useEntradaComRosto();

  async function registrar(visita: Visita, acao: "entrada" | "saida") {
    if (acao === "entrada") {
      // Visitante com rosto cadastrado só entra depois da verificação do rosto.
      await entrar({
        nomeVisitante: visita.nomeVisitante,
        documento: visita.documento,
        registrar: (verificacao) => registrarAcao.mutateAsync({ id: visita.id, acao, verificacao }).then(() => undefined),
        aoRegistrar: () => setStatus("EM_ANDAMENTO"),
      });
      return;
    }
    try {
      await registrarAcao.mutateAsync({ id: visita.id, acao });
    } catch (e) {
      mensagens.erro((e as Error).message);
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <Lista
        dados={filtradas}
        carregando={carregando}
        recarregando={recarregando}
        erro={erro}
        recarregar={recarregar}
        carregarMais={carregarMais}
        carregandoMais={carregandoMais}
        vazio={busca ? "Nenhum resultado para a busca" : "Nenhum visitante nesta lista"}
        espacoFinal={168}
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
            {visita.semSaida && <Selo texto="Sem saída há mais de 24 h" tom="alerta" />}
            <Text style={estilosTexto.corpo}>{unidadeTexto(visita.unidade)}</Text>
            <DetalhesVisita visita={visita} />
            {visita.autorizadoPor && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Avatar pessoa={visita.autorizadoPor} tamanho={28} />
                <Text style={estilosTexto.secundario}>Autorizado por {visita.autorizadoPor.nome}</Text>
              </View>
            )}
            {ehPorteiro && !!visita.documento && (visita.status === "AGENDADA" || visita.status === "EM_ANDAMENTO") && (
              <Botao titulo="Rosto do visitante" variante="secundario" pequeno onPress={() => setVerificandoRosto(visita)} />
            )}
            {visita.status === "AGENDADA" && (
              <Botao
                titulo={visita.temConvite ? "Ler convite e registrar entrada" : "Registrar entrada"}
                pequeno
                // Com convite, a entrada só acontece lendo o QR code (ou digitando o código) desta visita.
                onPress={() => (visita.temConvite ? setConferindo(visita) : registrar(visita, "entrada"))}
              />
            )}
            {visita.status === "EM_ANDAMENTO" && (
              <Botao titulo="Registrar saída" variante="secundario" pequeno onPress={() => registrar(visita, "saida")} />
            )}
          </Card>
        )}
      />
      <BotaoFlutuante icone="qr-code" posicao={1} rotulo="Ler QR code do convite" onPress={() => setLendo(true)} />
      <BotaoFlutuante icone="person-add" rotulo="Registrar entrada sem convite" onPress={() => setRegistrando(true)} />
      <LeitorConviteModal
        visivel={lendo || !!conferindo}
        visitaEsperada={conferindo}
        onFechar={() => {
          setLendo(false);
          setConferindo(null);
        }}
        onEntrada={() => {
          setLendo(false);
          setConferindo(null);
          setStatus("EM_ANDAMENTO");
        }}
      />
      <RostoVisitanteModal visita={verificandoRosto} onFechar={() => setVerificandoRosto(null)} />
      {modalRosto}
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
  const entradaDireta = useEntradaDireta();
  const { entrar, modal: modalRosto } = useEntradaComRosto();

  async function registrar() {
    if (!unidadeId) return;
    setErro(null);
    await entrar({
      nomeVisitante: nome.trim(),
      documento: documento.trim(),
      registrar: (verificacao) =>
        entradaDireta
          .mutateAsync({
            unidadeId,
            nomeVisitante: nome.trim(),
            documento: documento.trim(),
            placaVeiculo: placa.trim().toUpperCase() || undefined,
            verificacao,
          })
          .then(() => undefined),
      aoRegistrar: () => {
        setUnidadeId(null);
        setNome("");
        setDocumento("");
        setPlaca("");
        onRegistrada();
      },
    });
  }

  return (
    <ModalFormulario visivel={visivel} titulo="Registrar entrada" onFechar={onFechar}>
      <SeletorUnidade valor={unidadeId} onChange={setUnidadeId} />
      <Campo rotulo="Nome do visitante" value={nome} onChangeText={setNome} placeholder="Nome completo" />
      <Campo rotulo="Documento" value={documento} onChangeText={setDocumento} placeholder="RG ou CPF" />
      <Campo rotulo="Placa do veículo (opcional)" value={placa} onChangeText={setPlaca} autoCapitalize="characters" />
      <MensagemErro texto={erro} />
      <Botao titulo="Registrar entrada" onPress={registrar} carregando={entradaDireta.isPending} desabilitado={!unidadeId || nome.trim().length < 2 || documento.trim().length < 5} />
      {modalRosto}
    </ModalFormulario>
  );
}
