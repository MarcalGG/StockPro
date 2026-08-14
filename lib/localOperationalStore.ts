export type OperationalStatus =
  | "Em andamento"
  | "Conferencia finalizada"
  | "Inventario em rascunho"
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

export type InventoryItemDraft = {
  location: string;
  product: string;
  quantity: string;
  lots: string;
  status: string;
};

export type StoredInventoryRecord = {
  id: string;
  status: "Inventario em rascunho" | "Inventario finalizado";
  title: string;
  responsible: string;
  notes: string;
  items: InventoryItemDraft[];
  createdAt: string;
  updatedAt: string;
  finalizedAt: string | null;
};

const CURRENT_RECEIVING_KEY = "stockscan-pro:recebimento-atual";
const RECEIVING_RECORDS_KEY = "stockscan-pro:recebimentos:v1";
const INVENTORY_RECORDS_KEY = "stockscan-pro:inventarios:v1";

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
      invoiceNumber: record.invoiceNumber,
      supplier: record.supplier,
      finalizedAt: record.finalizedAt,
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

export function updateInventoryRecord(
  id: string,
  updater: (record: StoredInventoryRecord) => StoredInventoryRecord,
) {
  const current = getInventoryRecord(id);
  if (!current) return null;
  return saveInventoryRecord(updater(current));
}

export function listFinalizedInventories() {
  return listInventoryRecords().filter((record) => record.status === "Inventario finalizado");
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
