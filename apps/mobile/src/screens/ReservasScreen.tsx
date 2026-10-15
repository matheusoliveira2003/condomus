import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Alert, Text, View } from "react-native";
import { api, enviar, type AreaComum, type Reserva, type StatusReserva } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { useCarregar } from "../hooks/useCarregar";
import { useAbrirFormularioPorParametro } from "../hooks/useAbrirFormularioPorParametro";
import { BotaoFlutuante, Botao, Campo, Card, Chips, Lista, MensagemErro, ModalFormulario, Secao, Selo, estilosTexto } from "../ui/componentes";
import { data, hora, unidadeTexto } from "../ui/formatar";
import { Calendario } from "../ui/Calendario";

type OpcaoDia = "hoje" | "amanha" | "data";

/** Horário de funcionamento das áreas comuns (horas cheias). */
const ABERTURA = 8;
const FECHAMENTO = 23;

const rotuloStatus: Record<StatusReserva, { texto: string; tom: "neutro" | "sucesso" | "alerta" | "primario" }> = {
  PENDENTE: { texto: "Aguardando aprovação", tom: "alerta" },
  CONFIRMADA: { texto: "Confirmada", tom: "sucesso" },
  RECUSADA: { texto: "Recusada", tom: "neutro" },
  CANCELADA: { texto: "Cancelada", tom: "neutro" },
};

export function ReservasScreen() {
  const { usuario } = useAuth();
  return usuario?.papel === "MORADOR" ? <ReservasMorador /> : <ReservasSindico />;
}

function ReservasMorador() {
  const [reservando, setReservando] = useState(false);
  useAbrirFormularioPorParametro(useCallback(() => setReservando(true), []));
  const { dados, carregando, erro, recarregar } = useCarregar(useCallback(() => api<Reserva[]>("/reservas/minhas"), []), []);

  return (
    <View style={{ flex: 1 }}>
      <Lista
        dados={dados}
        carregando={carregando}
        erro={erro}
        recarregar={recarregar}
        vazio="Você não tem reservas futuras"
        cabecalho={<Secao titulo="Minhas reservas" />}
        renderItem={(r) => (
          <CardReserva reserva={r}>
            {(r.status === "PENDENTE" || r.status === "CONFIRMADA") && (
              <Botao
                titulo={r.status === "PENDENTE" ? "Cancelar solicitação" : "Cancelar reserva"}
                variante="secundario"
                pequeno
                onPress={() => confirmarCancelamento(r, recarregar)}
              />
            )}
          </CardReserva>
        )}
      />
      <BotaoFlutuante icone="calendar" onPress={() => setReservando(true)} />
      <NovaReservaModal
        visivel={reservando}
        onFechar={() => setReservando(false)}
        onCriada={() => {
          setReservando(false);
          void recarregar();
          Alert.alert("Solicitação enviada", "O síndico vai analisar sua reserva. Você será avisado quando ela for aprovada.");
        }}
      />
    </View>
  );
}

type FiltroSindico = "PENDENTE" | "CONFIRMADA";

