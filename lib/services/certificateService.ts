import forge from "node-forge";
import { prisma } from "../db";
import { encryptSecret, decryptSecret } from "../crypto";

export type CertificateStatusValue =
  | "NAO_CONFIGURADO"
  | "CONFIGURADO"
  | "CONEXAO_VALIDADA"
  | "PROXIMO_DO_VENCIMENTO"
  | "VENCIDO"
  | "ERRO_AUTENTICACAO"
  | "ERRO_CONEXAO";

export class CertificatePasswordError extends Error {}
export class CertificateFormatError extends Error {}

type ParsedCertificate = {
  certPem: string;
  keyPem: string;
  subjectCn: string;
  cnpjFromCertificate: string | null;
  validFrom: Date;
  validTo: Date;
};

// Le o arquivo .pfx/.p12 usando a senha (SO em memoria, nunca gravada) e
// extrai o certificado + chave privada em PEM. A partir daqui a senha
// original nao e mais necessaria — quem usa o certificado depois usa o PEM
// criptografado com a NOSSA chave (CERT_ENCRYPTION_KEY), nunca a senha
// original do arquivo.
export function parsePfxCertificate(pfxBuffer: Buffer, password: string): ParsedCertificate {
  let p12: forge.pkcs12.Pkcs12Pfx;
  try {
    const p12Asn1 = forge.asn1.fromDer(forge.util.createBuffer(pfxBuffer.toString("binary")));
    p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password);
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    if (message.includes("mac") || message.includes("password") || message.includes("invalid")) {
      throw new CertificatePasswordError("A senha do certificado esta incorreta.");
    }
    throw new CertificateFormatError(
      "Nao foi possivel ler o arquivo. Confira se e um certificado .pfx ou .p12 valido.",
    );
  }

  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
  const certBag = certBags[forge.pki.oids.certBag]?.[0];
  if (!certBag?.cert) {
    throw new CertificateFormatError("Nenhum certificado encontrado dentro do arquivo.");
  }

  const shroudedKeyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
  const plainKeyBags = p12.getBags({ bagType: forge.pki.oids.keyBag });
  const keyBag = shroudedKeyBags[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0] ?? plainKeyBags[forge.pki.oids.keyBag]?.[0];
  if (!keyBag?.key) {
    throw new CertificateFormatError("Nenhuma chave privada encontrada dentro do arquivo.");
  }

  const cert = certBag.cert;
  const certPem = forge.pki.certificateToPem(cert);
  const keyPem = forge.pki.privateKeyToPem(keyBag.key as forge.pki.PrivateKey);

  const cnField = cert.subject.getField("CN");
  const subjectCn = cnField?.value ?? "";
  const cnpjMatch = subjectCn.match(/(\d{14})/);

  return {
    certPem,
    keyPem,
    subjectCn,
    cnpjFromCertificate: cnpjMatch ? cnpjMatch[1] : null,
    validFrom: cert.validity.notBefore,
    validTo: cert.validity.notAfter,
  };
}

