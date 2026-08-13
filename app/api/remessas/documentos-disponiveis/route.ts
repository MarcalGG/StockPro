import { NextResponse } from "next/server";
import { requireSession } from "../../../../lib/auth";
import { listDocumentosDisponiveis } from "../../../../lib/services/remessaService";

export async function GET() {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });

  const documentos = await listDocumentosDisponiveis(session.companyId);
  return NextResponse.json({ documentos });
}