function ReservasSindico() {
  const [filtro, setFiltro] = useState<FiltroSindico>("PENDENTE");
  const [recusando, setRecusando] = useState<Reserva | null>(null);
  const { dados, carregando, erro, recarregar } = useCarregar(
    useCallback(() => api<Reserva[]>(`/reservas?status=${filtro}&de=${new Date().toISOString()}`), [filtro]),
    [],
  );

  async function aprovar(r: Reserva) {
    try {
      await enviar("PATCH", `/reservas/${r.id}/aprovar`);
      await recarregar();
    } catch (e) {
      Alert.alert("Erro", (e as Error).message);
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <Lista
        dados={dados}
        carregando={carregando}
        erro={erro}
        recarregar={recarregar}
        vazio={filtro === "PENDENTE" ? "Nenhuma reserva aguardando aprovação" : "Nenhuma reserva confirmada"}
        cabecalho={
          <View style={{ marginBottom: 4 }}>
            <Chips
              opcoes={[
                { valor: "PENDENTE" as const, rotulo: "Aguardando aprovação" },
                { valor: "CONFIRMADA" as const, rotulo: "Confirmadas" },
              ]}
              valor={filtro}
              onChange={setFiltro}
            />
          </View>
        }
        renderItem={(r) => (
          <CardReserva reserva={r} mostrarUnidade>
            {r.status === "PENDENTE" ? (
              <View style={{ flexDirection: "row", gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Botao titulo="Recusar" variante="secundario" pequeno onPress={() => setRecusando(r)} />
                </View>
                <View style={{ flex: 1 }}>
                  <Botao titulo="Aprovar" pequeno onPress={() => aprovar(r)} />
                </View>
              </View>
            ) : (
              <Botao titulo="Cancelar reserva" variante="secundario" pequeno onPress={() => confirmarCancelamento(r, recarregar)} />
            )}
          </CardReserva>
        )}
      />
      <RecusaModal
        reserva={recusando}
        onFechar={() => setRecusando(null)}
        onRecusada={() => {
          setRecusando(null);
          void recarregar();
        }}
      />
    </View>
  );
}

function CardReserva({ reserva: r, mostrarUnidade, children }: { reserva: Reserva; mostrarUnidade?: boolean; children?: ReactNode }) {
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

function confirmarCancelamento(reserva: Reserva, aoCancelar: () => void) {
  Alert.alert("Cancelar reserva", `${reserva.area.nome} em ${data(reserva.inicio)}?`, [
    { text: "Voltar", style: "cancel" },
    {
      text: "Cancelar reserva",
      style: "destructive",
      onPress: () =>
        enviar("PATCH", `/reservas/${reserva.id}/cancelar`).then(aoCancelar).catch((e: Error) => Alert.alert("Erro", e.message)),
    },
  ]);
}

function RecusaModal({ reserva, onFechar, onRecusada }: { reserva: Reserva | null; onFechar: () => void; onRecusada: () => void }) {
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function recusar() {
    if (!reserva) return;
    setSalvando(true);
    try {
      await enviar("PATCH", `/reservas/${reserva.id}/recusar`, { motivo: motivo.trim() || undefined });
      setMotivo("");
      onRecusada();
    } catch (e) {
      Alert.alert("Erro", (e as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <ModalFormulario visivel={!!reserva} titulo="Recusar reserva" onFechar={onFechar}>
      {reserva && (
        <Text style={estilosTexto.corpo}>
          {reserva.area.nome} · {data(reserva.inicio)} · {hora(reserva.inicio)} às {hora(reserva.fim)} — {unidadeTexto(reserva.unidade)}
        </Text>
      )}
      <Campo
        rotulo="Motivo (opcional)"
        value={motivo}
        onChangeText={setMotivo}
        multiline
        maxLength={300}
        style={{ minHeight: 90, textAlignVertical: "top" }}
        placeholder="Ex.: área em manutenção nesta data"
      />
      <Text style={estilosTexto.secundario}>O morador será avisado da recusa e do motivo.</Text>
      <Botao titulo="Recusar reserva" variante="perigo" onPress={recusar} carregando={salvando} />
    </ModalFormulario>
  );
}

function NovaReservaModal({ visivel, onFechar, onCriada }: { visivel: boolean; onFechar: () => void; onCriada: () => void }) {
  const [areas, setAreas] = useState<AreaComum[]>([]);
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
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (visivel) api<AreaComum[]>("/areas").then(setAreas).catch((e: Error) => setErro(e.message));
  }, [visivel]);

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
    if (inicio === null || fim === null) return;
    setSalvando(true);
    setErro(null);
    try {
      await enviar("POST", "/reservas", { areaId, inicio: emHora(inicio).toISOString(), fim: emHora(fim).toISOString() });
      setAreaId(null);
      onCriada();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <ModalFormulario visivel={visivel} titulo="Nova reserva" onFechar={onFechar}>
      <View style={{ gap: 8 }}>
        <Text style={estilosTexto.titulo}>Área</Text>
        <Chips opcoes={areas.map((a) => ({ valor: a.id, rotulo: a.nome }))} valor={areaId} onChange={setAreaId} />
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
      <Botao titulo="Reservar" onPress={reservar} carregando={salvando} desabilitado={!areaId || !dia || inicio === null || fim === null} />
    </ModalFormulario>
  );
}
