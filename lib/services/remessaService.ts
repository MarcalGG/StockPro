import { prisma } from "../db";
import { logAction } from "./auditLogService";

export class RemessaError extends Error {}

function formatNomeRemessa(date: Date): string {
  const formatted = new Intl.DateTimeFormat("pt-BR").format(date);
  return `Remessa Contabilidade — ${formatted}`;
}

// Um documento fiscal so aparece como "pronto para envio" enquanto nao
// estiver vinculado a nenhuma remessa (rascunho ou confirmada). Assim que
// entra numa remessa (mesmo rascunho), some desta lista — e a garantia de
// que o mesmo documento nunca fica em duas remessas ativas ao mesmo tempo.
export async function listDocumentosDisponiveis(companyId: string) {
  const documentos = await prisma.fiscalDocument.findMany({
    where: { companyId, remessaId: null },
    orderBy: { emissao: "desc" },
  });

  return documentos.map(toDocumentoResumo);
}

function toDocumentoResumo(doc: {
  id: string;
  tipo: string;
  chaveAcesso: string;
  numero: string | null;
  serie: string | null;
  emissao: Date | null;
  emitenteNome: string | null;
  emitenteCnpj: string | null;
  valorTotal: number | null;
  xml: string | null;
  pdfBase64: string | null;
  pdfUploadedAt: Date | null;
  remessaId: string | null;
}) {
  return {
    id: doc.id,
    tipo: doc.tipo as "NFE" | "CTE",
    chaveAcesso: doc.chaveAcesso,
    numero: doc.numero,
    serie: doc.serie,
    emissao: doc.emissao?.toISOString() ?? null,
    emitenteNome: doc.emitenteNome,
    emitenteCnpj: doc.emitenteCnpj,
    valorTotal: doc.valorTotal,
    temXml: Boolean(doc.xml),
    temPdf: Boolean(doc.pdfBase64),
    pdfUploadedAt: doc.pdfUploadedAt?.toISOString() ?? null,
    remessaId: doc.remessaId,
  };
}

// Cria a remessa e, na mesma transacao, vincula os documentos escolhidos —
// evita que dois administradores criem remessas concorrentes com o mesmo
// documento (o "where remessaId: null" dentro do updateMany so afeta linhas
// que ainda estiverem livres nesse instante).
export async function createRemessa(params: {
  companyId: string;
  actorEmail: string;
  documentIds: string[];
  observacao?: string | null;
  confirmar: boolean; // true = "Confirmar remessa" (PRONTA), false = "Salvar como rascunho" (RASCUNHO)
}) {
  const { companyId, actorEmail, documentIds, observacao, confirmar } = params;

  if (documentIds.length === 0) {
    throw new RemessaError("Selecione ao menos um documento para criar a remessa.");
  }

  const result = await prisma.$transaction(async (tx) => {
    const documentos = await tx.fiscalDocument.findMany({
      where: { id: { in: documentIds }, companyId, remessaId: null },
    });

    if (documentos.length !== documentIds.length) {
      throw new RemessaError(
        "Um ou mais documentos selecionados nao estao mais disponiveis (podem ja ter entrado em outra remessa).",
      );
    }

    const naoNfeOuCte = documentos.filter((d) => d.tipo !== "NFE" && d.tipo !== "CTE");
    if (naoNfeOuCte.length > 0) {
      throw new RemessaError("A remessa so pode conter documentos NF-e ou CT-e.");
    }

    const datas = documentos.map((d) => d.emissao).filter((d): d is Date => d !== null);
    const periodoInicio = datas.length ? new Date(Math.min(...datas.map((d) => d.getTime()))) : null;
    const periodoFim = datas.length ? new Date(Math.max(...datas.map((d) => d.getTime()))) : null;

    const now = new Date();
    const remessa = await tx.remessa.create({
      data: {
        companyId,
        nome: formatNomeRemessa(now),
        status: confirmar ? "PRONTA" : "RASCUNHO",
        observacao: observacao || null,
        periodoInicio,
        periodoFim,
        criadoPorEmail: actorEmail,
        confirmadaEm: confirmar ? now : null,
      },
    });

    const update = await tx.fiscalDocument.updateMany({
      where: { id: { in: documentIds }, companyId, remessaId: null },
      data: { remessaId: remessa.id },
    });

    if (update.count !== documentIds.length) {
      // Alguem levou um dos documentos entre o findMany e o updateMany acima.
      throw new RemessaError(
        "Um ou mais documentos selecionados foram incluidos em outra remessa nesse meio-tempo. Tente novamente.",
      );
    }

    return remessa;
  });

  await logAction({
    companyId,
    actorEmail,
    action: confirmar ? "remessa.criada_confirmada" : "remessa.criada_rascunho",
    detail: { remessaId: result.id, documentos: documentIds.length },
  });

  return result;
}

export async function getRemessaDetail(companyId: string, remessaId: string) {
  const remessa = await prisma.remessa.findFirst({
    where: { id: remessaId, companyId },
    include: { documentos: { orderBy: { emissao: "desc" } } },
  });
  if (!remessa) return null;

  return {
    id: remessa.id,
    nome: remessa.nome,
    status: remessa.status,
    observacao: remessa.observacao,
    periodoInicio: remessa.periodoInicio?.toISOString() ?? null,
    periodoFim: remessa.periodoFim?.toISOString() ?? null,
    criadoPorEmail: remessa.criadoPorEmail,
    criadoEm: remessa.criadoEm.toISOString(),
    confirmadaEm: remessa.confirmadaEm?.toISOString() ?? null,
    enviadaEm: remessa.enviadaEm?.toISOString() ?? null,
    enviadaPorEmail: remessa.enviadaPorEmail,
    canceladaEm: remessa.canceladaEm?.toISOString() ?? null,
    motivoCancelamento: remessa.motivoCancelamento,
    totalDocumentos: remessa.documentos.length,
    totalNfe: remessa.documentos.filter((d) => d.tipo === "NFE").length,
    totalCte: remessa.documentos.filter((d) => d.tipo === "CTE").length,
    documentos: remessa.documentos.map(toDocumentoResumo),
  };
}

