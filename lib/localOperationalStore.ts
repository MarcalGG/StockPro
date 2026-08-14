export type OperationalStatus =
  | "Em andamento"
  | "Conferencia finalizada"
  | "Inventario finalizado";

export type StoredConferenceItem = {
  id: number;
  code: string;
  barcode: string;
  product: string;
  unit: string;
  expected: number;
  received: number;
  batch: string;
  validity: string;
  damaged: boolean;
  note: string;
  shortageFlag: boolean;
  surplusFlag: boolean;
  shortValidity: boolean;
  missingBatchFlag: boolean;
  status: "Pendente" | "Conferido" | "Falta" | "Sobra" | "Avaria";
  manual?: boolean;
};

export type StoredDivergence = {
  itemId: number;
  code: string;
  product: string;
  unit: string;
  expected: number;
  received: number;
  difference: number;
  status: string;
  note: string;
};

export type CurrentReceivingDraft = {
  receiptId: string;
  invoiceKey: string;
  items: StoredConferenceItem[];
  nextItemId: number;
  receivingNotes: string;
  finalizedAt: string | null;
  invoiceNumber: string;
  documentType: string;
  documentSeries: string;
  documentIssueDate: string;
  supplierCnpj?: string;
  totalValue?: number | null;
  hasXml?: boolean;
  hasPdf?: boolean;
  supplier: string;
  responsible: string;
  entryDateTime: string;
  inventoryRows: InventoryItemDraft[];
};

export type StoredReceivingRecord = {
  id: string;
  status: "Em andamento" | "Conferencia finalizada";
  documentType: string;
  invoiceNumber: string;
  documentSeries: string;
  documentIssueDate: string;
  supplierCnpj?: string;
  totalValue?: number | null;
  hasXml?: boolean;
  hasPdf?: boolean;
  supplier: string;
  responsible: string;
  entryDateTime: string;
  accessKey: string;
  notes: string;
  items: StoredConferenceItem[];
  divergences: StoredDivergence[];
  createdAt: string;
  updatedAt: string;
  finalizedAt: string | null;
};

export type FiscalDocumentType = "NFE" | "CTE";
export type FiscalDocumentOrigin = "XML manual" | "anexo manual" | "chave";
export type FiscalDocumentStatus =
  | "Pendente"
  | "Pronto para envio"
  | "Enviado"
  | "Incompleto"
  | "Duplicado";

export type FiscalDocumentRecord = {
  id: string;
  type: FiscalDocumentType;
  accessKey: string;
  number: string;
  series: string;
  issuer: string;
  issuerCnpj: string;
  issuedAt: string;
  totalValue: number | null;
  linkedReceivingId: string;
  origin: FiscalDocumentOrigin;
  hasXml: boolean;
  hasPdf: boolean;
  status: FiscalDocumentStatus;
  includedAt: string;
  updatedAt: string;
};

export type AccountingShipmentDraft = {
  id: string;
  status: "Rascunho";
  documentIds: string[];
  responsible: string;
  notes: string;
  xmlCount: number;
  pdfCount: number;
  incompleteCount: number;
  createdAt: string;
  updatedAt: string;
};

export type InventoryItemDraft = {
  location: string;
  product: string;
  quantity: string;
  lots: string;
  status: string;
};

export type InventoryCountStatus = "Pendente" | "Confirmado" | "Falta" | "Sobra";

export type InventoryCountItem = {
  id: string;
  code: string;
  product: string;
  unit: string;
  expected: number | null;
  counted: number | null;
  difference: number | null;
  status: InventoryCountStatus;
  lastCountedAt: string | null;
  note: string;
  manual?: boolean;
};

export type StoredInventoryRecord = {
  id: string;
  status: "Em andamento" | "Finalizado";
  title: string;
  sector: string;
  responsible: string;
  startedAt: string;
  notes: string;
  items: InventoryCountItem[];
  createdAt: string;
  updatedAt: string;
  finalizedAt: string | null;
};

const CURRENT_RECEIVING_KEY = "stockscan-pro:recebimento-atual";
const RECEIVING_RECORDS_KEY = "stockscan-pro:recebimentos:v1";
const INVENTORY_RECORDS_KEY = "stockscan-pro:inventarios:v1";
const FISCAL_DOCUMENTS_KEY = "stockscan-pro:documentos-fiscais:v1";
const ACCOUNTING_SHIPMENTS_KEY = "stockscan-pro:remessas-contabeis:v1";

