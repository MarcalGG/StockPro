import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "../../../lib/auth";
import { createRemessa, listRemessas, RemessaError } from "../../../lib/services/remessaService";

export async function GET() {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });

  const remessas = await listRemessas(session.companyId);
  return NextResponse.json({ remessas });
}

export async function POST(request: NextRequest) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisicao invalido." }, { status: 400 });
  }

  const documentIds = Array.isArray((body as { documentIds?: unknown })?.documentIds)
    ? ((body as { documentIds: unknown[] }).documentIds.filter((v) => typeof v === "string") as string[])
    : [];
  const observacao = typeof (body as { observacao?: unknown })?.observacao === "string"
    ? (body as { observacao: string }).observacao
    : null;
  const confirmar = Boolean((body as { confirmar?: unknown })?.confirmar);

  try {
    const remessa = await createRemessa({
      companyId: session.companyId,
      actorEmail: session.email,
      documentIds,
      observacao,
      confirmar,
    });
    return NextResponse.json({ id: remessa.id, status: remessa.status });
  } catch (error) {
    if (error instanceof RemessaError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Nao foi possivel criar a remessa." }, { status: 500 });
  }
}
