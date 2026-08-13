import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "../../../../../lib/auth";
import { cancelarRemessa, RemessaError } from "../../../../../lib/services/remessaService";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });

  const { id } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisicao invalido." }, { status: 400 });
  }
  const motivo = typeof (body as { motivo?: unknown })?.motivo === "string" ? (body as { motivo: string }).motivo : "";

  try {
    await cancelarRemessa(session.companyId, id, session.email, motivo);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof RemessaError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Nao foi possivel cancelar a remessa." }, { status: 500 });
  }
}
