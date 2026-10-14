import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Text, View } from "react-native";
import { api, enviar, type AreaComum, type Reserva } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { useCarregar } from "../hooks/useCarregar";
import { BotaoFlutuante, Botao, Card, Chips, Lista, MensagemErro, ModalFormulario, Secao, estilosTexto } from "../ui/componentes";
import { data, hora, unidadeTexto } from "../ui/formatar";
import { proximosDias } from "../ui/visita";

/** Horário de funcionamento das áreas comuns (horas cheias). */
const ABERTURA = 8;
const FECHAMENTO = 23;

export function ReservasScreen() {
  const { usuario } = useAuth();
  const ehMorador = usuario?.papel === "MORADOR";
  const [reservando, setReservando] = useState(false);
  const { dados, carregando, erro, recarregar } = useCarregar(
    useCallback(async () => {
      const futuras = await api<Reserva[]>(`/reservas?de=${new Date().toISOString()}`);
      // Morador vê só as da unidade dele; o síndico vê todas para poder cancelar.
      return ehMorador ? futuras.filter((r) => r.unidade.id === usuario?.unidadeId) : futuras;
    }, [ehMorador, usuario?.unidadeId]),
    [],
  );

  function cancelar(reserva: Reserva) {
    Alert.alert("Cancelar reserva", `${reserva.area.nome} em ${data(reserva.inicio)}?`, [
      { text: "Voltar", style: "cancel" },
      {
        text: "Cancelar reserva",
        style: "destructive",
        onPress: () =>
          enviar("PATCH", `/reservas/${reserva.id}/cancelar`).then(recarregar).catch((e: Error) => Alert.alert("Erro", e.message)),
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
        vazio={ehMorador ? "Você não tem reservas futuras" : "Nenhuma reserva futura"}
        cabecalho={<Secao titulo={ehMorador ? "Minhas reservas" : "Próximas reservas"} />}
        renderItem={(r) => (
          <Card>
            <Text style={estilosTexto.titulo}>{r.area.nome}</Text>
            <Text style={estilosTexto.corpo}>
              {data(r.inicio)} · {hora(r.inicio)} às {hora(r.fim)}
            </Text>
            {!ehMorador && <Text style={estilosTexto.secundario}>{unidadeTexto(r.unidade)}</Text>}
            <Botao titulo="Cancelar reserva" variante="secundario" pequeno onPress={() => cancelar(r)} />
          </Card>
        )}
      />
      {ehMorador && <BotaoFlutuante icone="calendar" onPress={() => setReservando(true)} />}
      {ehMorador && (
        <NovaReservaModal
          visivel={reservando}
          onFechar={() => setReservando(false)}
          onCriada={() => {
            setReservando(false);
            void recarregar();
          }}
        />
      )}
    </View>
  );
}

function NovaReservaModal({ visivel, onFechar, onCriada }: { visivel: boolean; onFechar: () => void; onCriada: () => void }) {
  const [areas, setAreas] = useState<AreaComum[]>([]);
  const [areaId, setAreaId] = useState<string | null>(null);
  const dias = useMemo(() => proximosDias(14), []);
  const [dia, setDia] = useState(dias[0].valor);
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
    if (!areaId) return setOcupadas([]);
    const ate = new Date(dia);
    ate.setDate(ate.getDate() + 1);
    api<Reserva[]>(`/reservas?areaId=${areaId}&de=${dia}&ate=${ate.toISOString()}`)
      .then(setOcupadas)
      .catch((e: Error) => setErro(e.message));
  }, [areaId, dia]);

  const emHora = (h: number) => {
    const d = new Date(dia);
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
        <Chips opcoes={dias} valor={dia} onChange={setDia} />
      </View>
      {areaId && (
        <>
          {ocupadas.length > 0 && (
            <Text style={estilosTexto.secundario}>
              Já reservado: {ocupadas.map((r) => `${hora(r.inicio)}–${hora(r.fim)}`).join(", ")}
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
      <Botao titulo="Reservar" onPress={reservar} carregando={salvando} desabilitado={!areaId || inicio === null || fim === null} />
    </ModalFormulario>
  );
}
