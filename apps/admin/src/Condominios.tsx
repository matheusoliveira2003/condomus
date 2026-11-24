import { useEffect, useMemo, useState } from "react";
import { api } from "./api";
import { Cartao, Campo, Mensagem } from "./componentes";
import { rotuloPlano, type Condominio, type PlanoStatus } from "./tipos";

/** Lista de todos os condomínios, com busca e a situação do plano. Criar um condomínio já cria o síndico. */
export function Condominios({ onAbrir }: { onAbrir: (id: string) => void }) {
  const [lista, setLista] = useState<Condominio[] | null>(null);
  const [busca, setBusca] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);
  const [recarregar, setRecarregar] = useState(0);

  useEffect(() => {
    api<Condominio[]>("/painel/condominios")
      .then(setLista)
      .catch((e: Error) => setErro(e.message));
  }, [recarregar]);

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return (lista ?? []).filter((c) => !termo || c.nome.toLowerCase().includes(termo));
  }, [lista, busca]);

  return (
    <>
      <Cartao
        titulo="Condomínios"
        acao={<button className="botao" onClick={() => setCriando((v) => !v)}>{criando ? "Fechar" : "Novo condomínio"}</button>}
      >
        {criando && (
          <NovoCondominio
            onCriado={() => {
              setCriando(false);
              setRecarregar((n) => n + 1);
            }}
          />
        )}
        <Campo rotulo="Buscar por nome" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome do condomínio" />
        <Mensagem tipo="erro" texto={erro} />
        {lista === null && !erro && <p className="secundario">Carregando…</p>}
        {lista && filtrados.length === 0 && <p className="vazio">Nenhum condomínio encontrado.</p>}
        {filtrados.map((c) => (
          <div key={c.id} className="linha" style={{ cursor: "pointer" }} onClick={() => onAbrir(c.id)}>
            <div className="grow">
              <div className="titulo">{c.nome}</div>
              <div className="secundario">
                {c._count.unidades} unidades · {c._count.usuarios} usuários
                {c.endereco ? ` · ${c.endereco}` : ""}
              </div>
            </div>
            <PlanoSelo plano={c.planoStatus} situacao={c.situacao} />
          </div>
        ))}
      </Cartao>
    </>
  );
}

/** Selo do plano, com o aviso de vencimento quando o teste está acabando ou em carência. */
export function PlanoSelo({ plano, situacao }: { plano: PlanoStatus; situacao: Condominio["situacao"] }) {
  const tom = plano === "ATIVO" ? "sucesso" : plano === "TRIAL" ? "primario" : plano === "EXPIRADO" || plano === "SUSPENSO" ? "perigo" : "";
  const aviso =
    situacao.emCarencia ? `em carência (${situacao.diasDeCarencia} dias)` : plano === "TRIAL" && situacao.diasParaExpirar !== null ? `termina em ${Math.max(situacao.diasParaExpirar, 0)} dias` : null;
  return (
    <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
      <span className={`selo ${tom}`}>{rotuloPlano[plano]}</span>
      {aviso && <span className="selo alerta">{aviso}</span>}
    </span>
  );
}

function NovoCondominio({ onCriado }: { onCriado: () => void }) {
  const [nome, setNome] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [endereco, setEndereco] = useState("");
  const [sindicoNome, setSindicoNome] = useState("");
  const [sindicoEmail, setSindicoEmail] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [senhaGerada, setSenhaGerada] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setOcupado(true);
    try {
      const r = await api<{ senhaGerada: string }>("/painel/condominios", {
        metodo: "POST",
        corpo: {
          nome,
          ...(cnpj && { cnpj }),
          ...(endereco && { endereco }),
          sindico: { nome: sindicoNome, email: sindicoEmail },
        },
      });
      setSenhaGerada(r.senhaGerada);
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  if (senhaGerada) {
    return (
      <div style={{ marginBottom: 16 }}>
        <Mensagem tipo="sucesso" texto="Condomínio criado. O síndico recebeu um e-mail com a senha temporária." />
        <p className="secundario">Se o e-mail não chegar, esta é a senha temporária (copie agora; ela não aparece de novo):</p>
        <p className="senha-gerada">{senhaGerada}</p>
        <button className="botao secundario" onClick={onCriado}>Concluir</button>
      </div>
    );
  }

  return (
    <form onSubmit={criar} style={{ marginBottom: 16 }}>
      <div className="grade">
        <Campo rotulo="Nome do condomínio" value={nome} onChange={(e) => setNome(e.target.value)} required />
        <Campo rotulo="CNPJ (opcional)" value={cnpj} onChange={(e) => setCnpj(e.target.value)} />
        <Campo rotulo="Endereço (opcional)" value={endereco} onChange={(e) => setEndereco(e.target.value)} />
        <Campo rotulo="Nome do síndico" value={sindicoNome} onChange={(e) => setSindicoNome(e.target.value)} required />
        <Campo rotulo="E-mail do síndico" type="email" value={sindicoEmail} onChange={(e) => setSindicoEmail(e.target.value)} required />
      </div>
      <Mensagem tipo="erro" texto={erro} />
      <button className="botao" disabled={ocupado || !nome || !sindicoNome || !sindicoEmail}>
        {ocupado ? "Criando…" : "Criar condomínio e síndico"}
      </button>
    </form>
  );
}
