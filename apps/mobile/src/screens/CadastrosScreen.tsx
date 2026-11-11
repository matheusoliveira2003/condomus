import { useEffect, useState, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, enviar, type Papel, type UnidadeComMoradores, type UsuarioCadastro } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { adaptarQuery } from "../hooks/queries";
import { BotaoFlutuante, Botao, Campo, Card, Chips, Lista, MensagemErro, ModalFormulario, Selo, useEstilosTexto } from "../ui/componentes";
import { emailValido, unidadeTexto } from "../ui/formatar";
import { useMensagens } from "../ui/mensagens";
import { useCores, useEstilos, type Paleta } from "../ui/tema";
import { SeletorUnidade } from "../ui/SeletorUnidade";
import { Avatar } from "../ui/Avatar";

type Aba = "moradores" | "funcionarios" | "unidades";

const abas: { valor: Aba; rotulo: string }[] = [
  { valor: "moradores", rotulo: "Moradores" },
  { valor: "funcionarios", rotulo: "Funcionários" },
  { valor: "unidades", rotulo: "Unidades" },
];

const rotuloPapel: Record<Papel, string> = { MORADOR: "Morador", PORTEIRO: "Porteiro", SINDICO: "Síndico" };

export function CadastrosScreen() {
  const [aba, setAba] = useState<Aba>("moradores");
  const [criando, setCriando] = useState(false);
  const qc = useQueryClient();
  const fechar = () => {
    setCriando(false);
    void qc.invalidateQueries({ queryKey: ["cadastros"] });
  };
  const seletor = (
    <View style={{ marginBottom: 4 }}>
      <Chips opcoes={abas} valor={aba} onChange={setAba} />
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      {aba === "unidades" ? (
        <ListaUnidades cabecalho={seletor} />
      ) : (
        <ListaUsuarios aba={aba} cabecalho={seletor} />
      )}
      <BotaoFlutuante onPress={() => setCriando(true)} />
      {aba === "unidades" ? (
        <NovaUnidadeModal visivel={criando} onFechar={fechar} />
      ) : (
        <NovoUsuarioModal visivel={criando} morador={aba === "moradores"} onFechar={fechar} />
      )}
    </View>
  );
}

function ListaUsuarios({ aba, cabecalho }: { aba: Exclude<Aba, "unidades">; cabecalho: ReactNode }) {
  const estilosTexto = useEstilosTexto();
  const { usuario: eu } = useAuth();
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["cadastros", "usuarios"],
    queryFn: () => api<UsuarioCadastro[]>("/usuarios"),
  });
  const todos = query.data ?? [];
  const dados = todos.filter((u) => (aba === "moradores" ? u.papel === "MORADOR" : u.papel !== "MORADOR"));
  const { carregando, recarregando, erro, recarregar } = adaptarQuery(query);
  const mensagens = useMensagens();

  function alternarAtivo(u: UsuarioCadastro) {
    const acao = u.ativo ? "Desativar" : "Reativar";
    mensagens.confirmar({
      titulo: `${acao} conta`,
      texto: u.ativo ? `${u.nome} perderá o acesso ao app imediatamente.` : `${u.nome} voltará a ter acesso ao app.`,
      confirmar: acao,
      perigo: u.ativo,
      aoConfirmar: () =>
        enviar("PATCH", `/usuarios/${u.id}/ativo`, { ativo: !u.ativo })
          .then(() => {
            qc.invalidateQueries({ queryKey: ["cadastros"] });
            mensagens.sucesso(u.ativo ? "Conta desativada." : "Conta reativada.");
          })
          .catch((e: Error) => mensagens.erro(e.message)),
    });
  }

  function reenviarSenha(u: UsuarioCadastro) {
    mensagens.confirmar({
      titulo: "Reenviar senha",
      texto: `Uma nova senha temporária será gerada e enviada para ${u.email}. A senha anterior deixará de funcionar.`,
      confirmar: "Reenviar",
      aoConfirmar: () =>
        enviar("POST", `/usuarios/${u.id}/reenviar-senha`)
          .then(() => mensagens.sucesso(`Nova senha enviada para ${u.email}.`))
          .catch((e: Error) => mensagens.erro(e.message)),
    });
  }

  return (
    <Lista
      dados={dados}
      carregando={carregando}
        recarregando={recarregando}
      erro={erro}
      recarregar={recarregar}
      cabecalho={cabecalho}
      vazio={aba === "moradores" ? "Nenhum morador cadastrado" : "Nenhum funcionário cadastrado"}
      renderItem={(u) => (
        <Card>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
            <View style={!u.ativo && { opacity: 0.5 }}>
              <Avatar pessoa={u} tamanho={40} />
            </View>
            <Text style={[estilosTexto.titulo, { flex: 1 }, !u.ativo && { opacity: 0.5 }]}>{u.nome}</Text>
            {!u.ativo ? (
              <Selo texto="Desativado" />
            ) : u.senhaTemporaria ? (
              <Selo texto="Aguardando acesso" tom="alerta" />
            ) : (
              <Selo texto={rotuloPapel[u.papel]} tom="primario" />
            )}
          </View>
          <Text style={estilosTexto.secundario}>{u.email}</Text>
          {u.unidade && <Text style={estilosTexto.corpo}>{unidadeTexto(u.unidade)}</Text>}
          {u.id !== eu?.id && (
            <View style={{ gap: 8 }}>
              {u.ativo && u.senhaTemporaria && (
                <Botao titulo="Reenviar senha por e-mail" variante="secundario" pequeno onPress={() => reenviarSenha(u)} />
              )}
              <Botao titulo={u.ativo ? "Desativar" : "Reativar"} variante="secundario" pequeno onPress={() => alternarAtivo(u)} />
            </View>
          )}
        </Card>
      )}
    />
  );
}

