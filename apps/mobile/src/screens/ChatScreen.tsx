import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useIsFocused, useNavigation, useRoute } from "@react-navigation/native";
import { useQueryClient } from "@tanstack/react-query";
import { aquecerServidor, type LadoChat, type MensagemChat, type UnidadeComMoradores } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { Conversa } from "../chat/Conversa";
import { adaptarQuery, useContadores, useConversa, useConversas } from "../hooks/queries";
import { BotaoFlutuante, Lista, ModalFormulario, ModalTela, useEstilosTexto } from "../ui/componentes";
import { data, hora, unidadeTexto } from "../ui/formatar";
import { SeletorUnidade } from "../ui/SeletorUnidade";
import { useCores, useEstilos, type Paleta } from "../ui/tema";
import { ehMorador } from "@condomus/types";

/**
 * Tocar numa notificação do chat abre a aba com `{ unidadeId, unidadeTitulo }`: chama `abrir` com esses valores e limpa
 * os parâmetros, para a conversa não reabrir ao voltar à aba.
 */
function useAbrirConversaDaNotificacao(abrir: (unidadeId: string, titulo?: string) => void) {
  const rota = useRoute();
  const navegacao = useNavigation();
  const params = rota.params as { unidadeId?: string; unidadeTitulo?: string } | undefined;
  const unidadeId = params?.unidadeId;
  const titulo = params?.unidadeTitulo;
  useEffect(() => {
    if (!unidadeId) return;
    abrir(unidadeId, titulo);
    navegacao.setParams({ unidadeId: undefined, unidadeTitulo: undefined } as never);
  }, [unidadeId, titulo, abrir, navegacao]);
}

/**
 * Aba Chat. O morador vê um cartão da conversa com a portaria e a abre numa janela, como a portaria
 * faz com cada unidade. A portaria e o síndico veem a lista de conversas das unidades.
 */
export function ChatScreen() {
  const { usuario } = useAuth();
  const emFoco = useIsFocused();
  // O servidor gratuito dorme: abrir o chat já o acorda, antes de a pessoa terminar de digitar.
  useEffect(() => {
    if (emFoco) aquecerServidor();
  }, [emFoco]);
  // O síndico é um morador: tem a conversa da própria unidade com a portaria. Só o porteiro vê a lista de todas as unidades.
  return usuario && ehMorador(usuario.papel) ? <ChatDoMorador /> : <ConversasDaPortaria />;
}

/** O morador tem uma conversa só (a da unidade): um cartão "Portaria" que abre a conversa numa janela. */
function ChatDoMorador() {
  const emFoco = useIsFocused();
  const [aberta, setAberta] = useState(false);
  // O morador tem uma conversa só: qualquer notificação do chat abre ela.
  useAbrirConversaDaNotificacao(useCallback(() => setAberta(true), []));
  // Janela aberta: a própria conversa busca as novas a cada 4 s. Fechada, o cartão se atualiza mais devagar.
  const conversa = useConversa(undefined, emFoco && !aberta);
  const { data: contadores } = useContadores();
  const qc = useQueryClient();
  const ultima: MensagemChat | undefined = conversa.data?.[0];
  const naoLidas = contadores?.chatNaoLidas ?? 0;

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <ItemConversa titulo="Portaria" icone="chatbubbles-outline" ultima={ultima} naoLidas={naoLidas} meuLado="MORADOR" onAbrir={() => setAberta(true)} />
      <ModalTela
        visivel={aberta}
        titulo="Portaria"
        onFechar={() => {
          setAberta(false);
          // A conversa acabou de ser lida: atualiza o selo do cartão e da aba sem esperar o próximo ciclo.
          void qc.invalidateQueries({ queryKey: ["contadores"] });
        }}
      >
        <Conversa />
      </ModalTela>
    </View>
  );
}

/** A conversa aberta: da lista, ou de uma unidade recém-escolhida que ainda não tem mensagem. */
interface ConversaAberta {
  unidadeId: string;
  titulo: string;
}

function ConversasDaPortaria() {
  const emFoco = useIsFocused();
  const [aberta, setAberta] = useState<ConversaAberta | null>(null);
  const [iniciando, setIniciando] = useState(false);
  const { dados, carregando, recarregando, erro, recarregar } = adaptarQuery(useConversas(emFoco && !aberta));
  // A notificação traz o nome da unidade; sem ele (push antigo), a janela usa um título genérico.
  useAbrirConversaDaNotificacao(useCallback((unidadeId, titulo) => setAberta({ unidadeId, titulo: titulo ?? "Conversa" }), []));

  return (
    <View style={{ flex: 1 }}>
      <Lista
        dados={dados.map((c) => ({ ...c, id: c.unidade.id }))}
        carregando={carregando}
        recarregando={recarregando}
        erro={erro}
        recarregar={recarregar}
        vazio="Não há mensagens por enquanto"
        renderItem={(c) => (
          <ItemConversa
            titulo={unidadeTexto(c.unidade)}
            icone="home-outline"
            ultima={c.ultima}
            naoLidas={c.naoLidas}
            meuLado="PORTARIA"
            onAbrir={() => setAberta({ unidadeId: c.unidade.id, titulo: unidadeTexto(c.unidade) })}
          />
        )}
      />
      <BotaoFlutuante icone="create-outline" rotulo="Nova conversa" onPress={() => setIniciando(true)} />
      <NovaConversaModal
        visivel={iniciando}
        onFechar={() => setIniciando(false)}
        onEscolhida={(u) => {
          setIniciando(false);
          setAberta({ unidadeId: u.id, titulo: unidadeTexto(u) });
        }}
      />
      <ModalTela visivel={!!aberta} titulo={aberta?.titulo ?? ""} onFechar={() => setAberta(null)}>
        {aberta && <Conversa unidadeId={aberta.unidadeId} />}
      </ModalTela>
    </View>
  );
}

