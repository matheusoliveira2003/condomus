import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { enviar, type PlanoStatus, type Usuario } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { useCondominio, usePerfil } from "../hooks/queries";
import { Botao, Campo, Card, MensagemErro, ModalFormulario, Secao, Selecao, Selo, useEstilosTexto } from "../ui/componentes";
import { unidadeTexto } from "../ui/formatar";
import { Avatar } from "../ui/Avatar";
import { escolherFoto, type OrigemFoto } from "../foto";
import { useMensagens } from "../ui/mensagens";
import { paletaClara, paletaEscura, useCores, useEstilos, useTema, type Paleta, type Preferencia } from "../ui/tema";
import type { Papel } from "../api/client";

const opcoesAparencia: { valor: Preferencia; rotulo: string; icone: keyof typeof Ionicons.glyphMap }[] = [
  { valor: "claro", rotulo: "Claro", icone: "sunny-outline" },
  { valor: "escuro", rotulo: "Escuro", icone: "moon-outline" },
  { valor: "sistema", rotulo: "Automático", icone: "phone-portrait-outline" },
];

const descricaoAparencia: Record<Preferencia, string> = {
  claro: "Fundo claro, com o azul-marinho da marca. Ideal para ambientes iluminados.",
  escuro: "Fundo escuro, que cansa menos a vista à noite e economiza bateria em telas OLED.",
  sistema: "O app acompanha o modo claro ou escuro do seu celular e muda sozinho.",
};

const rotuloAparencia: Record<Preferencia, string> = {
  claro: "Claro",
  escuro: "Escuro",
  sistema: "Automático",
};

const rotuloPapel: Record<Papel, string> = { MORADOR: "Morador", PORTEIRO: "Porteiro", SINDICO: "Síndico" };

const rotuloPlano: Record<PlanoStatus, { texto: string; tom: "sucesso" | "primario" | "alerta" | "neutro" }> = {
  TRIAL: { texto: "Período de teste", tom: "primario" },
  ATIVO: { texto: "Ativo", tom: "sucesso" },
  EXPIRADO: { texto: "Expirado", tom: "alerta" },
  SUSPENSO: { texto: "Suspenso", tom: "neutro" },
};

