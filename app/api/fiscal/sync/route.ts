import { NextResponse } from "next/server";
import { requireSession } from "../../../../lib/auth";
import { runFiscalSync, getLastSyncStatus, SyncTooSoonError } from "../../../../lib/services/fiscalSyncService";

export async function GET() {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });

  const status = await getLastSyncStatus(session.companyId);
  return NextResponse.json(status);
}

export async function POST() {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });

  try {
    const result = await runFiscalSync({ companyId: session.companyId, actorEmail: session.email });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof SyncTooSoonError) {
      return NextResponse.json({ error: error.message }, { status: 429 });
    }
    const message = error instanceof Error ? error.message : "Nao foi possivel sincronizar.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
