import { prisma } from "../db";
import { consultarDistribuicaoNFe, isNfeDocumentSchema } from "./nfeDistributionService";
import { consultarDistribuicaoCTe, isCteDocumentSchema } from "./cteDistributionService";
import { storeFiscalDocuments } from "./fiscalDocumentService";
import { DistribuicaoCertificateError, DistribuicaoConnectionError } from "./dfeDistributionCore";
import { logAction } from "./auditLogService";

// Evita bater na SEFAZ com frequencia demais (regra 8: "controlar
// consultas... evitar repeticao excessiva"). O manual tecnico recomenda
// evitar chamadas mais frequentes que a cada poucos minutos quando nao ha
// novidade; aqui usamos uma janela conservadora de 5 minutos entre
// sincronizacoes manuais.
const MIN_INTERVAL_MS = 5 * 60 * 1000;

export class SyncTooSoonError extends Error {}

export async function getLastSyncStatus(companyId: string) {
  const lastRun = await prisma.syncRun.findFirst({
    where: { companyId },
    orderBy: { startedAt: "desc" },
  });

  if (!lastRun) {
    return {
      ultimaSincronizacao: null,
      status: "NUNCA_SINCRONIZADO" as const,
      novosDocumentos: 0,
      novasNfe: 0,
      novasCte: 0,
      ultNsu: "0",
      errorMessage: null,
    };
  }

  return {
    ultimaSincronizacao: lastRun.finishedAt?.toISOString() ?? lastRun.startedAt.toISOString(),
    status: lastRun.status,
    novosDocumentos: lastRun.novosDocumentos,
    novasNfe: lastRun.novasNfe,
    novasCte: lastRun.novasCte,
    ultNsu: lastRun.ultNsu ?? "0",
    errorMessage: lastRun.errorMessage,
  };
}

export async function runFiscalSync(params: { companyId: string; actorEmail: string }) {
  const lastRun = await prisma.syncRun.findFirst({
    where: { companyId: params.companyId },
    orderBy: { startedAt: "desc" },
  });

  if (lastRun && Date.now() - lastRun.startedAt.getTime() < MIN_INTERVAL_MS) {
    throw new SyncTooSoonError(
      "Sincronizacao realizada ha pouco tempo. Aguarde alguns minutos antes de buscar novamente.",
    );
  }

  const company = await prisma.company.findUnique({ where: { id: params.companyId } });
  if (!company) throw new Error("Empresa nao encontrada.");
  if (!company.ufCodigo) {
    throw new Error("Configure a UF da empresa antes de sincronizar.");
  }

  const certificate = await prisma.certificate.findUnique({ where: { companyId: params.companyId } });
  if (!certificate) {
    throw new Error("Nenhum certificado configurado.");
  }

  const ultNsuAnterior = lastRun?.ultNsu ?? "0";

  const syncRun = await prisma.syncRun.create({
    data: { companyId: params.companyId, status: "EM_ANDAMENTO" },
  });

  let novasNfe = 0;
  let novasCte = 0;
  let novoUltNsu = ultNsuAnterior;

  try {
    const nfeResult = await consultarDistribuicaoNFe({
      companyId: params.companyId,
      cnpj: company.cnpj,
      cUFAutor: company.ufCodigo,
      ambiente: company.ambiente,
      ultNsu: ultNsuAnterior,
    });

    if (nfeResult.statusCode && !["137", "138", "656"].includes(nfeResult.statusCode) && Number(nfeResult.statusCode) >= 200) {
      // 137/138 = "nenhum documento localizado" (nao e erro); outros
      // codigos >= 200 geralmente indicam rejeicao/erro da SEFAZ.
      throw new Error(`SEFAZ (NF-e) retornou: ${nfeResult.statusCode} - ${nfeResult.motivo}`);
    }

    const nfeDocs = nfeResult.documentos.filter((doc) => isNfeDocumentSchema(doc.schema));
    const nfeStoreResult = await storeFiscalDocuments({
      companyId: params.companyId,
      tipo: "NFE",
      documentos: nfeDocs,
    });
    novasNfe = nfeStoreResult.novos;
    if (nfeResult.ultNsu) novoUltNsu = nfeResult.ultNsu;

    const cteResult = await consultarDistribuicaoCTe({
      companyId: params.companyId,
      cnpj: company.cnpj,
      cUFAutor: company.ufCodigo,
      ambiente: company.ambiente,
      ultNsu: ultNsuAnterior,
    });

    const cteDocs = cteResult.documentos.filter((doc) => isCteDocumentSchema(doc.schema));
    const cteStoreResult = await storeFiscalDocuments({
      companyId: params.companyId,
      tipo: "CTE",
      documentos: cteDocs,
    });
    novasCte = cteStoreResult.novos;

    const novosDocumentos = novasNfe + novasCte;

    await prisma.syncRun.update({
      where: { id: syncRun.id },
      data: {
        status: "CONCLUIDA",
        finishedAt: new Date(),
        novosDocumentos,
        novasNfe,
        novasCte,
        ultNsu: novoUltNsu,
      },
    });

    await logAction({
      companyId: params.companyId,
      actorEmail: params.actorEmail,
      action: "sincronizacao.executada",
      detail: { novosDocumentos, novasNfe, novasCte, ultNsu: novoUltNsu },
    });

    return { novosDocumentos, novasNfe, novasCte, ultNsu: novoUltNsu };
  } catch (error) {
    const message =
      error instanceof DistribuicaoCertificateError || error instanceof DistribuicaoConnectionError
        ? error.message
        : "Nao foi possivel concluir a sincronizacao. Tente novamente mais tarde.";

    await prisma.syncRun.update({
      where: { id: syncRun.id },
      data: { status: "ERRO", finishedAt: new Date(), errorMessage: message },
    });

    await logAction({
      companyId: params.companyId,
      actorEmail: params.actorEmail,
      action: "sincronizacao.erro",
      detail: { motivo: message },
    });

    throw new Error(message);
  }
}
