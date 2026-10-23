import { useCallback, useState } from "react";
import { Alert, Pressable, Switch, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api, enviar, type Aviso, type Pagina } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { useCarregar } from "../hooks/useCarregar";
import { BotaoFlutuante, Botao, Campo, Card, Lista, MensagemErro, ModalFormulario, Selo, estilosTexto } from "../ui/componentes";
import { dataHora } from "../ui/formatar";
import { cores } from "../ui/tema";

export function AvisosScreen() {
  const { usuario } = useAuth();
  const ehSindico = usuario?.papel === "SINDICO";
  const { dados, carregando, erro, recarregar } = useCarregar(
    useCallback(() => api<Pagina<Aviso>>("/avisos").then((p) => p.itens), []),
    [],
  );
  const [criando, setCriando] = useState(false);

  function remover(aviso: Aviso) {
    Alert.alert("Remover aviso", `Remover "${aviso.titulo}"?`, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Remover",
        style: "destructive",
        onPress: () => enviar("DELETE", `/avisos/${aviso.id}`).then(recarregar).catch((e: Error) => Alert.alert("Erro", e.message)),
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
                <Pressable onPress={() => remover(aviso)} hitSlop={10}>
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
        onCriado={() => {
          setCriando(false);
          void recarregar();
        }}
      />
    </View>
  );
}

function NovoAvisoModal({ visivel, onFechar, onCriado }: { visivel: boolean; onFechar: () => void; onCriado: () => void }) {
  const [titulo, setTitulo] = useState("");
  const [conteudo, setConteudo] = useState("");
  const [fixado, setFixado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function publicar() {
    setSalvando(true);
    setErro(null);
    try {
      await enviar("POST", "/avisos", { titulo, conteudo, fixado });
      setTitulo("");
      setConteudo("");
      setFixado(false);
      onCriado();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setSalvando(false);
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
      <Botao titulo="Publicar" onPress={publicar} carregando={salvando} desabilitado={titulo.length < 3 || !conteudo} />
    </ModalFormulario>
  );
}
