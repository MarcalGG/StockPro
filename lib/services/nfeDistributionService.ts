import { callDistribuicaoDFe, type DistribuicaoResult } from "./dfeDistributionCore";

// Servico "NFeDistribuicaoDFe" (Ambiente Nacional). Endpoints confirmados
// via busca em fontes publicas (repositorio nfephp-org/sped-nfe) —
// reconfirme contra o manual oficial antes de operar em producao.
const ENDPOINTS = {
  PRODUCAO: "https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx",
  HOMOLOGACAO: "https://hom1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx",
} as const;

const NAMESPACE_URI = "http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe";
const SOAP_ACTION = "http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe/nfeDistDFeInteresse";
const OPERATION_NAME = "nfeDistDFeInteresse";

export async function consultarDistribuicaoNFe(params: {
  companyId: string;
  cnpj: string;
  cUFAutor: number;
  ambiente: "PRODUCAO" | "HOMOLOGACAO";
  ultNsu: string;
}): Promise<DistribuicaoResult> {
  return callDistribuicaoDFe({
    companyId: params.companyId,
    endpointUrl: ENDPOINTS[params.ambiente],
    soapActionUrl: SOAP_ACTION,
    namespaceUri: NAMESPACE_URI,
    operationName: OPERATION_NAME,
    cnpj: params.cnpj,
    cUFAutor: params.cUFAutor,
    ambiente: params.ambiente,
    ultNsu: params.ultNsu,
  });
}

// So nos interessam os documentos em si (resumo ou nota completa). Eventos
// (resEvento — cancelamento, carta de correcao etc.) ficam de fora nesta
// fase: o escopo pedido e "somente NF-e e CT-e", nao eventos.
export function isNfeDocumentSchema(schema: string): boolean {
  return schema.startsWith("resNFe") || schema.startsWith("procNFe");
}
