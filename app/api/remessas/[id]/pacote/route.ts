import { NextResponse } from "next/server";
import { requireSession } from "../../../../../lib/auth";
import { getRemessaDetail } from "../../../../../lib/services/remessaService";
import { buildRemessaZip, RemessaPackageError } from "../../../../../lib/services/remessaPackageService";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });

  const { id } = await context.params;
  const remessa = await getRemessaDetail(session.companyId, id);
  if (!remessa) return NextResponse.json({ error: "Remessa nao encontrada." }, { status: 404 });

  try {
    const zip = await buildRemessaZip(remessa);
    const dataStr = new Date().toISOString().slice(0, 10);
    return new NextResponse(new Uint8Array(zip), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="Remessa_Contabilidade_${dataStr}.zip"`,
      },
    });
  } catch (error) {
    if (error instanceof RemessaPackageError) {
      return NextResponse.json(
        { error: error.message, documentosIncompletos: error.documentosIncompletos },
        { status: 400 },
      );
    }
    console.error("Erro ao gerar pacote da remessa:", error);
    return NextResponse.json({ error: "Nao foi possivel gerar o pacote da remessa." }, { status: 500 });
  }
}
