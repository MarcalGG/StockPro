import { callDistribuicaoDFe, type DistribuicaoResult } from "./dfeDistributionCore";

// Servico "CTeDistribuicaoDFe" (Ambiente Nacional do CT-e). Mesma estrutura
// de mensagem do NFeDistribuicaoDFe, mas em endpoint proprio do dominio
// cte.fazenda.gov.br. Segundo fontes publicas consultadas, producao e
// homologacao usam a mesma URL, diferenciadas pelo campo <tpAmb> dentro do
// corpo da mensagem — reconfirme contra o manual oficial antes de operar
// em producao.
const ENDPOINT = "https://www1.cte.fazenda.gov.br/CTeDistribuicaoDFe/CTeDistribuicaoDFe.asmx";

const NAMESPACE_URI = "http://www.portalfiscal.inf.br/cte/wsdl/CTeDistribuicaoDFe";
const SOAP_ACTION = "http://www.portalfiscal.inf.br/cte/wsdl/CTeDistribuicaoDFe/cteDistDFeInteresse";
const OPERATION_NAME = "cteDistDFeInteresse";

export async function consultarDistribuicaoCTe(params: {
  companyId: string;
  cnpj: string;
  cUFAutor: number;
  ambiente: "PRODUCAO" | "HOMOLOGACAO";
  ultNsu: string;
}): Promise<DistribuicaoResult> {
  return callDistribuicaoDFe({
    companyId: params.companyId,
    endpointUrl: ENDPOINT,
    soapActionUrl: SOAP_ACTION,
    namespaceUri: NAMESPACE_URI,
    operationName: OPERATION_NAME,
    cnpj: params.cnpj,
    cUFAutor: params.cUFAutor,
    ambiente: params.ambiente,
    ultNsu: params.ultNsu,
  });
}

export function isCteDocumentSchema(schema: string): boolean {
  return schema.startsWith("resCTe") || schema.startsWith("procCTe");
}
