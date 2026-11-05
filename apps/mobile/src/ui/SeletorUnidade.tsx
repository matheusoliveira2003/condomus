import { useEffect, useMemo, useState } from "react";
import { Pressable, SectionList, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api, type Unidade } from "../api/client";
import { Campo, MensagemErro, ModalTela, useEstilosTexto } from "./componentes";
import { unidadeTexto } from "./formatar";
import { useCores, useEstilos, type Paleta } from "./tema";

/**
 * Campo único para escolher a unidade. Ao tocar, abre uma lista com busca, agrupada por bloco:
 * digitar "101" mostra o 101 de todos os blocos; "A 101" vai direto à unidade.
 */
export function SeletorUnidade({ valor, onChange }: { valor: string | null; onChange: (id: string | null) => void }) {
  const cores = useCores();
  const estilosTexto = useEstilosTexto();
  const styles = useEstilos(criarStyles);
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    api<Unidade[]>("/unidades").then(setUnidades).catch((e: Error) => setErro(e.message));
  }, []);

  const escolhida = unidades.find((u) => u.id === valor);

  return (
    <View style={{ gap: 4 }}>
      <Text style={estilosTexto.titulo}>Unidade</Text>
      <Pressable
        onPress={() => setAberto(true)}
        style={({ pressed }) => [styles.campo, pressed && { opacity: 0.7 }]}
        accessibilityRole="button"
        accessibilityLabel={escolhida ? `Unidade: ${unidadeTexto(escolhida)}` : "Escolher unidade"}
      >
        <Ionicons name="business-outline" size={20} color={cores.primaria} />
        <Text style={[styles.campoTexto, !escolhida && { color: cores.textoSecundario }]}>
          {escolhida ? unidadeTexto(escolhida) : "Toque para escolher"}
        </Text>
        <Ionicons name="chevron-forward" size={18} color={cores.textoSecundario} />
      </Pressable>
      <MensagemErro texto={erro} />

      <ModalTela visivel={aberto} titulo="Escolher unidade" onFechar={() => setAberto(false)}>
        <ListaUnidades
          unidades={unidades}
          valor={valor}
          onEscolher={(id) => {
            onChange(id);
            setAberto(false);
          }}
        />
      </ModalTela>
    </View>
  );
}

/** Minúsculas, sem espaços e sem a palavra "bloco": "Bloco A · 101" vira "a101". */
const normalizar = (texto: string) => texto.toLowerCase().replace(/bloco/g, "").replace(/\s+/g, "");

/** Lista com busca. Fica montada só com o modal aberto, então a busca começa limpa a cada vez. */
function ListaUnidades({
  unidades,
  valor,
  onEscolher,
}: {
  unidades: Unidade[];
  valor: string | null;
  onEscolher: (id: string) => void;
}) {
  const cores = useCores();
  const styles = useEstilos(criarStyles);
  const estilosTexto = useEstilosTexto();
  const [busca, setBusca] = useState("");

  const secoes = useMemo(() => {
    const termo = normalizar(busca);
    const filtradas = unidades.filter((u) => normalizar(`${u.bloco}${u.numero}`).includes(termo));
    const porBloco = new Map<string, Unidade[]>();
    for (const u of filtradas) porBloco.set(u.bloco, [...(porBloco.get(u.bloco) ?? []), u]);
    return [...porBloco.entries()]
      .sort(([a], [b]) => a.localeCompare(b, "pt-BR", { numeric: true }))
      .map(([bloco, itens]) => ({
        titulo: `Bloco ${bloco}`,
        data: itens.sort((a, b) => a.numero.localeCompare(b.numero, "pt-BR", { numeric: true })),
      }));
  }, [unidades, busca]);

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.buscaArea}>
        <Campo
          icone="search-outline"
          placeholder="Buscar por bloco ou número, ex.: 101 ou A 101"
          value={busca}
          onChangeText={setBusca}
          autoCorrect={false}
          autoCapitalize="characters"
          clearButtonMode="while-editing"
        />
      </View>
      <SectionList
        sections={secoes}
        keyExtractor={(u) => u.id}
        stickySectionHeadersEnabled
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 32 }}
        renderSectionHeader={({ section }) => <Text style={styles.secao}>{section.titulo}</Text>}
        renderItem={({ item, index, section }) => {
          const ativa = item.id === valor;
          const ultima = index === section.data.length - 1;
          return (
            <Pressable
              onPress={() => onEscolher(item.id)}
              accessibilityRole="button"
              accessibilityState={{ selected: ativa }}
              style={({ pressed }) => [styles.item, !ultima && styles.itemSeparado, pressed && { backgroundColor: cores.fundo }]}
            >
              <Text style={[styles.itemTexto, ativa && { color: cores.primaria, fontWeight: "600" }]}>
                Apartamento {item.numero}
              </Text>
              {ativa && <Ionicons name="checkmark" size={20} color={cores.primaria} />}
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <View style={styles.vazio}>
            <Text style={[estilosTexto.secundario, { textAlign: "center" }]}>
              {unidades.length === 0 ? "Nenhuma unidade cadastrada." : "Nenhuma unidade encontrada para essa busca."}
            </Text>
          </View>
        }
      />
    </View>
  );
}

const criarStyles = (cores: Paleta) =>
  StyleSheet.create({
    campo: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      borderWidth: 1,
      borderColor: cores.borda,
      backgroundColor: cores.superficie,
      borderRadius: 10,
      padding: 12,
    },
    campoTexto: { flex: 1, fontSize: 16, color: cores.texto },
    buscaArea: { padding: 16, paddingBottom: 8 },
    secao: {
      fontSize: 13,
      fontWeight: "600",
      color: cores.textoSecundario,
      textTransform: "uppercase",
      paddingHorizontal: 16,
      paddingTop: 14,
      paddingBottom: 6,
      backgroundColor: cores.fundo,
    },
    item: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingVertical: 14,
      backgroundColor: cores.superficie,
    },
    itemSeparado: { borderBottomWidth: 1, borderBottomColor: cores.borda },
    itemTexto: { fontSize: 16, color: cores.texto },
    vazio: { padding: 32, alignItems: "center" },
  });
