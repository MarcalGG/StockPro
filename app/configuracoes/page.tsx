import { redirect } from "next/navigation";
import { requireSession } from "../../lib/auth";
import ConfiguracoesFiscaisClient from "./ConfiguracoesFiscaisClient";

// Server component: confere a sessao no servidor antes de renderizar
// qualquer coisa (evita "flash" de conteudo protegido e mantem a
// verificacao fora do alcance do navegador).
export default async function ConfiguracoesPage() {
  const session = await requireSession();
  if (!session) {
    redirect("/login");
  }

  return <ConfiguracoesFiscaisClient email={session.email} />;
}
