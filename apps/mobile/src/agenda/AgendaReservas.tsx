import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { Reserva } from "../api/client";
import { useAreas, useReservas } from "../hooks/queries";
import { Chips, useEstilosTexto } from "../ui/componentes";
import { hora, unidadeTexto } from "../ui/formatar";
import { useCores, useEstilos, type Paleta } from "../ui/tema";
import { ABERTURA, FECHAMENTO, anoDe, contarPorDia, contarPorMes, diaDe, faixaNoDia, mesDe } from "./intervalos";

type Modo = "dia" | "mes" | "ano";
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/**
 * Agenda das áreas comuns. Mostra as reservas de todas as unidades do condomínio, em três visões:
 * Dia (linha do tempo das 8h às 23h), Mês (calendário com a contagem por dia) e Ano (contagem por mês).
 * As reservas já nascem confirmadas; a agenda só mostra o que está ocupado.
 */
export function AgendaReservas() {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const estilosTexto = useEstilosTexto();
  const [modo, setModo] = useState<Modo>("dia");
  const [dia, setDia] = useState(() => new Date());
  const [areaId, setAreaId] = useState<string | null>(null);
  const areas = useAreas();

  // Intervalo que a tela precisa, conforme o modo. O mês e o ano pedem tudo de uma vez, para as marcações.
  const intervalo = modo === "dia" ? diaDe(dia) : modo === "mes" ? mesDe(dia) : anoDe(dia);
  const filtro = `de=${intervalo.inicio.toISOString()}&ate=${intervalo.fim.toISOString()}${areaId ? `&areaId=${areaId}` : ""}`;
  const query = useReservas(filtro);
  const reservas = useMemo(() => (query.data ?? []).filter((r) => r.status === "CONFIRMADA" || r.status === "PENDENTE"), [query.data]);

  const nomeArea = areas.data?.find((a) => a.id === areaId)?.nome ?? "Todas as áreas";

  return (
    // Rola na vertical: o mês e o ano passam da altura de um celular pequeno.
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.tela}>
      <Chips<Modo>
        opcoes={[
          { valor: "dia", rotulo: "Dia" },
          { valor: "mes", rotulo: "Mês" },
          { valor: "ano", rotulo: "Ano" },
        ]}
        valor={modo}
        onChange={setModo}
      />
      <Chips<string>
        opcoes={[{ valor: "", rotulo: "Todas" }, ...(areas.data ?? []).map((a) => ({ valor: a.id, rotulo: a.nome }))]}
        valor={areaId ?? ""}
        onChange={(v) => setAreaId(v || null)}
      />

      <Navegador modo={modo} dia={dia} onMudar={setDia} />

      {modo === "dia" && <VisaoDia reservas={reservas} dia={dia} carregando={query.isLoading} />}
      {modo === "mes" && <VisaoMes reservas={reservas} mes={dia} onEscolherDia={(d) => { setDia(d); setModo("dia"); }} />}
      {modo === "ano" && <VisaoAno reservas={reservas} ano={dia} onEscolherMes={(m) => { setDia(m); setModo("mes"); }} />}

      <Text style={[estilosTexto.secundario, styles.rodape]}>{nomeArea}</Text>
    </ScrollView>
  );
}

/** Setas para ir de dia em dia, mês em mês ou ano em ano, e o título do período. */
function Navegador({ modo, dia, onMudar }: { modo: Modo; dia: Date; onMudar: (d: Date) => void }) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const passo = (delta: number) => {
    if (modo === "dia") onMudar(new Date(dia.getFullYear(), dia.getMonth(), dia.getDate() + delta));
    else if (modo === "mes") onMudar(new Date(dia.getFullYear(), dia.getMonth() + delta, 1));
    else onMudar(new Date(dia.getFullYear() + delta, 0, 1));
  };
  const titulo =
    modo === "dia"
      ? dia.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })
      : modo === "mes"
        ? dia.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })
        : String(dia.getFullYear());
  return (
    <View style={styles.navegador}>
      <Pressable onPress={() => passo(-1)} hitSlop={12} accessibilityRole="button" accessibilityLabel="Anterior">
        <Ionicons name="chevron-back" size={22} color={cores.texto} />
      </Pressable>
      <Text style={styles.titulo}>{titulo.charAt(0).toUpperCase() + titulo.slice(1)}</Text>
      <Pressable onPress={() => passo(1)} hitSlop={12} accessibilityRole="button" accessibilityLabel="Próximo">
        <Ionicons name="chevron-forward" size={22} color={cores.texto} />
      </Pressable>
    </View>
  );
}

/** Linha do tempo do dia: uma faixa por área, do horário de abertura ao de fechamento. */
function VisaoDia({ reservas, dia, carregando }: { reservas: Reserva[]; dia: Date; carregando: boolean }) {
  const styles = useEstilos(criarEstilos);
  const estilosTexto = useEstilosTexto();
  const doDia = reservas.filter((r) => faixaNoDia(new Date(r.inicio), new Date(r.fim), dia));
  if (carregando) return <Text style={[estilosTexto.secundario, styles.vazio]}>Carregando…</Text>;
  return (
    <View style={styles.dia}>
      <View style={styles.escala}>
        {Array.from({ length: FECHAMENTO - ABERTURA + 1 }, (_, i) => ABERTURA + i)
          .filter((h) => (h - ABERTURA) % 3 === 0 || h === FECHAMENTO)
          .map((h) => (
            <Text key={h} style={[estilosTexto.secundario, styles.hora, { left: `${((h - ABERTURA) / (FECHAMENTO - ABERTURA)) * 100}%` }]}>
              {h}h
            </Text>
          ))}
      </View>
      {doDia.length === 0 ? (
        <Text style={[estilosTexto.secundario, styles.vazio]}>Nenhuma reserva neste dia. Tudo livre.</Text>
      ) : (
        doDia.map((r) => <FaixaReserva key={r.id} reserva={r} dia={dia} />)
      )}
    </View>
  );
}

