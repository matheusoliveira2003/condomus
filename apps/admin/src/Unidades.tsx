import { useEffect, useState } from "react";
import { api } from "./api";
import { BotaoConfirmar, Cartao, Campo, Mensagem, Tabela } from "./componentes";
import { unidadeTexto, type Unidade } from "./tipos";

/** Unidades do condomínio: criar uma, criar em lote, editar, gerar convite e excluir. */
export function Unidades({ condominioId }: { condominioId: string }) {
  const base = `/painel/condominios/${condominioId}/unidades`;
  const [lista, setLista] = useState<Unidade[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [recarregar, setRecarregar] = useState(0);
  const [bloco, setBloco] = useState("");
  const [numero, setNumero] = useState("");
  const [lote, setLote] = useState({ blocos: "", andarInicial: "1", andarFinal: "1", porAndar: "4" });
  const [convite, setConvite] = useState<{ unidade: string; codigo: string; expiraEm: string } | null>(null);

  useEffect(() => {
    api<Unidade[]>(base).then(setLista).catch((e: Error) => setErro(e.message));
  }, [base, recarregar]);

  const atualizar = () => setRecarregar((n) => n + 1);
  async function acao(fn: () => Promise<unknown>, sucesso?: string) {
    setErro(null);
    setAviso(null);
    try {
      await fn();
      if (sucesso) setAviso(sucesso);
      atualizar();
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  return (
    <>
      <Cartao titulo="Nova unidade">
        <form
          className="grade"
          onSubmit={(e) => {
            e.preventDefault();
            void acao(async () => {
              await api(base, { metodo: "POST", corpo: { bloco, numero } });
              setBloco("");
              setNumero("");
            }, "Unidade criada.");
          }}
        >
          <Campo rotulo="Bloco" value={bloco} onChange={(e) => setBloco(e.target.value)} required />
          <Campo rotulo="Número" value={numero} onChange={(e) => setNumero(e.target.value)} required />
          <div className="campo fim"><button className="botao" disabled={!bloco || !numero}>Criar</button></div>
        </form>
      </Cartao>

      <Cartao titulo="Criar em lote">
        <p className="secundario">Cada bloco recebe todos os andares; o número é andar × 100 + posição (101, 102, 201…). As que já existem são ignoradas.</p>
        <form
          className="grade"
          onSubmit={(e) => {
            e.preventDefault();
            const blocos = lote.blocos.split(",").map((b) => b.trim()).filter(Boolean);
            void acao(async () => {
              const r = await api<{ criadas: number; ignoradas: number }>(`${base}/lote`, {
                metodo: "POST",
                corpo: { blocos, andarInicial: Number(lote.andarInicial), andarFinal: Number(lote.andarFinal), porAndar: Number(lote.porAndar) },
              });
              setAviso(`${r.criadas} criadas, ${r.ignoradas} já existiam.`);
            });
          }}
        >
          <Campo rotulo="Blocos (separados por vírgula)" value={lote.blocos} onChange={(e) => setLote({ ...lote, blocos: e.target.value })} placeholder="A, B" required />
          <Campo rotulo="Andar inicial" type="number" min={0} value={lote.andarInicial} onChange={(e) => setLote({ ...lote, andarInicial: e.target.value })} />
          <Campo rotulo="Andar final" type="number" min={0} value={lote.andarFinal} onChange={(e) => setLote({ ...lote, andarFinal: e.target.value })} />
          <Campo rotulo="Apartamentos por andar" type="number" min={1} value={lote.porAndar} onChange={(e) => setLote({ ...lote, porAndar: e.target.value })} />
          <div className="campo fim"><button className="botao" disabled={!lote.blocos.trim()}>Criar lote</button></div>
        </form>
      </Cartao>

      <Mensagem tipo="erro" texto={erro} />
      <Mensagem tipo="sucesso" texto={aviso} />
      {convite && (
        <div className="aviso">
          Convite de {convite.unidade}: <strong className="senha-gerada">{convite.codigo}</strong> · vale até{" "}
          {new Date(convite.expiraEm).toLocaleDateString("pt-BR")}. O morador usa em "Criar conta" no app.
        </div>
      )}

      <Cartao titulo={`Unidades${lista ? ` (${lista.length})` : ""}`}>
        {lista === null && !erro && <p className="secundario">Carregando…</p>}
        {lista && (
          <Tabela
            linhas={lista}
            vazio="Nenhuma unidade cadastrada."
            busca={(u) => `${u.bloco} ${u.numero}`}
            colunas={[
              { rotulo: "Unidade", principal: true, ordem: (u) => `${u.bloco} ${u.numero}`, celula: (u) => unidadeTexto(u) },
              { rotulo: "Moradores ativos", ordem: (u) => u._count?.moradores ?? 0, celula: (u) => u._count?.moradores ?? 0 },
            ]}
            acoes={(u) => (
              <AcoesUnidade
                unidade={u}
                onSalvar={(dados) => acao(() => api(`${base}/${u.id}`, { metodo: "PATCH", corpo: dados }), "Unidade alterada.")}
                onConvite={() =>
                  acao(async () => {
                    const r = await api<{ codigo: string; expiraEm: string }>(`${base}/${u.id}/convite`, { metodo: "POST" });
                    setConvite({ unidade: unidadeTexto(u), ...r });
                  })
                }
                onExcluir={() => acao(() => api(`${base}/${u.id}`, { metodo: "DELETE" }), "Unidade excluída.")}
              />
            )}
          />
        )}
      </Cartao>
    </>
  );
}

/** Ações de uma unidade. Editar troca os botões por dois campos, no lugar, na própria linha da tabela. */
function AcoesUnidade({
  unidade,
  onSalvar,
  onConvite,
  onExcluir,
}: {
  unidade: Unidade;
  onSalvar: (dados: { bloco: string; numero: string }) => Promise<void>;
  onConvite: () => Promise<void>;
  onExcluir: () => Promise<void>;
}) {
  const [editando, setEditando] = useState(false);
  const [bloco, setBloco] = useState(unidade.bloco);
  const [numero, setNumero] = useState(unidade.numero);
  if (editando) {
    return (
      <>
        <input value={bloco} onChange={(e) => setBloco(e.target.value)} size={4} aria-label="Bloco" />
        <input value={numero} onChange={(e) => setNumero(e.target.value)} size={6} aria-label="Número" />
        <button className="botao pequeno" disabled={!bloco.trim() || !numero.trim()} onClick={async () => { await onSalvar({ bloco, numero }); setEditando(false); }}>Salvar</button>
        <button className="botao pequeno secundario" onClick={() => setEditando(false)}>Cancelar</button>
      </>
    );
  }
  return (
    <>
      <button className="botao pequeno secundario" onClick={() => void onConvite()}>Gerar convite</button>
      <button className="botao pequeno secundario" onClick={() => setEditando(true)}>Editar</button>
      <BotaoConfirmar titulo="Excluir" pergunta="Excluir a unidade?" perigo onConfirmar={onExcluir} />
    </>
  );
}
