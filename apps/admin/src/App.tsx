import { useEffect, useState } from "react";
import { api, aoExpirarSessao, guardarToken, obterToken, sairDoPainel } from "./api";
import { Login } from "./Login";
import { Condominios } from "./Condominios";
import { DetalheCondominio } from "./DetalheCondominio";
import { TrocarSenha } from "./TrocarSenha";

interface Admin {
  id: string;
  nome: string;
  email: string;
}

type Tela = { nome: "lista" } | { nome: "detalhe"; id: string } | { nome: "senha" };

export function App() {
  const [admin, setAdmin] = useState<Admin | null>(null);
  const [verificando, setVerificando] = useState(Boolean(obterToken()));
  const [tela, setTela] = useState<Tela>({ nome: "lista" });

  useEffect(() => {
    aoExpirarSessao(() => {
      setAdmin(null);
      setTela({ nome: "lista" });
    });
    if (!obterToken()) return;
    api<Admin>("/eu")
      .then(setAdmin)
      .catch(() => sairDoPainel())
      .finally(() => setVerificando(false));
  }, []);

  if (verificando) return <div className="centro secundario">Carregando…</div>;
  if (!admin) return <Login onEntrar={(token, dados) => { guardarToken(token); setAdmin(dados); }} />;

  function sair() {
    sairDoPainel();
    setAdmin(null);
    setTela({ nome: "lista" });
  }

  return (
    <>
      <header className="topo">
        <h1>Condomus · Administração</h1>
        <span className="secundario" style={{ color: "#fff", opacity: 0.8 }}>{admin.email}</span>
        <button onClick={() => setTela({ nome: "senha" })}>Trocar senha</button>
        <button onClick={sair}>Sair</button>
      </header>
      <main className="conteudo">
        {tela.nome === "lista" && <Condominios onAbrir={(id) => setTela({ nome: "detalhe", id })} />}
        {tela.nome === "detalhe" && <DetalheCondominio id={tela.id} onVoltar={() => setTela({ nome: "lista" })} />}
        {tela.nome === "senha" && <TrocarSenha email={admin.email} onVoltar={() => setTela({ nome: "lista" })} />}
      </main>
    </>
  );
}
