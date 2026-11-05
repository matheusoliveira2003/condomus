import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useCores, useEstilos, type Paleta } from "./tema";

const SEMANA = ["D", "S", "T", "Q", "Q", "S", "S"];

const meiaNoite = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/**
 * Calendário mensal simples, em JavaScript puro (sem módulo nativo, então não
 * exige novo build do app). Dias antes de `minimo` ficam desabilitados.
 */
export function Calendario({ valor, onChange, minimo }: { valor: Date | null; onChange: (dia: Date) => void; minimo: Date }) {
  const cores = useCores();
  const styles = useEstilos(criarEstilos);
  const inicio = meiaNoite(minimo);
  const [mes, setMes] = useState(() => {
    const base = valor ?? inicio;
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });

  const diasNoMes = new Date(mes.getFullYear(), mes.getMonth() + 1, 0).getDate();
  // Espaços vazios antes do dia 1, para alinhar com o dia da semana.
  const celulas: (Date | null)[] = [
    ...Array<null>(mes.getDay()).fill(null),
    ...Array.from({ length: diasNoMes }, (_, i) => new Date(mes.getFullYear(), mes.getMonth(), i + 1)),
  ];
  const podeVoltar = mes > new Date(inicio.getFullYear(), inicio.getMonth(), 1);
  const mudarMes = (delta: number) => setMes(new Date(mes.getFullYear(), mes.getMonth() + delta, 1));
  const titulo = mes.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  return (
    <View style={styles.container}>
      <View style={styles.cabecalho}>
        <Pressable onPress={() => mudarMes(-1)} disabled={!podeVoltar} hitSlop={10} style={!podeVoltar && { opacity: 0.25 }}>
          <Ionicons name="chevron-back" size={22} color={cores.texto} />
        </Pressable>
        <Text style={styles.titulo}>{titulo.charAt(0).toUpperCase() + titulo.slice(1)}</Text>
        <Pressable onPress={() => mudarMes(1)} hitSlop={10}>
          <Ionicons name="chevron-forward" size={22} color={cores.texto} />
        </Pressable>
      </View>

      <View style={styles.grade}>
        {SEMANA.map((d, i) => (
          <Text key={i} style={[styles.celula, styles.diaSemana]}>
            {d}
          </Text>
        ))}
        {celulas.map((dia, i) => {
          if (!dia) return <View key={`vazio-${i}`} style={styles.celula} />;
          const passado = dia < inicio;
          const selecionado = valor?.getTime() === dia.getTime();
          return (
            <Pressable key={dia.getTime()} disabled={passado} onPress={() => onChange(dia)} style={styles.celula}>
              <View style={[styles.dia, selecionado && styles.diaSelecionado]}>
                <Text style={[styles.diaTexto, passado && { color: cores.borda }, selecionado && { color: cores.textoSobreCor }]}>
                  {dia.getDate()}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const criarEstilos = (cores: Paleta) =>
  StyleSheet.create({
    container: { borderWidth: 1, borderColor: cores.borda, borderRadius: 12, padding: 12, backgroundColor: cores.superficie },
    cabecalho: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
    titulo: { fontSize: 16, fontWeight: "600", color: cores.texto },
    grade: { flexDirection: "row", flexWrap: "wrap" },
    celula: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: "center", justifyContent: "center" },
    diaSemana: { textAlign: "center", textAlignVertical: "center", color: cores.textoSecundario, fontWeight: "600", aspectRatio: undefined, paddingVertical: 4 },
    dia: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
    diaSelecionado: { backgroundColor: cores.primaria },
    diaTexto: { fontSize: 15, color: cores.texto },
  });
