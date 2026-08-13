import { NextResponse } from "next/server";
import { requireSession } from "../../../../../lib/auth";
import { confirmarRemessa, RemessaError } from "../../../../../lib/services/remessaService";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });

  const { id } = await context.params;
  try {
    const remessa = await confirmarRemessa(session.companyId, id, session.email);
    return NextResponse.json({ id: remessa.id, status: remessa.status });
  } catch (error) {
    if (error instanceof RemessaError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Nao foi possivel confirmar a remessa." }, { status: 500 });
  }
}