/**
 * Escolhe o apartamento para puxar assunto. A conversa só entra na lista depois da primeira mensagem
 * enviada: abrir e sair sem escrever não cria nada.
 */
function NovaConversaModal({
  visivel,
  onFechar,
  onEscolhida,
}: {
  visivel: boolean;
  onFechar: () => void;
  onEscolhida: (unidade: UnidadeComMoradores) => void;
}) {
  const estilosTexto = useEstilosTexto();
  const cores = useCores();
  const [semMoradores, setSemMoradores] = useState<UnidadeComMoradores | null>(null);
  return (
    <ModalFormulario
      visivel={visivel}
      titulo="Nova conversa"
      onFechar={() => {
        setSemMoradores(null);
        onFechar();
      }}
    >
      <Text style={estilosTexto.corpo}>Escolha o apartamento com quem você quer falar.</Text>
      <SeletorUnidade
        valor={semMoradores?.id ?? null}
        onChange={(_id, unidade) => {
          if (!unidade) return;
          // Sem morador ativo, ninguém receberia a mensagem: avisa em vez de abrir uma conversa que ninguém lê.
          if (unidade._count.moradores === 0) setSemMoradores(unidade);
          else {
            setSemMoradores(null);
            onEscolhida(unidade);
          }
        }}
      />
      {semMoradores && (
        <Text style={[estilosTexto.corpo, { color: cores.alerta }]}>
          {unidadeTexto(semMoradores)} não tem moradores cadastrados: ninguém receberia a mensagem.
        </Text>
      )}
    </ModalFormulario>
  );
}

/**
 * Cartão de uma conversa: título, última mensagem, horário e não lidas. Serve à lista da portaria (uma
 * por unidade) e à aba do morador (a conversa com a portaria). Sem mensagem ainda, convida a escrever.
 */
function ItemConversa({
  titulo,
  icone,
  ultima,
  naoLidas,
  meuLado,
  onAbrir,
}: {
  titulo: string;
  icone: "home-outline" | "chatbubbles-outline";
  ultima?: MensagemChat;
  naoLidas: number;
  /** De que lado está quem vê o cartão: a última mensagem dele aparece como "Você". */
  meuLado: LadoChat;
  onAbrir: () => void;
}) {
  const cores = useCores();
  const styles = useEstilos(criarStyles);
  const estilosTexto = useEstilosTexto();
  const hoje = !!ultima && data(new Date()) === data(ultima.criadaEm);
  const previa = ultima ? (ultima.texto ?? (ultima.temFoto ? "📷 Foto" : "")) : "Fale com a portaria";
  return (
    <Pressable onPress={onAbrir} style={({ pressed }) => [styles.item, pressed && { opacity: 0.6 }]} accessibilityRole="button">
      <View style={styles.icone}>
        <Ionicons name={icone} size={20} color={cores.primaria} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={styles.topo}>
          <Text style={[styles.unidade, naoLidas > 0 && { fontWeight: "800" }]} numberOfLines={1}>
            {titulo}
          </Text>
          {ultima && <Text style={estilosTexto.secundario}>{hoje ? hora(ultima.criadaEm) : data(ultima.criadaEm)}</Text>}
        </View>
        <View style={styles.topo}>
          <Text style={[estilosTexto.secundario, { flex: 1 }, naoLidas > 0 && { color: cores.texto }]} numberOfLines={1}>
            {ultima ? (ultima.lado === meuLado ? "Você: " : `${ultima.autor.nome}: `) : ""}
            {previa}
          </Text>
          {naoLidas > 0 && (
            <View style={styles.selo}>
              <Text style={styles.seloTexto}>{naoLidas}</Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

const criarStyles = (cores: Paleta) =>
  StyleSheet.create({
    item: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      padding: 14,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: cores.borda,
      backgroundColor: cores.superficie,
    },
    icone: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: cores.primariaClara },
    topo: { flexDirection: "row", alignItems: "center", gap: 8 },
    unidade: { flex: 1, fontSize: 15, fontWeight: "700", color: cores.texto },
    selo: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, alignItems: "center", justifyContent: "center", backgroundColor: cores.primaria },
    seloTexto: { fontSize: 12, fontWeight: "800", color: cores.textoSobreCor },
  });
