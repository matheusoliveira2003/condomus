import { useEffect, useState } from "react";
import { Alert, Animated, BackHandler, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../auth/AuthContext";
import { useCadastro, useConvite } from "../hooks/queries";
import { Botao, Campo, MensagemErro } from "../ui/componentes";
import { cores } from "../ui/tema";

/** Distância que o painel percorre ao entrar (vindo de baixo). */
const DISTANCIA_ENTRADA = 600;

/**
 * Cadastro do morador por convite, em duas etapas.
 * Anima verticalmente da mesma forma que o LoginScreen quando `progresso` é fornecido.
 */
export function CadastroScreen({
  onVoltar,
  progresso,
}: {
  onVoltar: () => void;
  /** Animated.Value 0→1: 0 = fora de cena, 1 = visível. */
  progresso?: Animated.Value;
}) {
  const [codigo, setCodigo] = useState("");
  const [confirmado, setConfirmado] = useState(false);
  const convite = useConvite(codigo);

  // Painel sobe de DISTANCIA_ENTRADA → 0 conforme progresso vai de 0 → 1.
  const translateY = progresso
    ? progresso.interpolate({ inputRange: [0, 1], outputRange: [DISTANCIA_ENTRADA, 0] })
    : new Animated.Value(0);

  // Invisível quando fora de cena; aparece rapidamente ao iniciar o slide.
  const opacity = progresso
    ? progresso.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 1, 1] })
    : new Animated.Value(1);

  // Bloqueia toques e BackHandler enquanto não está visível.
  const [ativo, setAtivo] = useState(!progresso);
  useEffect(() => {
    if (!progresso) { setAtivo(true); return; }
    const id = progresso.addListener(({ value }) => {
      if (value > 0.05 && !ativo) setAtivo(true);
      if (value < 0.05 && ativo) setAtivo(false);
    });
    return () => progresso.removeListener(id);
  });

  // BackHandler só age quando a tela está visível.
  useEffect(() => {
    if (!ativo) return;
    const assinatura = BackHandler.addEventListener("hardwareBackPress", () => {
      if (confirmado) { setConfirmado(false); return true; }
      onVoltar();
      return true;
    });
    return () => assinatura.remove();
  }, [ativo, confirmado, onVoltar]);

  return (
    <Animated.View style={[StyleSheet.absoluteFill, { opacity }]} pointerEvents={ativo ? "auto" : "none"}>
      <Animated.View style={[styles.painel, { transform: [{ translateY }] }]}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "height" : "padding"}>
          <ScrollView contentContainerStyle={styles.conteudo} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
            {confirmado && convite.data ? (
              <EtapaDados
                codigo={codigo}
                onVoltar={() => setConfirmado(false)}
              />
            ) : (
              <EtapaCodigo
                codigo={codigo}
                onCodigoMudou={(v) => setCodigo(v.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                carregando={convite.isFetching}
                erro={convite.error ? (convite.error as Error).message : null}
                info={convite.data ? `${convite.data.condominio.nome} · Bloco ${convite.data.unidade.bloco} · ${convite.data.unidade.numero}` : null}
                onConfirmar={() => setConfirmado(true)}
                onVoltar={onVoltar}
              />
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </Animated.View>
    </Animated.View>
  );
}

function EtapaCodigo({
  codigo,
  onCodigoMudou,
  carregando,
  erro,
  info,
  onConfirmar,
  onVoltar,
}: {
  codigo: string;
  onCodigoMudou: (v: string) => void;
  carregando: boolean;
  erro: string | null;
  info: string | null;
  onConfirmar: () => void;
  onVoltar: () => void;
}) {
  return (
    <>
      <Text style={styles.titulo}>Criar conta</Text>
      <Campo
        icone="keypad-outline"
        placeholder="Código do convite"
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={8}
        value={codigo}
        onChangeText={onCodigoMudou}
        acaoDireita={
          <Pressable
            onPress={() => Alert.alert(
              "Como obter o código?",
              "O síndico do seu condomínio gera um código de convite de 8 caracteres para cada unidade. Peça ao síndico que acesse o app e crie um convite para a sua unidade.",
              [{ text: "Entendi" }],
            )}
            hitSlop={8}
            accessibilityLabel="Saiba como obter o código de convite"
          >
            <Ionicons name="help-circle-outline" size={22} color={cores.textoSecundario} />
          </Pressable>
        }
      />
      {info && (
        <View style={styles.confirmacao}>
          <Ionicons name="checkmark-circle" size={20} color={cores.sucesso} />
          <Text style={styles.confirmacaoTexto}>{info}</Text>
        </View>
      )}
      <Botao titulo="Continuar" onPress={onConfirmar} carregando={carregando} desabilitado={!info} />
      <Botao titulo="Voltar ao início" variante="discreto" onPress={onVoltar} />
      <MensagemErro texto={codigo.length === 8 ? erro : null} />
    </>
  );
}

function EtapaDados({ codigo, onVoltar }: { codigo: string; onVoltar: () => void }) {
  const { iniciarSessao } = useAuth();
  const cadastro = useCadastro();
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  async function criar() {
    setErro(null);
    if (senha !== confirmacao) return setErro("A confirmação não confere com a senha");
    try {
      const { token, usuario } = await cadastro.mutateAsync({ codigo, nome: nome.trim(), email: email.trim().toLowerCase(), senha });
      await iniciarSessao(token, usuario);
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  return (
    <>
      <Text style={styles.titulo}>Seus dados</Text>
      <Text style={styles.subtitulo}>Preencha para criar sua conta de morador.</Text>
      <Campo icone="person-outline" placeholder="Nome completo" autoComplete="name" value={nome} onChangeText={setNome} />
      <Campo
        icone="mail-outline"
        placeholder="E-mail"
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <Campo
        icone="lock-closed-outline"
        placeholder="Senha (mínimo de 6 caracteres)"
        senha
        autoComplete="new-password"
        value={senha}
        onChangeText={setSenha}
      />
      <Campo
        icone="lock-closed-outline"
        placeholder="Confirmar senha"
        senha
        autoComplete="new-password"
        value={confirmacao}
        onChangeText={setConfirmacao}
        onSubmitEditing={criar}
      />
      <Botao
        titulo="Criar conta"
        onPress={criar}
        carregando={cadastro.isPending}
        desabilitado={nome.trim().length < 2 || !email.includes("@") || senha.length < 6 || !confirmacao}
      />
      <Botao titulo="Voltar" variante="discreto" onPress={onVoltar} />
      <MensagemErro texto={erro} />
    </>
  );
}

const styles = StyleSheet.create({
  painel: {
    ...StyleSheet.absoluteFill,
    backgroundColor: cores.superficie,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    marginTop: 80, // deixa o gradiente visível no topo, alinhado com o LoginScreen
  },
  conteudo: { flexGrow: 1, padding: 24, paddingTop: 32, gap: 14 },
  titulo: { fontSize: 30, fontWeight: "800", color: cores.texto },
  subtitulo: { fontSize: 15, color: cores.textoSecundario, lineHeight: 21 },
  confirmacao: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 10,
    backgroundColor: cores.sucessoClaro,
  },
  confirmacaoTexto: { flex: 1, color: cores.texto, fontWeight: "600" },
});
