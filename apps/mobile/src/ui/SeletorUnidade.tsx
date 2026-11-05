import { useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { api, type Unidade } from "../api/client";
import { Chips, MensagemErro, useEstilosTexto } from "./componentes";

/** Seleção em dois passos: primeiro o bloco, depois o apartamento daquele bloco. */
export function SeletorUnidade({ valor, onChange }: { valor: string | null; onChange: (id: string | null) => void }) {
  const estilosTexto = useEstilosTexto();
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [bloco, setBloco] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    api<Unidade[]>("/unidades").then(setUnidades).catch((e: Error) => setErro(e.message));
  }, []);

  function escolherBloco(novo: string) {
    // O apartamento escolhido pertence ao bloco anterior; não pode continuar selecionado.
    if (novo !== bloco) onChange(null);
    setBloco(novo);
  }

  const blocos = useMemo(() => [...new Set(unidades.map((u) => u.bloco))], [unidades]);
  const apartamentos = useMemo(
    () =>
      unidades
        .filter((u) => u.bloco === bloco)
        .sort((a, b) => a.numero.localeCompare(b.numero, "pt-BR", { numeric: true })),
    [unidades, bloco],
  );

  return (
    <View style={{ gap: 8 }}>
      <Text style={estilosTexto.titulo}>Bloco</Text>
      <Chips grade opcoes={blocos.map((b) => ({ valor: b, rotulo: `Bloco ${b}` }))} valor={bloco} onChange={escolherBloco} />
      {bloco && (
        <>
          <Text style={[estilosTexto.titulo, { marginTop: 8 }]}>Apartamento</Text>
          <Chips grade opcoes={apartamentos.map((u) => ({ valor: u.id, rotulo: u.numero }))} valor={valor} onChange={onChange} />
        </>
      )}
      <MensagemErro texto={erro} />
    </View>
  );
}
