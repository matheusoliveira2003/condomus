import { useEffect, useMemo, useState } from "react";
import { api } from "./api";
import { BotaoConfirmar, Cartao, Campo, Mensagem, Selecao, Tabela } from "./componentes";
import { rotuloPapel, unidadeTexto, type Papel, type Unidade, type Usuario } from "./tipos";

/** Moradores, porteiros e síndicos do condomínio: criar, editar nome e unidade, reenviar senha e desativar. */
export function Usuarios({ condominioId }: { condominioId: string }) {
  const base = `/painel/condominios/${condominioId}`;
  const [lista, setLista] = useState<Usuario[] | null>(null);
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [filtro, setFiltro] = useState<Papel | "TODOS">("TODOS");
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [senhaGerada, setSenhaGerada] = useState<{ nome: string; senha: string } | null>(null);
  const [recarregar, setRecarregar] = useState(0);

  useEffect(() => {
    api<Usuario[]>(`${base}/usuarios`).then(setLista).catch((e: Error) => setErro(e.message));
    api<Unidade[]>(`${base}/unidades`).then(setUnidades).catch(() => {});
  }, [base, recarregar]);

  const visiveis = useMemo(() => (lista ?? []).filter((u) => filtro === "TODOS" || u.papel === filtro), [lista, filtro]);

  async function acao(fn: () => Promise<unknown>, sucesso: string) {
    setErro(null);
    setAviso(null);
    try {
      await fn();
      setAviso(sucesso);
      setRecarregar((n) => n + 1);
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  return (
    <>
      <NovoUsuario
        unidades={unidades}
        onCriar={async (dados) => {
          setErro(null);
          setAviso(null);
          try {
            const r = await api<{ nome: string; senhaGerada: string }>(`${base}/usuarios`, { metodo: "POST", corpo: dados });
            setSenhaGerada({ nome: r.nome, senha: r.senhaGerada });
            setRecarregar((n) => n + 1);
          } catch (e) {
            setErro((e as Error).message);
          }
        }}
      />
      <Mensagem tipo="erro" texto={erro} />
      <Mensagem tipo="sucesso" texto={aviso} />
      {senhaGerada && (
        <div className="aviso">
          {senhaGerada.nome} recebeu um e-mail com a senha temporária. Se não chegar, esta é a senha (copie agora; ela não aparece de novo):{" "}
          <span className="senha-gerada">{senhaGerada.senha}</span>{" "}
          <button className="botao pequeno secundario" onClick={() => setSenhaGerada(null)}>Ok</button>
        </div>
      )}
      <Cartao
        titulo={`Usuários${lista ? ` (${visiveis.length})` : ""}`}
        acao={
          <div className="abas">
            {(["TODOS", "MORADOR", "PORTEIRO", "SINDICO"] as const).map((p) => (
              <button key={p} className={filtro === p ? "ativa" : ""} onClick={() => setFiltro(p)}>
                {p === "TODOS" ? "Todos" : rotuloPapel[p]}
              </button>
            ))}
          </div>
        }
      >
        {lista === null && !erro && <p className="secundario">Carregando…</p>}
        {lista && (
          <Tabela
            linhas={visiveis}
            vazio="Nenhum usuário."
            busca={(u) => `${u.nome} ${u.email}`}
            inativa={(u) => !u.ativo}
            colunas={[
              { rotulo: "Nome", principal: true, ordem: (u) => u.nome, celula: (u) => <>{u.nome}<span className="secundario sub">{u.email}</span></> },
              { rotulo: "Papel", ordem: (u) => rotuloPapel[u.papel], celula: (u) => rotuloPapel[u.papel] },
              { rotulo: "Unidade", ordem: (u) => (u.papel === "MORADOR" ? unidadeTexto(u.unidade) : ""), celula: (u) => (u.papel === "MORADOR" ? unidadeTexto(u.unidade) : "—") },
              {
                rotulo: "Situação",
                celula: (u) => (!u.ativo ? <span className="selo">Desativado</span> : u.senhaTemporaria ? <span className="selo alerta">Aguardando acesso</span> : <span className="selo sucesso">Ativo</span>),
              },
            ]}
            acoes={(u) => (
              <AcoesUsuario
                usuario={u}
                unidades={unidades}
                onSalvar={(dados) => acao(() => api(`${base}/usuarios/${u.id}`, { metodo: "PATCH", corpo: dados }), "Usuário alterado.")}
                onReenviar={() => acao(() => api(`${base}/usuarios/${u.id}/reenviar-senha`, { metodo: "POST" }), `Nova senha enviada para ${u.email}.`)}
                onAtivo={(ativo) => acao(() => api(`${base}/usuarios/${u.id}/ativo`, { metodo: "PATCH", corpo: { ativo } }), ativo ? "Conta reativada." : "Conta desativada.")}
              />
            )}
          />
        )}
      </Cartao>
    </>
  );
}

function NovoUsuario({ unidades, onCriar }: { unidades: Unidade[]; onCriar: (dados: object) => Promise<void> }) {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [papel, setPapel] = useState<Papel>("MORADOR");
  const [unidadeId, setUnidadeId] = useState("");
  const precisaUnidade = papel === "MORADOR";
  return (
    <Cartao titulo="Novo usuário">
      <form
        className="grade"
        onSubmit={async (e) => {
          e.preventDefault();
          await onCriar({ nome, email, papel, ...(precisaUnidade && { unidadeId }) });
          setNome("");
          setEmail("");
        }}
      >
        <Campo rotulo="Nome" value={nome} onChange={(e) => setNome(e.target.value)} required />
        <Campo rotulo="E-mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <Selecao
          rotulo="Papel"
          valor={papel}
          onChange={(v) => setPapel(v as Papel)}
          opcoes={(Object.keys(rotuloPapel) as Papel[]).map((p) => ({ valor: p, rotulo: rotuloPapel[p] }))}
        />
        {precisaUnidade && (
          <Selecao
            rotulo="Unidade"
            valor={unidadeId}
            onChange={setUnidadeId}
            opcoes={[{ valor: "", rotulo: "Escolha a unidade" }, ...unidades.map((u) => ({ valor: u.id, rotulo: unidadeTexto(u) }))]}
          />
        )}
        <div className="campo fim">
          <button className="botao" disabled={!nome || !email || (precisaUnidade && !unidadeId)}>Criar</button>
        </div>
      </form>
    </Cartao>
  );
}

/** Ações de um usuário. Editar troca os botões por campos, no lugar, na própria linha da tabela. */
function AcoesUsuario({
  usuario: u,
  unidades,
  onSalvar,
  onReenviar,
  onAtivo,
}: {
  usuario: Usuario;
  unidades: Unidade[];
  onSalvar: (dados: object) => Promise<void>;
  onReenviar: () => Promise<void>;
  onAtivo: (ativo: boolean) => Promise<void>;
}) {
  const [editando, setEditando] = useState(false);
  const [nome, setNome] = useState(u.nome);
  const [unidadeId, setUnidadeId] = useState(u.unidade?.id ?? "");
  if (editando) {
    return (
      <>
        <input value={nome} onChange={(e) => setNome(e.target.value)} aria-label="Nome" />
        {u.papel === "MORADOR" && (
          <select value={unidadeId} onChange={(e) => setUnidadeId(e.target.value)} aria-label="Unidade">
            {unidades.map((un) => <option key={un.id} value={un.id}>{unidadeTexto(un)}</option>)}
          </select>
        )}
        <button
          className="botao pequeno"
          disabled={nome.trim().length < 2}
          onClick={async () => {
            await onSalvar({
              ...(nome !== u.nome && { nome }),
              ...(u.papel === "MORADOR" && unidadeId !== u.unidade?.id && { unidadeId }),
            });
            setEditando(false);
          }}
        >
          Salvar
        </button>
        <button className="botao pequeno secundario" onClick={() => setEditando(false)}>Cancelar</button>
      </>
    );
  }
  return (
    <>
      {u.ativo && u.senhaTemporaria && <button className="botao pequeno secundario" onClick={() => void onReenviar()}>Reenviar senha</button>}
      <button className="botao pequeno secundario" onClick={() => setEditando(true)}>Editar</button>
      {u.ativo ? (
        <BotaoConfirmar titulo="Desativar" pergunta={`${u.nome} perde o acesso. Confirma?`} perigo onConfirmar={() => onAtivo(false)} />
      ) : (
        <button className="botao pequeno secundario" onClick={() => void onAtivo(true)}>Reativar</button>
      )}
    </>
  );
}
