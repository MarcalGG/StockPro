import { NextResponse } from "next/server";
import { requireSession } from "../../../../lib/auth";
import { getRemessaDetail } from "../../../../lib/services/remessaService";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });

  const { id } = await context.params;
  const remessa = await getRemessaDetail(session.companyId, id);
  if (!remessa) return NextResponse.json({ error: "Remessa nao encontrada." }, { status: 404 });

  return NextResponse.json({ remessa });
}
