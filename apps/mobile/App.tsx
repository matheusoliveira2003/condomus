import { ActivityIndicator, Alert, Pressable, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { NavigationContainer } from "@react-navigation/native";
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
import { cores } from "./src/ui/tema";

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

function Navegacao() {
  const { usuario, restaurando, sair } = useAuth();

  if (restaurando) {
    return (
      <View style={{ flex: 1, justifyContent: "center", backgroundColor: cores.fundo }}>
        <ActivityIndicator size="large" color={cores.primaria} />
      </View>
    );
  }
  if (!usuario) return <LoginScreen />;

  const confirmarSaida = () =>
    Alert.alert("Sair", `Sair da conta de ${usuario.nome}?`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Sair", style: "destructive", onPress: () => void sair() },
    ]);

  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: cores.primaria,
        headerRight: () => (
          <Pressable onPress={confirmarSaida} hitSlop={12} style={{ marginRight: 16 }}>
            <Ionicons name="log-out-outline" size={24} color={cores.texto} />
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
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <NavigationContainer>
          <Navegacao />
        </NavigationContainer>
      </AuthProvider>
      <StatusBar style="dark" />
    </SafeAreaProvider>
  );
}
