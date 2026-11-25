import { useMemo, useState, type ReactNode } from "react";

export function Cartao({ titulo, acao, children }: { titulo?: string; acao?: ReactNode; children: ReactNode }) {
  return (
    <section className="cartao">
      {(titulo || acao) && (
        <header className="cartao-topo">
          {titulo && <h2>{titulo}</h2>}
          {acao}
        </header>
      )}
      {children}
    </section>
  );
}

export function Campo({ rotulo, ...props }: { rotulo: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="campo">
      <label>{rotulo}</label>
      <input {...props} />
    </div>
  );
}

export function Selecao({ rotulo, valor, onChange, opcoes }: { rotulo: string; valor: string; onChange: (v: string) => void; opcoes: { valor: string; rotulo: string }[] }) {
  return (
    <div className="campo">
      <label>{rotulo}</label>
      <select value={valor} onChange={(e) => onChange(e.target.value)}>
        {opcoes.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.rotulo}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Botão que pede confirmação antes de agir, para ações que tiram acesso ou apagam algo. */
export function BotaoConfirmar({ titulo, pergunta, perigo, onConfirmar }: { titulo: string; pergunta: string; perigo?: boolean; onConfirmar: () => Promise<void> | void }) {
  const [pedindo, setPedindo] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  if (!pedindo) {
    return (
      <button className={`botao pequeno ${perigo ? "perigo" : "secundario"}`} onClick={() => setPedindo(true)}>
        {titulo}
      </button>
    );
  }
  return (
    <span className="grupo">
      <span className="secundario">{pergunta}</span>
      <button
        className={`botao pequeno ${perigo ? "perigo" : ""}`}
        disabled={ocupado}
        onClick={async () => {
          setOcupado(true);
          try {
            await onConfirmar();
          } finally {
            setOcupado(false);
            setPedindo(false);
          }
        }}
      >
        Sim
      </button>
      <button className="botao pequeno secundario" onClick={() => setPedindo(false)}>
        Não
      </button>
    </span>
  );
}

export function Mensagem({ tipo, texto }: { tipo: "erro" | "aviso" | "sucesso"; texto: string | null }) {
  if (!texto) return null;
  return <div className={tipo}>{texto}</div>;
}

/** Uma coluna da tabela: o texto de cabeçalho, como mostrar a célula e, se houver `ordem`, o valor usado para ordenar. */
export interface Coluna<T> {
  rotulo: string;
  celula: (linha: T) => ReactNode;
  ordem?: (linha: T) => string | number;
  principal?: boolean;
}

/**
 * Tabela do painel: ordenação por coluna, busca opcional e estado vazio. Abaixo de 720 px cada linha vira um
 * cartão, e o rótulo da coluna aparece ao lado do valor (`data-rotulo`). A coluna de ações fica por último.
 */
export function Tabela<T extends { id: string }>({
  linhas,
  colunas,
  acoes,
  vazio,
  busca,
  inativa,
  onAbrir,
}: {
  linhas: T[];
  colunas: Coluna<T>[];
  acoes?: (linha: T) => ReactNode;
  vazio: string;
  /** Texto de cada linha usado pela busca; sem isso a tabela não mostra o campo. */
  busca?: (linha: T) => string;
  inativa?: (linha: T) => boolean;
  onAbrir?: (linha: T) => void;
}) {
  const [termo, setTermo] = useState("");
  const [ordenar, setOrdenar] = useState<{ indice: number; desc: boolean } | null>(null);

  const visiveis = useMemo(() => {
    const t = termo.trim().toLowerCase();
    let r = busca && t ? linhas.filter((l) => busca(l).toLowerCase().includes(t)) : linhas;
    const col = ordenar ? colunas[ordenar.indice] : undefined;
    if (ordenar && col?.ordem) {
      const valor = col.ordem;
      r = [...r].sort((a, b) => {
        const x = valor(a);
        const y = valor(b);
        const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "pt-BR", { numeric: true });
        return ordenar.desc ? -c : c;
      });
    }
    return r;
  }, [linhas, colunas, termo, ordenar, busca]);

  return (
    <>
      {busca && (
        <div className="campo tabela-busca">
          <input type="search" value={termo} onChange={(e) => setTermo(e.target.value)} placeholder="Buscar" aria-label="Buscar" />
        </div>
      )}
      {visiveis.length === 0 ? (
        <p className="vazio">{termo.trim() ? "Nada encontrado para essa busca." : vazio}</p>
      ) : (
        <div className="tabela-rolagem">
          <table className="tabela">
            <thead>
              <tr>
                {colunas.map((c, i) => (
                  <th key={c.rotulo} aria-sort={ordenar?.indice === i ? (ordenar.desc ? "descending" : "ascending") : undefined}>
                    {c.ordem ? (
                      <button onClick={() => setOrdenar(ordenar?.indice === i ? { indice: i, desc: !ordenar.desc } : { indice: i, desc: false })}>
                        {c.rotulo}
                        {ordenar?.indice === i ? (ordenar.desc ? " ↓" : " ↑") : ""}
                      </button>
                    ) : (
                      c.rotulo
                    )}
                  </th>
                ))}
                {acoes && <th aria-label="Ações" />}
              </tr>
            </thead>
            <tbody>
              {visiveis.map((l) => (
                <tr key={l.id} className={`${onAbrir ? "clicavel" : ""} ${inativa?.(l) ? "inativa" : ""}`} onClick={onAbrir ? () => onAbrir(l) : undefined}>
                  {colunas.map((c) => (
                    <td key={c.rotulo} data-rotulo={c.rotulo} className={c.principal ? "principal" : undefined}>
                      {c.celula(l)}
                    </td>
                  ))}
                  {acoes && (
                    <td className="acoes" onClick={(e) => e.stopPropagation()}>
                      <span className="grupo">{acoes(l)}</span>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
