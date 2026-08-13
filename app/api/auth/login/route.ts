import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/db";
import { createSessionCookie, verifyPassword } from "../../../../lib/auth";
import { logAction } from "../../../../lib/services/auditLogService";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisicao invalido." }, { status: 400 });
  }

  const email = typeof (body as { email?: unknown })?.email === "string" ? (body as { email: string }).email.trim().toLowerCase() : "";
  const password = typeof (body as { password?: unknown })?.password === "string" ? (body as { password: string }).password : "";

  if (!email || !password) {
    return NextResponse.json({ error: "Informe e-mail e senha." }, { status: 400 });
  }

  const user = await prisma.adminUser.findUnique({ where: { email } });
  // Mensagem generica de proposito: nao revela se o e-mail existe ou nao.
  const genericError = NextResponse.json({ error: "E-mail ou senha invalidos." }, { status: 401 });

  if (!user) return genericError;

  const validPassword = await verifyPassword(password, user.passwordHash);
  if (!validPassword) return genericError;

  await createSessionCookie({ userId: user.id, email: user.email, companyId: user.companyId });

  await logAction({
    companyId: user.companyId,
    actorEmail: user.email,
    action: "login.sucesso",
  });

  return NextResponse.json({ email: user.email });
}
