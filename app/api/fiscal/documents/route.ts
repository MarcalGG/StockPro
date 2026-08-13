import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "../../../../lib/auth";
import { listFiscalDocuments } from "../../../../lib/services/fiscalDocumentService";

export async function GET(request: NextRequest) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });

  const tipoParam = request.nextUrl.searchParams.get("tipo");
  const tipo = tipoParam === "NFE" || tipoParam === "CTE" ? tipoParam : undefined;

  const documents = await listFiscalDocuments({ companyId: session.companyId, tipo });
  return NextResponse.json({ documents });
}
