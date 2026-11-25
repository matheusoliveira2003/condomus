import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Text, View } from "react-native";
import { api, type Reserva, type StatusReserva } from "../api/client";
import { adaptarQuery, useAreas, useCancelarReserva, useCriarReserva, useReservasMinhas } from "../hooks/queries";
import { useAbrirPorParametro } from "../hooks/useAbrirPorParametro";
import { BotaoFlutuante, Botao, Card, Chips, Lista, MensagemErro, ModalFormulario, Secao, Selo, useEstilosTexto } from "../ui/componentes";
import { data, hora, unidadeTexto } from "../ui/formatar";
import { Calendario } from "../ui/Calendario";
import { useMensagens, type PedidoConfirmacao } from "../ui/mensagens";
import { AgendaReservas } from "../agenda/AgendaReservas";

type OpcaoDia = "hoje" | "amanha" | "data";

/** Horário de funcionamento das áreas comuns (horas cheias). */
const ABERTURA = 8;
const FECHAMENTO = 23;

const rotuloStatus: Record<StatusReserva, { texto: string; tom: "neutro" | "sucesso" | "alerta" | "primario" }> = {
  // Reservas pendentes só existem até a migração rodar; para o morador elas valem como confirmadas.
  PENDENTE: { texto: "Confirmada", tom: "sucesso" },
  CONFIRMADA: { texto: "Confirmada", tom: "sucesso" },
  RECUSADA: { texto: "Recusada", tom: "neutro" },
  CANCELADA: { texto: "Cancelada", tom: "neutro" },
};

/** Reservas são automáticas e de quem mora numa unidade: o síndico reserva como morador e não aprova nada. */
type Aba = "agenda" | "minhas";

/**
 * Reservas das áreas comuns. A agenda (dia, mês e ano) mostra o que está ocupado e é a primeira coisa que o morador vê;
 * "Minhas reservas" lista as da própria unidade, para cancelar. A reserva nasce confirmada: não há aprovação.
 */
export function ReservasScreen() {
  const [aba, setAba] = useState<Aba>("agenda");
  const [reservando, setReservando] = useState(false);
  useAbrirPorParametro("novo", useCallback(() => setReservando(true), []));
  const { dados, carregando, recarregando, erro, recarregar } = adaptarQuery(useReservasMinhas());
  const cancelar = useCancelarReserva();
  const mensagens = useMensagens();

  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
        <Chips<Aba>
          opcoes={[
            { valor: "agenda", rotulo: "Agenda" },
            { valor: "minhas", rotulo: "Minhas reservas" },
          ]}
          valor={aba}
          onChange={setAba}
        />
      </View>
      {aba === "agenda" ? (
        <AgendaReservas />
      ) : (
        <Lista
          dados={dados}
          carregando={carregando}
          recarregando={recarregando}
          erro={erro}
          recarregar={recarregar}
          vazio="Você não tem reservas futuras"
          cabecalho={<Secao titulo="Minhas reservas" />}
          renderItem={(r) => (
            <CardReserva reserva={r}>
              {(r.status === "PENDENTE" || r.status === "CONFIRMADA") && (
                <Botao titulo="Cancelar reserva" variante="secundario" pequeno onPress={() => confirmarCancelamento(mensagens, r, () => cancelar.mutateAsync(r.id))} />
              )}
            </CardReserva>
          )}
        />
      )}
      <BotaoFlutuante icone="calendar" onPress={() => setReservando(true)} />
      <NovaReservaModal
        visivel={reservando}
        onFechar={() => setReservando(false)}
        onCriada={() => {
          setReservando(false);
          mensagens.sucesso("Reserva confirmada.");
        }}
      />
    </View>
  );
}

function CardReserva({ reserva: r, mostrarUnidade, children }: { reserva: Reserva; mostrarUnidade?: boolean; children?: ReactNode }) {
  const estilosTexto = useEstilosTexto();
  return (
    <Card>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <Text style={[estilosTexto.titulo, { flex: 1 }]}>{r.area.nome}</Text>
        <Selo {...rotuloStatus[r.status]} />
      </View>
      <Text style={estilosTexto.corpo}>
        {data(r.inicio)} · {hora(r.inicio)} às {hora(r.fim)}
      </Text>
      {mostrarUnidade && <Text style={estilosTexto.secundario}>{unidadeTexto(r.unidade)}</Text>}
      {r.status === "RECUSADA" && r.motivoRecusa && <Text style={estilosTexto.secundario}>Motivo: {r.motivoRecusa}</Text>}
      {children}
    </Card>
  );
}

function confirmarCancelamento(
  mensagens: { confirmar: (p: PedidoConfirmacao) => void; sucesso: (t: string) => void; erro: (t: string) => void },
  reserva: Reserva,
  cancelar: () => Promise<unknown>,
) {
  mensagens.confirmar({
    titulo: "Cancelar reserva",
    texto: `${reserva.area.nome} em ${data(reserva.inicio)}?`,
    cancelar: "Voltar",
    confirmar: "Cancelar reserva",
    perigo: true,
    aoConfirmar: () => {
      cancelar().then(
        () => mensagens.sucesso("Reserva cancelada."),
        (e: Error) => mensagens.erro(e.message),
      );
    },
  });
}

