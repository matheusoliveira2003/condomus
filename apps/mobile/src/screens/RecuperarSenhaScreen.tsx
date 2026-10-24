import { useEffect, useState } from "react";
import { Animated, BackHandler, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { enviar } from "../api/client";
import { Botao, Campo, MensagemErro } from "../ui/componentes";
import { emailValido } from "../ui/formatar";
import { cores } from "../ui/tema";

const DISTANCIA_ENTRADA = 600;

export function RecuperarSenhaScreen({
  onVoltar,
  onConcluido,
  progresso,
}: {
  onVoltar: () => void;
  onConcluido: () => void;
  /** Animated.Value 0→1: 0 = fora de cena, 1 = visível. */
  progresso?: Animated.Value;
}) {
  const [email, setEmail] = useState("");
  const [codigoPedido, setCodigoPedido] = useState(false);

  const translateY = progresso
    ? progresso.interpolate({ inputRange: [0, 1], outputRange: [DISTANCIA_ENTRADA, 0] })
    : new Animated.Value(0);

  const opacity = progresso
    ? progresso.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 1, 1] })
    : new Animated.Value(1);

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
      onVoltar();
      return true;
    });
    return () => assinatura.remove();
  }, [ativo, onVoltar]);

  return (
    <Animated.View style={[StyleSheet.absoluteFill, { opacity }]} pointerEvents={ativo ? "auto" : "none"}>
      <Animated.View style={[styles.painel, { transform: [{ translateY }] }]}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "height" : "padding"}>
          <ScrollView contentContainerStyle={styles.conteudo} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
            {codigoPedido ? (
              <EtapaRedefinir email={email} onConcluido={onConcluido} onVoltar={() => setCodigoPedido(false)} />
            ) : (
              <EtapaPedirCodigo
                email={email}
                onEmailMudou={setEmail}
                onPedido={() => setCodigoPedido(true)}
                onVoltar={onVoltar}
              />
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </Animated.View>
    </Animated.View>
  );
}

function EtapaPedirCodigo({
  email,
  onEmailMudou,
  onPedido,
  onVoltar,
}: {
  email: string;
  onEmailMudou: (v: string) => void;
  onPedido: () => void;
  onVoltar: () => void;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function pedir() {
    if (!emailValido(email)) return setErro("Digite um e-mail válido");
    setErro(null);
    setEnviando(true);
    try {
      await enviar("POST", "/auth/recuperar-senha", { email: email.trim().toLowerCase() });
      onPedido();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <Text style={styles.titulo}>Esqueceu a senha?</Text>
      <Text style={styles.subtitulo}>Informe seu e-mail. Se ele estiver cadastrado, enviaremos um código para redefinir a senha.</Text>
      <View style={{ height: 8 }} />
      <Campo
        icone="mail-outline"
        placeholder="E-mail"
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        value={email}
        onChangeText={onEmailMudou}
        onSubmitEditing={pedir}
      />
      <Botao titulo="Enviar código" onPress={pedir} carregando={enviando} desabilitado={!emailValido(email)} />
      <Botao titulo="Voltar ao login" variante="discreto" onPress={onVoltar} />
      <MensagemErro texto={erro} />
    </>
  );
}

function EtapaRedefinir({ email, onConcluido, onVoltar }: { email: string; onConcluido: () => void; onVoltar: () => void }) {
  const [codigo, setCodigo] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function redefinir() {
    setErro(null);
    if (novaSenha !== confirmacao) return setErro("A confirmação não confere com a nova senha");
    setSalvando(true);
    try {
      await enviar("POST", "/auth/redefinir-senha", { email, codigo: codigo.trim(), novaSenha });
      onConcluido();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <>
      <Text style={styles.titulo}>Digite o código</Text>
      <Text style={styles.subtitulo}>
        Enviamos um código de 6 números para <Text style={{ fontWeight: "700" }}>{email}</Text>. Ele vale por 15 minutos.
      </Text>
      <View style={{ height: 8 }} />
      <Campo
        icone="keypad-outline"
        placeholder="Código recebido"
        keyboardType="number-pad"
        maxLength={6}
        value={codigo}
        onChangeText={setCodigo}
      />
      <Campo
        icone="lock-closed-outline"
        placeholder="Nova senha"
        senha
        value={novaSenha}
        onChangeText={setNovaSenha}
        autoComplete="new-password"
      />
      <Campo
        icone="lock-closed-outline"
        placeholder="Confirmar nova senha"
        senha
        value={confirmacao}
        onChangeText={setConfirmacao}
        autoComplete="new-password"
        onSubmitEditing={redefinir}
      />
      <Botao
        titulo="Redefinir senha"
        onPress={redefinir}
        carregando={salvando}
        desabilitado={codigo.length !== 6 || novaSenha.length < 6 || !confirmacao}
      />
      <Botao titulo="Pedir um novo código" variante="discreto" onPress={onVoltar} />
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
    marginTop: 80,
  },
  conteudo: { flexGrow: 1, padding: 24, paddingTop: 32, gap: 14 },
  titulo: { fontSize: 26, fontWeight: "800", color: cores.texto },
  subtitulo: { fontSize: 15, color: cores.textoSecundario, lineHeight: 21 },
});
