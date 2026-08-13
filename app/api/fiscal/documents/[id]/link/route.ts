import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "../../../../../../lib/auth";
import { linkDocumentToRecebimento } from "../../../../../../lib/services/fiscalDocumentService";
import { logAction } from "../../../../../../lib/services/auditLogService";

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

  const recebimentoId = typeof (body as { recebimentoId?: unknown })?.recebimentoId === "string"
    ? (body as { recebimentoId: string }).recebimentoId
    : "";

  if (!recebimentoId) {
    return NextResponse.json({ error: "Informe o id do recebimento." }, { status: 400 });
  }

  try {
    await linkDocumentToRecebimento({ companyId: session.companyId, documentId: id, recebimentoId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nao foi possivel vincular o documento.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  await logAction({
    companyId: session.companyId,
    actorEmail: session.email,
    action: "documento.vinculado",
    detail: { documentId: id, recebimentoId },
  });

  return NextResponse.json({ ok: true });
}
