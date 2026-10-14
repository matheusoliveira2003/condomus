import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { api, type Unidade } from "../api/client";
import { Chips, MensagemErro, estilosTexto } from "./componentes";

export function SeletorUnidade({ valor, onChange }: { valor: string | null; onChange: (id: string) => void }) {
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    api<Unidade[]>("/unidades").then(setUnidades).catch((e: Error) => setErro(e.message));
  }, []);

  return (
    <View style={{ gap: 8 }}>
      <Text style={estilosTexto.titulo}>Unidade</Text>
      <Chips opcoes={unidades.map((u) => ({ valor: u.id, rotulo: `${u.bloco}-${u.numero}` }))} valor={valor} onChange={onChange} />
      <MensagemErro texto={erro} />
    </View>
  );
}
