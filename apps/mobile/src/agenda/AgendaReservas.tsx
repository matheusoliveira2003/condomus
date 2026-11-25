import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { AreaComum, Reserva } from "../api/client";
import { useAreas, useReservas } from "../hooks/queries";
import { Chips, useEstilosTexto } from "../ui/componentes";
import { hora, unidadeTexto } from "../ui/formatar";
import { useCores, useEstilos, type Paleta } from "../ui/tema";
import { ABERTURA, FECHAMENTO, anoDe, contarPorDia, contarPorMes, corDaArea, diaDe, faixaNoDia, mesDe, mesmoDia } from "./intervalos";

type Modo = "dia" | "mes" | "ano";
const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const SEMANA = ["D", "S", "T", "Q", "Q", "S", "S"];
/** Marcas de hora da linha do tempo: de 3 em 3 horas, e a última. */
const HORAS_MARCADAS = [8, 11, 14, 17, 20, 23];

const maiuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/**
 * Agenda das áreas comuns. Mostra as reservas de todas as unidades do condomínio, em três visões:
 * Dia (um cartão por área, com a linha do tempo das 8h às 23h), Mês (calendário com marcações) e Ano (barras por mês).
 * As reservas já nascem confirmadas; a agenda mostra o que está ocupado e o que está livre.
 */
export function AgendaReservas() {
  const styles = useEstilos(criarEstilos);
  const [modo, setModo] = useState<Modo>("dia");
  const [dia, setDia] = useState(() => new Date());
  const [areaId, setAreaId] = useState<string | null>(null);
  const areas = useAreas();

  // Intervalo que a tela precisa, conforme o modo. O mês e o ano pedem tudo de uma vez, para as marcações.
  const intervalo = modo === "dia" ? diaDe(dia) : modo === "mes" ? mesDe(dia) : anoDe(dia);
  const filtro = `de=${intervalo.inicio.toISOString()}&ate=${intervalo.fim.toISOString()}${areaId ? `&areaId=${areaId}` : ""}`;
  const query = useReservas(filtro);
  const reservas = useMemo(() => (query.data ?? []).filter((r) => r.status === "CONFIRMADA" || r.status === "PENDENTE"), [query.data]);
  const listaAreas = areas.data ?? [];
  const areasVisiveis = areaId ? listaAreas.filter((a) => a.id === areaId) : listaAreas;

  return (
    // Rola na vertical: o mês e o ano passam da altura de um celular pequeno.
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.tela}>
      <View style={styles.seletor}>
        {(["dia", "mes", "ano"] as const).map((m) => (
          <Pressable key={m} onPress={() => setModo(m)} style={[styles.opcao, modo === m && styles.opcaoAtiva]} accessibilityRole="button" accessibilityState={{ selected: modo === m }}>
            <Text style={[styles.opcaoTexto, modo === m && styles.opcaoTextoAtivo]}>{m === "dia" ? "Dia" : m === "mes" ? "Mês" : "Ano"}</Text>
          </Pressable>
        ))}
      </View>

      <Chips<string>
        opcoes={[{ valor: "", rotulo: "Todas as áreas" }, ...listaAreas.map((a) => ({ valor: a.id, rotulo: a.nome }))]}
        valor={areaId ?? ""}
        onChange={(v) => setAreaId(v || null)}
      />

      <Navegador modo={modo} dia={dia} onMudar={setDia} />

      {modo === "dia" && <VisaoDia areas={areasVisiveis} reservas={reservas} dia={dia} carregando={query.isLoading} />}
      {modo === "mes" && (
        <VisaoMes
          areas={areasVisiveis}
          reservas={reservas}
          mes={dia}
          onEscolherDia={(d) => {
            setDia(d);
            setModo("dia");
          }}
        />
      )}
      {modo === "ano" && (
        <VisaoAno
          reservas={reservas}
          ano={dia}
          onEscolherMes={(m) => {
            setDia(m);
            setModo("mes");
          }}
        />
      )}
    </ScrollView>
  );
}