function computeStatus(validTo: Date): CertificateStatusValue {
  const now = new Date();
  const daysToExpire = (validTo.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  if (daysToExpire < 0) return "VENCIDO";
  if (daysToExpire <= 60) return "PROXIMO_DO_VENCIMENTO";
  return "CONFIGURADO";
}

export async function saveCertificate(params: {
  companyId: string;
  razaoSocial: string;
  cnpj: string;
  ufCodigo: number;
  ambiente: "PRODUCAO" | "HOMOLOGACAO";
  pfxBuffer: Buffer;
  password: string;
  uploadedByEmail: string;
}) {
  const parsed = parsePfxCertificate(params.pfxBuffer, params.password);

  const cnpjDigits = params.cnpj.replace(/\D/g, "");
  if (
    parsed.cnpjFromCertificate &&
    parsed.cnpjFromCertificate !== cnpjDigits
  ) {
    throw new CertificateFormatError(
      "O CNPJ informado nao corresponde ao certificado configurado.",
    );
  }

  const status = computeStatus(parsed.validTo);

  await prisma.company.update({
    where: { id: params.companyId },
    data: {
      razaoSocial: params.razaoSocial,
      cnpj: cnpjDigits,
      ufCodigo: params.ufCodigo,
      ambiente: params.ambiente,
    },
  });

  const encryptedCertPem = encryptSecret(parsed.certPem);
  const encryptedKeyPem = encryptSecret(parsed.keyPem);

  await prisma.certificate.upsert({
    where: { companyId: params.companyId },
    create: {
      companyId: params.companyId,
      status,
      encryptedCertPem,
      encryptedKeyPem,
      subjectCn: parsed.subjectCn,
      certCnpj: parsed.cnpjFromCertificate,
      validFrom: parsed.validFrom,
      validTo: parsed.validTo,
      uploadedByEmail: params.uploadedByEmail,
    },
    update: {
      status,
      encryptedCertPem,
      encryptedKeyPem,
      subjectCn: parsed.subjectCn,
      certCnpj: parsed.cnpjFromCertificate,
      validFrom: parsed.validFrom,
      validTo: parsed.validTo,
      uploadedByEmail: params.uploadedByEmail,
      uploadedAt: new Date(),
      lastTestedAt: null,
      lastTestResult: null,
      lastTestMessage: null,
    },
  });

  // "parsed" (com o PEM em texto puro) sai de escopo aqui e vira lixo de
  // memoria — nada dele foi gravado sem criptografia.
  return { status, validTo: parsed.validTo, subjectCn: parsed.subjectCn };
}

export async function removeCertificate(companyId: string) {
  await prisma.certificate.deleteMany({ where: { companyId } });
}

// Retorna SOMENTE metadados — nunca o PEM criptografado, nunca senha.
export async function getCertificateStatus(companyId: string) {
  const certificate = await prisma.certificate.findUnique({ where: { companyId } });
  if (!certificate) {
    return { status: "NAO_CONFIGURADO" as CertificateStatusValue };
  }

  // O prazo de validade manda quando indica vencido/proximo do vencimento
  // (fato objetivo, sempre verdadeiro). Fora isso, mostra o status
  // guardado, que reflete o resultado do ultimo teste de conexao
  // (configurado / conexao validada / erro de autenticacao / erro de
  // conexao) — sem isso, um teste que deu erro voltaria a aparecer como
  // "configurado" so por ainda estar dentro da validade.
  const expiryStatus = certificate.validTo ? computeStatus(certificate.validTo) : null;
  const status: CertificateStatusValue =
    expiryStatus === "VENCIDO" || expiryStatus === "PROXIMO_DO_VENCIMENTO"
      ? expiryStatus
      : certificate.status;

  return {
    status,
    subjectCn: certificate.subjectCn,
    validFrom: certificate.validFrom?.toISOString() ?? null,
    validTo: certificate.validTo?.toISOString() ?? null,
    uploadedByEmail: certificate.uploadedByEmail,
    uploadedAt: certificate.uploadedAt.toISOString(),
    lastTestedAt: certificate.lastTestedAt?.toISOString() ?? null,
    lastTestResult: certificate.lastTestResult,
    lastTestMessage: certificate.lastTestMessage,
  };
}

// Usado internamente pelos servicos de distribuicao DF-e (nfe/cte) para
// pegar o certificado ja decriptografado, SOMENTE em memoria, durante a
// chamada a SEFAZ. Nunca expor o retorno desta funcao numa resposta de API.
export async function getDecryptedCertificateForRequest(companyId: string) {
  const certificate = await prisma.certificate.findUnique({ where: { companyId } });
  if (!certificate) return null;

  return {
    certPem: decryptSecret(certificate.encryptedCertPem),
    keyPem: decryptSecret(certificate.encryptedKeyPem),
    validTo: certificate.validTo,
  };
}

export async function recordTestResult(
  companyId: string,
  result: "sucesso" | "erro",
  message: string,
  status: CertificateStatusValue,
) {
  await prisma.certificate.update({
    where: { companyId },
    data: {
      status,
      lastTestedAt: new Date(),
      lastTestResult: result,
      lastTestMessage: message,
    },
  });
}
