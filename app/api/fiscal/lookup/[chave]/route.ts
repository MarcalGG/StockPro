import { NextResponse } from "next/server";
import { requireSession } from "../../../../../lib/auth";
import { findFiscalDocumentByChave } from "../../../../../lib/services/fiscalDocumentService";

// Usado pela tela de Recebimento: ao ler/digitar uma chave, o app pergunta
// aqui se ja existe um documento sincronizado correspondente. Nunca
// bloqueia o recebimento manual — se der erro ou nao autenticado, quem
// chama deve simplesmente seguir sem os dados automaticos (regra: "nao
// bloquear o recebimento manual caso a SEFAZ esteja indisponivel").
export async function GET(_request: Request, context: { params: Promise<{ chave: string }> }) {
  const session = await requireSession();
  if (!session) {
    // Sem sessao administrativa configurada: o recebimento continua
    // funcionando normalmente, so sem o vinculo automatico.
    return NextResponse.json({ status: "INDISPONIVEL" }, { status: 200 });
  }

  const { chave } = await context.params;
  const digits = chave.replace(/\D/g, "");

  if (digits.length !== 44 || !isValidChecksum(digits)) {
    return NextResponse.json({ status: "CHAVE_INVALIDA" }, { status: 200 });
  }

  const modelo = digits.slice(20, 22);
  const tipoEsperado = modelo === "55" ? "NFE" : modelo === "57" ? "CTE" : null;
  if (!tipoEsperado) {
    return NextResponse.json({ status: "CHAVE_INVALIDA" }, { status: 200 });
  }

  const documento = await findFiscalDocumentByChave(session.companyId, digits);

  if (!documento) {
    return NextResponse.json({ status: "NAO_SINCRONIZADO", tipo: tipoEsperado }, { status: 200 });
  }

  if (documento.vinculadoRecebimentoId) {
    return NextResponse.json(
      {
        status: "JA_VINCULADO",
        tipo: documento.tipo,
        vinculadoRecebimentoId: documento.vinculadoRecebimentoId,
      },
      { status: 200 },
    );
  }

  return NextResponse.json(
    {
      status: "LOCALIZADO",
      documentId: documento.id,
      tipo: documento.tipo,
      numero: documento.numero,
      serie: documento.serie,
      emitenteNome: documento.emitenteNome,
      emitenteCnpj: documento.emitenteCnpj,
    },
    { status: 200 },
  );
}

function isValidChecksum(key44: string): boolean {
  const weights = [2, 3, 4, 5, 6, 7, 8, 9];
  let sum = 0;
  let weightIndex = 0;
  const first43 = key44.slice(0, 43);
  for (let i = first43.length - 1; i >= 0; i--) {
    sum += Number(first43[i]) * weights[weightIndex % weights.length];
    weightIndex++;
  }
  const remainder = sum % 11;
  const expectedDv = remainder < 2 ? 0 : 11 - remainder;
  return expectedDv === Number(key44[43]);
}
