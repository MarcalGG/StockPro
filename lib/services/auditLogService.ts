import { prisma } from "../db";

// Historico tecnico de auditoria. Nunca recebe (e nunca deve receber) senha,
// certificado ou qualquer segredo — so metadados de "o que aconteceu".
export async function logAction(params: {
  companyId?: string | null;
  actorEmail: string;
  action: string;
  detail?: Record<string, unknown>;
}) {
  await prisma.auditLog.create({
    data: {
      companyId: params.companyId ?? null,
      actorEmail: params.actorEmail,
      action: params.action,
      detail: params.detail ? JSON.stringify(params.detail) : null,
    },
  });
}

export async function listAuditLog(companyId: string, limit = 50) {
  const rows = await prisma.auditLog.findMany({
    where: { companyId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return rows.map((row) => ({
    id: row.id,
    actorEmail: row.actorEmail,
    action: row.action,
    detail: row.detail ? (JSON.parse(row.detail) as Record<string, unknown>) : null,
    createdAt: row.createdAt.toISOString(),
  }));
}
