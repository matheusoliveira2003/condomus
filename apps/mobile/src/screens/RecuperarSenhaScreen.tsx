import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { enviar } from "../api/client";
import { Botao, Campo, MensagemErro } from "../ui/componentes";
import { cores } from "../ui/tema";

/**
 * Esqueci a senha, em duas etapas: pedir o código por e-mail, depois informar
 * o código recebido junto com a nova senha. `onConcluido` volta para o login.
 */
export function RecuperarSenhaScreen({ onVoltar, onConcluido }: { onVoltar: () => void; onConcluido: () => void }) {
  const [email, setEmail] = useState("");
  const [codigoPedido, setCodigoPedido] = useState(false);

  return (
    <SafeAreaView style={styles.tela} edges={["top", "bottom"]}>
      <Pressable onPress={onVoltar} hitSlop={12} style={styles.voltar} accessibilityRole="button" accessibilityLabel="Voltar">
        <Ionicons name="arrow-back" size={24} color={cores.texto} />
      </Pressable>
      <View style={styles.conteudo}>
        {codigoPedido ? (
          <EtapaRedefinir email={email} onConcluido={onConcluido} onVoltar={() => setCodigoPedido(false)} />
        ) : (
          <EtapaPedirCodigo email={email} onEmailMudou={setEmail} onPedido={() => setCodigoPedido(true)} />
        )}
      </View>
    </SafeAreaView>
  );
}

function EtapaPedirCodigo({
  email,
  onEmailMudou,
  onPedido,
}: {
  email: string;
  onEmailMudou: (v: string) => void;
  onPedido: () => void;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function pedir() {
    setErro(null);
    setEnviando(true);
    try {
      // A API sempre responde 204, exista ou não o e-mail — então aqui não há como saber,
      // e é assim mesmo (evita confirmar quais e-mails têm conta no condomínio).
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
      <MensagemErro texto={erro} />
      <View style={{ height: 4 }} />
      <Botao titulo="Enviar código" onPress={pedir} carregando={enviando} desabilitado={!email.includes("@")} />
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
      <MensagemErro texto={erro} />
      <View style={{ height: 4 }} />
      <Botao
        titulo="Redefinir senha"
        onPress={redefinir}
        carregando={salvando}
        desabilitado={codigo.length !== 6 || novaSenha.length < 6 || !confirmacao}
      />
      <Pressable onPress={onVoltar} hitSlop={8} style={{ alignSelf: "center", marginTop: 8 }}>
        <Text style={styles.link}>Pedir um novo código</Text>
      </Pressable>
    </>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.superficie },
  voltar: { marginLeft: 8, marginTop: 4, padding: 8, alignSelf: "flex-start" },
  conteudo: { flex: 1, padding: 24, paddingTop: 16, gap: 14 },
  titulo: { fontSize: 26, fontWeight: "800", color: cores.texto },
  subtitulo: { fontSize: 15, color: cores.textoSecundario, lineHeight: 21 },
  link: { color: cores.primaria, fontWeight: "600", fontSize: 14 },
});
