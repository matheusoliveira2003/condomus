import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Alert, Animated, Pressable, View, ActivityIndicator } from "react-native";
import { StatusBar } from "expo-status-bar";
import { DefaultTheme, NavigationContainer, createNavigationContainerRef, type Theme } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ComponentType } from "react";
import type { Papel } from "./src/api/client";
import { AuthProvider, useAuth } from "./src/auth/AuthContext";
import { LoginScreen } from "./src/screens/LoginScreen";
import { RecuperarSenhaScreen } from "./src/screens/RecuperarSenhaScreen";
import { CadastroScreen } from "./src/screens/CadastroScreen";
import { PlanoInativoScreen } from "./src/screens/PlanoInativoScreen";
import { BoasVindasScreen } from "./src/screens/BoasVindasScreen";
import { AberturaAnimada, type DestinoAbertura } from "./src/screens/AberturaAnimada";
import { FUNDO_MARCA } from "./src/ui/logo";
import { AvisosScreen } from "./src/screens/AvisosScreen";
import { VisitasMoradorScreen } from "./src/screens/VisitasMoradorScreen";
import { PortariaVisitasScreen } from "./src/screens/PortariaVisitasScreen";
import { EncomendasScreen } from "./src/screens/EncomendasScreen";
import { ReservasScreen } from "./src/screens/ReservasScreen";
import { CadastrosScreen } from "./src/screens/CadastrosScreen";
import { InicioScreen } from "./src/screens/InicioScreen";
import { MinhaContaModal } from "./src/screens/MinhaContaModal";
import { cores } from "./src/ui/tema";
import { Avatar } from "./src/ui/Avatar";
import { useAbrirAbaDaNotificacao } from "./src/notificacoes";

interface Aba {
  nome: string;
  titulo: string;
  icone: keyof typeof Ionicons.glyphMap;
  tela: ComponentType;
}

/**
 * HOC que exibe um spinner enquanto a tela ainda não terminou de renderizar
 * pela primeira vez. Substitui o `lazyPlaceholder` removido no React Navigation v7.
 * Deve ser chamado fora de qualquer render para garantir identidade estável do tipo.
 */
function comSpinner<P extends object>(Tela: ComponentType<P>): ComponentType<P> {
  return function TelaComSpinner(props: P) {
    const [pronta, setPronta] = useState(false);
    useLayoutEffect(() => { setPronta(true); }, []);
    if (!pronta) {
      return (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: cores.fundo }}>
          <ActivityIndicator color={cores.primaria} />
        </View>
      );
    }
    return <Tela {...props} />;
  };
}

/** Telas com spinner de lazy loading pré-criados (identidade estável). */
const AvisosLazy = comSpinner(AvisosScreen);
const EncomendasLazy = comSpinner(EncomendasScreen);
const ReservasLazy = comSpinner(ReservasScreen);
const PortariaLazy = comSpinner(PortariaVisitasScreen);
const VisitasMoradorLazy = comSpinner(VisitasMoradorScreen);
const CadastrosLazy = comSpinner(CadastrosScreen);

const avisos: Aba = { nome: "Avisos", titulo: "Avisos", icone: "megaphone-outline", tela: AvisosLazy };
const encomendas: Aba = { nome: "Encomendas", titulo: "Encomendas", icone: "cube-outline", tela: EncomendasLazy };
const reservas: Aba = { nome: "Reservas", titulo: "Reservas", icone: "calendar-outline", tela: ReservasLazy };
const portaria: Aba = { nome: "Portaria", titulo: "Visitantes", icone: "shield-checkmark-outline", tela: PortariaLazy };

/** Abas disponíveis para cada perfil de acesso. */
const abasPorPapel: Record<Papel, Aba[]> = {
  MORADOR: [
    { nome: "Início", titulo: "Início", icone: "home-outline", tela: InicioScreen },
    { nome: "Visitas", titulo: "Meus visitantes", icone: "people-outline", tela: VisitasMoradorLazy },
    encomendas,
    reservas,
    // Sem aba Avisos: os avisos ficam no Início (resumo + "Ver todos").
  ],
  PORTEIRO: [portaria, encomendas, avisos],
  SINDICO: [
    avisos,
    portaria,
    encomendas,
    reservas,
    { nome: "Cadastros", titulo: "Cadastros", icone: "people-outline", tela: CadastrosLazy },
  ],
};

