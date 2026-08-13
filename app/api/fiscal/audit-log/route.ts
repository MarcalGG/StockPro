import { NextResponse } from "next/server";
import { requireSession } from "../../../../lib/auth";
import { listAuditLog } from "../../../../lib/services/auditLogService";

export async function GET() {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });

  const logs = await listAuditLog(session.companyId);
  return NextResponse.json({ logs });
}
