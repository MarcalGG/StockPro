"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  getPendingGoogleRedirectResult,
  signInWithGoogle,
  signOutUser,
  subscribeToAuthState,
  type AppUser,
  type AuthStatus,
} from "../../lib/firebaseAuth";
import { firebaseConfigured } from "../../lib/firebase";
import { setActiveOperationalUser } from "../../lib/localOperationalStore";
import {
  detectLegacyData,
  hasResolvedLegacyData,
  ignoreLegacyData,
  migrateLegacyDataToUser,
  type LegacyDataSummary,
} from "../../lib/localOperationalMigration";
import LegacyDataDialog from "../components/LegacyDataDialog";

type AuthContextValue = {
  user: AppUser | null;
  status: AuthStatus;
  firebaseConfigured: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth precisa estar dentro de <AuthProvider>");
  return ctx;
}

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  // Sem config do Firebase, ja comeca "unauthenticated" (nao ha nada para
  // esperar) — evita chamar setState de dentro do efeito abaixo so para
  // esse caso, o que o eslint-plugin-react-hooks reporta como erro.
  const [status, setStatus] = useState<AuthStatus>(firebaseConfigured ? "loading" : "unauthenticated");
  const [pendingLegacy, setPendingLegacy] = useState<{ user: AppUser; summary: LegacyDataSummary } | null>(
    null,
  );

  // Libera o app para um usuario: so ativa o namespace do UID (e portanto
  // libera leitura/escrita do localStorage dele) depois de resolvida a
  // questao dos dados legados (associados ou ignorados), evitando a corrida
  // em que uma tela le o storage antes do namespace certo estar ativo.
  const releaseUser = useCallback((nextUser: AppUser) => {
    setActiveOperationalUser(nextUser.uid);
    setUser(nextUser);
    setStatus("authenticated");
  }, []);

  const handleAuthenticatedUser = useCallback(
    (nextUser: AppUser) => {
      if (hasResolvedLegacyData(nextUser.uid)) {
        releaseUser(nextUser);
        return;
      }
      const summary = detectLegacyData();
      if (!summary.hasAnyData) {
        // nada legado para perguntar: marca como resolvido e segue
        ignoreLegacyData(nextUser.uid);
        releaseUser(nextUser);
        return;
      }
      // Mantem o gate em "loading" ate o usuario decidir no dialogo.
      setPendingLegacy({ user: nextUser, summary });
    },
    [releaseUser],
  );

  useEffect(() => {
    if (!firebaseConfigured) {
      return;
    }

    getPendingGoogleRedirectResult().catch((error) => {
      console.error("[auth] falha ao recuperar resultado de redirect:", error);
    });

    const unsubscribe = subscribeToAuthState((nextUser) => {
      if (nextUser) {
        handleAuthenticatedUser(nextUser);
      } else {
        setActiveOperationalUser(null);
        setUser(null);
        setStatus("unauthenticated");
      }
    });

    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signIn = useCallback(async () => {
    const result = await signInWithGoogle();
    // Em popup, o onAuthStateChanged acima ja cuida do resto. Em redirect,
    // result vem null e a sessao so se resolve no proximo carregamento.
    if (result) {
      handleAuthenticatedUser(result);
    }
  }, [handleAuthenticatedUser]);

  const signOut = useCallback(async () => {
    await signOutUser();
    // Nao apaga nenhum dado do localStorage — so encerra a sessao do
    // Firebase e desativa o namespace ativo.
    setActiveOperationalUser(null);
    setUser(null);
    setStatus("unauthenticated");
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, status: pendingLegacy ? "loading" : status, firebaseConfigured, signIn, signOut }),
    [user, status, pendingLegacy, signIn, signOut],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
      {pendingLegacy && (
        <LegacyDataDialog
          summary={pendingLegacy.summary}
          onAssociate={() => {
            migrateLegacyDataToUser(pendingLegacy.user.uid);
            const resolvedUser = pendingLegacy.user;
            setPendingLegacy(null);
            releaseUser(resolvedUser);
          }}
          onIgnore={() => {
            ignoreLegacyData(pendingLegacy.user.uid);
            const resolvedUser = pendingLegacy.user;
            setPendingLegacy(null);
            releaseUser(resolvedUser);
          }}
        />
      )}
    </AuthContext.Provider>
  );
}
