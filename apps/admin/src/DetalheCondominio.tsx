import { useEffect, useState } from "react";
import { api } from "./api";
import { Cartao, Campo, Mensagem, Selecao } from "./componentes";
import { PlanoSelo } from "./Condominios";
import { Areas } from "./Areas";
import { Unidades } from "./Unidades";
import { Usuarios } from "./Usuarios";
import { rotuloPlano, type Condominio, type PlanoStatus } from "./tipos";

type Aba = "dados" | "unidades" | "usuarios" | "areas";

export function DetalheCondominio({ id, onVoltar }: { id: string; onVoltar: () => void }) {
  const [condominio, setCondominio] = useState<Condominio | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aba, setAba] = useState<Aba>("dados");
  const [recarregar, setRecarregar] = useState(0);

  useEffect(() => {
    api<Condominio>(`/painel/condominios/${id}`)
      .then(setCondominio)
      .catch((e: Error) => setErro(e.message));
  }, [id, recarregar]);

  return (
    <>
      <div className="cabecalho-detalhe">
        <button className="botao secundario pequeno" onClick={onVoltar}>← Condomínios</button>
        <h2>{condominio?.nome ?? "…"}</h2>
        {condominio && <PlanoSelo plano={condominio.planoStatus} situacao={condominio.situacao} />}
      </div>
      <Mensagem tipo="erro" texto={erro} />
      <div className="abas">
        {(["dados", "unidades", "usuarios", "areas"] as const).map((a) => (
          <button key={a} className={aba === a ? "ativa" : ""} onClick={() => setAba(a)}>
            {{ dados: "Dados e plano", unidades: "Unidades", usuarios: "Usuários", areas: "Áreas comuns" }[a]}
          </button>
        ))}
      </div>
      {condominio && aba === "dados" && <Dados condominio={condominio} onSalvo={() => setRecarregar((n) => n + 1)} />}
      {aba === "unidades" && <Unidades condominioId={id} />}
      {aba === "usuarios" && <Usuarios condominioId={id} />}
      {aba === "areas" && <Areas condominioId={id} />}
    </>
  );
}

/** Dados e plano. A data em branco deixa o plano sem vencimento. */
function Dados({ condominio, onSalvo }: { condominio: Condominio; onSalvo: () => void }) {
  const [nome, setNome] = useState(condominio.nome);
  const [cnpj, setCnpj] = useState(condominio.cnpj ?? "");
  const [endereco, setEndereco] = useState(condominio.endereco ?? "");
  const [plano, setPlano] = useState<PlanoStatus>(condominio.planoStatus);
  const [expira, setExpira] = useState(condominio.planoExpiraEm ? condominio.planoExpiraEm.slice(0, 10) : "");
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setSalvo(false);
    setOcupado(true);
    try {
      await api(`/painel/condominios/${condominio.id}`, {
        metodo: "PATCH",
        corpo: {
          nome,
          cnpj: cnpj || null,
          endereco: endereco || null,
          planoStatus: plano,
          // Fim do dia escolhido, no horário de Brasília (UTC-3).
          planoExpiraEm: expira ? `${expira}T23:59:59-03:00` : null,
        },
      });
      setSalvo(true);
      onSalvo();
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Cartao titulo="Dados e plano">
      <form onSubmit={salvar}>
        <div className="grade">
          <Campo rotulo="Nome" value={nome} onChange={(e) => setNome(e.target.value)} required />
          <Campo rotulo="CNPJ" value={cnpj} onChange={(e) => setCnpj(e.target.value)} />
          <Campo rotulo="Endereço" value={endereco} onChange={(e) => setEndereco(e.target.value)} />
          <Selecao
            rotulo="Plano"
            valor={plano}
            onChange={(v) => setPlano(v as PlanoStatus)}
            opcoes={(Object.keys(rotuloPlano) as PlanoStatus[]).map((p) => ({ valor: p, rotulo: rotuloPlano[p] }))}
          />
          <Campo rotulo="Plano vale até (em branco = sem data)" type="date" value={expira} onChange={(e) => setExpira(e.target.value)} />
        </div>
        <p className="secundario">
          {condominio._count.unidades} unidades · {condominio._count.usuarios} usuários · {condominio._count.areas ?? 0} áreas comuns
        </p>
        <Mensagem tipo="erro" texto={erro} />
        <Mensagem tipo="sucesso" texto={salvo ? "Alterações salvas." : null} />
        <button className="botao" disabled={ocupado || nome.trim().length < 2}>{ocupado ? "Salvando…" : "Salvar"}</button>
      </form>
    </Cartao>
  );
}
