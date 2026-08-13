import { XMLParser } from "fast-xml-parser";
import { prisma } from "../db";

// parseTagValue:false e essencial aqui: sem isso, o fast-xml-parser converte
// automaticamente valores que "parecem numero" (como a propria chave de
// acesso de 44 digitos, ou o CNPJ) para Number — e um numero de 44 digitos
// vira notacao cientifica, corrompendo a chave. Convertemos manualmente so
// os campos que realmente sao numericos (valor total) com toNumber().
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: false,
});

type ParsedSummary = {
  chaveAcesso: string;
  numero: string | null;
  serie: string | null;
  emissao: Date | null;
  emitenteNome: string | null;
  emitenteCnpj: string | null;
  valorTotal: number | null;
  statusFiscal: string | null;
};

function toNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

// Extrai os dados resumidos de um docZip ja descompactado. Aceita tanto o
// formato resumido (resNFe/resCTe) quanto o documento completo
// (procNFe/procCTe), que tem uma estrutura mais profunda.
export function parseFiscalDocumentSummary(
  xml: string,
  tipo: "NFE" | "CTE",
): ParsedSummary | null {
  let parsed: Record<string, unknown>;
  try {
    parsed = parser.parse(xml) as Record<string, unknown>;
  } catch {
    return null;
  }

  // Formato resumido: resNFe / resCTe
  const resKey = tipo === "NFE" ? "resNFe" : "resCTe";
  const res = parsed[resKey] as Record<string, unknown> | undefined;
  if (res) {
    return {
      chaveAcesso: String(res[tipo === "NFE" ? "chNFe" : "chCTe"] ?? ""),
      numero: null,
      serie: null,
      emissao: toDate(res.dhEmi),
      emitenteNome: (res.xNome as string) ?? null,
      emitenteCnpj: (res.CNPJ as string) ?? null,
      valorTotal: toNumber(res[tipo === "NFE" ? "vNF" : "vCT"]),
      statusFiscal: res[tipo === "NFE" ? "cSitNFe" : "cSitCTe"]
        ? String(res[tipo === "NFE" ? "cSitNFe" : "cSitCTe"])
        : null,
    };
  }

  // Formato completo: procNFe (NFe + protocolo) ou procCTe (CTe + protocolo)
  const procKey = tipo === "NFE" ? "nfeProc" : "cteProc";
  const proc = parsed[procKey] as Record<string, unknown> | undefined;
  if (proc) {
    const docRoot = proc[tipo === "NFE" ? "NFe" : "CTe"] as Record<string, unknown> | undefined;
    const infDoc = docRoot?.[tipo === "NFE" ? "infNFe" : "infCte"] as
      | Record<string, unknown>
      | undefined;
    if (!infDoc) return null;

    const ide = infDoc.ide as Record<string, unknown> | undefined;
    const emit = infDoc.emit as Record<string, unknown> | undefined;
    const total = infDoc.total as Record<string, unknown> | undefined;
    const icmsTot = total?.ICMSTot as Record<string, unknown> | undefined;
    const idAttr = String(infDoc["@_Id"] ?? "");
    const chave = idAttr.replace(/\D/g, "").slice(-44);

    return {
      chaveAcesso: chave,
      numero: ide?.nNF ? String(ide.nNF) : ide?.nCT ? String(ide.nCT) : null,
      serie: ide?.serie ? String(ide.serie) : null,
      emissao: toDate(ide?.dhEmi),
      emitenteNome: (emit?.xNome as string) ?? null,
      emitenteCnpj: (emit?.CNPJ as string) ?? null,
      valorTotal: toNumber(icmsTot?.vNF ?? total?.vTPrest),
      statusFiscal: null,
    };
  }

  return null;
}

// Grava documentos sem duplicar pela chave de acesso (unique por
// empresa+chave no schema). Retorna quantos eram realmente novos.
export async function storeFiscalDocuments(params: {
  companyId: string;
  tipo: "NFE" | "CTE";
  documentos: Array<{ xml: string; schema: string }>;
}): Promise<{ novos: number }> {
  let novos = 0;

  for (const doc of params.documentos) {
    const summary = parseFiscalDocumentSummary(doc.xml, params.tipo);
    if (!summary || summary.chaveAcesso.length !== 44) continue;

    const existing = await prisma.fiscalDocument.findUnique({
      where: {
        companyId_chaveAcesso: {
          companyId: params.companyId,
          chaveAcesso: summary.chaveAcesso,
        },
      },
    });
    if (existing) continue; // ja importado antes — nao duplica

    await prisma.fiscalDocument.create({
      data: {
        companyId: params.companyId,
        tipo: params.tipo,
        chaveAcesso: summary.chaveAcesso,
        numero: summary.numero,
        serie: summary.serie,
        emissao: summary.emissao,
        emitenteNome: summary.emitenteNome,
        emitenteCnpj: summary.emitenteCnpj,
        valorTotal: summary.valorTotal,
        statusFiscal: summary.statusFiscal,
        xml: doc.schema.startsWith("proc") ? doc.xml : null,
        origem: "SEFAZ via certificado A1",
      },
    });
    novos++;
  }

  return { novos };
}

export async function listFiscalDocuments(params: {
  companyId: string;
  tipo?: "NFE" | "CTE";
  limit?: number;
}) {
  const documents = await prisma.fiscalDocument.findMany({
    where: { companyId: params.companyId, tipo: params.tipo },
    orderBy: { importadoEm: "desc" },
    take: params.limit ?? 100,
  });

  return documents.map((doc) => ({
    id: doc.id,
    tipo: doc.tipo,
    chaveAcesso: doc.chaveAcesso,
    numero: doc.numero,
    serie: doc.serie,
    emissao: doc.emissao?.toISOString() ?? null,
    emitenteNome: doc.emitenteNome,
    emitenteCnpj: doc.emitenteCnpj,
    valorTotal: doc.valorTotal,
    statusFiscal: doc.statusFiscal,
    origem: doc.origem,
    importadoEm: doc.importadoEm.toISOString(),
    vinculadoRecebimentoId: doc.vinculadoRecebimentoId,
    temXmlCompleto: Boolean(doc.xml),
  }));
}

export async function findFiscalDocumentByChave(companyId: string, chaveAcesso: string) {
  const doc = await prisma.fiscalDocument.findUnique({
    where: { companyId_chaveAcesso: { companyId, chaveAcesso } },
  });
  if (!doc) return null;

  return {
    id: doc.id,
    tipo: doc.tipo,
    chaveAcesso: doc.chaveAcesso,
    numero: doc.numero,
    serie: doc.serie,
    emitenteNome: doc.emitenteNome,
    emitenteCnpj: doc.emitenteCnpj,
    vinculadoRecebimentoId: doc.vinculadoRecebimentoId,
  };
}

export async function linkDocumentToRecebimento(params: {
  companyId: string;
  documentId: string;
  recebimentoId: string;
}) {
  const doc = await prisma.fiscalDocument.findFirst({
    where: { id: params.documentId, companyId: params.companyId },
  });
  if (!doc) {
    throw new Error("Documento nao encontrado.");
  }
  if (doc.vinculadoRecebimentoId && doc.vinculadoRecebimentoId !== params.recebimentoId) {
    throw new Error("Este documento ja esta vinculado a outro recebimento.");
  }

  await prisma.fiscalDocument.update({
    where: { id: doc.id },
    data: { vinculadoRecebimentoId: params.recebimentoId },
  });
}
