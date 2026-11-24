import { useEffect, useState } from "react";
import { api } from "./api";
import { Cartao, Campo, Mensagem } from "./componentes";
import type { Area } from "./tipos";

/** Áreas comuns reserváveis: criar, editar e ativar ou desativar. Área desativada some das reservas do app. */
export function Areas({ condominioId }: { condominioId: string }) {
  const base = `/painel/condominios/${condominioId}/areas`;
  const [lista, setLista] = useState<Area[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [recarregar, setRecarregar] = useState(0);
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [capacidade, setCapacidade] = useState("");

  useEffect(() => {
    api<Area[]>(base).then(setLista).catch((e: Error) => setErro(e.message));
  }, [base, recarregar]);

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

  const corpo = (n: string, d: string, cap: string) => ({ nome: n, ...(d && { descricao: d }), ...(cap && { capacidade: Number(cap) }) });

  return (
    <>
      <Cartao titulo="Nova área comum">
        <form
          className="grade"
          onSubmit={(e) => {
            e.preventDefault();
            void acao(async () => {
              await api(base, { metodo: "POST", corpo: corpo(nome, descricao, capacidade) });
              setNome("");
              setDescricao("");
              setCapacidade("");
            }, "Área criada.");
          }}
        >
          <Campo rotulo="Nome" value={nome} onChange={(e) => setNome(e.target.value)} required />
          <Campo rotulo="Descrição (opcional)" value={descricao} onChange={(e) => setDescricao(e.target.value)} />
          <Campo rotulo="Capacidade (opcional)" type="number" min={1} value={capacidade} onChange={(e) => setCapacidade(e.target.value)} />
          <div className="campo" style={{ alignSelf: "end" }}><button className="botao" disabled={nome.trim().length < 2}>Criar</button></div>
        </form>
      </Cartao>
      <Mensagem tipo="erro" texto={erro} />
      <Mensagem tipo="sucesso" texto={aviso} />
      <Cartao titulo={`Áreas comuns${lista ? ` (${lista.length})` : ""}`}>
        {lista === null && !erro && <p className="secundario">Carregando…</p>}
        {lista?.length === 0 && <p className="vazio">Nenhuma área cadastrada.</p>}
        {lista?.map((a) => (
          <div key={a.id} className="linha" style={{ opacity: a.ativa ? 1 : 0.55 }}>
            <div className="grow">
              <div className="titulo">{a.nome}</div>
              <div className="secundario">
                {a.descricao ?? "Sem descrição"}
                {a.capacidade ? ` · até ${a.capacidade} pessoas` : ""}
              </div>
            </div>
            {!a.ativa && <span className="selo">Desativada</span>}
            <button
              className="botao pequeno secundario"
              onClick={() =>
                void acao(
                  () => api(`${base}/${a.id}`, { metodo: "PATCH", corpo: { ...corpo(a.nome, a.descricao ?? "", a.capacidade ? String(a.capacidade) : ""), ativa: !a.ativa } }),
                  a.ativa ? "Área desativada." : "Área reativada.",
                )
              }
            >
              {a.ativa ? "Desativar" : "Reativar"}
            </button>
          </div>
        ))}
      </Cartao>
    </>
  );
}
