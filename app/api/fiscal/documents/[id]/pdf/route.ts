import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "../../../../../../lib/auth";
import { anexarPdfDocumento, RemessaError } from "../../../../../../lib/services/remessaService";

const MAX_PDF_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB — DANFE/DACTE tipico tem poucas paginas

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });

  const { id } = await context.params;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Envio invalido." }, { status: 400 });
  }

  const file = formData.get("arquivo");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Envie o arquivo PDF do DANFE/DACTE." }, { status: 400 });
  }
  if (file.type && file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json({ error: "O arquivo precisa ser um PDF." }, { status: 400 });
  }
  if (file.size > MAX_PDF_SIZE_BYTES) {
    return NextResponse.json({ error: "Arquivo maior do que o esperado para um DANFE/DACTE." }, { status: 400 });
  }

  const pdfBase64 = Buffer.from(await file.arrayBuffer()).toString("base64");

  try {
    await anexarPdfDocumento({
      companyId: session.companyId,
      documentId: id,
      actorEmail: session.email,
      pdfBase64,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof RemessaError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Nao foi possivel anexar o PDF." }, { status: 500 });
  }
}