function FaixaReserva({ reserva: r, dia }: { reserva: Reserva; dia: Date }) {
  const styles = useEstilos(criarEstilos);
  const estilosTexto = useEstilosTexto();
  const cores = useCores();
  const faixa = faixaNoDia(new Date(r.inicio), new Date(r.fim), dia);
  return (
    <View style={styles.linhaReserva}>
      <Text style={[estilosTexto.corpo, styles.nomeArea]} numberOfLines={1}>
        {r.area.nome}
      </Text>
      <Text style={estilosTexto.secundario}>
        {hora(r.inicio)} às {hora(r.fim)} · {unidadeTexto(r.unidade)}
      </Text>
      <View style={styles.trilho}>
        {faixa && (
          <View style={[styles.barra, { left: `${faixa.inicioPct}%`, width: `${faixa.fimPct - faixa.inicioPct}%`, backgroundColor: cores.primaria }]} />
        )}
      </View>
    </View>
  );
}

/** Calendário do mês com a contagem de reservas por dia. Tocar num dia abre a visão do dia. */
function VisaoMes({ reservas, mes, onEscolherDia }: { reservas: Reserva[]; mes: Date; onEscolherDia: (d: Date) => void }) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const porDia = useMemo(() => contarPorDia(reservas, mes), [reservas, mes]);
  const dias = porDia.length;
  return (
    <View style={styles.mes}>
      {Array.from({ length: dias }, (_, i) => {
        const d = new Date(mes.getFullYear(), mes.getMonth(), i + 1);
        const n = porDia[i];
        return (
          <Pressable key={i} onPress={() => onEscolherDia(d)} style={styles.celulaMes} accessibilityRole="button" accessibilityLabel={`${i + 1}, ${n} reserva${n === 1 ? "" : "s"}`}>
            <Text style={styles.numeroDia}>{i + 1}</Text>
            {n > 0 && <View style={[styles.marca, { backgroundColor: cores.primaria }]} />}
            {n > 0 && <Text style={styles.contagem}>{n}</Text>}
          </Pressable>
        );
      })}
    </View>
  );
}

/** Ano: uma linha por mês, com quantas reservas começam nele. Tocar num mês abre o calendário dele. */
function VisaoAno({ reservas, ano, onEscolherMes }: { reservas: Reserva[]; ano: Date; onEscolherMes: (d: Date) => void }) {
  const styles = useEstilos(criarEstilos);
  const porMes = useMemo(() => contarPorMes(reservas, ano), [reservas, ano]);
  const maior = Math.max(1, ...porMes);
  return (
    <View style={styles.ano}>
      {porMes.map((n, i) => (
        <Pressable key={i} onPress={() => onEscolherMes(new Date(ano.getFullYear(), i, 1))} style={styles.linhaMes} accessibilityRole="button">
          <Text style={styles.nomeMes}>{MESES[i]}</Text>
          <View style={styles.trilhoMes}>
            <View style={[styles.barraMes, { width: `${(n / maior) * 100}%` }]} />
          </View>
          <Text style={styles.contagem}>{n}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const criarEstilos = (cores: Paleta) =>
  StyleSheet.create({
    tela: { padding: 16, paddingBottom: 96, gap: 12 },
    navegador: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 4 },
    titulo: { fontSize: 16, fontWeight: "700", color: cores.texto },
    rodape: { textAlign: "center" },
    vazio: { textAlign: "center", paddingVertical: 24 },
    dia: { gap: 8 },
    escala: { height: 18, position: "relative" },
    hora: { position: "absolute", top: 0, fontSize: 12, transform: [{ translateX: -10 }] },
    linhaReserva: { gap: 4, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: cores.borda },
    nomeArea: { fontWeight: "700" },
    trilho: { height: 10, borderRadius: 5, backgroundColor: cores.neutroClaro, position: "relative", overflow: "hidden" },
    barra: { position: "absolute", top: 0, bottom: 0, borderRadius: 5 },
    mes: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
    celulaMes: { width: "13%", minWidth: 40, aspectRatio: 1, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: cores.borda, alignItems: "center", justifyContent: "center", padding: 2 },
    numeroDia: { fontSize: 13, color: cores.texto },
    marca: { width: 6, height: 6, borderRadius: 3, marginTop: 2 },
    contagem: { fontSize: 11, color: cores.textoSecundario },
    ano: { gap: 6 },
    linhaMes: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
    nomeMes: { width: 40, fontSize: 14, color: cores.texto, textTransform: "capitalize" },
    trilhoMes: { flex: 1, height: 10, borderRadius: 5, backgroundColor: cores.neutroClaro, overflow: "hidden" },
    barraMes: { height: 10, borderRadius: 5, backgroundColor: cores.primaria },
  });