/** Gera o código de convite da unidade (vale 7 dias) para o síndico repassar ao morador. */
function gerarConvite(mensagens: ReturnType<typeof useMensagens>, u: UnidadeComMoradores) {
  enviar<{ codigo: string; expiraEm: string }>("POST", `/unidades/${u.id}/convite`)
    .then(({ codigo, expiraEm }) =>
      mensagens.informar(
        `Convite · ${unidadeTexto(u)}`,
        `Código: ${codigo}\n\nVálido até ${new Date(expiraEm).toLocaleDateString("pt-BR")}. Envie ao morador: ele usa em "Criar conta". Gerar outro código invalida este.`,
      ),
    )
    .catch((e: Error) => mensagens.erro(e.message));
}

function ListaUnidades({ cabecalho }: { cabecalho: ReactNode }) {
  const estilosTexto = useEstilosTexto();
  const query = useQuery({
    queryKey: ["cadastros", "unidades"],
    queryFn: () => api<UnidadeComMoradores[]>("/unidades"),
  });
  const { dados, carregando, recarregando, erro, recarregar } = adaptarQuery(query);
  const mensagens = useMensagens();
  const qc = useQueryClient();
  const [editando, setEditando] = useState<UnidadeComMoradores | null>(null);

  function excluir(u: UnidadeComMoradores) {
    mensagens.confirmar({
      titulo: "Excluir unidade",
      texto: `Excluir a unidade ${unidadeTexto(u)}? Só é possível se ela não tiver moradores nem histórico.`,
      confirmar: "Excluir",
      perigo: true,
      aoConfirmar: () => {
        enviar("DELETE", `/unidades/${u.id}`)
          .then(() => {
            void qc.invalidateQueries({ queryKey: ["cadastros"] });
            mensagens.sucesso("Unidade excluída");
          })
          .catch((e: Error) => mensagens.erro(e.message));
      },
    });
  }

  return (
    <>
    <Lista
      dados={dados}
      carregando={carregando}
      recarregando={recarregando}
      erro={erro}
      recarregar={recarregar}
      cabecalho={cabecalho}
      vazio="Nenhuma unidade cadastrada"
      renderItem={(u) => (
        <Card>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={estilosTexto.titulo}>{unidadeTexto(u)}</Text>
            <Text style={estilosTexto.secundario}>
              {u._count.moradores} {u._count.moradores === 1 ? "morador" : "moradores"}
            </Text>
          </View>
          <Botao titulo="Gerar convite" variante="secundario" pequeno onPress={() => gerarConvite(mensagens, u)} />
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Botao titulo="Editar" variante="secundario" pequeno onPress={() => setEditando(u)} />
            </View>
            <View style={{ flex: 1 }}>
              <Botao titulo="Excluir" variante="perigo" pequeno onPress={() => excluir(u)} />
            </View>
          </View>
        </Card>
      )}
    />
    <EditarUnidadeModal
      unidade={editando}
      onFechar={() => {
        setEditando(null);
        void qc.invalidateQueries({ queryKey: ["cadastros"] });
      }}
    />
    </>
  );
}