export function MinhaContaModal({ visivel, onFechar }: { visivel: boolean; onFechar: () => void }) {
  const cores = useCores();
  const styles = useEstilos(criarStyles);
  const estilosTexto = useEstilosTexto();
  const { preferencia } = useTema();
  const { sair, usuario, definirFoto } = useAuth();
  const { data: perfil } = usePerfil(visivel);
  const { data: condominio } = useCondominio(visivel);
  const [trocandoSenha, setTrocandoSenha] = useState(false);
  const [trocandoEmail, setTrocandoEmail] = useState(false);
  const [escolhendoAparencia, setEscolhendoAparencia] = useState(false);
  const [sheetAberto, setSheetAberto] = useState(false);
  const [enviandoFoto, setEnviandoFoto] = useState(false);
  const mensagens = useMensagens();

  function confirmarSaida() {
    mensagens.confirmar({
      titulo: "Sair",
      texto: "Deseja sair da sua conta?",
      confirmar: "Sair",
      perigo: true,
      aoConfirmar: () => {
        onFechar();
        void sair();
      },
    });
  }

  async function trocar(origem: OrigemFoto) {
    setSheetAberto(false);
    try {
      const imagem = await escolherFoto(origem);
      if (!imagem) return;
      setEnviandoFoto(true);
      const { fotoAtualizadaEm } = await enviar<{ fotoAtualizadaEm: string }>("PUT", "/auth/foto", { imagem });
      definirFoto(fotoAtualizadaEm);
      mensagens.sucesso("Foto atualizada.");
    } catch (e) {
      mensagens.erro((e as Error).message);
    } finally {
      setEnviandoFoto(false);
    }
  }

  function removerFoto() {
    setSheetAberto(false);
    mensagens.confirmar({
      titulo: "Remover foto",
      texto: "Deseja remover sua foto de perfil?",
      confirmar: "Remover",
      perigo: true,
      aoConfirmar: () =>
        enviar("DELETE", "/auth/foto")
          .then(() => {
            definirFoto(null);
            mensagens.sucesso("Foto removida.");
          })
          .catch((e: Error) => mensagens.erro(e.message)),
    });
  }

  return (
    <ModalFormulario
      visivel={visivel}
      titulo="Minha conta"
      onFechar={onFechar}
      overlay={
        <FotoSheet
          visivel={sheetAberto}
          temFoto={!!usuario?.fotoAtualizadaEm}
          onGaleria={() => void trocar("galeria")}
          onCamera={() => void trocar("camera")}
          onRemover={removerFoto}
          onFechar={() => setSheetAberto(false)}
        />
      }
    >
      {/* Cabeçalho do perfil */}
      {perfil ? (
        <View style={styles.perfil}>
          <FotoDePerfil enviando={enviandoFoto} onAbrirSheet={() => setSheetAberto(true)} />
          <Text style={[estilosTexto.titulo, { fontSize: 18 }]}>{perfil.nome}</Text>
          <Text style={estilosTexto.secundario}>{perfil.email}</Text>
          {condominio && <Text style={estilosTexto.secundario}>{condominio.nome}</Text>}
          <Text style={estilosTexto.corpo}>
            {rotuloPapel[perfil.papel]}
            {perfil.unidade && ` · ${unidadeTexto(perfil.unidade)}`}
          </Text>
        </View>
      ) : (
        <View style={styles.perfilCarregando}>
          <ActivityIndicator color={cores.primaria} />
        </View>
      )}

      {/* Plano (síndico) */}
      {perfil?.papel === "SINDICO" && <PlanoDoCondominio />}

      {/* Links de conta */}
      <Pressable
        onPress={() => setTrocandoSenha(true)}
        style={({ pressed }) => [styles.linkSenha, pressed && { opacity: 0.6 }]}
        accessibilityRole="button"
      >
        <Ionicons name="lock-closed-outline" size={20} color={cores.primaria} />
        <Text style={styles.linkSenhaTexto}>Trocar senha</Text>
        <Ionicons name="chevron-forward" size={16} color={cores.primaria} style={{ marginLeft: "auto" }} />
      </Pressable>
      <Pressable
        onPress={() => setTrocandoEmail(true)}
        style={({ pressed }) => [styles.linkSenha, pressed && { opacity: 0.6 }]}
        accessibilityRole="button"
      >
        <Ionicons name="mail-outline" size={20} color={cores.primaria} />
        <Text style={styles.linkSenhaTexto}>Trocar e-mail</Text>
        <Ionicons name="chevron-forward" size={16} color={cores.primaria} style={{ marginLeft: "auto" }} />
      </Pressable>

      <Pressable
        onPress={() => setEscolhendoAparencia(true)}
        style={({ pressed }) => [styles.linkSenha, pressed && { opacity: 0.6 }]}
        accessibilityRole="button"
      >
        <Ionicons name="contrast-outline" size={20} color={cores.primaria} />
        <Text style={styles.linkSenhaTexto}>Aparência</Text>
        <Text style={[estilosTexto.secundario, { marginLeft: "auto" }]}>{rotuloAparencia[preferencia]}</Text>
        <Ionicons name="chevron-forward" size={16} color={cores.primaria} />
      </Pressable>

      {/* Separador antes do botão de sair */}
      <View style={styles.separador} />

      <Botao titulo="Sair da conta" variante="perigo" onPress={confirmarSaida} />

      {/* Modais de conta */}
      <TrocarSenhaModal visivel={trocandoSenha} onFechar={() => setTrocandoSenha(false)} />
      <TrocarEmailModal visivel={trocandoEmail} onFechar={() => setTrocandoEmail(false)} />
      <AparenciaModal visivel={escolhendoAparencia} onFechar={() => setEscolhendoAparencia(false)} />
    </ModalFormulario>
  );
}

/** Situação do plano do condomínio (visível só ao síndico). */
function PlanoDoCondominio() {
  const styles = useEstilos(criarStyles);
  const estilosTexto = useEstilosTexto();
  const { data: condominio } = useCondominio();
  if (!condominio) return null;
  const { texto, tom } = rotuloPlano[condominio.planoStatus];
  return (
    <Card>
      <Secao titulo="Plano do condomínio" />
      <Text style={estilosTexto.corpo}>{condominio.nome}</Text>
      <View style={styles.planoLinha}>
        <Selo texto={texto} tom={tom} />
        {condominio.planoExpiraEm && (
          <Text style={estilosTexto.secundario}>
            {condominio.planoStatus === "EXPIRADO" ? "Expirou em " : "Válido até "}
            {new Date(condominio.planoExpiraEm).toLocaleDateString("pt-BR")}
          </Text>
        )}
      </View>
    </Card>
  );
}