/** Cabeçalho, barra de abas e fundo das telas seguem a paleta do app. */
const temaNavegacao: Theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: cores.primaria,
    background: cores.fundo,
    card: cores.superficie,
    text: cores.texto,
    border: cores.borda,
  },
};

const Tab = createBottomTabNavigator();
const navegacao = createNavigationContainerRef();

/** Duração da troca de painel entre boas-vindas e login. */
const DURACAO_PAINEL = 360;

function Navegacao() {
  const { usuario, restaurando, planoInativo } = useAuth();
  const [contaAberta, setContaAberta] = useState(false);
  /** A abertura animada roda uma vez por abertura do app (não ao voltar de outro app). */
  const [abertura, setAbertura] = useState(true);
  const [telaPublica, setTelaPublica] = useState<"boasVindas" | "login" | "recuperarSenha" | "cadastro">("boasVindas");
  useAbrirAbaDaNotificacao(navegacao, !!usuario, usuario?.papel);

  // 0 = boas-vindas visível; 1 = login visível.
  const progresso = useRef(new Animated.Value(0)).current;
  // 0 = fora de cena; 1 = cadastro visível.
  const progressoCadastro = useRef(new Animated.Value(0)).current;
  // 0 = fora de cena; 1 = recuperar senha visível.
  const progressoRecuperar = useRef(new Animated.Value(0)).current;
  // 0 = invisível; 1 = área logada visível (fade-in ao entrar).
  const opacidadeApp = useRef(new Animated.Value(0)).current;

  function irParaLogin() {
    setTelaPublica("login");
    Animated.timing(progresso, { toValue: 1, duration: DURACAO_PAINEL, useNativeDriver: true }).start();
  }

  function voltarParaBoasVindas() {
    Animated.timing(progresso, { toValue: 0, duration: DURACAO_PAINEL, useNativeDriver: true })
      .start(() => setTelaPublica("boasVindas"));
  }

  function irParaCadastro() {
    setTelaPublica("cadastro");
    Animated.timing(progressoCadastro, { toValue: 1, duration: DURACAO_PAINEL, useNativeDriver: true }).start();
  }

  function voltarDoCadastro() {
    Animated.timing(progressoCadastro, { toValue: 0, duration: DURACAO_PAINEL, useNativeDriver: true })
      .start(() => setTelaPublica("boasVindas"));
  }

  function irParaRecuperar() {
    setTelaPublica("recuperarSenha");
    Animated.timing(progressoRecuperar, { toValue: 1, duration: DURACAO_PAINEL, useNativeDriver: true }).start();
  }

  function voltarDeRecuperar() {
    Animated.timing(progressoRecuperar, { toValue: 0, duration: DURACAO_PAINEL, useNativeDriver: true })
      .start(() => setTelaPublica("login"));
  }

  // Fade-in da área logada ao fazer login.
  useEffect(() => {
    if (usuario) {
      opacidadeApp.setValue(0);
      Animated.timing(opacidadeApp, { toValue: 1, duration: 350, useNativeDriver: true }).start();
    }
  }, [!!usuario]);

  const destinoAbertura: DestinoAbertura = restaurando ? null : usuario || telaPublica !== "boasVindas" ? "app" : "boasVindas";
  const fundoEscuro = abertura || restaurando || (!usuario);

  return (
    <>
      {restaurando ? (
        <View style={{ flex: 1, backgroundColor: FUNDO_MARCA }} />
      ) : !usuario ? (
        // Gradiente fixo + painéis brancos animados verticalmente para todas as telas públicas.
        <TelasPublicas
          progresso={progresso}
          progressoCadastro={progressoCadastro}
          progressoRecuperar={progressoRecuperar}
          abertura={abertura}
          onEntrar={irParaLogin}
          onCriarConta={irParaCadastro}
          onVoltar={voltarParaBoasVindas}
          onVoltarDoCadastro={voltarDoCadastro}
          onEsqueciSenha={irParaRecuperar}
          onVoltarDeRecuperar={voltarDeRecuperar}
          onRecuperado={() => {
            Alert.alert("Senha redefinida", "Sua senha foi alterada. Entre com a nova senha.");
            voltarDeRecuperar();
          }}
        />
      ) : planoInativo && usuario.papel !== "SINDICO" ? (
        <PlanoInativoScreen />
      ) : (
        <Animated.View style={{ flex: 1, opacity: opacidadeApp }}>
          <AreaLogada contaAberta={contaAberta} setContaAberta={setContaAberta} />
        </Animated.View>
      )}
      {abertura && <AberturaAnimada destino={destinoAbertura} onTerminar={() => setAbertura(false)} />}
      <StatusBar style={fundoEscuro ? "light" : "dark"} />
    </>
  );
}

