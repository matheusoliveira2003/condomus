import { useState } from "react";
import { Alert, Pressable, Switch, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { Aviso } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { adaptarQuery, useCriarAviso, useAvisos, useRemoverAviso } from "../hooks/queries";
import { BotaoFlutuante, Botao, Campo, Card, Lista, MensagemErro, ModalFormulario, Selo, estilosTexto } from "../ui/componentes";
import { dataHora } from "../ui/formatar";
import { cores } from "../ui/tema";

export function AvisosScreen() {
  const { usuario } = useAuth();
  const ehSindico = usuario?.papel === "SINDICO";
  const { dados, carregando, erro, recarregar } = adaptarQuery(useAvisos());
  const remover = useRemoverAviso();
  const [criando, setCriando] = useState(false);

  function confirmarRemocao(aviso: Aviso) {
    Alert.alert("Remover aviso", `Remover "${aviso.titulo}"?`, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Remover",
        style: "destructive",
        onPress: () => remover.mutate(aviso.id, { onError: (e) => Alert.alert("Erro", (e as Error).message) }),
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
        vazio="Nenhum aviso no momento"
        renderItem={(aviso) => (
          <Card>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
              <View style={{ flex: 1, gap: 6 }}>
                {aviso.fixado && <Selo texto="📌 Fixado" tom="primario" />}
                <Text style={estilosTexto.titulo}>{aviso.titulo}</Text>
              </View>
              {ehSindico && (
                <Pressable onPress={() => confirmarRemocao(aviso)} hitSlop={10}>
                  <Ionicons name="trash-outline" size={20} color={cores.perigo} />
                </Pressable>
              )}
            </View>
            <Text style={estilosTexto.corpo}>{aviso.conteudo}</Text>
            <Text style={estilosTexto.secundario}>
              {aviso.autor.nome} · {dataHora(aviso.criadoEm)}
            </Text>
          </Card>
        )}
      />
      {ehSindico && <BotaoFlutuante onPress={() => setCriando(true)} />}
      <NovoAvisoModal
        visivel={criando}
        onFechar={() => setCriando(false)}
        onCriado={() => setCriando(false)}
      />
    </View>
  );
}

function NovoAvisoModal({ visivel, onFechar, onCriado }: { visivel: boolean; onFechar: () => void; onCriado: () => void }) {
  const [titulo, setTitulo] = useState("");
  const [conteudo, setConteudo] = useState("");
  const [fixado, setFixado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const criar = useCriarAviso();

  async function publicar() {
    setErro(null);
    try {
      await criar.mutateAsync({ titulo, conteudo, fixado });
      setTitulo("");
      setConteudo("");
      setFixado(false);
      onCriado();
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  return (
    <ModalFormulario visivel={visivel} titulo="Novo aviso" onFechar={onFechar}>
      <Campo rotulo="Título" value={titulo} onChangeText={setTitulo} placeholder="Ex.: Manutenção do elevador" />
      <Campo
        rotulo="Mensagem"
        value={conteudo}
        onChangeText={setConteudo}
        multiline
        style={{ minHeight: 120, textAlignVertical: "top" }}
        placeholder="Escreva o comunicado para os moradores"
      />
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={estilosTexto.titulo}>Fixar no topo</Text>
        <Switch value={fixado} onValueChange={setFixado} trackColor={{ true: cores.primaria, false: cores.borda }} />
      </View>
      <MensagemErro texto={erro} />
      <Botao titulo="Publicar" onPress={publicar} carregando={criar.isPending} desabilitado={titulo.length < 3 || !conteudo} />
    </ModalFormulario>
  );
}
