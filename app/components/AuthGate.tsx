"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../providers/AuthProvider";

function FullScreenSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#09233f]">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-white" />
    </div>
  );
}

// Protecao client-side (esta fase nao tem backend persistente para validar
// sessao no servidor — a validacao server-side fica para quando houver um
// backend que precise dela; documentado no README).
export default function AuthGate({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [status, router]);

  if (status === "loading") return <FullScreenSpinner />;
  if (status === "unauthenticated") return <FullScreenSpinner />;

  return <>{children}</>;
}
