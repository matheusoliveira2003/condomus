import { useState } from "react";
import { Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { Ionicons, SimpleLineIcons } from "@expo/vector-icons";
import type { Aviso } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { adaptarQuery, useCriarAviso, useAvisos, useEditarAviso, useRemoverAviso } from "../hooks/queries";
import { BotaoFlutuante, Botao, Campo, Card, Lista, MensagemErro, ModalFormulario, useEstilosTexto } from "../ui/componentes";
import { dataHora } from "../ui/formatar";
import { useMensagens } from "../ui/mensagens";
import { useCores, useEstilos, type Paleta } from "../ui/tema";

export function AvisosScreen() {
  const cores = useCores();
  const estilos = useEstilos(criarEstilos);
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
            {aviso.fixado && (
              <View style={estilos.fixado}>
                <SimpleLineIcons name="pin" size={13} color={cores.primaria} />
                <Text style={estilos.fixadoTexto}>FIXADO</Text>
              </View>
            )}
            <View style={estilos.cabecalho}>
              <Text style={estilos.titulo} numberOfLines={2}>{aviso.titulo}</Text>
              {ehSindico && (
                <View style={estilos.acoes}>
                  <Pressable
                    onPress={() => setEditando(aviso)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Editar aviso"
                    style={({ pressed }) => [estilos.acao, { backgroundColor: cores.primariaClara }, pressed && { opacity: 0.7 }]}
                  >
                    <Ionicons name="create-outline" size={19} color={cores.primaria} />
                  </Pressable>
                  <Pressable
                    onPress={() => confirmarRemocao(aviso)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Remover aviso"
                    style={({ pressed }) => [estilos.acao, { backgroundColor: cores.perigoClaro }, pressed && { opacity: 0.7 }]}
                  >
                    <Ionicons name="trash-outline" size={19} color={cores.perigo} />
                  </Pressable>
                </View>
              )}
            </View>
            <Text style={estilos.conteudo}>{aviso.conteudo}</Text>
            <View style={estilos.rodape}>
              <Ionicons name="time-outline" size={14} color={cores.textoSecundario} />
              <Text style={estilos.data}>Publicado em {dataHora(aviso.criadoEm)}</Text>
            </View>
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
  const cores = useCores();
  const estilosTexto = useEstilosTexto();
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

const criarEstilos = (cores: Paleta) =>
  StyleSheet.create({
    fixado: {
      flexDirection: "row",
      alignItems: "center",
      alignSelf: "flex-start",
      gap: 6,
      backgroundColor: cores.primariaClara,
      borderRadius: 10,
      paddingVertical: 6,
      paddingHorizontal: 10,
      marginBottom: 12,
    },
    fixadoTexto: { fontSize: 13, fontWeight: "800", letterSpacing: 0.3, color: cores.primaria },
    cabecalho: { flexDirection: "row", alignItems: "center", gap: 12 },
    titulo: { flex: 1, fontSize: 18, fontWeight: "700", color: cores.texto, lineHeight: 24 },
    acoes: { flexDirection: "row", gap: 8 },
    acao: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
    conteudo: { marginTop: 10, fontSize: 15, lineHeight: 22, color: cores.texto },
    rodape: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginTop: 14,
      paddingTop: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: cores.borda,
    },
    data: { fontSize: 13, color: cores.textoSecundario },
  });
