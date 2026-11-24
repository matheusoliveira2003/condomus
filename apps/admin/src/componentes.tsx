import { useState, type ReactNode } from "react";

export function Cartao({ titulo, acao, children }: { titulo?: string; acao?: ReactNode; children: ReactNode }) {
  return (
    <section className="cartao">
      {(titulo || acao) && (
        <header style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          {titulo && <h2 style={{ flex: 1, margin: 0 }}>{titulo}</h2>}
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
    <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
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