/** Avatar grande; tocar chama onAbrirSheet para exibir o sheet no nível correto. */
function FotoDePerfil({ enviando, onAbrirSheet }: { enviando: boolean; onAbrirSheet: () => void }) {
  const cores = useCores();
  const styles = useEstilos(criarStyles);
  const { usuario } = useAuth();
  if (!usuario) return null;

  return (
    <Pressable
      onPress={onAbrirSheet}
      disabled={enviando}
      accessibilityRole="button"
      accessibilityLabel="Alterar foto de perfil"
    >
      <Avatar pessoa={usuario} tamanho={96} />
      {enviando ? (
        <View style={styles.carregandoFoto}>
          <ActivityIndicator color="#fff" />
        </View>
      ) : (
        <View style={styles.seloCamera}>
          <Ionicons name="camera" size={16} color={cores.textoSobreCor} />
        </View>
      )}
    </Pressable>
  );
}

/** Bottom sheet customizado para seleção de foto de perfil. */
function FotoSheet({
  visivel,
  temFoto,
  onGaleria,
  onCamera,
  onRemover,
  onFechar,
}: {
  visivel: boolean;
  temFoto: boolean;
  onGaleria: () => void;
  onCamera: () => void;
  onRemover: () => void;
  onFechar: () => void;
}) {
  const stylesSheet = useEstilos(criarStylesSheet);
  const translateY = useRef(new Animated.Value(300)).current;
  const opacidade = useRef(new Animated.Value(0)).current;
  // montado controla se o componente fica na árvore; só desmonta após animação de saída terminar.
  const [montado, setMontado] = useState(visivel);

  useEffect(() => {
    if (visivel) {
      setMontado(true);
      Animated.parallel([
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 4 }),
        Animated.timing(opacidade, { toValue: 1, duration: 180, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateY, { toValue: 300, duration: 200, useNativeDriver: true }),
        Animated.timing(opacidade, { toValue: 0, duration: 180, useNativeDriver: true }),
      ]).start(({ finished }) => {
        // Só desmonta depois da animação de saída — evita bloquear toques do modal.
        if (finished) setMontado(false);
      });
    }
  }, [visivel]);

  if (!montado) return null;

  return (
    <Animated.View style={[stylesSheet.fundo, { opacity: opacidade }]}>
      <Pressable style={{ flex: 1 }} onPress={onFechar} />
      <Animated.View style={[stylesSheet.sheet, { transform: [{ translateY }] }]}>
        <View style={stylesSheet.alca} />
        <Text style={stylesSheet.titulo}>Foto de perfil</Text>
        <OpcaoSheet icone="images-outline" texto="Escolher da galeria" onPress={onGaleria} />
        <OpcaoSheet icone="camera-outline" texto="Tirar foto" onPress={onCamera} />
        {temFoto && (
          <>
            <View style={stylesSheet.separador} />
            <OpcaoSheet icone="trash-outline" texto="Remover foto" onPress={onRemover} perigo />
          </>
        )}
        <Pressable onPress={onFechar} style={stylesSheet.cancelar}>
          <Text style={stylesSheet.cancelarTexto}>Cancelar</Text>
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

function OpcaoSheet({
  icone,
  texto,
  onPress,
  perigo,
}: {
  icone: keyof typeof Ionicons.glyphMap;
  texto: string;
  onPress: () => void;
  perigo?: boolean;
}) {
  const cores = useCores();
  const stylesSheet = useEstilos(criarStylesSheet);
  const cor = perigo ? cores.perigo : cores.texto;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [stylesSheet.opcao, pressed && { backgroundColor: cores.fundo }]}
    >
      <View style={[stylesSheet.opcaoIcone, perigo && { backgroundColor: cores.perigoClaro }]}>
        <Ionicons name={icone} size={20} color={cor} />
      </View>
      <Text style={[stylesSheet.opcaoTexto, { color: cor }]}>{texto}</Text>
      {!perigo && <Ionicons name="chevron-forward" size={16} color={cores.textoSecundario} style={{ marginLeft: "auto" }} />}
    </Pressable>
  );
}

