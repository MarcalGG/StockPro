"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../providers/AuthProvider";
import { getAuthErrorMessage } from "../../lib/firebaseAuth";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.82-.07-1.42-.22-2.05H12v3.9h6.53c-.13 1.06-.85 2.65-2.44 3.72l-.02.15 3.55 2.72.25.02c2.26-2.06 3.62-5.08 3.62-8.46z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.06 7.93-2.87l-3.78-2.9c-1.01.7-2.37 1.19-4.15 1.19-3.17 0-5.86-2.09-6.82-4.98l-.14.01-3.68 2.82-.05.14C3.3 21.3 7.35 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.18 14.44A7.4 7.4 0 0 1 4.76 12c0-.85.15-1.67.41-2.44l-.01-.16-3.72-2.86-.12.06A11.96 11.96 0 0 0 0 12c0 1.93.47 3.76 1.32 5.4l3.86-2.96z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c2.26 0 3.78.97 4.65 1.79l3.4-3.29C17.94 1.19 15.24 0 12 0 7.35 0 3.3 2.7 1.32 6.6l3.85 2.96C6.14 6.84 8.83 4.75 12 4.75z"
      />
    </svg>
  );
}

function FullScreenSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#09233f]">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-white" />
    </div>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const { status, signIn, firebaseConfigured } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/");
    }
  }, [status, router]);

  async function handleGoogleSignIn() {
    setError("");
    setLoading(true);
    try {
      await signIn();
    } catch (err) {
      setError(getAuthErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  if (status === "authenticated") return <FullScreenSpinner />;

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#09233f] p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-[#09233f] text-xl font-black text-cyan-300 shadow-sm">
            SS
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              StockScan Pro
            </p>
            <h1 className="text-lg font-semibold text-slate-900">Entrar</h1>
          </div>
        </div>

        {!firebaseConfigured && (
          <p className="mb-4 rounded-lg bg-amber-50 p-3 text-center text-xs font-semibold text-amber-800">
            O login com Google ainda não está configurado neste ambiente.
          </p>
        )}

        {error && (
          <p className="mb-4 rounded-lg bg-rose-50 p-3 text-center text-xs font-semibold text-rose-800">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={loading || !firebaseConfigured}
          className="flex w-full items-center justify-center gap-3 rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <GoogleIcon />
          {loading ? "Entrando..." : "Continuar com Google"}
        </button>

        <p className="mt-4 text-center text-xs text-slate-400">
          Qualquer conta Google pode entrar nesta fase — seus dados ficam
          isolados por conta, mas não há restrição de quem pode acessar.
        </p>

        <p className="mt-6 text-center text-xs text-slate-400">
          <Link href="/login/admin" className="underline hover:text-slate-600">
            Sou administrador
          </Link>
        </p>
      </div>
    </main>
  );
}
