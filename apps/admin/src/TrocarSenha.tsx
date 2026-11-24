import { useState } from "react";
import { api, ErroApi, guardarToken } from "./api";
import { Cartao, Campo, Mensagem } from "./componentes";

const MINIMO = 12;

/**
 * Troca da senha do próprio administrador. As outras sessões abertas são encerradas; esta continua,
 * com o token novo que a API devolve.
 */
export function TrocarSenha({ email, onVoltar }: { email: string; onVoltar: () => void }) {
  const [atual, setAtual] = useState("");
  const [nova, setNova] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  const problema =
    nova && nova.length < MINIMO
      ? `A nova senha deve ter pelo menos ${MINIMO} caracteres`
      : confirmacao && nova !== confirmacao
        ? "A confirmação não confere com a nova senha"
        : null;

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (problema) return;
    setErro(null);
    setOcupado(true);
    try {
      const r = await api<{ token: string }>("/senha", { metodo: "PATCH", corpo: { senhaAtual: atual, novaSenha: nova } });
      guardarToken(r.token);
      setFeito(true);
      setAtual("");
      setNova("");
      setConfirmacao("");
    } catch (err) {
      setErro(err instanceof ErroApi && err.status === 429 ? "Muitas tentativas. Aguarde alguns minutos." : (err as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <>
      <div>
        <button className="botao secundario pequeno" onClick={onVoltar}>
          ← Condomínios
        </button>
      </div>
      <Cartao titulo="Trocar senha">
        {feito ? (
          <>
            <Mensagem tipo="sucesso" texto="Senha alterada. Outras sessões abertas do painel foram encerradas." />
            <button className="botao" onClick={onVoltar}>
              Voltar aos condomínios
            </button>
          </>
        ) : (
          <form onSubmit={salvar} style={{ maxWidth: 380 }}>
            {/* Campo de usuário oculto: ajuda o gerenciador de senhas a salvar a nova senha na conta certa. */}
            <input type="email" autoComplete="username" value={email} readOnly hidden />
            <Campo rotulo="Senha atual" type="password" autoComplete="current-password" value={atual} onChange={(e) => setAtual(e.target.value)} required />
            <Campo rotulo={`Nova senha (mín. ${MINIMO} caracteres)`} type="password" autoComplete="new-password" value={nova} onChange={(e) => setNova(e.target.value)} required />
            <Campo rotulo="Confirme a nova senha" type="password" autoComplete="new-password" value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)} required />
            <Mensagem tipo="erro" texto={problema ?? erro} />
            <button className="botao" disabled={ocupado || !atual || !nova || !confirmacao || !!problema}>
              {ocupado ? "Salvando…" : "Trocar senha"}
            </button>
          </form>
        )}
      </Cartao>
    </>
  );
}
