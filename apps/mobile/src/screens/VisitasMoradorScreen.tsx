import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api, obterToken, type Visita, type VisitanteFrequente } from "../api/client";
import { compartilharConvite, urlQrConvite } from "../convite";
import { Avatar } from "../ui/Avatar";
import { Calendario } from "../ui/Calendario";
import { data } from "../ui/formatar";
import { useMensagens } from "../ui/mensagens";
import { useCores, useEstilos, type Paleta } from "../ui/tema";
import { adaptarQuery, useCancelarVisita, useCriarVisita, useOcultarVisitante, useVisitantes, useVisitas } from "../hooks/queries";
import { useAbrirPorParametro } from "../hooks/useAbrirPorParametro";
import {
  BotaoFlutuante,
  Botao,
  BotoesLado,
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
import { DetalhesVisita, SeloVisita } from "../ui/visita";

export function VisitasMoradorScreen() {
  // Lista principal só com visitas em aberto; finalizadas e canceladas ficam no histórico.
  const { dados, carregando, recarregando, erro, recarregar, carregarMais, carregandoMais } = adaptarQuery(useVisitas("situacao=ativas"));
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
        carregarMais={carregarMais}
        carregandoMais={carregandoMais}
        vazio="Nenhum visitante autorizado"
        cabecalho={<LinkHistorico texto="Ver histórico de visitas" onPress={() => setVendoHistorico(true)} />}
        renderItem={(visita) => (
          <CardVisita visita={visita}>
            {visita.status === "AGENDADA" && (
              <BotoesLado>
                <Botao titulo="Cancelar" variante="secundario" pequeno onPress={() => confirmarCancelamento(visita)} />
                <Botao titulo="Enviar convite" pequeno onPress={() => setConvite(visita)} />
              </BotoesLado>
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
  const estilosTexto = useEstilosTexto();
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
  const { dados, carregando, recarregando, erro, recarregar, carregarMais, carregandoMais } = adaptarQuery(useVisitas(`situacao=historico&limite=${LIMITE_HISTORICO}`));
  return (
    <Lista
      dados={dados}
      carregando={carregando}
        recarregando={recarregando}
      erro={erro}
      recarregar={recarregar}
      carregarMais={carregarMais}
      carregandoMais={carregandoMais}
      vazio="Nenhuma visita no histórico"
      renderItem={(visita) => <CardVisita visita={visita} />}
    />
  );
}

/** QR code e código do convite, com o botão para compartilhar a imagem com o visitante. */
function ConviteModal({ visita, onFechar }: { visita: Visita | null; onFechar: () => void }) {
  const styles = useEstilos(criarStyles);
  const estilosTexto = useEstilosTexto();
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

const criarStyles = (cores: Paleta) =>
  StyleSheet.create({
    cartao: { width: "80%", alignSelf: "center", borderRadius: 12, overflow: "hidden", borderWidth: 1, borderColor: cores.borda },
  });

type OpcaoDia = "qualquer" | "hoje" | "amanha" | "data";

/** Quantos visitantes frequentes aparecem antes de a pessoa buscar. */
const VISITANTES_VISIVEIS = 5;

/**
 * Visitantes que a unidade autorizou nos últimos 90 dias. Tocar em um preenche o formulário (o morador
 * ainda pode editar). Também dá para tirar alguém da lista; isso não apaga o histórico.
 */
function VisitantesFrequentes({ visivel, onEscolher }: { visivel: boolean; onEscolher: (v: VisitanteFrequente) => void }) {
  const cores = useCores();
  const styles = useEstilos(criarStylesFrequentes);
  const estilosTexto = useEstilosTexto();
  const mensagens = useMensagens();
  const { data: visitantes = [] } = useVisitantes(visivel);
  const ocultar = useOcultarVisitante();
  const [busca, setBusca] = useState("");

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const soDigitos = termo.replace(/\D/g, "");
    const lista = termo
      ? visitantes.filter(
          (v) =>
            v.nomeVisitante.toLowerCase().includes(termo) ||
            (soDigitos.length > 0 && v.documento.replace(/\D/g, "").includes(soDigitos)),
        )
      : visitantes;
    return lista.slice(0, termo ? lista.length : VISITANTES_VISIVEIS);
  }, [visitantes, busca]);

  if (visitantes.length === 0) return null;

  function remover(v: VisitanteFrequente) {
    mensagens.confirmar({
      titulo: "Remover da lista",
      texto: `${v.nomeVisitante} sai da sua lista de visitantes. O histórico de visitas continua. Se você autorizar de novo, ele volta para a lista.`,
      confirmar: "Remover",
      perigo: true,
      aoConfirmar: () => {
        ocultar.mutateAsync(v.documento).catch((e: Error) => mensagens.erro(e.message));
      },
    });
  }

  return (
    <View style={{ gap: 12 }}>
      {visitantes.length > VISITANTES_VISIVEIS && (
        <Campo rotulo="Buscar" value={busca} onChangeText={setBusca} placeholder="Nome ou documento" />
      )}
      <View style={styles.cartao}>
        <View style={styles.cabecalho}>
          <Ionicons name="time-outline" size={26} color={cores.primaria} />
          <View style={{ flex: 1 }}>
            <Text style={styles.titulo}>Visitantes recentes</Text>
            <Text style={estilosTexto.secundario}>Acesso rápido para visitantes frequentes</Text>
          </View>
        </View>
        {filtrados.map((v, i) => (
          <View key={v.documento} style={[styles.linha, i > 0 && styles.linhaComDivisoria]}>
            <Pressable
              onPress={() => onEscolher(v)}
              style={({ pressed }) => [styles.toque, pressed && { opacity: 0.6 }]}
              accessibilityRole="button"
              accessibilityLabel={`Usar ${v.nomeVisitante}`}
            >
              <Avatar pessoa={{ id: v.documento, nome: v.nomeVisitante, fotoAtualizadaEm: null }} tamanho={40} />
              <View style={styles.dados}>
                <View style={styles.nomeLinha}>
                  <Text style={styles.nome} numberOfLines={1}>
                    {v.nomeVisitante}
                  </Text>
                  {v.temRosto && <Selo texto="Biometria cadastrada" tom="primario" />}
                </View>
                <Text style={styles.documento} numberOfLines={1}>
                  {v.documento}
                  {v.placaVeiculo ? ` · ${v.placaVeiculo}` : ""}
                </Text>
              </View>
            </Pressable>
            <Pressable
              onPress={() => remover(v)}
              hitSlop={8}
              style={({ pressed }) => [styles.remover, pressed && { opacity: 0.6 }]}
              accessibilityRole="button"
              accessibilityLabel={`Remover ${v.nomeVisitante} da lista`}
            >
              <Ionicons name="trash-outline" size={22} color={cores.perigo} />
            </Pressable>
          </View>
        ))}
        {busca.trim() && filtrados.length === 0 && (
          <Text style={[estilosTexto.secundario, { padding: 16 }]}>Nenhum visitante encontrado.</Text>
        )}
      </View>
    </View>
  );
}

const criarStylesFrequentes = (cores: Paleta) =>
  StyleSheet.create({
    cartao: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: cores.borda,
      backgroundColor: cores.superficie,
      overflow: "hidden",
    },
    cabecalho: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: cores.borda,
    },
    titulo: { fontSize: 16, fontWeight: "800", color: cores.texto },
    linha: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 10 },
    linhaComDivisoria: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: cores.borda },
    toque: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12 },
    dados: { flex: 1, gap: 4 },
    nomeLinha: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
    nome: { flexShrink: 1, fontSize: 15, fontWeight: "800", color: cores.texto },
    documento: { fontSize: 13, color: cores.textoSecundario },
    remover: { padding: 6 },
  });

