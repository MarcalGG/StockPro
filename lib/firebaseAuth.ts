// Camada de autenticacao Google, sobre o Firebase Auth (lib/firebase.ts).
//
// Nenhum token e guardado manualmente em localStorage/sessionStorage aqui —
// o SDK do Firebase administra a persistencia da sessao sozinho (mesmo
// padrao do Ascend). Este modulo so expoe funcoes de alto nivel para o resto
// do app: entrar, sair, assinar mudancas de estado e traduzir erros.

import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  onAuthStateChanged,
  signOut,
  type User,
} from "firebase/auth";
import { auth } from "./firebase";

export type AppUser = {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
};

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

export function toAppUser(user: User): AppUser {
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    photoURL: user.photoURL,
  };
}

export function subscribeToAuthState(callback: (user: AppUser | null) => void) {
  if (!auth) {
    callback(null);
    return () => {};
  }
  return onAuthStateChanged(auth, (user) => {
    callback(user ? toAppUser(user) : null);
  });
}

function isMobileUserAgent(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

// Popup no desktop (experiencia mais rapida, sem sair da pagina); redirect no
// mobile (popups sao bloqueados/pouco confiaveis em muitos navegadores
// moveis). No caminho de redirect, o resultado so chega no proximo
// carregamento da pagina — por isso retorna null aqui, e quem chamou precisa
// tratar `getPendingGoogleRedirectResult()` no mount da tela de login.
export async function signInWithGoogle(): Promise<AppUser | null> {
  if (!auth) {
    throw new Error("auth/config-missing");
  }
  const provider = new GoogleAuthProvider();
  if (isMobileUserAgent()) {
    await signInWithRedirect(auth, provider);
    return null;
  }
  const result = await signInWithPopup(auth, provider);
  return toAppUser(result.user);
}

export async function getPendingGoogleRedirectResult(): Promise<AppUser | null> {
  if (!auth) return null;
  const result = await getRedirectResult(auth);
  return result ? toAppUser(result.user) : null;
}

export async function signOutUser(): Promise<void> {
  if (!auth) return;
  await signOut(auth);
}

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  "auth/config-missing": "O login com Google ainda não está configurado neste ambiente.",
  "auth/popup-blocked":
    "O navegador bloqueou a janela de login. Permita pop-ups para este site e tente novamente.",
  "auth/popup-closed-by-user": "A janela de login foi fechada antes de concluir. Tente novamente.",
  "auth/cancelled-popup-request": "Outra tentativa de login já estava em andamento. Tente novamente.",
  "auth/network-request-failed": "Falha de rede ao tentar entrar. Verifique sua conexão e tente novamente.",
  "auth/unauthorized-domain":
    "Este domínio não está autorizado no projeto Firebase. Adicione-o em Authentication > Settings > Authorized domains.",
  "auth/operation-not-allowed":
    "O login com Google não está habilitado neste projeto Firebase. Ative o provedor Google em Authentication > Sign-in method.",
  "auth/api-key-not-valid.-please-pass-a-valid-api-key.":
    "A configuração do Firebase está incorreta (chave de API inválida). Confira as variáveis de ambiente.",
  "auth/invalid-api-key":
    "A configuração do Firebase está incorreta (chave de API inválida). Confira as variáveis de ambiente.",
  "auth/web-storage-unsupported":
    "Este navegador não permite armazenamento local, necessário para manter a sessão. Tente outro navegador.",
};

export function getAuthErrorMessage(error: unknown): string {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code: unknown }).code)
      : "";
  return AUTH_ERROR_MESSAGES[code] ?? "Algo deu errado ao entrar. Tente novamente.";
}
