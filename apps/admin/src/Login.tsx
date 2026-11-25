import { useState } from "react";
import logo from "./assets/logo.png";
import { api, ErroApi } from "./api";
import { Campo, Mensagem } from "./componentes";

interface Admin {
  id: string;
  nome: string;
  email: string;
}

/** Entrada do administrador. A mensagem de erro é a mesma para e-mail inexistente e senha errada. */
export function Login({ onEntrar }: { onEntrar: (token: string, admin: Admin) => void }) {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setOcupado(true);
    try {
      const r = await api<{ token: string; administrador: Admin }>("/auth/login", { metodo: "POST", corpo: { email, senha } });
      onEntrar(r.token, r.administrador);
    } catch (err) {
      setErro(err instanceof ErroApi && err.status === 429 ? "Muitas tentativas. Aguarde alguns minutos." : (err as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="centro">
      <form className="cartao login" onSubmit={entrar}>
        <img className="logo" src={logo} alt="Condomus" />
        <h2 className="mt0">Entrar como administrador</h2>
        <Campo rotulo="E-mail" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <Campo rotulo="Senha" type="password" autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} required />
        <Mensagem tipo="erro" texto={erro} />
        <button className="botao cheio" disabled={ocupado || !email || !senha}>
          {ocupado ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </div>
  );
}
