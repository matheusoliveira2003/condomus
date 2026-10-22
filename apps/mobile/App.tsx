import { useState } from "react";
import { Alert, Pressable, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { DefaultTheme, NavigationContainer, createNavigationContainerRef, type Theme } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import type { ComponentType } from "react";
import type { Papel } from "./src/api/client";
import { AuthProvider, useAuth } from "./src/auth/AuthContext";
import { LoginScreen } from "./src/screens/LoginScreen";
import { RecuperarSenhaScreen } from "./src/screens/RecuperarSenhaScreen";
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

const avisos: Aba = { nome: "Avisos", titulo: "Avisos", icone: "megaphone-outline", tela: AvisosScreen };
const encomendas: Aba = { nome: "Encomendas", titulo: "Encomendas", icone: "cube-outline", tela: EncomendasScreen };
const reservas: Aba = { nome: "Reservas", titulo: "Reservas", icone: "calendar-outline", tela: ReservasScreen };
const portaria: Aba = { nome: "Portaria", titulo: "Visitantes", icone: "shield-checkmark-outline", tela: PortariaVisitasScreen };

/** Abas disponíveis para cada perfil de acesso. */
const abasPorPapel: Record<Papel, Aba[]> = {
  MORADOR: [
    { nome: "Início", titulo: "Início", icone: "home-outline", tela: InicioScreen },
    { nome: "Visitas", titulo: "Meus visitantes", icone: "people-outline", tela: VisitasMoradorScreen },
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
    { nome: "Cadastros", titulo: "Cadastros", icone: "people-outline", tela: CadastrosScreen },
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

function Navegacao() {
  const { usuario, restaurando } = useAuth();
  const [contaAberta, setContaAberta] = useState(false);
  /** A abertura animada roda uma vez por abertura do app (não ao voltar de outro app). */
  const [abertura, setAbertura] = useState(true);
  const [telaPublica, setTelaPublica] = useState<"boasVindas" | "login" | "recuperarSenha">("boasVindas");
  useAbrirAbaDaNotificacao(navegacao, !!usuario, usuario?.papel);

  // Enquanto confere o login salvo, a abertura espera no centro; depois segue para o destino.
  // "app" cobre três casos (já logado, ou a pessoa já saiu das boas-vindas antes da abertura
  // acabar, para o login ou para a recuperação de senha): em todos a abertura só precisa sumir
  // por completo (fundo + logo juntos), sem deixar o logo "flutuando" sobre a tela de trás.
  const destinoAbertura: DestinoAbertura = restaurando ? null : usuario || telaPublica !== "boasVindas" ? "app" : "boasVindas";
  const fundoEscuro = abertura || restaurando || (!usuario && telaPublica === "boasVindas");

  return (
    <>
      {restaurando ? (
        <View style={{ flex: 1, backgroundColor: FUNDO_MARCA }} />
      ) : !usuario ? (
        telaPublica === "login" ? (
          <LoginScreen onVoltar={() => setTelaPublica("boasVindas")} onEsqueciSenha={() => setTelaPublica("recuperarSenha")} />
        ) : telaPublica === "recuperarSenha" ? (
          <RecuperarSenhaScreen
            onVoltar={() => setTelaPublica("login")}
            onConcluido={() => {
              Alert.alert("Senha redefinida", "Sua senha foi alterada. Entre com a nova senha.");
              setTelaPublica("login");
            }}
          />
        ) : (
          <BoasVindasScreen
            // O painel sobe quando a abertura sai de cena (ao voltar do login, já aparece pronto).
            painelVisivel={!abertura}
            onEntrar={() => setTelaPublica("login")}
            onCriarConta={() => Alert.alert("Criar conta", "O pedido de acesso ao condomínio estará disponível em breve.")}
          />
        )
      ) : (
        <AreaLogada contaAberta={contaAberta} setContaAberta={setContaAberta} />
      )}
      {abertura && <AberturaAnimada destino={destinoAbertura} onTerminar={() => setAbertura(false)} />}
      {/* Ícones claros sobre o azul-marinho da abertura e das boas-vindas; escuros nas telas claras. */}
      <StatusBar style={fundoEscuro ? "light" : "dark"} />
    </>
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

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <NavigationContainer ref={navegacao} theme={temaNavegacao}>
          <Navegacao />
        </NavigationContainer>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
