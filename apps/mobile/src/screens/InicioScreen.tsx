import { useCallback, type ReactNode } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, type ParamListBase } from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import { api, type Resumo } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { useCarregar } from "../hooks/useCarregar";
import { MensagemErro, Selo, estilosTexto } from "../ui/componentes";
import { data, hora, unidadeTexto } from "../ui/formatar";
import { cores } from "../ui/tema";

type Icone = keyof typeof Ionicons.glyphMap;

export function InicioScreen() {
  const { usuario } = useAuth();
  const navegacao = useNavigation<BottomTabNavigationProp<ParamListBase>>();
  const { dados: resumo, carregando, erro, recarregar } = useCarregar(
    useCallback(() => {
      const inicioDoDia = new Date();
      inicioDoDia.setHours(0, 0, 0, 0);
      return api<Resumo>(`/resumo?inicioDoDia=${inicioDoDia.toISOString()}`);
    }, []),
    null,
  );

  const primeiroNome = usuario?.nome.split(" ")[0];
  const hoje = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });

  return (
    <ScrollView
      style={{ backgroundColor: cores.fundo }}
      contentContainerStyle={styles.conteudo}
      refreshControl={<RefreshControl refreshing={carregando} onRefresh={recarregar} />}
    >
      <View style={{ gap: 2 }}>
        <Text style={styles.saudacao}>
          {saudacao()}, {primeiroNome}!
        </Text>
        <Text style={estilosTexto.secundario}>
          {resumo ? `${unidadeTexto(resumo.unidade)} · ` : ""}
          {hoje.charAt(0).toUpperCase() + hoje.slice(1)}
        </Text>
      </View>

      <View style={styles.atalhos}>
        <Atalho icone="person-add" texto="Autorizar visitante" onPress={() => navegacao.navigate("Visitas", { novo: true })} />
        <Atalho icone="calendar" texto="Reservar área" onPress={() => navegacao.navigate("Reservas", { novo: true })} />
      </View>

      <MensagemErro texto={erro} />

      {resumo && (
        <>
          <Cartao icone="cube" titulo="Encomendas" onPress={() => navegacao.navigate("Encomendas")}>
            {resumo.encomendas.total === 0 ? (
              <Text style={estilosTexto.secundario}>Nenhuma encomenda esperando na portaria</Text>
            ) : (
              <>
                <Text style={styles.destaque}>
                  {resumo.encomendas.total} {resumo.encomendas.total === 1 ? "encomenda" : "encomendas"} na portaria
                </Text>
                {resumo.encomendas.itens.map((e) => (
                  <Text key={e.id} style={estilosTexto.secundario}>
                    • {e.descricao}
                    {e.remetente ? ` (${e.remetente})` : ""}
                  </Text>
                ))}
                {resumo.encomendas.total > resumo.encomendas.itens.length && (
                  <Text style={estilosTexto.secundario}>e mais {resumo.encomendas.total - resumo.encomendas.itens.length}…</Text>
                )}
              </>
            )}
          </Cartao>

          <Cartao icone="people" titulo="Visitantes" onPress={() => navegacao.navigate("Visitas")}>
            {resumo.visitas.noCondominio.length === 0 && resumo.visitas.esperadasHoje.length === 0 ? (
              <Text style={estilosTexto.secundario}>Nenhum visitante esperado hoje</Text>
            ) : (
              <>
                {resumo.visitas.noCondominio.map((v) => (
                  <View key={v.id} style={styles.linha}>
                    <Text style={[estilosTexto.corpo, { flex: 1 }]}>{v.nomeVisitante}</Text>
                    <Selo texto={`No condomínio desde ${hora(v.entradaEm)}`} tom="sucesso" />
                  </View>
                ))}
                {resumo.visitas.esperadasHoje.map((v) => (
                  <View key={v.id} style={styles.linha}>
                    <Text style={[estilosTexto.corpo, { flex: 1 }]}>{v.nomeVisitante}</Text>
                    <Selo texto={v.dataPrevista ? "Esperado hoje" : "Autorizado"} tom="primario" />
                  </View>
                ))}
              </>
            )}
          </Cartao>

          <Cartao icone="calendar" titulo="Próxima reserva" onPress={() => navegacao.navigate("Reservas")}>
            {resumo.proximaReserva ? (
              <>
                <View style={styles.linha}>
                  <Text style={[styles.destaque, { flex: 1 }]}>{resumo.proximaReserva.area.nome}</Text>
                  {resumo.proximaReserva.status === "PENDENTE" ? (
                    <Selo texto="Aguardando aprovação" tom="alerta" />
                  ) : (
                    <Selo texto="Confirmada" tom="sucesso" />
                  )}
                </View>
                <Text style={estilosTexto.secundario}>
                  {data(resumo.proximaReserva.inicio)} · {hora(resumo.proximaReserva.inicio)} às {hora(resumo.proximaReserva.fim)}
                </Text>
              </>
            ) : (
              <Text style={estilosTexto.secundario}>Nenhuma reserva marcada</Text>
            )}
          </Cartao>

          <Cartao icone="megaphone" titulo="Último aviso" onPress={() => navegacao.navigate("Avisos")}>
            {resumo.ultimoAviso ? (
              <>
                <Text style={styles.destaque}>
                  {resumo.ultimoAviso.fixado ? "📌 " : ""}
                  {resumo.ultimoAviso.titulo}
                </Text>
                <Text style={estilosTexto.secundario} numberOfLines={2}>
                  {resumo.ultimoAviso.conteudo}
                </Text>
              </>
            ) : (
              <Text style={estilosTexto.secundario}>Nenhum aviso no momento</Text>
            )}
          </Cartao>
        </>
      )}
    </ScrollView>
  );
}

