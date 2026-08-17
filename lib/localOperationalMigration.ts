// Migracao (opcional, sob confirmacao explicita do usuario) dos dados
// operacionais gravados no localStorage ANTES de existir login com Google —
// as 5 chaves legadas fixas, sem dono, usadas pelo app quando ele nao tinha
// autenticacao nenhuma.
//
// Regras (decisao do usuario, nao alterar sem pedir de novo):
// - nunca migrar automaticamente: sempre perguntar, com a quantidade de
//   itens detectada, e permitir "Ignorar";
// - a copia para o namespace do usuario NUNCA apaga o original — e um
//   snapshot, nao uma mudanca ("mover"). O dado legado continua ali;
// - idempotente: rodar a migracao mais de uma vez para o mesmo UID nao
//   duplica nada (marca gravada em stockpro:legacy-migration:<uid>).
import { LEGACY_KEY_BY_SUFFIX, LEGACY_KEYS } from "./localOperationalStore";

export type LegacyDataSummary = {
  hasAnyData: boolean;
  recebimentoAtual: boolean;
  recebimentos: number;
  inventarios: number;
  documentosFiscais: number;
  remessas: number;
};

function readLegacyRaw(key: string): unknown[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function hasLegacyValue(key: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    return parsed !== null && parsed !== undefined;
  } catch {
    return false;
  }
}

// Marca de decisao por UID: uma vez que o usuario migrou OU ignorou, nao
// perguntamos de novo nas proximas vezes que essa mesma conta logar neste
// navegador.
function decisionKey(uid: string) {
  return `stockpro:legacy-migration:${uid}`;
}

export function hasResolvedLegacyData(uid: string): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(decisionKey(uid)) !== null;
  } catch {
    return true;
  }
}

export function detectLegacyData(): LegacyDataSummary {
  const recebimentoAtual = hasLegacyValue(LEGACY_KEYS.CURRENT_RECEIVING);
  const recebimentos = (readLegacyRaw(LEGACY_KEYS.RECEIVING_RECORDS) ?? []).length;
  const inventarios = (readLegacyRaw(LEGACY_KEYS.INVENTORY_RECORDS) ?? []).length;
  const documentosFiscais = (readLegacyRaw(LEGACY_KEYS.FISCAL_DOCUMENTS) ?? []).length;
  const remessas = (readLegacyRaw(LEGACY_KEYS.ACCOUNTING_SHIPMENTS) ?? []).length;

  return {
    hasAnyData:
      recebimentoAtual || recebimentos > 0 || inventarios > 0 || documentosFiscais > 0 || remessas > 0,
    recebimentoAtual,
    recebimentos,
    inventarios,
    documentosFiscais,
    remessas,
  };
}

// Copia (nunca apaga) cada chave legada presente para o namespace do UID.
// Idempotente: se essa conta ja tiver decidido antes, nao faz nada de novo.
export function migrateLegacyDataToUser(uid: string): void {
  if (typeof window === "undefined") return;
  if (hasResolvedLegacyData(uid)) return;

  for (const [suffix, legacyKey] of Object.entries(LEGACY_KEY_BY_SUFFIX)) {
    try {
      const raw = window.localStorage.getItem(legacyKey);
      if (raw === null) continue;
      const targetKey = `stockpro:user:${uid}:${suffix}`;
      // Nao sobrescreve se ja existir algo no destino (protege contra
      // duplicar/perder dado se a funcao for chamada mais de uma vez).
      if (window.localStorage.getItem(targetKey) !== null) continue;
      window.localStorage.setItem(targetKey, raw);
    } catch {
      // localStorage indisponivel: nada a fazer, a decisao ainda e marcada
      // abaixo para nao ficar perguntando em loop.
    }
  }

  markLegacyDataResolved(uid);
}

// Marca a decisao de "Ignorar" sem copiar nada.
export function ignoreLegacyData(uid: string): void {
  markLegacyDataResolved(uid);
}

function markLegacyDataResolved(uid: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(decisionKey(uid), new Date().toISOString());
  } catch {
    // ignora armazenamento indisponivel
  }
}