function AgendarVisitaModal({ visivel, onFechar, onCriada }: { visivel: boolean; onFechar: () => void; onCriada: (visita: Visita) => void }) {
  const estilosTexto = useEstilosTexto();
  const [nome, setNome] = useState("");
  const [documento, setDocumento] = useState("");
  const [placa, setPlaca] = useState("");
  const hoje = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const amanha = useMemo(() => new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + 1), [hoje]);
  const [opcaoDia, setOpcaoDia] = useState<OpcaoDia>("qualquer");
  /** Dia escolhido no calendário (só vale quando a opção é "data"). */
  const [diaCalendario, setDiaCalendario] = useState<Date | null>(null);
  const diaEscolhido = opcaoDia === "hoje" ? hoje : opcaoDia === "amanha" ? amanha : opcaoDia === "data" ? diaCalendario : null;
  const [erro, setErro] = useState<string | null>(null);
  const criar = useCriarVisita();

  async function autorizar() {
    setErro(null);
    try {
      const visita = await criar.mutateAsync({
        nomeVisitante: nome.trim(),
        documento: documento.trim(),
        placaVeiculo: placa.trim().toUpperCase() || undefined,
        dataPrevista: diaEscolhido?.toISOString(),
      });
      setNome("");
      setDocumento("");
      setPlaca("");
      setOpcaoDia("qualquer");
      setDiaCalendario(null);
      onCriada(visita);
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  return (
    <ModalFormulario visivel={visivel} titulo="Autorizar visitante" onFechar={onFechar}>
      <VisitantesFrequentes
        visivel={visivel}
        onEscolher={(v) => {
          setNome(v.nomeVisitante);
          setDocumento(v.documento);
          setPlaca(v.placaVeiculo ?? "");
        }}
      />
      <Campo rotulo="Nome do visitante" value={nome} onChangeText={setNome} placeholder="Nome completo" />
      <Campo rotulo="Documento" value={documento} onChangeText={setDocumento} placeholder="RG ou CPF" />
      <Campo rotulo="Placa do veículo (opcional)" value={placa} onChangeText={setPlaca} autoCapitalize="characters" placeholder="ABC1D23" />
      <View style={{ gap: 8 }}>
        <Text style={estilosTexto.titulo}>Quando?</Text>
        <Chips
          opcoes={[
            { valor: "qualquer" as const, rotulo: "Qualquer dia" },
            { valor: "hoje" as const, rotulo: "Hoje" },
            { valor: "amanha" as const, rotulo: "Amanhã" },
            { valor: "data" as const, rotulo: diaCalendario ? data(diaCalendario) : "Selecionar data" },
          ]}
          valor={opcaoDia}
          onChange={setOpcaoDia}
        />
        {opcaoDia === "data" && <Calendario valor={diaCalendario} onChange={setDiaCalendario} minimo={hoje} />}
      </View>
      <MensagemErro texto={erro} />
      <Botao titulo="Autorizar" onPress={autorizar} carregando={criar.isPending} desabilitado={nome.trim().length < 2 || documento.trim().length < 5 || (opcaoDia === "data" && !diaCalendario)} />
    </ModalFormulario>
  );
}