/** Setas para ir de dia em dia, mês em mês ou ano em ano, o título do período e um atalho para voltar a hoje. */
function Navegador({ modo, dia, onMudar }: { modo: Modo; dia: Date; onMudar: (d: Date) => void }) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const passo = (delta: number) => {
    if (modo === "dia") onMudar(new Date(dia.getFullYear(), dia.getMonth(), dia.getDate() + delta));
    else if (modo === "mes") onMudar(new Date(dia.getFullYear(), dia.getMonth() + delta, 1));
    else onMudar(new Date(dia.getFullYear() + delta, 0, 1));
  };
  const hoje = new Date();
  const naoEhHoje =
    modo === "dia"
      ? !mesmoDia(dia, hoje)
      : modo === "mes"
        ? dia.getMonth() !== hoje.getMonth() || dia.getFullYear() !== hoje.getFullYear()
        : dia.getFullYear() !== hoje.getFullYear();
  const titulo =
    modo === "dia"
      ? dia.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })
      : modo === "mes"
        ? dia.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })
        : String(dia.getFullYear());
  return (
    <View style={styles.navegador}>
      <Pressable onPress={() => passo(-1)} hitSlop={12} style={styles.seta} accessibilityRole="button" accessibilityLabel="Anterior">
        <Ionicons name="chevron-back" size={20} color={cores.primaria} />
      </Pressable>
      <View style={styles.tituloBloco}>
        <Text style={styles.titulo}>{maiuscula(titulo)}</Text>
        {naoEhHoje && (
          <Pressable onPress={() => onMudar(new Date())} hitSlop={8} accessibilityRole="button">
            <Text style={styles.irHoje}>Voltar para hoje</Text>
          </Pressable>
        )}
      </View>
      <Pressable onPress={() => passo(1)} hitSlop={12} style={styles.seta} accessibilityRole="button" accessibilityLabel="Próximo">
        <Ionicons name="chevron-forward" size={20} color={cores.primaria} />
      </Pressable>
    </View>
  );
}

/** Dia: um cartão por área. Cada um mostra a linha do tempo, as reservas do dia e, sem nenhuma, que a área está livre. */
function VisaoDia({ areas, reservas, dia, carregando }: { areas: AreaComum[]; reservas: Reserva[]; dia: Date; carregando: boolean }) {
  const estilosTexto = useEstilosTexto();
  const styles = useEstilos(criarEstilos);
  if (carregando) return <Text style={[estilosTexto.secundario, styles.vazio]}>Carregando…</Text>;
  if (areas.length === 0) return <Text style={[estilosTexto.secundario, styles.vazio]}>Nenhuma área comum cadastrada.</Text>;
  return (
    <View style={{ gap: 12 }}>
      {areas.map((a) => (
        <CartaoArea key={a.id} area={a} dia={dia} reservas={reservas.filter((r) => r.area.id === a.id && faixaNoDia(new Date(r.inicio), new Date(r.fim), dia))} />
      ))}
    </View>
  );
}

