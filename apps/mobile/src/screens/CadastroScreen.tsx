import { useEffect, useState } from "react";
import { BackHandler, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../auth/AuthContext";
import { useCadastro, useConvite } from "../hooks/queries";
import { Botao, Campo, MensagemErro } from "../ui/componentes";
import { cores } from "../ui/tema";

/**
 * Cadastro do morador por convite, em duas etapas: o código de 8 caracteres gerado pelo síndico
 * (mostra condomínio e unidade para confirmar) e depois nome, e-mail e senha. Ao concluir, já entra no app.
 */
export function CadastroScreen({ onVoltar }: { onVoltar: () => void }) {
  const [codigo, setCodigo] = useState("");
  const [confirmado, setConfirmado] = useState(false);
  const convite = useConvite(codigo);

  // O botão voltar do Android volta uma etapa (e na primeira, para as boas-vindas).
  useEffect(() => {
    const assinatura = BackHandler.addEventListener("hardwareBackPress", () => {
      if (confirmado) setConfirmado(false);
      else onVoltar();
      return true;
    });
    return () => assinatura.remove();
  }, [confirmado, onVoltar]);

  return (
    <SafeAreaView style={styles.tela} edges={["top", "bottom"]}>
      <Pressable
        onPress={confirmado ? () => setConfirmado(false) : onVoltar}
        hitSlop={12}
        style={styles.voltar}
        accessibilityRole="button"
        accessibilityLabel="Voltar"
      >
        <Ionicons name="arrow-back" size={24} color={cores.texto} />
      </Pressable>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScrollView contentContainerStyle={styles.conteudo} keyboardShouldPersistTaps="handled">
          {confirmado && convite.data ? (
            <EtapaDados codigo={codigo} />
          ) : (
            <EtapaCodigo
              codigo={codigo}
              onCodigoMudou={(v) => setCodigo(v.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
              carregando={convite.isFetching}
              erro={convite.error ? (convite.error as Error).message : null}
              info={convite.data ? `${convite.data.condominio.nome} · Bloco ${convite.data.unidade.bloco} · ${convite.data.unidade.numero}` : null}
              onConfirmar={() => setConfirmado(true)}
            />
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function EtapaCodigo({
  codigo,
  onCodigoMudou,
  carregando,
  erro,
  info,
  onConfirmar,
}: {
  codigo: string;
  onCodigoMudou: (v: string) => void;
  carregando: boolean;
  erro: string | null;
  info: string | null;
  onConfirmar: () => void;
}) {
  return (
    <>
      <Text style={styles.titulo}>Criar conta</Text>
      <Text style={styles.subtitulo}>Digite o código de convite de 8 caracteres que o síndico do seu condomínio gerou para a sua unidade.</Text>
      <View style={{ height: 8 }} />
      <Campo
        icone="keypad-outline"
        placeholder="Código do convite"
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={8}
        value={codigo}
        onChangeText={onCodigoMudou}
      />
      <MensagemErro texto={codigo.length === 8 ? erro : null} />
      {info && (
        <View style={styles.confirmacao}>
          <Ionicons name="checkmark-circle" size={20} color={cores.sucesso} />
          <Text style={styles.confirmacaoTexto}>{info}</Text>
        </View>
      )}
      <View style={{ height: 4 }} />
      <Botao titulo="Continuar" onPress={onConfirmar} carregando={carregando} desabilitado={!info} />
    </>
  );
}

function EtapaDados({ codigo }: { codigo: string }) {
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
      // Entra direto: a API devolve token e usuário como no login.
      await iniciarSessao(token, usuario);
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  return (
    <>
      <Text style={styles.titulo}>Seus dados</Text>
      <Text style={styles.subtitulo}>Preencha para criar sua conta de morador.</Text>
      <View style={{ height: 8 }} />
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
      <MensagemErro texto={erro} />
      <View style={{ height: 4 }} />
      <Botao
        titulo="Criar conta"
        onPress={criar}
        carregando={cadastro.isPending}
        desabilitado={nome.trim().length < 2 || !email.includes("@") || senha.length < 6 || !confirmacao}
      />
    </>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.superficie },
  voltar: { marginLeft: 8, marginTop: 4, padding: 8, alignSelf: "flex-start" },
  conteudo: { flexGrow: 1, padding: 24, paddingTop: 16, gap: 14 },
  titulo: { fontSize: 26, fontWeight: "800", color: cores.texto },
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