function saudacao() {
  const h = new Date().getHours();
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

function Atalho({ icone, texto, onPress }: { icone: Icone; texto: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.atalho, pressed && { opacity: 0.7 }]}>
      <Ionicons name={icone} size={22} color="#fff" />
      <Text style={styles.atalhoTexto}>{texto}</Text>
    </Pressable>
  );
}

function Cartao({ icone, titulo, onPress, children }: { icone: Icone; titulo: string; onPress: () => void; children: ReactNode }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.cartao, pressed && { opacity: 0.7 }]}>
      <View style={styles.cartaoCabecalho}>
        <View style={styles.cartaoIcone}>
          <Ionicons name={icone} size={16} color={cores.primaria} />
        </View>
        <Text style={styles.cartaoTitulo}>{titulo}</Text>
        <Ionicons name="chevron-forward" size={18} color={cores.textoSecundario} />
      </View>
      <View style={{ gap: 6 }}>{children}</View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  conteudo: { padding: 16, gap: 14 },
  saudacao: { fontSize: 24, fontWeight: "700", color: cores.texto },
  atalhos: { flexDirection: "row", gap: 10 },
  atalho: {
    flex: 1,
    backgroundColor: cores.primaria,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 12,
    gap: 6,
  },
  atalhoTexto: { color: "#fff", fontWeight: "600", fontSize: 14 },
  cartao: { backgroundColor: cores.superficie, borderRadius: 12, padding: 16, gap: 10, borderWidth: 1, borderColor: cores.borda },
  cartaoCabecalho: { flexDirection: "row", alignItems: "center", gap: 8 },
  cartaoIcone: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: cores.primariaClara,
    alignItems: "center",
    justifyContent: "center",
  },
  cartaoTitulo: { flex: 1, fontSize: 13, fontWeight: "600", color: cores.textoSecundario, textTransform: "uppercase" },
  destaque: { fontSize: 16, fontWeight: "600", color: cores.texto },
  linha: { flexDirection: "row", alignItems: "center", gap: 8 },
});
