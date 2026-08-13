import { NextResponse } from "next/server";
import { requireSession } from "../../../../../lib/auth";
import { prisma } from "../../../../../lib/db";
import { recordTestResult } from "../../../../../lib/services/certificateService";
import { consultarDistribuicaoNFe } from "../../../../../lib/services/nfeDistributionService";
import {
  DistribuicaoCertificateError,
  DistribuicaoConnectionError,
} from "../../../../../lib/services/dfeDistributionCore";
import { logAction } from "../../../../../lib/services/auditLogService";

export async function POST() {
  const session = await requireSession();
  if (!session) return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });

  const [certificate, company] = await Promise.all([
    prisma.certificate.findUnique({ where: { companyId: session.companyId } }),
    prisma.company.findUnique({ where: { id: session.companyId } }),
  ]);

  if (!certificate || !company) {
    return NextResponse.json({ message: "Nenhum certificado configurado." }, { status: 400 });
  }

  if (certificate.validTo && certificate.validTo.getTime() < Date.now()) {
    const message = "O certificado esta vencido.";
    await recordTestResult(session.companyId, "erro", message, "VENCIDO");
    await logAction({
      companyId: session.companyId,
      actorEmail: session.email,
      action: "certificado.teste_conexao",
      detail: { resultado: "erro", motivo: "vencido" },
    });
    return NextResponse.json({ message }, { status: 200 });
  }

  if (!company.ufCodigo) {
    return NextResponse.json(
      { message: "Configure a UF da empresa antes de testar a conexao." },
      { status: 400 },
    );
  }

  if (certificate.certCnpj && certificate.certCnpj !== company.cnpj) {
    const message = "O CNPJ informado nao corresponde ao certificado configurado.";
    await recordTestResult(session.companyId, "erro", message, "ERRO_AUTENTICACAO");
    await logAction({
      companyId: session.companyId,
      actorEmail: session.email,
      action: "certificado.teste_conexao",
      detail: { resultado: "erro", motivo: "cnpj_divergente" },
    });
    return NextResponse.json({ message }, { status: 200 });
  }

  try {
    const result = await consultarDistribuicaoNFe({
      companyId: session.companyId,
      cnpj: company.cnpj,
      cUFAutor: company.ufCodigo,
      ambiente: company.ambiente,
      ultNsu: "0",
    });

    const validoAteFormatado = certificate.validTo
      ? new Intl.DateTimeFormat("pt-BR").format(certificate.validTo)
      : "data desconhecida";
    const message = `Certificado validado com sucesso. Valido ate ${validoAteFormatado}. Resposta da SEFAZ: ${result.statusCode} - ${result.motivo}`;

    await recordTestResult(session.companyId, "sucesso", message, "CONEXAO_VALIDADA");
    await logAction({
      companyId: session.companyId,
      actorEmail: session.email,
      action: "certificado.teste_conexao",
      detail: { resultado: "sucesso", cStat: result.statusCode },
    });

    return NextResponse.json({ message }, { status: 200 });
  } catch (error) {
    let message = "Nao foi possivel conectar ao servico fiscal no momento. Tente novamente mais tarde.";
    let status: "ERRO_CONEXAO" | "ERRO_AUTENTICACAO" = "ERRO_CONEXAO";

    if (error instanceof DistribuicaoCertificateError) {
      message = error.message;
      status = "ERRO_AUTENTICACAO";
    } else if (error instanceof DistribuicaoConnectionError) {
      message = "Nao foi possivel conectar ao servico fiscal no momento. Tente novamente mais tarde.";
      status = "ERRO_CONEXAO";
    }

    await recordTestResult(session.companyId, "erro", message, status);
    await logAction({
      companyId: session.companyId,
      actorEmail: session.email,
      action: "certificado.teste_conexao",
      detail: { resultado: "erro" },
    });

    return NextResponse.json({ message }, { status: 200 });
  }
}
