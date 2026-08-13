import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "../../../../lib/auth";
import {
  getCertificateStatus,
  saveCertificate,
  removeCertificate,
  CertificatePasswordError,
  CertificateFormatError,
} from "../../../../lib/services/certificateService";
import { logAction } from "../../../../lib/services/auditLogService";

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB — certificados A1 sao pequenos (poucos KB)

export async function GET() {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });

  const status = await getCertificateStatus(session.companyId);
  return NextResponse.json(status);
}

export async function POST(request: NextRequest) {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Envio invalido." }, { status: 400 });
  }

  const file = formData.get("arquivo");
  const razaoSocial = String(formData.get("razaoSocial") ?? "").trim();
  const cnpj = String(formData.get("cnpj") ?? "").replace(/\D/g, "");
  const ufCodigo = Number(formData.get("ufCodigo"));
  const ambiente = String(formData.get("ambiente") ?? "");
  const password = String(formData.get("senha") ?? "");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Envie o arquivo do certificado (.pfx ou .p12)." }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json({ error: "Arquivo maior do que o esperado para um certificado A1." }, { status: 400 });
  }
  if (!razaoSocial) {
    return NextResponse.json({ error: "Informe a razao social." }, { status: 400 });
  }
  if (cnpj.length !== 14) {
    return NextResponse.json({ error: "CNPJ invalido — precisa ter 14 digitos." }, { status: 400 });
  }
  if (!Number.isFinite(ufCodigo) || ufCodigo <= 0) {
    return NextResponse.json({ error: "Selecione a UF da empresa." }, { status: 400 });
  }
  if (ambiente !== "PRODUCAO" && ambiente !== "HOMOLOGACAO") {
    return NextResponse.json({ error: "Ambiente invalido." }, { status: 400 });
  }
  if (!password) {
    return NextResponse.json({ error: "Informe a senha do certificado." }, { status: 400 });
  }

  const pfxBuffer = Buffer.from(await file.arrayBuffer());

  try {
    const result = await saveCertificate({
      companyId: session.companyId,
      razaoSocial,
      cnpj,
      ufCodigo,
      ambiente,
      pfxBuffer,
      password,
      uploadedByEmail: session.email,
    });

    await logAction({
      companyId: session.companyId,
      actorEmail: session.email,
      action: "certificado.configurado",
      detail: { validoAte: result.validTo.toISOString() },
    });

    return NextResponse.json({
      status: result.status,
      validTo: result.validTo.toISOString(),
      subjectCn: result.subjectCn,
    });
  } catch (error) {
    if (error instanceof CertificatePasswordError) {
      await logAction({
        companyId: session.companyId,
        actorEmail: session.email,
        action: "certificado.erro_upload",
        detail: { motivo: "senha_incorreta" },
      });
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof CertificateFormatError) {
      await logAction({
        companyId: session.companyId,
        actorEmail: session.email,
        action: "certificado.erro_upload",
        detail: { motivo: "formato_invalido" },
      });
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Nunca vazar detalhes internos (stack trace, caminho de arquivo etc.)
    return NextResponse.json(
      { error: "Nao foi possivel salvar o certificado. Tente novamente." },
      { status: 500 },
    );
  } finally {
    pfxBuffer.fill(0); // limpa o buffer com os bytes do certificado da memoria assim que possivel
  }
}

export async function DELETE() {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });

  await removeCertificate(session.companyId);
  await logAction({
    companyId: session.companyId,
    actorEmail: session.email,
    action: "certificado.removido",
  });

  return NextResponse.json({ ok: true });
}