export function createOperationalId(prefix: string) {
  const random =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}_${random}`;
}

export function getCurrentReceivingDraft() {
  return readJson<CurrentReceivingDraft | null>(CURRENT_RECEIVING_KEY, null);
}

export function saveCurrentReceivingDraft(draft: CurrentReceivingDraft) {
  writeJson(CURRENT_RECEIVING_KEY, draft);
}

export function clearCurrentReceivingDraft() {
  removeKey(CURRENT_RECEIVING_KEY);
}

export function listReceivingRecords() {
  return readJson<StoredReceivingRecord[]>(RECEIVING_RECORDS_KEY, []);
}

export function getReceivingRecord(id: string) {
  return listReceivingRecords().find((record) => record.id === id) ?? null;
}

export function saveReceivingRecord(record: StoredReceivingRecord) {
  const now = new Date().toISOString();
  const records = listReceivingRecords();
  const existing = records.find((item) => item.id === record.id);
  const nextRecord = {
    ...record,
    createdAt: existing?.createdAt ?? (record.createdAt || now),
    updatedAt: now,
  };
  writeJson(
    RECEIVING_RECORDS_KEY,
    [nextRecord, ...records.filter((item) => item.id !== record.id)].slice(0, 100),
  );
  return nextRecord;
}

export function updateReceivingRecord(
  id: string,
  updater: (record: StoredReceivingRecord) => StoredReceivingRecord,
) {
  const current = getReceivingRecord(id);
  if (!current) return null;
  return saveReceivingRecord(updater(current));
}

export function listFinalizedReceivings() {
  return listReceivingRecords().filter((record) => record.status === "Conferencia finalizada");
}

export function listConferenceDivergences() {
  return listFinalizedReceivings().flatMap((record) =>
    record.divergences.map((divergence) => ({
      ...divergence,
      receiptId: record.id,
      documentType: record.documentType,
      invoiceNumber: record.invoiceNumber,
      supplier: record.supplier,
      responsible: record.responsible,
      finalizedAt: record.finalizedAt,
      updatedAt: record.updatedAt,
    })),
  );
}

export function listInventoryRecords() {
  return readJson<StoredInventoryRecord[]>(INVENTORY_RECORDS_KEY, []);
}

export function getInventoryRecord(id: string) {
  return listInventoryRecords().find((record) => record.id === id) ?? null;
}

export function saveInventoryRecord(record: StoredInventoryRecord) {
  const now = new Date().toISOString();
  const records = listInventoryRecords();
  const existing = records.find((item) => item.id === record.id);
  const nextRecord = {
    ...record,
    createdAt: existing?.createdAt ?? (record.createdAt || now),
    updatedAt: now,
  };
  writeJson(
    INVENTORY_RECORDS_KEY,
    [nextRecord, ...records.filter((item) => item.id !== record.id)].slice(0, 100),
  );
  return nextRecord;
}

export function createInventory(input: {
  title: string;
  sector: string;
  responsible: string;
  startedAt: string;
  notes: string;
  items?: InventoryCountItem[];
}) {
  const now = new Date().toISOString();
  return saveInventoryRecord({
    id: createOperationalId("inventario"),
    status: "Em andamento",
    title: input.title,
    sector: input.sector,
    responsible: input.responsible,
    startedAt: input.startedAt,
    notes: input.notes,
    items: input.items ?? [],
    createdAt: now,
    updatedAt: now,
    finalizedAt: null,
  });
}

export function saveInventoryDraft(record: StoredInventoryRecord) {
  return saveInventoryRecord({
    ...record,
    status: "Em andamento",
    finalizedAt: null,
  });
}

export function getActiveInventoryDraft() {
  return listInventoryRecords()
    .filter((record) => record.status === "Em andamento")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null;
}

export function updateInventoryCounts(id: string, items: InventoryCountItem[]) {
  return updateInventoryRecord(id, (record) => ({
    ...record,
    items,
    status: "Em andamento",
    finalizedAt: null,
  }));
}

export function finalizeInventory(id: string, finalizedAt = new Date().toISOString()) {
  return updateInventoryRecord(id, (record) => ({
    ...record,
    status: "Finalizado",
    finalizedAt,
  }));
}

export function updateInventoryRecord(
  id: string,
  updater: (record: StoredInventoryRecord) => StoredInventoryRecord,
) {
  const current = getInventoryRecord(id);
  if (!current) return null;
  return saveInventoryRecord(updater(current));
}

export function listFinalizedInventories() {
  return listInventoryRecords().filter((record) => record.status === "Finalizado");
}

export function listFiscalDocuments() {
  return readJson<FiscalDocumentRecord[]>(FISCAL_DOCUMENTS_KEY, []);
}

export function getFiscalDocument(id: string) {
  return listFiscalDocuments().find((record) => record.id === id) ?? null;
}

export function saveFiscalDocument(record: FiscalDocumentRecord) {
  const now = new Date().toISOString();
  const records = listFiscalDocuments();
  const existingById = records.find((item) => item.id === record.id);
  const existingByKey = record.accessKey
    ? records.find((item) => item.accessKey === record.accessKey)
    : null;
  const target = existingByKey ?? existingById;
  const nextRecord = {
    ...target,
    ...record,
    id: target?.id ?? record.id,
    includedAt: target?.includedAt ?? record.includedAt,
    updatedAt: now,
  };
  writeJson(
    FISCAL_DOCUMENTS_KEY,
    [nextRecord, ...records.filter((item) => item.id !== nextRecord.id)].slice(0, 200),
  );
  return nextRecord;
}

export function updateFiscalDocumentStatus(id: string, status: FiscalDocumentStatus) {
  const record = getFiscalDocument(id);
  if (!record) return null;
  return saveFiscalDocument({ ...record, status });
}

export function upsertFiscalDocumentFromReceiving(record: StoredReceivingRecord) {
  const type = normalizeFiscalDocumentType(record.documentType);
  if (!type) return null;

  const hasIdentifiableDocument = Boolean(record.accessKey || (record.invoiceNumber && record.supplier));
  if (!hasIdentifiableDocument) return null;

  const records = listFiscalDocuments();
  const existing = record.accessKey
    ? records.find((item) => item.accessKey === record.accessKey)
    : records.find((item) => item.linkedReceivingId === record.id);
  const hasXml = Boolean(record.hasXml);
  const hasPdf = Boolean(record.hasPdf);
  const status = fiscalDocumentStatus({
    accessKey: record.accessKey,
    hasXml,
    hasPdf,
    type,
    duplicate: false,
  });
  const now = new Date().toISOString();
  return saveFiscalDocument({
    id: existing?.id ?? createOperationalId("doc"),
    type,
    accessKey: record.accessKey,
    number: record.invoiceNumber,
    series: record.documentSeries,
    issuer: record.supplier,
    issuerCnpj: record.supplierCnpj ?? "",
    issuedAt: record.documentIssueDate || record.entryDateTime,
    totalValue: record.totalValue ?? null,
    linkedReceivingId: record.id,
    origin: hasXml ? "XML manual" : hasPdf ? "anexo manual" : "chave",
    hasXml,
    hasPdf,
    status: existing?.status === "Enviado" ? "Enviado" : status,
    includedAt: existing?.includedAt ?? now,
    updatedAt: now,
  });
}

export function canMarkFiscalDocumentReady(record: FiscalDocumentRecord) {
  const missing: string[] = [];
  if (record.type !== "NFE" && record.type !== "CTE") missing.push("tipo NF-e ou CT-e");
  if (!isValidAccessKey(record.accessKey)) missing.push("chave de acesso valida");
  if (!record.hasXml && !record.hasPdf) missing.push("XML ou PDF disponivel");
  if (record.status === "Duplicado") missing.push("remover duplicidade");
  return { ok: missing.length === 0, missing };
}

export function listAccountingShipmentDrafts() {
  return readJson<AccountingShipmentDraft[]>(ACCOUNTING_SHIPMENTS_KEY, []);
}

export function saveAccountingShipmentDraft(input: {
  documentIds: string[];
  responsible: string;
  notes: string;
}) {
  const now = new Date().toISOString();
  const documents = listFiscalDocuments().filter((item) => input.documentIds.includes(item.id));
  const draft: AccountingShipmentDraft = {
    id: createOperationalId("remessa"),
    status: "Rascunho",
    documentIds: input.documentIds,
    responsible: input.responsible,
    notes: input.notes,
    xmlCount: documents.filter((item) => item.hasXml).length,
    pdfCount: documents.filter((item) => item.hasPdf).length,
    incompleteCount: documents.filter((item) => item.status !== "Pronto para envio").length,
    createdAt: now,
    updatedAt: now,
  };
  writeJson(ACCOUNTING_SHIPMENTS_KEY, [draft, ...listAccountingShipmentDrafts()].slice(0, 100));
  return draft;
}

function normalizeFiscalDocumentType(type: string): FiscalDocumentType | null {
  const clean = type.toUpperCase().replace(/[^A-Z]/g, "");
  if (clean === "NFE") return "NFE";
  if (clean === "CTE") return "CTE";
  return null;
}

function fiscalDocumentStatus(input: {
  accessKey: string;
  duplicate: boolean;
  hasPdf: boolean;
  hasXml: boolean;
  type: FiscalDocumentType;
}): FiscalDocumentStatus {
  if (input.duplicate) return "Duplicado";
  if (!isValidAccessKey(input.accessKey)) return "Incompleto";
  if (!input.hasXml && !input.hasPdf) return "Incompleto";
  return "Pendente";
}

function isValidAccessKey(key: string) {
  if (!/^\d{44}$/.test(key)) return false;
  let sum = 0;
  let weight = 2;
  for (let i = 42; i >= 0; i -= 1) {
    sum += Number(key[i]) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  const remainder = sum % 11;
  const digit = remainder < 2 ? 0 : 11 - remainder;
  return digit === Number(key[43]);
}

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // localStorage indisponivel ou cheio: a tela continua operacional.
  }
}

function removeKey(key: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignora armazenamento indisponivel
  }
}
