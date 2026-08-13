"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.error || "Nao foi possivel entrar.");
        return;
      }
      router.push("/configuracoes");
      router.refresh();
    } catch {
      setError("Nao foi possivel conectar ao servidor.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#eef3f8] p-4">
      <form
        className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-sm"
        onSubmit={handleSubmit}
      >
        <div className="mb-6 flex items-center gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#09233f] text-lg font-black text-cyan-300 shadow-sm">
            SS
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              StockScan Pro
            </p>
            <h1 className="text-lg font-semibold text-slate-900">Acesso administrativo</h1>
          </div>
        </div>

        <label className="block text-sm font-bold text-slate-700">
          E-mail
          <input
            autoComplete="username"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-cyan-600"
            onChange={(event) => setEmail(event.target.value)}
            required
            type="email"
            value={email}
          />
        </label>

        <label className="mt-4 block text-sm font-bold text-slate-700">
          Senha
          <input
            autoComplete="current-password"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-cyan-600"
            onChange={(event) => setPassword(event.target.value)}
            required
            type="password"
            value={password}
          />
        </label>

        {error && (
          <p className="mt-4 rounded-lg bg-rose-50 p-3 text-xs font-semibold text-rose-800">
            {error}
          </p>
        )}

        <button
          className="mt-6 w-full rounded-xl bg-[#09233f] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#12385f] disabled:cursor-not-allowed disabled:opacity-60"
          disabled={loading}
          type="submit"
        >
          {loading ? "Entrando..." : "Entrar"}
        </button>

        <p className="mt-4 text-center text-xs text-slate-400">
          Acesso restrito a administradores. Fale com quem configurou o
          sistema se voce nao tem uma conta.
        </p>
      </form>
    </main>
  );
}