function NovaReservaModal({ visivel, onFechar, onCriada }: { visivel: boolean; onFechar: () => void; onCriada: () => void }) {
  const estilosTexto = useEstilosTexto();
  const areasQuery = useAreas();
  const areas = areasQuery.data ?? [];
  const [areaId, setAreaId] = useState<string | null>(null);
  const hoje = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const amanha = useMemo(() => new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + 1), [hoje]);
  const [opcaoDia, setOpcaoDia] = useState<OpcaoDia>("hoje");
  /** Dia escolhido no calendário (só vale quando a opção é "data"). */
  const [diaCalendario, setDiaCalendario] = useState<Date | null>(null);
  const diaEscolhido = opcaoDia === "hoje" ? hoje : opcaoDia === "amanha" ? amanha : diaCalendario;
  const dia = diaEscolhido?.toISOString() ?? null;
  const [ocupadas, setOcupadas] = useState<Reserva[]>([]);
  const [inicio, setInicio] = useState<number | null>(null);
  const [fim, setFim] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const criarReserva = useCriarReserva();

  // Ao trocar de área ou dia, busca o que já está reservado e limpa os horários escolhidos.
  useEffect(() => {
    setInicio(null);
    setFim(null);
    if (!areaId || !dia) return setOcupadas([]);
    const ate = new Date(dia);
    ate.setDate(ate.getDate() + 1);
    api<Reserva[]>(`/reservas?areaId=${areaId}&de=${dia}&ate=${ate.toISOString()}`)
      .then(setOcupadas)
      .catch((e: Error) => setErro(e.message));
  }, [areaId, dia]);

  const emHora = (h: number) => {
    const d = new Date(dia ?? hoje);
    d.setHours(h);
    return d;
  };
  const ocupado = (de: number, ate: number) =>
    ocupadas.some((r) => new Date(r.inicio) < emHora(ate) && new Date(r.fim) > emHora(de));
  const agora = new Date();

  const horasInicio = Array.from({ length: FECHAMENTO - ABERTURA }, (_, i) => ABERTURA + i).map((h) => ({
    valor: String(h),
    rotulo: `${h}h`,
    desabilitado: emHora(h) < agora || ocupado(h, h + 1),
  }));
  const horasFim =
    inicio === null
      ? []
      : Array.from({ length: FECHAMENTO - inicio }, (_, i) => inicio + 1 + i).map((h) => ({
          valor: String(h),
          rotulo: `${h}h`,
          desabilitado: ocupado(inicio, h),
        }));

  async function reservar() {
    if (inicio === null || fim === null || !areaId) return;
    setErro(null);
    try {
      await criarReserva.mutateAsync({ areaId, inicio: emHora(inicio).toISOString(), fim: emHora(fim).toISOString() });
      setAreaId(null);
      onCriada();
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  return (
    <ModalFormulario visivel={visivel} titulo="Nova reserva" onFechar={onFechar}>
      <View style={{ gap: 8 }}>
        <Text style={estilosTexto.titulo}>Área</Text>
        {areasQuery.isError ? (
          <MensagemErro texto="Não foi possível carregar as áreas. Tente de novo." />
        ) : areasQuery.isSuccess && areas.length === 0 ? (
          <Text style={estilosTexto.secundario}>
            Nenhuma área disponível para reserva. Peça ao síndico para cadastrar as áreas do condomínio.
          </Text>
        ) : (
          <Chips opcoes={areas.map((a) => ({ valor: a.id, rotulo: a.nome }))} valor={areaId} onChange={setAreaId} />
        )}
      </View>
      <View style={{ gap: 8 }}>
        <Text style={estilosTexto.titulo}>Dia</Text>
        <Chips
          opcoes={[
            { valor: "hoje" as const, rotulo: "Hoje" },
            { valor: "amanha" as const, rotulo: "Amanhã" },
            { valor: "data" as const, rotulo: diaCalendario ? data(diaCalendario) : "Selecionar data" },
          ]}
          valor={opcaoDia}
          onChange={setOpcaoDia}
        />
        {opcaoDia === "data" && <Calendario valor={diaCalendario} onChange={setDiaCalendario} minimo={hoje} />}
      </View>
      {areaId && dia && (
        <>
          {ocupadas.length > 0 && (
            <Text style={estilosTexto.secundario}>
              Indisponível: {ocupadas.map((r) => `${hora(r.inicio)}–${hora(r.fim)}`).join(", ")}
            </Text>
          )}
          <View style={{ gap: 8 }}>
            <Text style={estilosTexto.titulo}>Início</Text>
            <Chips
              opcoes={horasInicio}
              valor={inicio === null ? null : String(inicio)}
              onChange={(v) => {
                setInicio(Number(v));
                setFim(null);
              }}
            />
          </View>
          {inicio !== null && (
            <View style={{ gap: 8 }}>
              <Text style={estilosTexto.titulo}>Término</Text>
              <Chips opcoes={horasFim} valor={fim === null ? null : String(fim)} onChange={(v) => setFim(Number(v))} />
            </View>
          )}
        </>
      )}
      <MensagemErro texto={erro} />
      <Botao titulo="Reservar" onPress={reservar} carregando={criarReserva.isPending} desabilitado={!areaId || !dia || inicio === null || fim === null} />
    </ModalFormulario>
  );
}
