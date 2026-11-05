import { useCallback, useState, type ReactNode } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, type ParamListBase } from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import { useAuth } from "../auth/AuthContext";
import { useResumo } from "../hooks/queries";
import { useAbrirPorParametro } from "../hooks/useAbrirPorParametro";
import { AvisosScreen } from "./AvisosScreen";
import { MinhaContaModal } from "./MinhaContaModal";
import { MensagemErro, ModalTela, Selo, useEstilosTexto } from "../ui/componentes";
import { data, hora, unidadeTexto } from "../ui/formatar";
import { useCores, useEstilos, type Paleta } from "../ui/tema";
import { Avatar } from "../ui/Avatar";

type Icone = keyof typeof Ionicons.glyphMap;

export function InicioScreen() {
  const cores = useCores();
  const styles = useEstilos(criarStyles);
  const estilosTexto = useEstilosTexto();
  const { usuario } = useAuth();
  const navegacao = useNavigation<BottomTabNavigationProp<ParamListBase>>();
  const query = useResumo();
  const resumo = query.data;
  const carregando = query.isLoading;
  const recarregando = query.isFetching;
  const erro = query.error ? (query.error as Error).message : null;
  const recarregar = query.refetch;

  const [vendoAvisos, setVendoAvisos] = useState(false);
  const [contaAberta, setContaAberta] = useState(false);
  // Tocar numa notificação de aviso abre o Início com a lista de avisos aberta.
  useAbrirPorParametro("verAvisos", useCallback(() => setVendoAvisos(true), []));

  const primeiroNome = usuario?.nome.split(" ")[0];
  const hoje = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });

  return (
    <ScrollView
      style={{ backgroundColor: cores.fundo }}
      contentContainerStyle={styles.conteudo}
      refreshControl={<RefreshControl refreshing={carregando} onRefresh={recarregar} />}
    >
      <View style={styles.cabecalho}>
        {usuario && (
          <Pressable onPress={() => setContaAberta(true)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Minha conta">
            <Avatar pessoa={usuario} tamanho={52} />
          </Pressable>
        )}
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.saudacao}>
            {saudacao()}, {primeiroNome}
          </Text>
          <Text style={estilosTexto.secundario}>
            {resumo?.unidade ? `${unidadeTexto(resumo.unidade)} · ` : ""}
            {hoje.charAt(0).toUpperCase() + hoje.slice(1)}
          </Text>
        </View>
      </View>

      <View style={styles.atalhos}>
        <Atalho icone="person-add" texto="Autorizar visitante" onPress={() => navegacao.navigate("Visitas", { novo: true })} />
        <Atalho icone="calendar" texto="Reservar área" onPress={() => navegacao.navigate("Reservas", { novo: true })} />
      </View>

      <MensagemErro texto={erro} />

      {/* Carregamento inicial: o RefreshControl não aparece sozinho ao montar a tela
          (só quando o usuário puxa pra baixo), então sem isto os cards ficavam em branco. */}
      {carregando && !resumo && (
        <View style={styles.carregando}>
          <ActivityIndicator color={cores.primaria} />
        </View>
      )}

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

          <Cartao icone="megaphone" titulo="Avisos" onPress={() => setVendoAvisos(true)}>
            {resumo.avisos.length === 0 ? (
              <Text style={estilosTexto.secundario}>Nenhum aviso no momento</Text>
            ) : (
              <>
                {resumo.avisos.map((a, i) => (
                  <View key={a.id} style={[{ gap: 2 }, i > 0 && styles.separador]}>
                    <Text style={styles.destaque}>
                      {a.fixado ? "📌 " : ""}
                      {a.titulo}
                    </Text>
                    <Text style={estilosTexto.secundario} numberOfLines={2}>
                      {a.conteudo}
                    </Text>
                  </View>
                ))}
                <Text style={styles.verTodos}>Ver todos os avisos</Text>
              </>
            )}
          </Cartao>
        </>
      )}
      <ModalTela visivel={vendoAvisos} titulo="Avisos" onFechar={() => setVendoAvisos(false)}>
        <AvisosScreen />
      </ModalTela>
      <MinhaContaModal visivel={contaAberta} onFechar={() => setContaAberta(false)} />
    </ScrollView>
  );
}

function saudacao() {
  const h = new Date().getHours();
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

function Atalho({ icone, texto, onPress }: { icone: Icone; texto: string; onPress: () => void }) {
  const cores = useCores();
  const styles = useEstilos(criarStyles);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.atalho, pressed && { opacity: 0.7 }]}>
      <Ionicons name={icone} size={22} color={cores.textoSobreCor} />
      <Text style={styles.atalhoTexto}>{texto}</Text>
    </Pressable>
  );
}

function Cartao({ icone, titulo, onPress, children }: { icone: Icone; titulo: string; onPress: () => void; children: ReactNode }) {
  const cores = useCores();
  const styles = useEstilos(criarStyles);
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

const criarStyles = (cores: Paleta) =>
  StyleSheet.create({
    conteudo: { padding: 16, gap: 14 },
    carregando: { paddingVertical: 32, alignItems: "center" },
    cabecalho: { flexDirection: "row", alignItems: "center", gap: 12 },
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
    atalhoTexto: { color: cores.textoSobreCor, fontWeight: "600", fontSize: 14 },
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
    separador: { borderTopWidth: 1, borderTopColor: cores.borda, paddingTop: 8 },
    verTodos: { color: cores.primaria, fontWeight: "600", fontSize: 14, marginTop: 2 },
  });
