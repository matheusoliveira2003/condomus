import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { api, obterToken, type Visita } from "../api/client";
import { compartilharConvite, urlQrConvite } from "../convite";
import { useMensagens } from "../ui/mensagens";
import { cores } from "../ui/tema";
import { adaptarQuery, useCancelarVisita, useCriarVisita, useVisitas } from "../hooks/queries";
import { useAbrirPorParametro } from "../hooks/useAbrirPorParametro";
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
  estilosTexto,
} from "../ui/componentes";
import { DetalhesVisita, SeloVisita, proximosDias } from "../ui/visita";

export function VisitasMoradorScreen() {
  // Lista principal só com visitas em aberto; finalizadas e canceladas ficam no histórico.
  const { dados, carregando, recarregando, erro, recarregar } = adaptarQuery(useVisitas("situacao=ativas"));
  const cancelar = useCancelarVisita();
  const mensagens = useMensagens();
  const [agendando, setAgendando] = useState(false);
  const [vendoHistorico, setVendoHistorico] = useState(false);
  const [convite, setConvite] = useState<Visita | null>(null);
  useAbrirPorParametro("novo", useCallback(() => setAgendando(true), []));

  function confirmarCancelamento(visita: Visita) {
    mensagens.confirmar({
      titulo: "Cancelar visita",
      texto: `Cancelar a autorização de ${visita.nomeVisitante}?`,
      cancelar: "Voltar",
      confirmar: "Cancelar visita",
      perigo: true,
      aoConfirmar: () =>
        cancelar.mutate(visita.id, {
          onSuccess: () => mensagens.sucesso("Visita cancelada."),
          onError: (e) => mensagens.erro((e as Error).message),
        }),
    });
  }

  return (
    <View style={{ flex: 1 }}>
      <Lista
        dados={dados}
        carregando={carregando}
        recarregando={recarregando}
        erro={erro}
        recarregar={recarregar}
        vazio="Nenhum visitante autorizado"
        cabecalho={<LinkHistorico texto="Ver histórico de visitas" onPress={() => setVendoHistorico(true)} />}
        renderItem={(visita) => (
          <CardVisita visita={visita}>
            {visita.status === "AGENDADA" && (
              <View style={{ flexDirection: "row", gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Botao titulo="Cancelar" variante="secundario" pequeno onPress={() => confirmarCancelamento(visita)} />
                </View>
                <View style={{ flex: 1 }}>
                  <Botao titulo="Enviar convite" pequeno onPress={() => setConvite(visita)} />
                </View>
              </View>
            )}
          </CardVisita>
        )}
      />
      <ModalTela visivel={vendoHistorico} titulo="Histórico de visitas" onFechar={() => setVendoHistorico(false)}>
        <HistoricoVisitas />
      </ModalTela>
      <BotaoFlutuante icone="person-add" onPress={() => setAgendando(true)} />
      <AgendarVisitaModal
        visivel={agendando}
        onFechar={() => setAgendando(false)}
        onCriada={(visita) => {
          setAgendando(false);
          void recarregar();
          // Logo após autorizar, o convite já abre para ser enviado ao visitante.
          setConvite(visita);
        }}
      />
      <ConviteModal visita={convite} onFechar={() => setConvite(null)} />
    </View>
  );
}

function CardVisita({ visita, children }: { visita: Visita; children?: ReactNode }) {
  return (
    <Card>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={estilosTexto.titulo}>{visita.nomeVisitante}</Text>
        <SeloVisita status={visita.status} />
      </View>
      <DetalhesVisita visita={visita} />
      {children}
    </Card>
  );
}

/** Quantos itens o histórico mostra (os mais recentes). */
const LIMITE_HISTORICO = 50;

/** Últimas visitas finalizadas ou canceladas da unidade. */
function HistoricoVisitas() {
  const { dados, carregando, recarregando, erro, recarregar } = adaptarQuery(useVisitas(`situacao=historico&limite=${LIMITE_HISTORICO}`));
  return (
    <Lista
      dados={dados}
      carregando={carregando}
        recarregando={recarregando}
      erro={erro}
      recarregar={recarregar}
      vazio="Nenhuma visita no histórico"
      renderItem={(visita) => <CardVisita visita={visita} />}
    />
  );
}

/** QR code e código do convite, com o botão para compartilhar a imagem com o visitante. */
function ConviteModal({ visita, onFechar }: { visita: Visita | null; onFechar: () => void }) {
  const [codigo, setCodigo] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [compartilhando, setCompartilhando] = useState(false);
  const mensagens = useMensagens();

  useEffect(() => {
    setCodigo(null);
    setErro(null);
    if (visita)
      api<{ codigo: string }>(`/visitas/${visita.id}/convite`)
        .then((c) => setCodigo(c.codigo))
        .catch((e: Error) => setErro(e.message));
  }, [visita]);

  async function compartilhar() {
    if (!visita) return;
    setCompartilhando(true);
    try {
      await compartilharConvite(visita.id, visita.nomeVisitante);
    } catch (e) {
      mensagens.erro((e as Error).message);
    } finally {
      setCompartilhando(false);
    }
  }

  return (
    <ModalFormulario visivel={!!visita} titulo="Convite de visita" onFechar={onFechar}>
      {visita && (
        <Text style={estilosTexto.corpo}>
          Envie este convite para <Text style={{ fontWeight: "700" }}>{visita.nomeVisitante}</Text>. Na portaria, basta mostrá-lo
          no celular. O cartão não mostra sua unidade nem seu nome.
        </Text>
      )}
      <MensagemErro texto={erro} />
      {visita && codigo && (
        <>
          {/* Prévia do cartão exatamente como o visitante vai recebê-lo (proporção 4:5). */}
          <View style={styles.cartao}>
            {/* Fonte em lista: no Android, uma fonte única descarta o cabeçalho de login. */}
            <Image
              source={[{ uri: `${urlQrConvite(visita.id)}?c=${codigo}`, headers: { Authorization: `Bearer ${obterToken()}` } }]}
              style={{ width: "100%", aspectRatio: 4 / 5 }}
              resizeMode="contain"
              accessibilityLabel={`Convite de ${visita.nomeVisitante} com QR code e código ${codigo}`}
            />
          </View>
          <Botao titulo="Compartilhar convite" onPress={compartilhar} carregando={compartilhando} />
        </>
      )}
    </ModalFormulario>
  );
}

const styles = StyleSheet.create({
  cartao: { width: "80%", alignSelf: "center", borderRadius: 12, overflow: "hidden", borderWidth: 1, borderColor: cores.borda },
});

const SEM_DATA = "sem-data";

function AgendarVisitaModal({ visivel, onFechar, onCriada }: { visivel: boolean; onFechar: () => void; onCriada: (visita: Visita) => void }) {
  const [nome, setNome] = useState("");
  const [documento, setDocumento] = useState("");
  const [placa, setPlaca] = useState("");
  const [dia, setDia] = useState<string>(SEM_DATA);
  const [erro, setErro] = useState<string | null>(null);
  const criar = useCriarVisita();

  async function autorizar() {
    setErro(null);
    try {
      const visita = await criar.mutateAsync({
        nomeVisitante: nome.trim(),
        documento: documento.trim() || undefined,
        placaVeiculo: placa.trim().toUpperCase() || undefined,
        dataPrevista: dia === SEM_DATA ? undefined : dia,
      });
      setNome("");
      setDocumento("");
      setPlaca("");
      setDia(SEM_DATA);
      onCriada(visita);
    } catch (e) {
      setErro((e as Error).message);
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
      <Botao titulo="Autorizar" onPress={autorizar} carregando={criar.isPending} desabilitado={nome.trim().length < 2} />
    </ModalFormulario>
  );
}