function CartaoArea({ area, dia, reservas }: { area: AreaComum; dia: Date; reservas: Reserva[] }) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const estilosTexto = useEstilosTexto();
  const cor = corDaArea(area.id);
  const livre = reservas.length === 0;
  return (
    <View style={styles.cartao}>
      <View style={styles.cartaoTopo}>
        <View style={[styles.ponto, { backgroundColor: cor }]} />
        <Text style={styles.nomeArea} numberOfLines={1}>
          {area.nome}
        </Text>
        <View style={[styles.selo, { backgroundColor: livre ? cores.sucessoClaro : cores.primariaClara }]}>
          <Text style={[styles.seloTexto, { color: livre ? cores.sucesso : cores.primaria }]}>
            {livre ? "Livre" : `${reservas.length} reserva${reservas.length === 1 ? "" : "s"}`}
          </Text>
        </View>
      </View>

      <LinhaDoTempo reservas={reservas} dia={dia} cor={cor} />

      {livre ? (
        <Text style={estilosTexto.secundario}>
          Livre o dia todo, das {ABERTURA}h às {FECHAMENTO}h.
        </Text>
      ) : (
        <View style={{ gap: 6 }}>
          {reservas.map((r) => (
            <View key={r.id} style={styles.itemReserva}>
              <Ionicons name="time-outline" size={15} color={cores.textoSecundario} />
              <Text style={styles.itemHorario}>
                {hora(r.inicio)} às {hora(r.fim)}
              </Text>
              <Text style={[estilosTexto.secundario, { flex: 1 }]} numberOfLines={1}>
                {unidadeTexto(r.unidade)}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

/** Régua das 8h às 23h com as reservas do dia como blocos. As marcas de hora ficam abaixo da régua. */
function LinhaDoTempo({ reservas, dia, cor }: { reservas: Reserva[]; dia: Date; cor: string }) {
  const styles = useEstilos(criarEstilos);
  const estilosTexto = useEstilosTexto();
  const total = FECHAMENTO - ABERTURA;
  return (
    <View>
      <View style={styles.regua}>
        {HORAS_MARCADAS.slice(1, -1).map((h) => (
          <View key={h} style={[styles.divisoria, { left: `${((h - ABERTURA) / total) * 100}%` }]} />
        ))}
        {reservas.map((r) => {
          const faixa = faixaNoDia(new Date(r.inicio), new Date(r.fim), dia);
          if (!faixa) return null;
          return <View key={r.id} style={[styles.bloco, { left: `${faixa.inicioPct}%`, width: `${faixa.fimPct - faixa.inicioPct}%`, backgroundColor: cor }]} />;
        })}
      </View>
      <View style={styles.marcas}>
        {HORAS_MARCADAS.map((h) => (
          <Text key={h} style={[estilosTexto.secundario, styles.marca]}>
            {h}h
          </Text>
        ))}
      </View>
    </View>
  );
}

/** Calendário do mês: dias da semana alinhados, hoje destacado e um ponto colorido por área com reserva no dia. */
function VisaoMes({ areas, reservas, mes, onEscolherDia }: { areas: AreaComum[]; reservas: Reserva[]; mes: Date; onEscolherDia: (d: Date) => void }) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const estilosTexto = useEstilosTexto();
  const porDia = useMemo(() => contarPorDia(reservas, mes), [reservas, mes]);
  const hoje = new Date();
  const inicioHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const dias = porDia.length;
  // Células vazias antes do dia 1, para alinhar com o dia da semana.
  const vazias = new Date(mes.getFullYear(), mes.getMonth(), 1).getDay();
  const celulas: (number | null)[] = [...Array<null>(vazias).fill(null), ...Array.from({ length: dias }, (_, i) => i + 1)];

  /** Áreas com reserva num dia do mês, para os pontos coloridos (no máximo quatro por dia). */
  const areasDoDia = (numero: number) => {
    const d = new Date(mes.getFullYear(), mes.getMonth(), numero);
    const ids = new Set(reservas.filter((r) => faixaNoDia(new Date(r.inicio), new Date(r.fim), d)).map((r) => r.area.id));
    return areas.filter((a) => ids.has(a.id)).slice(0, 4);
  };

  return (
    <View style={styles.cartao}>
      <View style={styles.semana}>
        {SEMANA.map((s, i) => (
          <Text key={i} style={[styles.diaSemana, { color: i === 0 ? cores.perigo : cores.textoSecundario }]}>
            {s}
          </Text>
        ))}
      </View>
      <View style={styles.grade}>
        {celulas.map((n, i) => {
          if (n === null) return <View key={`v${i}`} style={styles.celulaMes} />;
          const d = new Date(mes.getFullYear(), mes.getMonth(), n);
          const eHoje = mesmoDia(d, hoje);
          const passado = d < inicioHoje;
          const quantas = porDia[n - 1];
          return (
            <Pressable
              key={n}
              onPress={() => onEscolherDia(d)}
              style={styles.celulaMes}
              accessibilityRole="button"
              accessibilityLabel={`Dia ${n}, ${quantas === 0 ? "livre" : `${quantas} reserva${quantas === 1 ? "" : "s"}`}`}
            >
              <View style={[styles.numeroBolha, eHoje && { backgroundColor: cores.primaria }]}>
                <Text style={[styles.numeroDia, passado && { color: cores.textoSecundario }, eHoje && { color: cores.textoSobreCor, fontWeight: "800" }]}>{n}</Text>
              </View>
              <View style={styles.pontos}>
                {areasDoDia(n).map((a) => (
                  <View key={a.id} style={[styles.pontinho, { backgroundColor: corDaArea(a.id) }]} />
                ))}
              </View>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.legenda}>
        {areas.map((a) => (
          <View key={a.id} style={styles.itemLegenda}>
            <View style={[styles.pontinho, { backgroundColor: corDaArea(a.id) }]} />
            <Text style={estilosTexto.secundario}>{a.nome}</Text>
          </View>
        ))}
      </View>
      <Text style={[estilosTexto.secundario, { textAlign: "center" }]}>Toque num dia para ver as reservas dele.</Text>
    </View>
  );
}

/** Ano: uma barra por mês, a do mês atual destacada. Tocar num mês abre o calendário dele. */
function VisaoAno({ reservas, ano, onEscolherMes }: { reservas: Reserva[]; ano: Date; onEscolherMes: (d: Date) => void }) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const estilosTexto = useEstilosTexto();
  const porMes = useMemo(() => contarPorMes(reservas, ano), [reservas, ano]);
  const maior = Math.max(1, ...porMes);
  const hoje = new Date();
  const total = porMes.reduce((a, b) => a + b, 0);
  return (
    <View style={styles.cartao}>
      <Text style={estilosTexto.secundario}>{total === 0 ? "Nenhuma reserva neste ano." : `${total} reserva${total === 1 ? "" : "s"} em ${ano.getFullYear()}.`}</Text>
      {porMes.map((n, i) => {
        const atual = hoje.getFullYear() === ano.getFullYear() && hoje.getMonth() === i;
        return (
          <Pressable key={i} onPress={() => onEscolherMes(new Date(ano.getFullYear(), i, 1))} style={styles.linhaMes} accessibilityRole="button" accessibilityLabel={`${MESES[i]}, ${n} reservas`}>
            <Text style={[styles.nomeMes, atual && { color: cores.primaria, fontWeight: "800" }]}>{MESES[i]}</Text>
            <View style={styles.trilhoMes}>{n > 0 && <View style={[styles.barraMes, { width: `${Math.max((n / maior) * 100, 4)}%` }, atual && { backgroundColor: cores.primaria }]} />}</View>
            <Text style={[styles.contagemMes, n === 0 && { color: cores.textoSecundario }]}>{n}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const criarEstilos = (cores: Paleta) =>
  StyleSheet.create({
    tela: { padding: 16, paddingBottom: 96, gap: 14 },
    // Seletor Dia/Mês/Ano em uma peça só (segmentado), no lugar de três botões soltos.
    seletor: { flexDirection: "row", backgroundColor: cores.neutroClaro, borderRadius: 12, padding: 4 },
    opcao: { flex: 1, alignItems: "center", paddingVertical: 9, borderRadius: 9, borderWidth: 1, borderColor: "transparent" },
    opcaoAtiva: { backgroundColor: cores.superficie, borderColor: cores.borda },
    opcaoTexto: { fontSize: 14, fontWeight: "600", color: cores.textoSecundario },
    opcaoTextoAtivo: { color: cores.primaria, fontWeight: "800" },
    navegador: { flexDirection: "row", alignItems: "center", gap: 8 },
    seta: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: cores.primariaClara },
    tituloBloco: { flex: 1, alignItems: "center", gap: 2 },
    titulo: { fontSize: 17, fontWeight: "800", color: cores.texto, textAlign: "center" },
    irHoje: { fontSize: 13, fontWeight: "700", color: cores.primaria },
    vazio: { textAlign: "center", paddingVertical: 24 },
    cartao: { backgroundColor: cores.superficie, borderRadius: 14, borderWidth: 1, borderColor: cores.borda, padding: 14, gap: 12 },
    cartaoTopo: { flexDirection: "row", alignItems: "center", gap: 8 },
    ponto: { width: 12, height: 12, borderRadius: 6 },
    nomeArea: { flex: 1, fontSize: 16, fontWeight: "800", color: cores.texto },
    selo: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
    seloTexto: { fontSize: 12, fontWeight: "800" },
    regua: { height: 22, borderRadius: 8, backgroundColor: cores.neutroClaro, position: "relative", overflow: "hidden" },
    divisoria: { position: "absolute", top: 0, bottom: 0, width: 1, backgroundColor: cores.borda },
    bloco: { position: "absolute", top: 3, bottom: 3, borderRadius: 6 },
    // As marcas ficam espalhadas de ponta a ponta, uma sob cada divisão da régua.
    marcas: { flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
    marca: { fontSize: 11 },
    itemReserva: { flexDirection: "row", alignItems: "center", gap: 6 },
    itemHorario: { fontSize: 14, fontWeight: "700", color: cores.texto },
    semana: { flexDirection: "row" },
    diaSemana: { flex: 1, textAlign: "center", fontSize: 12, fontWeight: "800" },
    grade: { flexDirection: "row", flexWrap: "wrap" },
    celulaMes: { width: `${100 / 7}%`, alignItems: "center", paddingVertical: 4, minHeight: 50 },
    numeroBolha: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
    numeroDia: { fontSize: 14, fontWeight: "600", color: cores.texto },
    pontos: { flexDirection: "row", gap: 3, marginTop: 3, height: 7 },
    pontinho: { width: 7, height: 7, borderRadius: 3.5 },
    legenda: { flexDirection: "row", flexWrap: "wrap", gap: 12, justifyContent: "center", paddingTop: 4 },
    itemLegenda: { flexDirection: "row", alignItems: "center", gap: 5 },
    linhaMes: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6 },
    nomeMes: { width: 34, fontSize: 14, fontWeight: "600", color: cores.texto },
    trilhoMes: { flex: 1, height: 14, borderRadius: 7, backgroundColor: cores.neutroClaro, overflow: "hidden" },
    barraMes: { height: 14, borderRadius: 7, backgroundColor: cores.textoSecundario },
    contagemMes: { width: 24, textAlign: "right", fontSize: 14, fontWeight: "800", color: cores.texto },
  });