function EditarUnidadeModal({ unidade, onFechar }: { unidade: UnidadeComMoradores | null; onFechar: () => void }) {
  const [bloco, setBloco] = useState("");
  const [numero, setNumero] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (unidade) {
      setBloco(unidade.bloco ?? "");
      setNumero(unidade.numero);
      setErro(null);
    }
  }, [unidade]);

  async function salvar() {
    if (!unidade) return;
    setSalvando(true);
    setErro(null);
    try {
      await enviar("PATCH", `/unidades/${unidade.id}`, { bloco, numero });
      onFechar();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <ModalFormulario visivel={!!unidade} titulo="Editar unidade" onFechar={onFechar}>
      <Campo rotulo="Bloco" value={bloco} onChangeText={setBloco} autoCapitalize="characters" placeholder="Ex.: A" />
      <Campo rotulo="Número" value={numero} onChangeText={setNumero} keyboardType="number-pad" placeholder="Ex.: 101" />
      <MensagemErro texto={erro} />
      <Botao titulo="Salvar" onPress={salvar} carregando={salvando} desabilitado={!bloco.trim() || !numero.trim()} />
    </ModalFormulario>
  );
}

type ModoUnidade = "uma" | "lote";

const modosUnidade: { valor: ModoUnidade; rotulo: string }[] = [
  { valor: "uma", rotulo: "Uma unidade" },
  { valor: "lote", rotulo: "Em lote" },
];

