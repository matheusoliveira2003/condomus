import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useIsFocused } from "@react-navigation/native";
import { aquecerServidor, type ConversaChat } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { Conversa } from "../chat/Conversa";
import { adaptarQuery, useConversas } from "../hooks/queries";
import { Lista, ModalTela, useEstilosTexto } from "../ui/componentes";
import { data, hora, unidadeTexto } from "../ui/formatar";
import { useCores, useEstilos, type Paleta } from "../ui/tema";

/**
 * Aba Chat. O morador vê direto a conversa da própria unidade com a portaria. A portaria e o
 * síndico veem a lista de conversas das unidades e abrem a que quiserem responder.
 */
export function ChatScreen() {
  const { usuario } = useAuth();
  const emFoco = useIsFocused();
  // O servidor gratuito dorme: abrir o chat já o acorda, antes de a pessoa terminar de digitar.
  useEffect(() => {
    if (emFoco) aquecerServidor();
  }, [emFoco]);
  return usuario?.papel === "MORADOR" ? <Conversa /> : <ConversasDaPortaria />;
}

function ConversasDaPortaria() {
  const emFoco = useIsFocused();
  const [aberta, setAberta] = useState<ConversaChat | null>(null);
  const { dados, carregando, recarregando, erro, recarregar } = adaptarQuery(useConversas(emFoco && !aberta));

  return (
    <View style={{ flex: 1 }}>
      <Lista
        dados={dados.map((c) => ({ ...c, id: c.unidade.id }))}
        carregando={carregando}
        recarregando={recarregando}
        erro={erro}
        recarregar={recarregar}
        vazio="Não há mensagens por enquanto"
        renderItem={(c) => <ItemConversa conversa={c} onAbrir={() => setAberta(c)} />}
      />
      <ModalTela visivel={!!aberta} titulo={aberta ? unidadeTexto(aberta.unidade) : ""} onFechar={() => setAberta(null)}>
        {aberta && <Conversa unidadeId={aberta.unidade.id} />}
      </ModalTela>
    </View>
  );
}

function ItemConversa({ conversa, onAbrir }: { conversa: ConversaChat; onAbrir: () => void }) {
  const cores = useCores();
  const styles = useEstilos(criarStyles);
  const estilosTexto = useEstilosTexto();
  const { ultima, naoLidas } = conversa;
  const hoje = data(new Date()) === data(ultima.criadaEm);
  const previa = ultima.texto ?? (ultima.temFoto ? "📷 Foto" : "");
  return (
    <Pressable onPress={onAbrir} style={({ pressed }) => [styles.item, pressed && { opacity: 0.6 }]} accessibilityRole="button">
      <View style={styles.icone}>
        <Ionicons name="home-outline" size={20} color={cores.primaria} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={styles.topo}>
          <Text style={[styles.unidade, naoLidas > 0 && { fontWeight: "800" }]} numberOfLines={1}>
            {unidadeTexto(conversa.unidade)}
          </Text>
          <Text style={estilosTexto.secundario}>{hoje ? hora(ultima.criadaEm) : data(ultima.criadaEm)}</Text>
        </View>
        <View style={styles.topo}>
          <Text style={[estilosTexto.secundario, { flex: 1 }, naoLidas > 0 && { color: cores.texto }]} numberOfLines={1}>
            {ultima.lado === "PORTARIA" ? "Você: " : `${ultima.autor.nome}: `}
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
