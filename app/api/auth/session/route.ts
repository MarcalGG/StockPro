import { NextResponse } from "next/server";
import { requireSession } from "../../../../lib/auth";

export async function GET() {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ authenticated: false }, { status: 200 });
  }
  return NextResponse.json({ authenticated: true, email: session.email });
}