export async function listRemessas(companyId: string) {
  const remessas = await prisma.remessa.findMany({
    where: { companyId },
    include: { documentos: true },
    orderBy: { criadoEm: "desc" },
  });

  return remessas.map((r) => ({
    id: r.id,
    nome: r.nome,
    status: r.status,
    periodoInicio: r.periodoInicio?.toISOString() ?? null,
    periodoFim: r.periodoFim?.toISOString() ?? null,
    criadoPorEmail: r.criadoPorEmail,
    criadoEm: r.criadoEm.toISOString(),
    enviadaEm: r.enviadaEm?.toISOString() ?? null,
    totalDocumentos: r.documentos.length,
    totalNfe: r.documentos.filter((d) => d.tipo === "NFE").length,
    totalCte: r.documentos.filter((d) => d.tipo === "CTE").length,
  }));
}

export async function confirmarRemessa(companyId: string, remessaId: string, actorEmail: string) {
  const remessa = await prisma.remessa.findFirst({ where: { id: remessaId, companyId } });
  if (!remessa) throw new RemessaError("Remessa nao encontrada.");
  if (remessa.status !== "RASCUNHO") {
    throw new RemessaError("So e possivel confirmar uma remessa que esteja em rascunho.");
  }

  const updated = await prisma.remessa.update({
    where: { id: remessaId },
    data: { status: "PRONTA", confirmadaEm: new Date() },
  });

  await logAction({
    companyId,
    actorEmail,
    action: "remessa.confirmada",
    detail: { remessaId },
  });

  return updated;
}

export async function cancelarRemessa(
  companyId: string,
  remessaId: string,
  actorEmail: string,
  motivo: string,
) {
  if (!motivo.trim()) {
    throw new RemessaError("Informe o motivo do cancelamento.");
  }

  const remessa = await prisma.remessa.findFirst({ where: { id: remessaId, companyId } });
  if (!remessa) throw new RemessaError("Remessa nao encontrada.");
  if (remessa.status !== "RASCUNHO" && remessa.status !== "PRONTA") {
    throw new RemessaError("So e possivel cancelar uma remessa em rascunho ou pronta para envio.");
  }

  await prisma.$transaction([
    prisma.fiscalDocument.updateMany({
      where: { remessaId },
      data: { remessaId: null },
    }),
    prisma.remessa.update({
      where: { id: remessaId },
      data: {
        status: "CANCELADA",
        canceladaEm: new Date(),
        motivoCancelamento: motivo.trim(),
      },
    }),
  ]);

  await logAction({
    companyId,
    actorEmail,
    action: "remessa.cancelada",
    detail: { remessaId, motivo: motivo.trim() },
  });
}

export async function marcarComoEnviada(companyId: string, remessaId: string, actorEmail: string) {
  const remessa = await prisma.remessa.findFirst({
    where: { id: remessaId, companyId },
    include: { documentos: true },
  });
  if (!remessa) throw new RemessaError("Remessa nao encontrada.");
  if (remessa.status !== "PRONTA") {
    throw new RemessaError("So e possivel marcar como enviada uma remessa pronta para envio.");
  }

  // So conta como "pendencia" a falta do XML — o arquivo fiscal em si. A
  // falta de PDF nao entra aqui: o servico de Distribuicao de DF-e da SEFAZ
  // nunca fornece PDF (so XML), entao exigir PDF sempre marcaria quase toda
  // remessa como "com pendencias" mesmo quando esta tecnicamente completa.
  const incompletos = remessa.documentos.filter((d) => !d.xml);
  const status = incompletos.length > 0 ? "ENVIADA_COM_PENDENCIAS" : "ENVIADA";
  const now = new Date();

  const updated = await prisma.remessa.update({
    where: { id: remessaId },
    data: { status, enviadaEm: now, enviadaPorEmail: actorEmail },
  });

  await logAction({
    companyId,
    actorEmail,
    action: "remessa.marcada_enviada",
    detail: { remessaId, status, documentosIncompletos: incompletos.length },
  });

  return updated;
}

// PDF anexado manualmente (o servico de Distribuicao de DF-e da SEFAZ so
// devolve XML — nao ha PDF/DANFE nesse fluxo). So permitido enquanto o
// documento nao estiver preso a uma remessa ja enviada.
export async function anexarPdfDocumento(params: {
  companyId: string;
  documentId: string;
  actorEmail: string;
  pdfBase64: string;
}) {
  const doc = await prisma.fiscalDocument.findFirst({
    where: { id: params.documentId, companyId: params.companyId },
    include: { remessa: true },
  });
  if (!doc) throw new RemessaError("Documento nao encontrado.");
  if (doc.remessa && (doc.remessa.status === "ENVIADA" || doc.remessa.status === "ENVIADA_COM_PENDENCIAS")) {
    throw new RemessaError("Este documento ja pertence a uma remessa enviada e nao pode mais ser alterado.");
  }

  await prisma.fiscalDocument.update({
    where: { id: doc.id },
    data: { pdfBase64: params.pdfBase64, pdfUploadedAt: new Date() },
  });

  await logAction({
    companyId: params.companyId,
    actorEmail: params.actorEmail,
    action: "documento.pdf_anexado",
    detail: { documentId: doc.id },
  });
}
