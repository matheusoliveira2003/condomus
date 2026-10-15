import { useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { NavigationContainer, createNavigationContainerRef } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import type { ComponentType } from "react";
import type { Papel } from "./src/api/client";
import { AuthProvider, useAuth } from "./src/auth/AuthContext";
import { LoginScreen } from "./src/screens/LoginScreen";
import { AvisosScreen } from "./src/screens/AvisosScreen";
import { VisitasMoradorScreen } from "./src/screens/VisitasMoradorScreen";
import { PortariaVisitasScreen } from "./src/screens/PortariaVisitasScreen";
import { EncomendasScreen } from "./src/screens/EncomendasScreen";
import { ReservasScreen } from "./src/screens/ReservasScreen";
import { CadastrosScreen } from "./src/screens/CadastrosScreen";
import { MinhaContaModal } from "./src/screens/MinhaContaModal";
import { cores } from "./src/ui/tema";
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
    avisos,
    { nome: "Visitas", titulo: "Meus visitantes", icone: "people-outline", tela: VisitasMoradorScreen },
    encomendas,
    reservas,
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

const Tab = createBottomTabNavigator();
const navegacao = createNavigationContainerRef();

function Navegacao() {
  const { usuario, restaurando } = useAuth();
  const [contaAberta, setContaAberta] = useState(false);
  useAbrirAbaDaNotificacao(navegacao, !!usuario);

  if (restaurando) {
    return (
      <View style={{ flex: 1, justifyContent: "center", backgroundColor: cores.fundo }}>
        <ActivityIndicator size="large" color={cores.primaria} />
      </View>
    );
  }
  if (!usuario) return <LoginScreen />;

  return (
    <>
      <Tab.Navigator
        screenOptions={{
          tabBarActiveTintColor: cores.primaria,
          headerRight: () => (
            <Pressable onPress={() => setContaAberta(true)} hitSlop={12} style={{ marginRight: 16 }}>
              <Ionicons name="person-circle-outline" size={28} color={cores.texto} />
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
        <NavigationContainer ref={navegacao}>
          <Navegacao />
        </NavigationContainer>
      </AuthProvider>
      <StatusBar style="dark" />
    </SafeAreaProvider>
  );
}