/** Escolha entre modo claro, escuro ou automático (salva no aparelho), com prévia do resultado. */
function AparenciaModal({ visivel, onFechar }: { visivel: boolean; onFechar: () => void }) {
  const cores = useCores();
  const styles = useEstilos(criarStyles);
  const estilosTexto = useEstilosTexto();
  const { preferencia, definirPreferencia, esquema } = useTema();
  return (
    <ModalFormulario visivel={visivel} titulo="Aparência" onFechar={onFechar}>
      <PreviaTema paleta={esquema === "escuro" ? paletaEscura : paletaClara} />
      <Card>
        <Selecao rotulo="Modo" opcoes={opcoesAparencia} valor={preferencia} onChange={definirPreferencia} />
        <View style={styles.aparenciaDescricao}>
          <Ionicons name="information-circle-outline" size={18} color={cores.textoSecundario} style={{ marginTop: 1 }} />
          <Text style={[estilosTexto.secundario, { flex: 1 }]}>{descricaoAparencia[preferencia]}</Text>
        </View>
      </Card>
    </ModalFormulario>
  );
}

/** Miniatura do app (cabeçalho, cartão, selos e abas) desenhada com a paleta do modo escolhido. */
function PreviaTema({ paleta: p }: { paleta: Paleta }) {
  const e = useMemo(() => criarPrevia(p), [p]);
  return (
    <View style={e.moldura} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={e.tela}>
        <View style={e.cabecalho}>
          <View style={[e.linha, { width: 84, height: 10, backgroundColor: p.texto }]} />
          <View style={e.avatar} />
        </View>
        <View style={e.conteudo}>
          <View style={e.card}>
            <View style={[e.linha, { width: "62%", height: 9, backgroundColor: p.texto }]} />
            <View style={[e.linha, { width: "90%", height: 7, backgroundColor: p.textoSecundario, opacity: 0.55 }]} />
            <View style={[e.linha, { width: "74%", height: 7, backgroundColor: p.textoSecundario, opacity: 0.55 }]} />
            <View style={e.selos}>
              <View style={[e.selo, { backgroundColor: p.sucessoClaro }]}>
                <View style={[e.linha, { width: 30, height: 6, backgroundColor: p.sucesso }]} />
              </View>
              <View style={[e.selo, { backgroundColor: p.alertaClaro }]}>
                <View style={[e.linha, { width: 30, height: 6, backgroundColor: p.alerta }]} />
              </View>
            </View>
          </View>
          <View style={e.botao}>
            <View style={[e.linha, { width: 54, height: 7, backgroundColor: p.textoSobreCor }]} />
          </View>
        </View>
        <View style={e.abas}>
          {[true, false, false, false].map((ativa, i) => (
            <View key={i} style={e.aba}>
              <View style={[e.abaIcone, { backgroundColor: ativa ? p.primaria : p.textoSecundario, opacity: ativa ? 1 : 0.45 }]} />
              <View style={[e.linha, { width: 20, height: 4, backgroundColor: ativa ? p.primaria : p.textoSecundario, opacity: ativa ? 1 : 0.45 }]} />
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const criarPrevia = (p: Paleta) =>
  StyleSheet.create({
    moldura: {
      alignSelf: "center",
      width: "78%",
      maxWidth: 280,
      padding: 6,
      borderRadius: 26,
      backgroundColor: p.borda,
      borderWidth: 1,
      borderColor: p.borda,
    },
    tela: { borderRadius: 20, overflow: "hidden", backgroundColor: p.fundo },
    cabecalho: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 14,
      paddingVertical: 12,
      backgroundColor: p.superficie,
    },
    avatar: { width: 20, height: 20, borderRadius: 10, backgroundColor: p.primaria },
    conteudo: { padding: 12, gap: 10 },
    card: { gap: 7, padding: 12, borderRadius: 12, backgroundColor: p.superficie, borderWidth: 1, borderColor: p.borda },
    selos: { flexDirection: "row", gap: 6, marginTop: 3 },
    selo: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
    botao: { alignSelf: "flex-start", paddingHorizontal: 18, paddingVertical: 9, borderRadius: 10, backgroundColor: p.primaria },
    linha: { borderRadius: 4 },
    abas: {
      flexDirection: "row",
      justifyContent: "space-around",
      paddingVertical: 9,
      marginTop: 6,
      backgroundColor: p.superficie,
      borderTopWidth: 1,
      borderTopColor: p.borda,
    },
    aba: { alignItems: "center", gap: 4 },
    abaIcone: { width: 14, height: 14, borderRadius: 4 },
  });

/** Modal separado para troca de senha. */
function TrocarSenhaModal({ visivel, onFechar }: { visivel: boolean; onFechar: () => void }) {
  const cores = useCores();
  const styles = useEstilos(criarStyles);
  const { confirmarTrocaDeSenha } = useAuth();
  const [atual, setAtual] = useState("");
  const [nova, setNova] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState(false);
  const [salvando, setSalvando] = useState(false);

  function fechar() {
    setAtual("");
    setNova("");
    setConfirmacao("");
    setErro(null);
    setSucesso(false);
    onFechar();
  }

  async function salvar() {
    setErro(null);
    setSucesso(false);
    if (nova !== confirmacao) return setErro("A confirmação não confere com a nova senha");
    setSalvando(true);
    try {
      const { token, usuario: sessao } = await enviar<{ token: string; usuario: Usuario }>("PATCH", "/auth/senha", { senhaAtual: atual, novaSenha: nova });
      await confirmarTrocaDeSenha(token, sessao);
      setSucesso(true);
      setAtual("");
      setNova("");
      setConfirmacao("");
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <ModalFormulario visivel={visivel} titulo="Trocar senha" onFechar={fechar}>
      <Campo rotulo="Senha atual" value={atual} onChangeText={setAtual} senha />
      <Campo rotulo="Nova senha" value={nova} onChangeText={setNova} senha placeholder="Mínimo de 6 caracteres" />
      <Campo rotulo="Confirmar nova senha" value={confirmacao} onChangeText={setConfirmacao} senha />
      <MensagemErro texto={erro} />
      {sucesso && (
        <View style={styles.sucesso}>
          <Ionicons name="checkmark-circle" size={18} color={cores.sucesso} />
          <Text style={{ color: cores.sucesso }}>Senha alterada com sucesso</Text>
        </View>
      )}
      <Botao titulo="Salvar nova senha" onPress={salvar} carregando={salvando} desabilitado={!atual || nova.length < 6 || !confirmacao} />
    </ModalFormulario>
  );
}

/** Modal para troca de e-mail em duas etapas: (1) novo e-mail + senha → (2) código recebido. */
function TrocarEmailModal({ visivel, onFechar }: { visivel: boolean; onFechar: () => void }) {
  const cores = useCores();
  const styles = useEstilos(criarStyles);
  const estilosTexto = useEstilosTexto();
  const [etapa, setEtapa] = useState<1 | 2>(1);
  const [novoEmail, setNovoEmail] = useState("");
  const [senhaAtual, setSenhaAtual] = useState("");
  const [codigo, setCodigo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState(false);
  const [salvando, setSalvando] = useState(false);

  function fechar() {
    setEtapa(1);
    setNovoEmail("");
    setSenhaAtual("");
    setCodigo("");
    setErro(null);
    setSucesso(false);
    onFechar();
  }

  async function enviarCodigo() {
    setErro(null);
    setSalvando(true);
    try {
      await enviar("POST", "/auth/trocar-email", { novoEmail, senhaAtual });
      setEtapa(2);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  async function confirmar() {
    setErro(null);
    setSalvando(true);
    try {
      await enviar("POST", "/auth/confirmar-email", { codigo });
      setSucesso(true);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <ModalFormulario visivel={visivel} titulo="Trocar e-mail" onFechar={fechar}>
      {etapa === 1 ? (
        <>
          <Campo rotulo="Novo e-mail" value={novoEmail} onChangeText={setNovoEmail} keyboardType="email-address" autoCapitalize="none" placeholder="seuemail@exemplo.com" />
          <Campo rotulo="Senha atual" value={senhaAtual} onChangeText={setSenhaAtual} senha />
          <MensagemErro texto={erro} />
          <Botao
            titulo="Enviar código de confirmação"
            onPress={enviarCodigo}
            carregando={salvando}
            desabilitado={!novoEmail || !senhaAtual}
          />
        </>
      ) : sucesso ? (
        <>
          <View style={styles.sucesso}>
            <Ionicons name="checkmark-circle" size={18} color={cores.sucesso} />
            <Text style={{ color: cores.sucesso }}>E-mail alterado com sucesso!</Text>
          </View>
          <Botao titulo="Fechar" onPress={fechar} />
        </>
      ) : (
        <>
          <Text style={[estilosTexto.secundario, { marginBottom: 8 }]}>
            Enviamos um código de 6 dígitos para{" "}
            <Text style={{ color: cores.texto, fontWeight: "600" }}>{novoEmail}</Text>. Digite-o abaixo para confirmar.
          </Text>
          <Campo
            rotulo="Código de confirmação"
            value={codigo}
            onChangeText={setCodigo}
            keyboardType="number-pad"
            placeholder="000000"
          />
          <MensagemErro texto={erro} />
          <Botao titulo="Confirmar e-mail" onPress={confirmar} carregando={salvando} desabilitado={codigo.length !== 6} />
          <Pressable onPress={() => { setEtapa(1); setErro(null); setCodigo(""); }} style={{ alignItems: "center", paddingVertical: 8 }}>
            <Text style={[estilosTexto.secundario, { textDecorationLine: "underline" }]}>Usar outro e-mail</Text>
          </Pressable>
        </>
      )}
    </ModalFormulario>
  );
}

const criarStyles = (cores: Paleta) =>
  StyleSheet.create({
    perfil: { alignItems: "center", gap: 4, paddingVertical: 8 },
    perfilCarregando: { alignItems: "center", paddingVertical: 32 },
    carregandoFoto: {
      ...StyleSheet.absoluteFill,
      borderRadius: 48,
      backgroundColor: "rgba(15, 27, 45, 0.45)",
      alignItems: "center",
      justifyContent: "center",
    },
    seloCamera: {
      position: "absolute",
      right: 0,
      bottom: 0,
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: cores.primaria,
      borderWidth: 2,
      borderColor: cores.superficie,
      alignItems: "center",
      justifyContent: "center",
    },
    planoLinha: { flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" },
    linkSenha: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      backgroundColor: cores.superficie,
      borderRadius: 12,
      padding: 16,
      borderWidth: 1,
      borderColor: cores.borda,
    },
    linkSenhaTexto: { fontSize: 15, fontWeight: "500", color: cores.primaria },
    separador: { height: 1, backgroundColor: cores.borda, marginVertical: 4 },
    aparenciaDescricao: { flexDirection: "row", gap: 8, alignItems: "flex-start", marginTop: 4 },
    sucesso: { flexDirection: "row", alignItems: "center", gap: 6 },
  });

const criarStylesSheet = (cores: Paleta) =>
  StyleSheet.create({
    fundo: {
      ...StyleSheet.absoluteFill,
      backgroundColor: "rgba(0,0,0,0.45)",
      justifyContent: "flex-end",
      zIndex: 100,
    },
    sheet: {
      backgroundColor: cores.superficie,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingHorizontal: 16,
      paddingBottom: 32,
      paddingTop: 12,
    },
    alca: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: cores.borda,
      alignSelf: "center",
      marginBottom: 16,
    },
    titulo: {
      fontSize: 13,
      fontWeight: "600",
      color: cores.textoSecundario,
      textTransform: "uppercase",
      letterSpacing: 0.5,
      marginBottom: 8,
      paddingHorizontal: 4,
    },
    opcao: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      paddingVertical: 14,
      paddingHorizontal: 4,
      borderRadius: 10,
    },
    opcaoIcone: {
      width: 38,
      height: 38,
      borderRadius: 10,
      backgroundColor: cores.primariaClara,
      alignItems: "center",
      justifyContent: "center",
    },
    opcaoTexto: { fontSize: 16, fontWeight: "500" },
    separador: { height: 1, backgroundColor: cores.borda, marginVertical: 4 },
    cancelar: {
      marginTop: 8,
      paddingVertical: 14,
      alignItems: "center",
      borderRadius: 12,
      backgroundColor: cores.fundo,
    },
    cancelarTexto: { fontSize: 16, fontWeight: "600", color: cores.textoSecundario },
  });
