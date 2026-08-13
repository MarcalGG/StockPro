import JSZip from "jszip";
import PDFDocument from "pdfkit";
import type { getRemessaDetail } from "./remessaService";
import { prisma } from "../db";

export class RemessaPackageError extends Error {
  constructor(
    message: string,
    public readonly documentosIncompletos: Array<{ id: string; chaveAcesso: string; tipo: string }>,
  ) {
    super(message);
  }
}

type RemessaDetail = NonNullable<Awaited<ReturnType<typeof getRemessaDetail>>>;

function numeroArquivo(doc: RemessaDetail["documentos"][number]): string {
  return (doc.numero ?? doc.chaveAcesso.slice(-6)).padStart(6, "0");
}

function tipoLabel(tipo: string): string {
  return tipo === "NFE" ? "NF-e" : "CT-e";
}

function formatDateBr(iso: string | null): string {
  if (!iso) return "-";
  return new Intl.DateTimeFormat("pt-BR").format(new Date(iso));
}

function formatCurrency(value: number | null): string {
  if (value === null) return "-";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Gera o PDF de resumo da remessa (nome, periodo, responsavel, listas de
// NF-e/CT-e, chaves de acesso, arquivos disponiveis). Contem SOMENTE dados
// fiscais da remessa — nunca fotos, conferencia fisica, divergencias ou
// inventario, que nem existem neste banco.
export function buildResumoPdf(remessa: RemessaDetail): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: "A4" });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(18).text("Resumo da Remessa para Contabilidade", { align: "left" });
    doc.moveDown(0.5);
    doc.fontSize(11).fillColor("#334155");
    doc.text(`Remessa: ${remessa.nome}`);
    doc.text(
      `Periodo dos documentos: ${formatDateBr(remessa.periodoInicio)} a ${formatDateBr(remessa.periodoFim)}`,
    );
    doc.text(`Criada em: ${formatDateBr(remessa.criadoEm)} por ${remessa.criadoPorEmail}`);
    if (remessa.confirmadaEm) doc.text(`Confirmada em: ${formatDateBr(remessa.confirmadaEm)}`);
    if (remessa.enviadaEm) {
      doc.text(`Marcada como enviada em: ${formatDateBr(remessa.enviadaEm)} por ${remessa.enviadaPorEmail}`);
    }
    if (remessa.observacao) doc.text(`Observacao: ${remessa.observacao}`);
    doc.moveDown();

    const totalNfe = remessa.documentos.filter((d) => d.tipo === "NFE").length;
    const totalCte = remessa.documentos.filter((d) => d.tipo === "CTE").length;
    doc.fontSize(13).fillColor("#0f172a").text("Resumo");
    doc.fontSize(11).fillColor("#334155");
    doc.text(`Total de documentos: ${remessa.documentos.length}`);
    doc.text(`NF-e: ${totalNfe}`);
    doc.text(`CT-e: ${totalCte}`);
    doc.moveDown();

    doc.fontSize(13).fillColor("#0f172a").text("Documentos incluidos");
    doc.moveDown(0.3);
    doc.fontSize(9).fillColor("#334155");
    for (const d of remessa.documentos) {
      doc.text(
        `${tipoLabel(d.tipo)}  n. ${d.numero ?? "-"}  |  ${d.emitenteNome ?? "-"}  |  ` +
          `emissao ${formatDateBr(d.emissao)}  |  valor ${formatCurrency(d.valorTotal)}`,
      );
      doc.text(`  Chave de acesso: ${d.chaveAcesso}`);
      doc.text(`  XML disponivel: ${d.temXml ? "sim" : "nao"}  |  PDF disponivel: ${d.temPdf ? "sim" : "nao"}`);
      doc.moveDown(0.4);
    }

    doc.end();
  });
}

// Monta o .zip da remessa: pastas NFE/ e CTE/ com os XMLs e PDFs
// disponiveis de cada documento, mais o resumo-remessa.pdf na raiz.
// Bloqueia a geracao se algum documento nao tiver NENHUM arquivo (nem XML
// nem PDF) — nesse caso nao ha nada de util para mandar para a
// contabilidade sobre aquele documento.
export async function buildRemessaZip(remessa: RemessaDetail): Promise<Buffer> {
  const semNenhumArquivo = remessa.documentos.filter((d) => !d.temXml && !d.temPdf);
  if (semNenhumArquivo.length > 0) {
    throw new RemessaPackageError(
      "Alguns documentos da remessa nao tem nenhum arquivo (nem XML, nem PDF) disponivel e por isso o pacote nao pode ser gerado.",
      semNenhumArquivo.map((d) => ({ id: d.id, chaveAcesso: d.chaveAcesso, tipo: d.tipo })),
    );
  }

  const zip = new JSZip();
  const dataStr = new Date().toISOString().slice(0, 10);
  const root = zip.folder(`Remessa_Contabilidade_${dataStr}`)!;
  const nfeFolder = root.folder("NFE")!;
  const cteFolder = root.folder("CTE")!;

  for (const doc of remessa.documentos) {
    const folder = doc.tipo === "NFE" ? nfeFolder : cteFolder;
    const prefix = `${tipoLabel(doc.tipo)}_${numeroArquivo(doc)}`;

    if (doc.temXml) {
      const full = await prisma.fiscalDocument.findUnique({ where: { id: doc.id }, select: { xml: true } });
      if (full?.xml) folder.file(`${prefix}_XML.xml`, full.xml);
    }
    if (doc.temPdf) {
      const full = await prisma.fiscalDocument.findUnique({ where: { id: doc.id }, select: { pdfBase64: true } });
      if (full?.pdfBase64) folder.file(`${prefix}_PDF.pdf`, Buffer.from(full.pdfBase64, "base64"));
    }
  }

  const resumoPdf = await buildResumoPdf(remessa);
  root.file("resumo-remessa.pdf", resumoPdf);

  return zip.generateAsync({ type: "nodebuffer" });
}
