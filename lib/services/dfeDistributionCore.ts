import https from "node:https";
import zlib from "node:zlib";
import { getDecryptedCertificateForRequest } from "./certificateService";

// Nucleo compartilhado da chamada ao servico de "Distribuicao de DF-e" da
// SEFAZ, usado tanto para NF-e quanto para CT-e (ver nfeDistributionService
// e cteDistributionService, que so trocam o endpoint/namespace).
//
// Endpoints e estrutura confirmados via busca em fontes publicas em
// 2026-08 (manual tecnico da NF-e/CT-e, repositorios open-source
// nfephp-org/sped-nfe e sped-cte). Antes de usar em producao, confirme
// contra o manual oficial vigente na fazenda.gov.br — servicos da SEFAZ
// mudam de tempos em tempos (ja houve pelo menos uma migracao de dominio
// no passado, registrada na Nota Tecnica 2014.002).
//
// IMPORTANTE: esta chamada usa TLS mutuo (mTLS) com o certificado A1 da
// empresa — e assim que a SEFAZ autentica quem esta perguntando. Por isso
// o certificado e a chave privada (em PEM, ja descriptografados so em
// memoria) sao passados como `cert`/`key` da requisicao HTTPS.

export type DistribuicaoDocumento = {
  nsu: string;
  schema: string;
  xml: string;
};

export type DistribuicaoResult = {
  statusCode: string;
  motivo: string;
  ultNsu: string;
  maxNsu: string;
  documentos: DistribuicaoDocumento[];
};

export class DistribuicaoConnectionError extends Error {}
export class DistribuicaoCertificateError extends Error {}

function buildSoapEnvelope(params: {
  namespaceUri: string;
  operationName: string;
  tpAmb: 1 | 2;
  cUFAutor: number;
  cnpj: string;
  ultNsu: string;
}) {
  const ultNsuPadded = params.ultNsu.replace(/\D/g, "").padStart(15, "0").slice(-15);

  return `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <${params.operationName} xmlns="${params.namespaceUri}">
      <nfeDadosMsg>
        <distDFeInt xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01">
          <tpAmb>${params.tpAmb}</tpAmb>
          <cUFAutor>${params.cUFAutor}</cUFAutor>
          <CNPJ>${params.cnpj}</CNPJ>
          <distNSU>
            <ultNSU>${ultNsuPadded}</ultNSU>
          </distNSU>
        </distDFeInt>
      </nfeDadosMsg>
    </${params.operationName}>
  </soap12:Body>
</soap12:Envelope>`;
}

export async function callDistribuicaoDFe(params: {
  companyId: string;
  endpointUrl: string;
  soapActionUrl: string;
  namespaceUri: string;
  operationName: string;
  cnpj: string;
  cUFAutor: number;
  ambiente: "PRODUCAO" | "HOMOLOGACAO";
  ultNsu: string;
}): Promise<DistribuicaoResult> {
  const certificate = await getDecryptedCertificateForRequest(params.companyId);
  if (!certificate) {
    throw new DistribuicaoCertificateError("Nenhum certificado configurado para esta empresa.");
  }
  if (certificate.validTo && certificate.validTo.getTime() < Date.now()) {
    throw new DistribuicaoCertificateError("O certificado esta vencido.");
  }

  const body = buildSoapEnvelope({
    namespaceUri: params.namespaceUri,
    operationName: params.operationName,
    tpAmb: params.ambiente === "PRODUCAO" ? 1 : 2,
    cUFAutor: params.cUFAutor,
    cnpj: params.cnpj.replace(/\D/g, ""),
    ultNsu: params.ultNsu,
  });

  const endpoint = new URL(params.endpointUrl);
  const bodyBuffer = Buffer.from(body, "utf8");

  const responseXml = await new Promise<string>((resolve, reject) => {
    const req = https.request(
      {
        hostname: endpoint.hostname,
        path: endpoint.pathname,
        method: "POST",
        cert: certificate.certPem,
        key: certificate.keyPem,
        headers: {
          "Content-Type": "application/soap+xml; charset=utf-8; action=\"" + params.soapActionUrl + "\"",
          "Content-Length": bodyBuffer.length,
        },
        timeout: 25000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      },
    );
    req.on("error", (error) => {
      reject(new DistribuicaoConnectionError(error.message));
    });
    req.on("timeout", () => {
      req.destroy();
      reject(new DistribuicaoConnectionError("Tempo esgotado ao conectar com o servico fiscal."));
    });
    req.write(bodyBuffer);
    req.end();
  });

  return parseDistribuicaoResponse(responseXml);
}

function parseDistribuicaoResponse(xml: string): DistribuicaoResult {
  const statusCode = xml.match(/<cStat>(\d+)<\/cStat>/)?.[1] ?? "";
  const motivo = xml.match(/<xMotivo>([^<]*)<\/xMotivo>/)?.[1] ?? "";
  const ultNsu = xml.match(/<ultNSU>(\d+)<\/ultNSU>/)?.[1] ?? "0";
  const maxNsu = xml.match(/<maxNSU>(\d+)<\/maxNSU>/)?.[1] ?? "0";

  const documentos: DistribuicaoDocumento[] = [];
  const docZipRegex = /<docZip NSU="(\d+)"\s+schema="([^"]+)">([^<]+)<\/docZip>/g;
  let match: RegExpExecArray | null;
  while ((match = docZipRegex.exec(xml))) {
    const [, nsu, schema, base64Gzip] = match;
    try {
      const xmlDoc = zlib.gunzipSync(Buffer.from(base64Gzip, "base64")).toString("utf8");
      documentos.push({ nsu, schema, xml: xmlDoc });
    } catch {
      // docZip corrompido ou nao decodificavel: ignora este item e segue
    }
  }

  return { statusCode, motivo, ultNsu, maxNsu, documentos };
}