function NovaUnidadeModal({ visivel, onFechar }: { visivel: boolean; onFechar: () => void }) {
  const mensagens = useMensagens();
  const estilosTexto = useEstilosTexto();
  const [modo, setModo] = useState<ModoUnidade>("uma");
  const [bloco, setBloco] = useState("");
  const [numero, setNumero] = useState("");
  const [blocos, setBlocos] = useState("");
  const [andarInicial, setAndarInicial] = useState("1");
  const [andarFinal, setAndarFinal] = useState("");
  const [porAndar, setPorAndar] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const listaBlocos = blocos
    .split(/[,\s]+/)
    .map((b) => b.trim())
    .filter(Boolean);
  const inicial = Number(andarInicial);
  const final = Number(andarFinal);
  const apartamentos = Number(porAndar);
  const loteValido =
    listaBlocos.length > 0 &&
    andarInicial !== "" &&
    andarFinal !== "" &&
    porAndar !== "" &&
    [inicial, final, apartamentos].every(Number.isInteger) &&
    final >= inicial &&
    apartamentos >= 1;
  const total = loteValido ? listaBlocos.length * (final - inicial + 1) * apartamentos : 0;

  function limpar() {
    setBloco("");
    setNumero("");
    setBlocos("");
    setAndarInicial("1");
    setAndarFinal("");
    setPorAndar("");
    setErro(null);
  }

  async function salvar() {
    setSalvando(true);
    setErro(null);
    try {
      if (modo === "uma") {
        await enviar("POST", "/unidades", { bloco, numero });
      } else {
        const { criadas, ignoradas } = await enviar<{ criadas: number; ignoradas: number }>("POST", "/unidades/lote", {
          blocos: listaBlocos,
          andarInicial: inicial,
          andarFinal: final,
          porAndar: apartamentos,
        });
        mensagens.sucesso(
          ignoradas > 0
            ? `${criadas} unidades criadas; ${ignoradas} já existiam`
            : `${criadas} ${criadas === 1 ? "unidade criada" : "unidades criadas"}`,
        );
      }
      limpar();
      onFechar();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <ModalFormulario visivel={visivel} titulo="Nova unidade" onFechar={onFechar}>
      <Chips opcoes={modosUnidade} valor={modo} onChange={setModo} />
      {modo === "uma" ? (
        <>
          <Campo rotulo="Bloco" value={bloco} onChangeText={setBloco} autoCapitalize="characters" placeholder="Ex.: A" />
          <Campo rotulo="Número" value={numero} onChangeText={setNumero} keyboardType="number-pad" placeholder="Ex.: 101" />
          <MensagemErro texto={erro} />
          <Botao titulo="Cadastrar unidade" onPress={salvar} carregando={salvando} desabilitado={!bloco.trim() || !numero.trim()} />
        </>
      ) : (
        <>
          <Campo rotulo="Blocos" value={blocos} onChangeText={setBlocos} autoCapitalize="characters" placeholder="Ex.: A, B, C" />
          <Campo rotulo="Andar inicial" value={andarInicial} onChangeText={setAndarInicial} keyboardType="number-pad" placeholder="Ex.: 1" />
          <Campo rotulo="Andar final" value={andarFinal} onChangeText={setAndarFinal} keyboardType="number-pad" placeholder="Ex.: 8" />
          <Campo rotulo="Apartamentos por andar" value={porAndar} onChangeText={setPorAndar} keyboardType="number-pad" placeholder="Ex.: 4" />
          {loteValido && (
            <Text style={estilosTexto.secundario}>
              Serão {total} unidades, numeradas {inicial * 100 + 1} a {final * 100 + apartamentos} em cada bloco. As que já existem são ignoradas.
            </Text>
          )}
          <MensagemErro texto={erro} />
          <Botao titulo="Cadastrar em lote" onPress={salvar} carregando={salvando} desabilitado={!loteValido} />
        </>
      )}
    </ModalFormulario>
  );
}

function NovoUsuarioModal({ visivel, morador, onFechar }: { visivel: boolean; morador: boolean; onFechar: () => void }) {
  const cores = useCores();
  const senhaBox = useEstilos(criarSenhaBox);
  const estilosTexto = useEstilosTexto();
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [papel, setPapel] = useState<"PORTEIRO" | "SINDICO">("PORTEIRO");
  const [unidadeId, setUnidadeId] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [senhaGerada, setSenhaGerada] = useState<string | null>(null);
  const qc = useQueryClient();

  async function salvar() {
    setSalvando(true);
    setErro(null);
    try {
      const res = await enviar<{ senhaGerada: string }>("POST", "/usuarios", {
        nome,
        email,
        papel: morador ? "MORADOR" : papel,
        unidadeId: morador ? unidadeId : undefined,
      });
      qc.invalidateQueries({ queryKey: ["usuarios"] });
      setSenhaGerada(res.senhaGerada);
      setNome("");
      setEmail("");
      setUnidadeId(null);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  function fechar() {
    setSenhaGerada(null);
    onFechar();
  }

  const valido = nome.trim().length >= 2 && emailValido(email) && (!morador || !!unidadeId);

  // Após cadastrar: exibe a senha gerada para o síndico anotar.
  if (senhaGerada) {
    return (
      <ModalFormulario visivel={visivel} titulo="Cadastro concluído" onFechar={fechar}>
        <View style={{ alignItems: "center", gap: 12, paddingVertical: 8 }}>
          <Ionicons name="checkmark-circle" size={48} color={cores.sucesso} />
          <Text style={estilosTexto.titulo}>Usuário criado!</Text>
          <Text style={[estilosTexto.secundario, { textAlign: "center" }]}>
            Um e-mail com a senha temporária foi enviado para o usuário. Ela também está disponível abaixo caso precise repassar manualmente.
          </Text>
        </View>
        <View style={senhaBox.container}>
          <Text style={senhaBox.rotulo}>Senha temporária</Text>
          <Text style={senhaBox.senha} selectable>{senhaGerada}</Text>
        </View>
        <Botao titulo="Fechar" onPress={fechar} />
      </ModalFormulario>
    );
  }

  return (
    <ModalFormulario visivel={visivel} titulo={morador ? "Novo morador" : "Novo funcionário"} onFechar={fechar}>
      {morador ? (
        <SeletorUnidade valor={unidadeId} onChange={setUnidadeId} />
      ) : (
        <View style={{ gap: 8 }}>
          <Text style={estilosTexto.titulo}>Função</Text>
          <Chips
            opcoes={[
              { valor: "PORTEIRO" as const, rotulo: "Porteiro" },
              { valor: "SINDICO" as const, rotulo: "Síndico" },
            ]}
            valor={papel}
            onChange={setPapel}
          />
        </View>
      )}
      <Campo rotulo="Nome" value={nome} onChangeText={setNome} placeholder="Nome completo" />
      <Campo rotulo="E-mail" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
      <MensagemErro texto={erro} />
      <Botao titulo="Cadastrar" onPress={salvar} carregando={salvando} desabilitado={!valido} />
    </ModalFormulario>
  );
}

const criarSenhaBox = (cores: Paleta) =>
  StyleSheet.create({
    container: {
      backgroundColor: cores.fundo,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: cores.borda,
      padding: 16,
      alignItems: "center",
      gap: 6,
    },
    rotulo: { fontSize: 12, fontWeight: "600", color: cores.textoSecundario, textTransform: "uppercase", letterSpacing: 0.5 },
    senha: { fontSize: 22, fontWeight: "800", color: cores.texto, letterSpacing: 2 },
  });
