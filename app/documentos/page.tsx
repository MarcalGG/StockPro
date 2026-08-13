import { redirect } from "next/navigation";
import { requireSession } from "../../lib/auth";
import DocumentosContabilidadeClient from "./DocumentosContabilidadeClient";

// Server component: mesma protecao de sessao usada em /configuracoes —
// confere no servidor antes de renderizar qualquer dado fiscal.
export default async function DocumentosPage() {
  const session = await requireSession();
  if (!session) {
    redirect("/login");
  }

  return <DocumentosContabilidadeClient email={session.email} />;
}
