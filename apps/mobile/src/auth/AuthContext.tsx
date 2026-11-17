import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import * as SecureStore from "expo-secure-store";
import {
  ErroDeConexao,
  TEMPO_LIMITE_ACORDAR_MS,
  api,
  aquecerServidor,
  definirAoExpirarSessao,
  definirAoPlanoInativo,
  definirToken,
  enviar,
  type Usuario,
} from "../api/client";
import { obterTokenPush } from "../notificacoes";

const CHAVE_TOKEN = "condomus.token";

interface AuthContextValue {
  usuario: Usuario | null;
  /** true enquanto verifica se existe uma sessão salva no aparelho. */
  restaurando: boolean;
  /** true quando a API recusou o acesso (402) porque o plano do condomínio está inativo. */
  planoInativo: boolean;
  /**
   * Entra na conta. Se o mesmo e-mail e senha servem em mais de um condomínio, devolve a lista para a
   * pessoa escolher (e quem chama reenvia com o `condominioId`); se entrou, devolve null.
   */
  entrar: (email: string, senha: string, lembrar?: boolean, condominioId?: string) => Promise<CondominioDaEscolha[] | null>;
  /** Guarda uma sessão já emitida pela API (login ou auto-cadastro por convite). */
  iniciarSessao: (token: string, usuario: Usuario) => Promise<void>;
  sair: () => Promise<void>;
  /** Atualiza a versão da foto após enviar ou remover, para os avatares recarregarem. */
  definirFoto: (fotoAtualizadaEm: string | null) => void;
  /** Adota a sessão devolvida pela troca de senha (o token anterior deixa de valer). */
  confirmarTrocaDeSenha: (token: string, usuario: Usuario) => Promise<void>;
}

/** Condomínio em que o e-mail e a senha informados têm conta. */
export interface CondominioDaEscolha {
  condominioId: string;
  nome: string;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [restaurando, setRestaurando] = useState(true);
  const [planoInativo, setPlanoInativo] = useState(false);
  const tokenPush = useRef<string | null>(null);

  const sair = useCallback(async () => {
    // Desvincula o celular antes de perder a autenticação; se falhar, segue saindo.
    if (tokenPush.current) {
      await enviar("DELETE", `/dispositivos/${encodeURIComponent(tokenPush.current)}`).catch(() => {});
      tokenPush.current = null;
    }
    definirToken(null);
    setUsuario(null);
    setPlanoInativo(false);
    await SecureStore.deleteItemAsync(CHAVE_TOKEN);
  }, []);

  useEffect(() => {
    definirAoExpirarSessao(() => void sair());
    definirAoPlanoInativo(() => setPlanoInativo(true));
    restaurarSessao().finally(() => setRestaurando(false));
    return () => {
      definirAoExpirarSessao(null);
      definirAoPlanoInativo(null);
    };

    async function restaurarSessao() {
      const salvo = await SecureStore.getItemAsync(CHAVE_TOKEN);
      if (!salvo) return;
      definirToken(salvo);
      try {
        const eu = await api<Usuario & { unidade: { id: string } | null }>("/auth/me", {}, TEMPO_LIMITE_ACORDAR_MS);
        setUsuario({
          id: eu.id,
          nome: eu.nome,
          papel: eu.papel,
          unidadeId: eu.unidade?.id ?? null,
          fotoAtualizadaEm: eu.fotoAtualizadaEm,
          senhaTemporaria: eu.senhaTemporaria,
        });
      } catch (e) {
        if (e instanceof ErroDeConexao) {
          // Servidor fora do ar ou sem rede: não é motivo para perder a sessão. Mantém o token salvo
          // para a próxima abertura e deixa a pessoa na tela de entrada.
          definirToken(null);
          return;
        }
        await sair();
      }
    }
  }, [sair]);

  // Acorda o servidor já na abertura: o plano gratuito dorme quando ninguém usa.
  useEffect(() => {
    aquecerServidor();
  }, []);

  // Com alguém logado, registra este celular para receber as notificações dessa pessoa.
  useEffect(() => {
    if (!usuario) return;
    obterTokenPush().then((token) => {
      if (!token) return;
      tokenPush.current = token;
      enviar("PUT", "/dispositivos", { token }).catch((e: Error) => console.warn("[push] Falha ao registrar", e.message));
    });
  }, [usuario?.id]);

  async function iniciarSessao(token: string, novo: Usuario) {
    definirToken(token);
    await SecureStore.setItemAsync(CHAVE_TOKEN, token);
    setPlanoInativo(false);
    setUsuario(novo);
  }

  async function entrar(email: string, senha: string, lembrar = true, condominioId?: string) {
    const resposta = await enviar<{ token: string; usuario: Usuario } | { escolherCondominio: CondominioDaEscolha[] }>(
      "POST",
      "/auth/login",
      { email: email.trim().toLowerCase(), senha, ...(condominioId && { condominioId }) },
      TEMPO_LIMITE_ACORDAR_MS,
    );
    // A senha serve em mais de um condomínio: a pessoa escolhe e a tela reenvia com o escolhido.
    if ("escolherCondominio" in resposta) return resposta.escolherCondominio;
    definirToken(resposta.token);
    if (lembrar) await SecureStore.setItemAsync(CHAVE_TOKEN, resposta.token);
    setPlanoInativo(false);
    setUsuario(resposta.usuario);
    return null;
  }

  const definirFoto = useCallback((fotoAtualizadaEm: string | null) => {
    setUsuario((atual) => (atual ? { ...atual, fotoAtualizadaEm } : atual));
  }, []);

  const confirmarTrocaDeSenha = useCallback(async (token: string, novo: Usuario) => {
    // A troca de senha invalida o token antigo: guarda o novo antes da próxima requisição.
    definirToken(token);
    // Só regrava se havia sessão salva (login sem "lembrar" não deve passar a lembrar).
    if (await SecureStore.getItemAsync(CHAVE_TOKEN)) await SecureStore.setItemAsync(CHAVE_TOKEN, token);
    setUsuario(novo);
  }, []);

  return (
    <AuthContext.Provider value={{ usuario, restaurando, planoInativo, entrar, iniciarSessao, sair, definirFoto, confirmarTrocaDeSenha }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth deve ser usado dentro de AuthProvider");
  return ctx;
}