/**
 * Todas as telas públicas compartilham o mesmo fundo gradiente.
 * Apenas os painéis brancos animam verticalmente.
 */
function TelasPublicas({
  progresso,
  progressoCadastro,
  progressoRecuperar,
  abertura,
  onEntrar,
  onCriarConta,
  onVoltar,
  onVoltarDoCadastro,
  onEsqueciSenha,
  onVoltarDeRecuperar,
  onRecuperado,
}: {
  progresso: Animated.Value;
  progressoCadastro: Animated.Value;
  progressoRecuperar: Animated.Value;
  abertura: boolean;
  onEntrar: () => void;
  onCriarConta: () => void;
  onVoltar: () => void;
  onVoltarDoCadastro: () => void;
  onEsqueciSenha: () => void;
  onVoltarDeRecuperar: () => void;
  onRecuperado: () => void;
}) {
  return (
    <View style={{ flex: 1 }}>
      <BoasVindasScreen
        painelVisivel={!abertura}
        onEntrar={onEntrar}
        onCriarConta={onCriarConta}
        progresso={progresso}
      />
      <LoginScreen
        onVoltar={onVoltar}
        onEsqueciSenha={onEsqueciSenha}
        progresso={progresso}
      />
      <CadastroScreen
        onVoltar={onVoltarDoCadastro}
        progresso={progressoCadastro}
      />
      <RecuperarSenhaScreen
        onVoltar={onVoltarDeRecuperar}
        onConcluido={onRecuperado}
        progresso={progressoRecuperar}
      />
    </View>
  );
}

/** Abas do perfil logado, com o acesso à Minha conta no cabeçalho. */
function AreaLogada({ contaAberta, setContaAberta }: { contaAberta: boolean; setContaAberta: (v: boolean) => void }) {
  const { usuario } = useAuth();
  if (!usuario) return null;

  return (
    <>
      <Tab.Navigator
        screenOptions={{
          tabBarActiveTintColor: cores.primaria,
          tabBarInactiveTintColor: cores.textoSecundario,
          lazy: true,
          headerRight: () => (
            <Pressable
              onPress={() => setContaAberta(true)}
              hitSlop={12}
              style={{ marginRight: 16 }}
              accessibilityRole="button"
              accessibilityLabel="Minha conta"
            >
              <Avatar pessoa={usuario} tamanho={32} />
            </Pressable>
          ),
        }}
      >
        {abasPorPapel[usuario.papel].map((aba) => (
          <Tab.Screen
            key={aba.nome}
            name={aba.nome}
            component={aba.tela}
            options={{
              title: aba.titulo,
              tabBarLabel: aba.nome,
              tabBarIcon: ({ color, size }) => <Ionicons name={aba.icone} color={color} size={size} />,
            }}
          />
        ))}
      </Tab.Navigator>
      <MinhaContaModal visivel={contaAberta} onFechar={() => setContaAberta(false)} />
    </>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Dados considerados frescos por 30s — evita re-fetch desnecessário ao alternar abas rapidamente.
      staleTime: 30_000,
      // Retry automático 2x em caso de falha de rede (padrão seria 3x).
      retry: 2,
    },
  },
});

export default function App() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <NavigationContainer ref={navegacao} theme={temaNavegacao}>
            <Navegacao />
          </NavigationContainer>
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
