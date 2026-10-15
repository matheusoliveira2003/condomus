import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import * as SecureStore from "expo-secure-store";
import { api, definirAoExpirarSessao, definirToken, enviar, type Usuario } from "../api/client";
import { obterTokenPush } from "../notificacoes";

const CHAVE_TOKEN = "condomus.token";

interface AuthContextValue {
  usuario: Usuario | null;
  /** true enquanto verifica se existe uma sessão salva no aparelho. */
  restaurando: boolean;
  entrar: (email: string, senha: string) => Promise<void>;
  sair: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [restaurando, setRestaurando] = useState(true);
  const tokenPush = useRef<string | null>(null);

  const sair = useCallback(async () => {
    // Desvincula o celular antes de perder a autenticação; se falhar, segue saindo.
    if (tokenPush.current) {
      await enviar("DELETE", `/dispositivos/${encodeURIComponent(tokenPush.current)}`).catch(() => {});
      tokenPush.current = null;
    }
    definirToken(null);
    setUsuario(null);
    await SecureStore.deleteItemAsync(CHAVE_TOKEN);
  }, []);

  useEffect(() => {
    definirAoExpirarSessao(() => void sair());
    restaurarSessao().finally(() => setRestaurando(false));
    return () => definirAoExpirarSessao(null);

    async function restaurarSessao() {
      const salvo = await SecureStore.getItemAsync(CHAVE_TOKEN);
      if (!salvo) return;
      definirToken(salvo);
      try {
        const eu = await api<Usuario & { unidade: { id: string } | null }>("/auth/me");
        setUsuario({ id: eu.id, nome: eu.nome, papel: eu.papel, unidadeId: eu.unidade?.id ?? null });
      } catch {
        await sair();
      }
    }
  }, [sair]);

  // Com alguém logado, registra este celular para receber as notificações dessa pessoa.
  useEffect(() => {
    if (!usuario) return;
    obterTokenPush().then((token) => {
      if (!token) return;
      tokenPush.current = token;
      enviar("PUT", "/dispositivos", { token }).catch((e: Error) => console.warn("[push] Falha ao registrar", e.message));
    });
  }, [usuario?.id]);

  async function entrar(email: string, senha: string) {
    const { token, usuario } = await enviar<{ token: string; usuario: Usuario }>("POST", "/auth/login", {
      email: email.trim().toLowerCase(),
      senha,
    });
    definirToken(token);
    await SecureStore.setItemAsync(CHAVE_TOKEN, token);
    setUsuario(usuario);
  }

  return <AuthContext.Provider value={{ usuario, restaurando, entrar, sair }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth deve ser usado dentro de AuthProvider");
  return ctx;
}
