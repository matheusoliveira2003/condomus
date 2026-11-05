import { useState } from "react";
import { Pressable, Switch, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { Aviso } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { adaptarQuery, useCriarAviso, useAvisos, useEditarAviso, useRemoverAviso } from "../hooks/queries";
import { BotaoFlutuante, Botao, Campo, Card, Lista, MensagemErro, ModalFormulario, estilosTexto } from "../ui/componentes";
import { dataHora } from "../ui/formatar";
import { useMensagens } from "../ui/mensagens";
import { cores } from "../ui/tema";

export function AvisosScreen() {
  const { usuario } = useAuth();
  const ehSindico = usuario?.papel === "SINDICO";
  const { dados, carregando, recarregando, erro, recarregar } = adaptarQuery(useAvisos());
  const remover = useRemoverAviso();
  const mensagens = useMensagens();
  const [criando, setCriando] = useState(false);
  const [editando, setEditando] = useState<Aviso | null>(null);

  function confirmarRemocao(aviso: Aviso) {
    mensagens.confirmar({
      titulo: "Remover aviso",
      texto: `Remover "${aviso.titulo}"?`,
      confirmar: "Remover",
      perigo: true,
      aoConfirmar: () =>
        remover.mutate(aviso.id, {
          onSuccess: () => mensagens.sucesso("Aviso removido."),
          onError: (e) => mensagens.erro((e as Error).message),
        }),
    });
  }

  return (
    <View style={{ flex: 1 }}>
      <Lista
        dados={dados}
        carregando={carregando}
        recarregando={recarregando}
        erro={erro}
        recarregar={recarregar}
        vazio="Nenhum aviso no momento"
        renderItem={(aviso) => (
          <Card>
            {/* Cabeçalho: título + botões de ação */}
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
              <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 6 }}>
                {aviso.fixado && <Ionicons name="pin" size={16} color={cores.perigo} />}
                <Text style={[estilosTexto.titulo, { fontSize: 18, flex: 1 }]}>{aviso.titulo}</Text>
              </View>
              {ehSindico && (
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <Pressable
                    onPress={() => setEditando(aviso)}
                    hitSlop={6}
                    style={{ backgroundColor: cores.primariaClara, borderRadius: 8, padding: 6 }}
                  >
                    <Ionicons name="create-outline" size={18} color={cores.primaria} />
                  </Pressable>
                  <Pressable onPress={() => confirmarRemocao(aviso)} hitSlop={10}>
                    <Ionicons name="trash-outline" size={20} color={cores.perigo} />
                  </Pressable>
                </View>
              )}
            </View>
            {/* Conteúdo */}
            <Text style={estilosTexto.corpo}>{aviso.conteudo}</Text>
            {/* Rodapé: data/hora alinhada à direita */}
            <Text style={[estilosTexto.secundario, { textAlign: "right" }]}>{dataHora(aviso.criadoEm)}</Text>
          </Card>
        )}
      />
      {ehSindico && <BotaoFlutuante onPress={() => setCriando(true)} />}
      <AvisoModal
        key="novo"
        visivel={criando}
        onFechar={() => setCriando(false)}
      />
      <AvisoModal
        key={editando?.id ?? "editar"}
        visivel={!!editando}
        aviso={editando ?? undefined}
        onFechar={() => setEditando(null)}
      />
    </View>
  );
}

/** Modal reutilizável para criar e editar avisos. */
function AvisoModal({
  visivel,
  aviso,
  onFechar,
}: {
  visivel: boolean;
  aviso?: Aviso;
  onFechar: () => void;
}) {
  const [titulo, setTitulo] = useState(aviso?.titulo ?? "");
  const [conteudo, setConteudo] = useState(aviso?.conteudo ?? "");
  const [fixado, setFixado] = useState(aviso?.fixado ?? false);
  const [erro, setErro] = useState<string | null>(null);
  const criar = useCriarAviso();
  const editar = useEditarAviso();

  const editando = !!aviso;
  const pendente = criar.isPending || editar.isPending;

  // Reinicia os campos toda vez que o modal abre com um aviso diferente (ou sem aviso).
  // Não usar useEffect aqui para não criar dependência extra — o `key` no componente pai é mais limpo,
  // mas como o modal é reutilizado, sincronizamos via prop visivel.
  function fechar() {
    setTitulo(aviso?.titulo ?? "");
    setConteudo(aviso?.conteudo ?? "");
    setFixado(aviso?.fixado ?? false);
    setErro(null);
    onFechar();
  }

  async function salvar() {
    setErro(null);
    try {
      if (editando) {
        await editar.mutateAsync({ id: aviso.id, titulo, conteudo, fixado });
      } else {
        await criar.mutateAsync({ titulo, conteudo, fixado });
      }
      fechar();
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  return (
    <ModalFormulario visivel={visivel} titulo={editando ? "Editar aviso" : "Novo aviso"} onFechar={fechar}>
      <Campo rotulo="Título" value={titulo} onChangeText={setTitulo} placeholder="Ex.: Manutenção do elevador" />
      <Campo
        rotulo="Mensagem"
        value={conteudo}
        onChangeText={setConteudo}
        multiline
        style={{ height: 120, textAlignVertical: "top" }}
        placeholder="Escreva o comunicado para os moradores"
      />
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={estilosTexto.titulo}>Fixar no topo</Text>
        <Switch value={fixado} onValueChange={setFixado} trackColor={{ true: cores.primaria, false: cores.borda }} />
      </View>
      <MensagemErro texto={erro} />
      <Botao
        titulo={editando ? "Salvar alterações" : "Publicar"}
        onPress={salvar}
        carregando={pendente}
        desabilitado={titulo.length < 3 || !conteudo}
      />
    </ModalFormulario>
  );
}
