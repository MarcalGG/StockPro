"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

type ItemStatus = "Conferido" | "Divergente" | "Pendente";
type ScanMode = "photo" | "key" | "xml";
type TabId = "Recebimento" | "Conferencia" | "Inventario" | "Relatorio";

type InvoiceItem = {
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
  status: ItemStatus;
};

function computeItemStatus(item: {
  received: number;
  expected: number;
  damaged: boolean;
  shortageFlag: boolean;
  surplusFlag: boolean;
}): ItemStatus {
  if (item.damaged || item.shortageFlag || item.surplusFlag) return "Divergente";
  if (item.received === 0) return "Pendente";
  return item.received === item.expected ? "Conferido" : "Divergente";
}

function hasShortage(item: InvoiceItem) {
  return item.shortageFlag || (item.received > 0 && item.received < item.expected);
}

function hasSurplus(item: InvoiceItem) {
  return item.surplusFlag || item.received > item.expected;
}

function hasMissingBatch(item: InvoiceItem) {
  return item.missingBatchFlag || (item.received > 0 && !item.batch);
}

const initialItems: InvoiceItem[] = [];

type InventoryRow = {
  location: string;
  product: string;
  quantity: string;
  lots: string;
  status: string;
};

const initialInventoryRows: InventoryRow[] = [];

const newItemDefault = { code: "", product: "", unit: "UN", expected: "" };

const tabs: { id: TabId; label: string; icon: (props: IconProps) => React.ReactElement }[] = [
  { id: "Recebimento", label: "Receber", icon: IconInbox },
  { id: "Conferencia", label: "Conferir", icon: IconCheckList },
  { id: "Inventario", label: "Estoque", icon: IconGrid },
  { id: "Relatorio", label: "Relatorio", icon: IconDoc },
];

const STORAGE_KEY = "stockscan-pro:recebimento-atual";

type FiscalLookupResult = {
  status:
    | "LOCALIZADO"
    | "NAO_SINCRONIZADO"
    | "JA_VINCULADO"
    | "CHAVE_INVALIDA"
    | "INDISPONIVEL";
  tipo?: "NFE" | "CTE";
  documentId?: string;
  numero?: string | null;
  serie?: string | null;
  emitenteNome?: string | null;
  emitenteCnpj?: string | null;
};

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabId>("Recebimento");
  const [scanMode, setScanMode] = useState<ScanMode>("photo");
  const [scanState, setScanState] = useState<"idle" | "reading" | "done">(
    "idle",
  );
  const [invoiceKey, setInvoiceKey] = useState("");
  const [pasteError, setPasteError] = useState("");
  const [items, setItems] = useState<InvoiceItem[]>(initialItems);
  const [nextItemId, setNextItemId] = useState(1);
  const [receivingNotes, setReceivingNotes] = useState("");
  const [finalizedAt, setFinalizedAt] = useState<string | null>(null);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [supplier, setSupplier] = useState("");
  const [responsible, setResponsible] = useState("");
  const [entryDateTime, setEntryDateTime] = useState("");
  // Id local (nao e um id de banco) usado so para vincular um documento
  // fiscal sincronizado a "este" recebimento no navegador. Gerado uma vez e
  // mantido no localStorage junto com o resto do recebimento.
  const [recebimentoId] = useState(() =>
    typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
  );
  const [fiscalLookup, setFiscalLookup] = useState<FiscalLookupResult | null>(null);
  const [fiscalLookupLoading, setFiscalLookupLoading] = useState(false);
  const [inventoryRows, setInventoryRows] = useState<InventoryRow[]>(initialInventoryRows);
  const [newItem, setNewItem] = useState(newItemDefault);
  const [whatsappMessage, setWhatsappMessage] = useState("");
  const [copyFeedback, setCopyFeedback] = useState("");
  const [scannerTarget, setScannerTarget] = useState<
    "invoiceKey" | "newItemCode" | "conferenceLoop" | null
  >(null);
  const [cameraError, setCameraError] = useState("");
  const [notePhotoUrl, setNotePhotoUrl] = useState<string | null>(null);
  const [xmlImportError, setXmlImportError] = useState("");
  const [xmlPreview, setXmlPreview] = useState<ParsedNfe | null>(null);
  const [scanFeedback, setScanFeedback] = useState<{ text: string; tone: "success" | "error" } | null>(
    null,
  );
  const [scanLog, setScanLog] = useState<{ text: string; tone: "success" | "error" }[]>([]);
  const hasHydrated = useRef(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const scanFrameRef = useRef<number | null>(null);
  const notePhotoInputRef = useRef<HTMLInputElement | null>(null);
  const xmlFileInputRef = useRef<HTMLInputElement | null>(null);
  const lastScanRef = useRef<{ code: string; at: number } | null>(null);
  const scanFeedbackTimeoutRef = useRef<number | null>(null);

  const cleanInvoiceKey = invoiceKey.replace(/\D/g, "").slice(0, 44);
  const isInvoiceKeyComplete = cleanInvoiceKey.length === 44;
  const isInvoiceKeyChecksumValid = isInvoiceKeyComplete && isValidNfeKeyChecksum(cleanInvoiceKey);
  const isInvoiceKeyValid = isInvoiceKeyComplete && isInvoiceKeyChecksumValid;
  const invoiceKeyParts = parseInvoiceKey(cleanInvoiceKey);
  const invoiceKeyTouched = cleanInvoiceKey.length > 0;
  const isFinalized = finalizedAt !== null;

  const totals = useMemo(() => {
    const expected = items.reduce((sum, item) => sum + item.expected, 0);
    const received = items.reduce((sum, item) => sum + item.received, 0);
    const pending = items.filter((item) => item.status === "Pendente").length;
    const divergent = items.filter((item) => item.status === "Divergente").length;
    const done = items.filter((item) => item.status === "Conferido").length;
    const damaged = items.filter((item) => item.damaged).length;
    const missingUnits = items.reduce(
      (sum, item) => sum + Math.max(0, item.expected - item.received),
      0,
    );
    const surplusUnits = items.reduce(
      (sum, item) => sum + Math.max(0, item.received - item.expected),
      0,
    );
    const shortageCount = items.filter(hasShortage).length;
    const surplusCount = items.filter(hasSurplus).length;
    const shortValidityCount = items.filter((item) => item.shortValidity).length;
    const missingBatchCount = items.filter(hasMissingBatch).length;

    return {
      expected,
      received,
      pending,
      divergent,
      done,
      damaged,
      missingUnits,
      surplusUnits,
      shortageCount,
      surplusCount,
      shortValidityCount,
      missingBatchCount,
    };
  }, [items]);

  // Fase 5: restaura o recebimento em andamento salvo no navegador.
  // Precisa ser um efeito (nao um initializer de useState) porque `window.localStorage`
  // so existe no cliente; ler no render quebraria a renderizacao no servidor. Roda uma
  // unica vez ao montar (dependencias vazias), entao nao gera loop de renders.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        // eslint-disable-next-line react-hooks/set-state-in-effect -- restauracao unica na montagem, guardada por [] e por hasHydrated
        if (typeof saved.invoiceKey === "string") setInvoiceKey(saved.invoiceKey);
        if (Array.isArray(saved.items)) setItems(saved.items);
        if (typeof saved.nextItemId === "number") setNextItemId(saved.nextItemId);
        if (typeof saved.receivingNotes === "string") setReceivingNotes(saved.receivingNotes);
        if (saved.finalizedAt === null || typeof saved.finalizedAt === "string") {
          setFinalizedAt(saved.finalizedAt);
        }
        if (typeof saved.invoiceNumber === "string") setInvoiceNumber(saved.invoiceNumber);
        if (typeof saved.supplier === "string") setSupplier(saved.supplier);
        if (typeof saved.responsible === "string") setResponsible(saved.responsible);
        if (typeof saved.entryDateTime === "string") setEntryDateTime(saved.entryDateTime);
        if (Array.isArray(saved.inventoryRows)) setInventoryRows(saved.inventoryRows);
      }
    } catch {
      // dados salvos corrompidos: ignora e comeca do zero
    }
    hasHydrated.current = true;
  }, []);

  // Fase 5: salva automaticamente a cada mudanca relevante.
  useEffect(() => {
    if (!hasHydrated.current) return;
    const payload = {
      invoiceKey,
      items,
      nextItemId,
      receivingNotes,
      finalizedAt,
      invoiceNumber,
      supplier,
      responsible,
      entryDateTime,
      inventoryRows,
    };
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // armazenamento indisponivel ou cheio: ignora
    }
  }, [
    invoiceKey,
    items,
    nextItemId,
    receivingNotes,
    finalizedAt,
    invoiceNumber,
    supplier,
    responsible,
    entryDateTime,
    inventoryRows,
  ]);

  // Atualizacao 2: quando a chave fica valida, pergunta ao backend (se
  // configurado) se ja existe um documento fiscal sincronizado com essa
  // chave. Nunca bloqueia o preenchimento manual — qualquer falha (sem
  // sessao admin configurada, sem rede, servidor fora) so deixa o
  // resultado como "indisponivel" e a pessoa segue preenchendo normalmente.
  useEffect(() => {
    // Nao reseta fiscalLookup sincronamente aqui: a renderizacao ja so
    // mostra o banner quando isInvoiceKeyValid e verdadeiro, entao um
    // resultado antigo simplesmente fica sem uso ate a proxima chave valida.
    if (!isInvoiceKeyValid) return;

    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- consulta dispara quando a chave fica valida; nao ha como mover para fora do efeito
    setFiscalLookupLoading(true);

    fetch(`/api/fiscal/lookup/${cleanInvoiceKey}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled) setFiscalLookup(data);
      })
      .catch(() => {
        if (!cancelled) setFiscalLookup({ status: "INDISPONIVEL" });
      })
      .finally(() => {
        if (!cancelled) setFiscalLookupLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isInvoiceKeyValid, cleanInvoiceKey]);

  async function vincularDocumentoFiscal() {
    if (!fiscalLookup?.documentId) return;
    try {
      const res = await fetch(`/api/fiscal/documents/${fiscalLookup.documentId}/link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recebimentoId }),
      });
      if (res.ok) {
        if (fiscalLookup.emitenteNome) setSupplier((current) => current || fiscalLookup.emitenteNome!);
        if (fiscalLookup.numero) {
          setInvoiceNumber((current) => current || fiscalLookup.numero!);
        }
        setFiscalLookup((current) => (current ? { ...current, status: "JA_VINCULADO" } : current));
      }
    } catch {
      // sem conexao com o backend: a pessoa continua preenchendo manualmente
    }
  }

  const barcodeScannerSupported =
    typeof window !== "undefined" && "BarcodeDetector" in window;

  // Le codigo de barras/QR pela camera de verdade (API nativa do navegador,
  // sem biblioteca externa). Funciona em Chrome/Edge no Android e desktop;
  // navegadores sem suporte caem no aviso de fallback (colar/digitar).
  useEffect(() => {
    if (!scannerTarget) return;

    let cancelled = false;

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        cameraStreamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => {});
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- BarcodeDetector ainda nao tem tipos oficiais do TS
        const DetectorCtor = (window as any).BarcodeDetector;
        const detector = new DetectorCtor({
          formats: ["code_128", "code_39", "codabar", "itf", "ean_13", "qr_code"],
        });

        const tick = async () => {
          if (cancelled || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes.length > 0) {
              const raw = String(codes[0].rawValue || "").replace(/\D/g, "");
              if (scannerTarget === "invoiceKey" && raw.length >= 44) {
                handleInvoiceKeyChange(raw.slice(0, 44));
                setScannerTarget(null);
                return;
              }
              if (scannerTarget === "newItemCode" && raw.length > 0) {
                setNewItem((current) => ({ ...current, code: raw }));
                setScannerTarget(null);
                return;
              }
              if (scannerTarget === "conferenceLoop" && raw.length > 0) {
                const now = Date.now();
                const last = lastScanRef.current;
                const isRepeat = last !== null && last.code === raw && now - last.at < 1200;
                if (!isRepeat) {
                  lastScanRef.current = { code: raw, at: now };
                  const result = incrementReceivedByCode(raw);
                  pushScanFeedback(
                    result.matched
                      ? `+1 ${result.productName}`
                      : `Codigo ${raw} nao encontrado na nota`,
                    result.matched ? "success" : "error",
                  );
                }
                // continua escaneando: nao fecha a camera apos um match
              }
            }
          } catch {
            // frame nao decodificavel ainda, tenta o proximo
          }
          if (!cancelled) scanFrameRef.current = requestAnimationFrame(tick);
        };
        scanFrameRef.current = requestAnimationFrame(tick);
      } catch {
        if (!cancelled) {
          setCameraError(
            "Nao foi possivel acessar a camera. Verifique a permissao do navegador.",
          );
          setScannerTarget(null);
        }
      }
    }

    start();

    return () => {
      cancelled = true;
      if (scanFrameRef.current) cancelAnimationFrame(scanFrameRef.current);
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach((track) => track.stop());
        cameraStreamRef.current = null;
      }
    };
  }, [scannerTarget, barcodeScannerSupported]);

  function openKeyScanner() {
    if (!barcodeScannerSupported) {
      setCameraError(
        "Este navegador nao suporta leitura de codigo de barras pela camera. Cole ou digite a chave.",
      );
      return;
    }
    setCameraError("");
    setScannerTarget("invoiceKey");
  }

  function openItemCodeScanner() {
    if (!barcodeScannerSupported) {
      setCameraError(
        "Este navegador nao suporta leitura de codigo de barras pela camera. Digite o codigo.",
      );
      return;
    }
    setCameraError("");
    setScannerTarget("newItemCode");
  }

  function closeScanner() {
    setScannerTarget(null);
    setScanFeedback(null);
  }

  // Fase 2 (extra): escaneia o codigo de barras do produto durante a
  // conferencia fisica e soma 1 na quantidade recebida, sem digitar nada.
  function openConferenceScanner() {
    if (isFinalized) return;
    if (!barcodeScannerSupported) {
      setCameraError(
        "Este navegador nao suporta leitura de codigo de barras pela camera. Digite as quantidades manualmente.",
      );
      return;
    }
    if (items.length === 0) {
      setCameraError("Adicione os itens da nota antes de escanear.");
      return;
    }
    setCameraError("");
    setScanLog([]);
    setScanFeedback(null);
    lastScanRef.current = null;
    setScannerTarget("conferenceLoop");
  }

  function pushScanFeedback(text: string, tone: "success" | "error") {
    setScanFeedback({ text, tone });
    setScanLog((current) => [{ text, tone }, ...current].slice(0, 6));
    if (scanFeedbackTimeoutRef.current) window.clearTimeout(scanFeedbackTimeoutRef.current);
    scanFeedbackTimeoutRef.current = window.setTimeout(() => setScanFeedback(null), 1800);
  }

  function incrementReceivedByCode(rawCode: string): { matched: boolean; productName: string } {
    let matchedName = "";
    setItems((current) => {
      const idx = current.findIndex(
        (item) => (item.barcode && item.barcode === rawCode) || item.code === rawCode,
      );
      if (idx === -1) return current;
      matchedName = current[idx].product;
      return current.map((item, i) => {
        if (i !== idx) return item;
        const nextReceived = item.received + 1;
        const next = {
          ...item,
          received: nextReceived,
          shortageFlag: nextReceived >= item.expected ? false : item.shortageFlag,
          surplusFlag: nextReceived <= item.expected ? false : item.surplusFlag,
        };
        return { ...next, status: computeItemStatus(next) };
      });
    });
    return { matched: matchedName !== "", productName: matchedName };
  }

  function handleNotePhotoChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setNotePhotoUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return URL.createObjectURL(file);
    });
    setScanState("done");
  }

  function handleXmlFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setXmlImportError("");
    setXmlPreview(null);

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = parseNfeXml(String(reader.result ?? ""));
        if (parsed.items.length === 0) {
          setXmlImportError(
            "Nao encontrei produtos neste XML. Confira se e o arquivo certo da NF-e.",
          );
          return;
        }
        setXmlPreview(parsed);
      } catch (error) {
        setXmlImportError(
          error instanceof Error ? error.message : "Nao foi possivel ler este arquivo XML.",
        );
      }
    };
    reader.onerror = () => setXmlImportError("Nao foi possivel ler o arquivo.");
    reader.readAsText(file, "utf-8");
  }

  function confirmXmlImport() {
    if (!xmlPreview) return;
    if (items.length > 0) {
      const confirmed = window.confirm(
        `Ja existem ${items.length} item(ns) na conferencia. Importar do XML vai substituir a lista atual. Continuar?`,
      );
      if (!confirmed) return;
    }

    const importedItems: InvoiceItem[] = xmlPreview.items.map((item, index) => ({
      id: nextItemId + index,
      code: item.code || String(nextItemId + index),
      barcode: item.barcode,
      product: item.product,
      unit: item.unit,
      expected: item.expected,
      received: 0,
      batch: item.batch,
      validity: item.validity,
      damaged: false,
      note: "",
      shortageFlag: false,
      surplusFlag: false,
      shortValidity: false,
      missingBatchFlag: false,
      status: "Pendente",
    }));

    setItems(importedItems);
    setNextItemId((current) => current + importedItems.length);
    if (xmlPreview.invoiceNumber) setInvoiceNumber(xmlPreview.invoiceNumber);
    if (xmlPreview.supplier) setSupplier(xmlPreview.supplier);
    if (xmlPreview.entryDateTime) setEntryDateTime(xmlPreview.entryDateTime);
    if (xmlPreview.accessKey) setInvoiceKey(xmlPreview.accessKey);
    setXmlPreview(null);
    setActiveTab("Conferencia");
  }

  function cancelXmlPreview() {
    setXmlPreview(null);
    setXmlImportError("");
  }

  function clearReceiving() {
    const confirmed = window.confirm(
      "Limpar o recebimento atual? Isso apaga a chave, os itens, quantidades e observacoes salvos neste navegador.",
    );
    if (!confirmed) return;

    setInvoiceKey("");
    setPasteError("");
    setItems([]);
    setNextItemId(1);
    setReceivingNotes("");
    setFinalizedAt(null);
    setInvoiceNumber("");
    setSupplier("");
    setResponsible("");
    setEntryDateTime("");
    setInventoryRows([]);
    setNewItem(newItemDefault);
    setWhatsappMessage("");
    setCopyFeedback("");
    setScanState("idle");
    setNotePhotoUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
    setXmlPreview(null);
    setXmlImportError("");
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignora
    }
  }

  function useKeyAndImportItems() {
    if (!isInvoiceKeyValid) return;

    setScanState("reading");
    window.setTimeout(() => {
      setScanState("done");
      setInvoiceNumber((current) => {
        if (current.trim()) return current;
        const raw = cleanInvoiceKey.slice(25, 34);
        if (raw.length !== 9) return current;
        return `${raw.slice(0, 3)}.${raw.slice(3, 6)}.${raw.slice(6, 9)}`;
      });
      setActiveTab("Conferencia");
    }, 700);
  }

  function handleInvoiceKeyChange(value: string) {
    setPasteError("");
    setInvoiceKey(value.replace(/\D/g, "").slice(0, 44));
  }

  async function pasteInvoiceKeyFromClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      const digits = text.replace(/\D/g, "").slice(0, 44);
      if (!digits) {
        setPasteError("Nada parecido com uma chave foi encontrado na area de transferencia.");
        return;
      }
      setInvoiceKey(digits);
      setPasteError("");
    } catch {
      setPasteError("Nao foi possivel ler a area de transferencia. Cole com Ctrl+V no campo.");
    }
  }

  function updateReceived(id: number, value: string) {
    if (isFinalized) return;
    const received = Number(value);
    setItems((current) =>
      current.map((item) => {
        if (item.id !== id) return item;

        const nextReceived = Number.isNaN(received) || received < 0 ? 0 : received;
        const next = {
          ...item,
          received: nextReceived,
          shortageFlag: nextReceived >= item.expected ? false : item.shortageFlag,
          surplusFlag: nextReceived <= item.expected ? false : item.surplusFlag,
        };
        return { ...next, status: computeItemStatus(next) };
      }),
    );
  }

  function updateField(id: number, field: "batch" | "validity" | "note", value: string) {
    if (isFinalized) return;
    setItems((current) =>
      current.map((item) => {
        if (item.id !== id) return item;
        const next = { ...item, [field]: value };
        if (field === "batch" && value.trim()) next.missingBatchFlag = false;
        return next;
      }),
    );
  }

  function addItem() {
    if (isFinalized) return;
    const code = newItem.code.trim();
    const product = newItem.product.trim();
    const expected = Number(newItem.expected);
    if (!product || !Number.isFinite(expected) || expected <= 0) return;

    setItems((current) => [
      ...current,
      {
        id: nextItemId,
        code: code || String(nextItemId),
        barcode: code,
        product,
        unit: newItem.unit.trim() || "UN",
        expected,
        received: 0,
        batch: "",
        validity: "",
        damaged: false,
        note: "",
        shortageFlag: false,
        surplusFlag: false,
        shortValidity: false,
        missingBatchFlag: false,
        status: "Pendente",
      },
    ]);
    setNextItemId((current) => current + 1);
    setNewItem(newItemDefault);
  }

  function removeItem(id: number) {
    if (isFinalized) return;
    setItems((current) => current.filter((item) => item.id !== id));
  }

  function addInventoryRow() {
    setInventoryRows((current) => [
      ...current,
      { location: "", product: "", quantity: "", lots: "", status: "Contar" },
    ]);
  }

  function updateInventoryRow(index: number, field: keyof InventoryRow, value: string) {
    setInventoryRows((current) =>
      current.map((row, i) => (i === index ? { ...row, [field]: value } : row)),
    );
  }

  function removeInventoryRow(index: number) {
    setInventoryRows((current) => current.filter((_, i) => i !== index));
  }

  // Fase 2: acoes rapidas por produto.
  function markReceivedAll(id: number) {
    if (isFinalized) return;
    setItems((current) =>
      current.map((item) => {
        if (item.id !== id) return item;
        const next = { ...item, received: item.expected, shortageFlag: false, surplusFlag: false };
        return { ...next, status: computeItemStatus(next) };
      }),
    );
  }

  function toggleShortage(id: number) {
    if (isFinalized) return;
    setItems((current) =>
      current.map((item) => {
        if (item.id !== id) return item;
        const next = { ...item, shortageFlag: !item.shortageFlag, surplusFlag: false };
        return { ...next, status: computeItemStatus(next) };
      }),
    );
  }

  function toggleSurplus(id: number) {
    if (isFinalized) return;
    setItems((current) =>
      current.map((item) => {
        if (item.id !== id) return item;
        const next = { ...item, surplusFlag: !item.surplusFlag, shortageFlag: false };
        return { ...next, status: computeItemStatus(next) };
      }),
    );
  }

  function toggleDamaged(id: number) {
    if (isFinalized) return;
    setItems((current) =>
      current.map((item) => {
        if (item.id !== id) return item;
        const next = { ...item, damaged: !item.damaged };
        return { ...next, status: computeItemStatus(next) };
      }),
    );
  }

  function toggleShortValidity(id: number) {
    if (isFinalized) return;
    setItems((current) =>
      current.map((item) =>
        item.id === id ? { ...item, shortValidity: !item.shortValidity } : item,
      ),
    );
  }

  function toggleMissingBatch(id: number) {
    if (isFinalized) return;
    setItems((current) =>
      current.map((item) =>
        item.id === id ? { ...item, missingBatchFlag: !item.missingBatchFlag } : item,
      ),
    );
  }

  function finalizeReceiving() {
    setFinalizedAt(
      new Date().toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
    );
  }

  function reopenReceiving() {
    setFinalizedAt(null);
  }

  function generatePdf() {
    window.print();
  }

  function exportExcel() {
    const rows: string[][] = [
      ["Relatorio de recebimento - StockScan Pro"],
      ["Numero da NF", invoiceNumber || "nao informado"],
      ["Fornecedor", supplier || "nao informado"],
      ["Responsavel", responsible || "nao informado"],
      ["Data/hora de entrada", entryDateTime || "nao informada"],
      ["Status", isFinalized ? `Finalizado em ${finalizedAt}` : "Conferencia em andamento"],
      [],
      [
        "Codigo",
        "Produto",
        "Unidade",
        "Qtd. nota",
        "Qtd. recebida",
        "Diferenca",
        "Lote",
        "Validade",
        "Avaria",
        "Observacao da avaria",
        "Validade curta",
        "Lote nao informado",
        "Status",
      ],
      ...items.map((item) => [
        item.code,
        item.product,
        item.unit,
        String(item.expected),
        String(item.received),
        String(item.received - item.expected),
        item.batch || "nao informado",
        item.validity || "nao informada",
        item.damaged ? "Sim" : "Nao",
        item.damaged ? item.note || "sem descricao" : "",
        item.shortValidity ? "Sim" : "Nao",
        hasMissingBatch(item) ? "Sim" : "Nao",
        item.status,
      ]),
      [],
      ["Observacoes do recebimento", receivingNotes || "nenhuma"],
    ];

    const csv = rows.map((row) => row.map(escapeCsvCell).join(";")).join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "relatorio-recebimento-stockscan-pro.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  // Fase 4: mensagem pronta para WhatsApp.
  function buildWhatsappMessage() {
    const lines: string[] = [];
    const nf = invoiceNumber.trim() || "(numero nao informado)";
    const header = supplier.trim()
      ? `Recebimento NF ${nf} - ${supplier.trim()}.`
      : `Recebimento NF ${nf}.`;
    lines.push(header);
    if (responsible.trim()) lines.push(`Responsavel: ${responsible.trim()}.`);
    if (entryDateTime.trim()) lines.push(`Data/hora: ${entryDateTime.trim()}.`);
    lines.push("");

    const problems = items.filter(
      (item) => item.status !== "Conferido" || item.shortValidity || hasMissingBatch(item),
    );

    if (items.length === 0) {
      lines.push("Nenhum item cadastrado ainda nesta conferencia.");
    } else if (problems.length === 0) {
      lines.push("Nenhuma divergencia encontrada. Recebimento conferido sem problemas.");
    } else {
      lines.push(`Divergencias encontradas (${problems.length}):`);
      problems.forEach((item) => {
        const parts: string[] = [];
        if (item.received === 0 && !item.shortageFlag) {
          parts.push("ainda nao conferido");
        } else if (hasShortage(item)) {
          const missing = Math.max(0, item.expected - item.received);
          parts.push(
            missing > 0
              ? `nota ${item.expected}, recebido ${item.received}, faltaram ${missing} unidade(s)`
              : "marcado como falta",
          );
        } else if (hasSurplus(item)) {
          const surplus = Math.max(0, item.received - item.expected);
          parts.push(
            surplus > 0
              ? `nota ${item.expected}, recebido ${item.received}, sobraram ${surplus} unidade(s)`
              : "marcado como sobra",
          );
        }
        if (item.damaged) parts.push(`avaria${item.note ? `: ${item.note}` : ""}`);
        if (hasMissingBatch(item)) parts.push("lote nao informado");
        if (item.shortValidity) parts.push("validade curta");
        lines.push(`- ${item.product}: ${parts.join("; ") || "verificar"}.`);
      });
    }

    if (receivingNotes.trim()) {
      lines.push("");
      lines.push(`Observacoes: ${receivingNotes.trim()}`);
    }

    lines.push("");
    lines.push("Favor verificar.");
    return lines.join("\n");
  }

  function generateWhatsappMessage() {
    setWhatsappMessage(buildWhatsappMessage());
    setCopyFeedback("");
  }

  async function copyWhatsappMessage() {
    try {
      await navigator.clipboard.writeText(whatsappMessage);
      setCopyFeedback("Mensagem copiada!");
    } catch {
      setCopyFeedback("Nao foi possivel copiar automaticamente. Selecione o texto e copie manualmente.");
    }
    window.setTimeout(() => setCopyFeedback(""), 3000);
  }

  return (
    <main className="min-h-screen bg-[#eef3f8] text-slate-950">
      <div className="mx-auto flex min-w-0 max-w-7xl flex-col gap-4 px-3 py-3 pb-24 sm:gap-5 sm:px-6 sm:py-4 sm:pb-6 lg:px-8">
        <header className="no-print overflow-hidden rounded-2xl bg-[#09233f] text-white shadow-sm">
          <div className="grid gap-5 p-4 sm:gap-6 sm:p-5 md:grid-cols-[1.1fr_0.9fr] md:p-7">
            <section className="flex flex-col justify-between gap-6 sm:gap-8">
              <div className="flex items-start gap-3">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-cyan-400 text-lg font-black text-cyan-950 shadow-sm sm:h-12 sm:w-12">
                  SS
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-200 sm:text-sm">
                    MGN Technologies
                  </p>
                  <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl md:text-4xl">
                    StockScan Pro
                  </h1>
                </div>
              </div>

              <p className="max-w-2xl text-sm leading-6 text-slate-200 sm:text-base">
                Assistente de recebimento e inventario para supervisores de
                estoque. Fotografe a nota em papel, confira produtos, registre
                lote e validade e gere uma prova de recebimento.
              </p>

              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3">
                <Metric label="Itens da nota" value={String(items.length)} />
                <Metric label="Qtd. esperada" value={String(totals.expected)} />
                <Metric label="Qtd. recebida" value={String(totals.received)} />
                <Metric label="Divergencias" value={String(totals.divergent)} />
              </div>
            </section>

            <section className="rounded-xl border border-white/15 bg-white/10 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-cyan-100">Recebimento atual</p>
                  <input
                    aria-label="Numero da nota fiscal"
                    className="mt-1 w-full min-w-0 bg-transparent text-lg font-semibold text-white outline-none placeholder:text-slate-400 sm:text-xl"
                    disabled={isFinalized}
                    onChange={(event) => setInvoiceNumber(event.target.value)}
                    placeholder="Numero da NF (ex.: 000.482.119)"
                    value={invoiceNumber}
                  />
                </div>
                <span
                  className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${
                    isFinalized
                      ? "bg-cyan-300 text-cyan-950"
                      : scanState === "done"
                        ? "bg-emerald-400 text-emerald-950"
                        : "bg-white/20 text-white"
                  }`}
                >
                  {isFinalized
                    ? "Finalizado"
                    : scanState === "done"
                      ? "Leitura OK"
                      : "Aguardando leitura"}
                </span>
              </div>

              <div className="mt-5 grid gap-3 text-sm text-slate-100">
                <EditableInfoRow
                  disabled={isFinalized}
                  label="Fornecedor"
                  onChange={setSupplier}
                  placeholder="Nome do fornecedor"
                  value={supplier}
                />
                <EditableInfoRow
                  disabled={isFinalized}
                  label="Entrada"
                  onChange={setEntryDateTime}
                  placeholder="Data e hora"
                  value={entryDateTime}
                />
                <EditableInfoRow
                  disabled={isFinalized}
                  label="Responsavel"
                  onChange={setResponsible}
                  placeholder="Quem esta recebendo"
                  value={responsible}
                />
                <InfoRow
                  label="Status"
                  value={
                    isFinalized
                      ? `Finalizado em ${finalizedAt}`
                      : "Conferencia em andamento"
                  }
                />
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-4">
                <button
                  className="text-xs font-bold text-rose-200 underline decoration-dotted underline-offset-2 hover:text-rose-100"
                  onClick={clearReceiving}
                  type="button"
                >
                  Limpar recebimento atual
                </button>
                <Link
                  className="text-xs font-bold text-cyan-200 underline decoration-dotted underline-offset-2 hover:text-cyan-100"
                  href="/configuracoes"
                >
                  Configuracoes &gt; Documentos Fiscais
                </Link>
              </div>
            </section>
          </div>
        </header>

        <nav
          aria-label="Modulos do StockScan Pro"
          className="no-print hidden gap-2 rounded-2xl bg-white p-2 shadow-sm sm:grid sm:grid-cols-4"
        >
          {tabs.map((tab) => (
            <button
              className={`flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition ${
                activeTab === tab.id
                  ? "bg-[#09233f] text-white"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
              }`}
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              type="button"
            >
              <tab.icon className="h-4 w-4" />
              {tab.id}
            </button>
          ))}
        </nav>

        {activeTab === "Recebimento" && (
          <section className="grid gap-4 sm:gap-5 lg:grid-cols-[0.85fr_1.15fr]">
            <div className="rounded-2xl bg-white p-4 shadow-sm sm:p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-cyan-700">
                    Etapa 1
                  </p>
                  <h2 className="mt-1 text-xl font-semibold sm:text-2xl">
                    Capturar nota fiscal
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    O jeito mais rapido: importe o XML da nota e o app
                    preenche produtos, quantidade, lote e validade sozinho.
                  </p>
                </div>
                <span className="hidden shrink-0 rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600 sm:inline-block">
                  Camera + chave + XML
                </span>
              </div>

              <div className="mt-5 grid grid-cols-3 gap-2 rounded-xl bg-slate-100 p-1">
                <button
                  className={`rounded-lg px-2 py-3 text-xs font-bold transition sm:text-sm ${
                    scanMode === "xml"
                      ? "bg-white text-[#09233f] shadow-sm"
                      : "text-slate-600 hover:text-slate-950"
                  }`}
                  onClick={() => setScanMode("xml")}
                  type="button"
                >
                  Importar XML
                </button>
                <button
                  className={`rounded-lg px-2 py-3 text-xs font-bold transition sm:text-sm ${
                    scanMode === "key"
                      ? "bg-white text-[#09233f] shadow-sm"
                      : "text-slate-600 hover:text-slate-950"
                  }`}
                  onClick={() => setScanMode("key")}
                  type="button"
                >
                  Chave de acesso
                </button>
                <button
                  className={`rounded-lg px-2 py-3 text-xs font-bold transition sm:text-sm ${
                    scanMode === "photo"
                      ? "bg-white text-[#09233f] shadow-sm"
                      : "text-slate-600 hover:text-slate-950"
                  }`}
                  onClick={() => setScanMode("photo")}
                  type="button"
                >
                  Foto da nota
                </button>
              </div>

              {scanMode === "xml" ? (
                <div className="mt-5 min-h-72 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:min-h-80 sm:p-5">
                  <input
                    accept=".xml,text/xml,application/xml"
                    className="hidden"
                    onChange={handleXmlFileChange}
                    ref={xmlFileInputRef}
                    type="file"
                  />

                  {!xmlPreview ? (
                    <div className="flex flex-col items-center justify-center py-6 text-center">
                      <div className="grid h-20 w-20 place-items-center rounded-xl bg-[#09233f] text-3xl font-bold text-white sm:h-24 sm:w-24 sm:text-4xl">
                        <IconDoc className="h-10 w-10" />
                      </div>
                      <h3 className="mt-5 text-lg font-semibold">
                        Importar arquivo XML da NF-e
                      </h3>
                      <p className="mt-2 max-w-sm text-sm leading-6 text-slate-600">
                        Selecione o arquivo <span className="font-mono">.xml</span> da
                        nota (o mesmo que o fornecedor manda por e-mail ou que
                        voce baixa do portal dele). O app le tudo direto no
                        navegador — o arquivo nao e enviado para nenhum
                        servidor.
                      </p>
                      <button
                        className="mt-5 flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 py-3.5 text-sm font-bold text-emerald-950 shadow-sm transition hover:bg-emerald-400 active:scale-[0.98] sm:w-auto sm:py-3"
                        onClick={() => xmlFileInputRef.current?.click()}
                        type="button"
                      >
                        <IconDoc className="h-4 w-4" />
                        Escolher arquivo XML
                      </button>

                      {xmlImportError && (
                        <p className="mt-4 flex items-start gap-2 rounded-lg bg-rose-50 p-3 text-left text-xs font-semibold leading-5 text-rose-800">
                          <IconAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          {xmlImportError}
                        </p>
                      )}
                    </div>
                  ) : (
                    <div>
                      <p className="flex items-center gap-2 text-sm font-bold text-emerald-800">
                        <IconCheck className="h-4 w-4 shrink-0" />
                        XML lido com sucesso
                      </p>
                      <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
                        <KeyInfo
                          label="Numero da NF"
                          value={xmlPreview.invoiceNumber || "Nao encontrado"}
                        />
                        <KeyInfo
                          label="Fornecedor"
                          value={xmlPreview.supplier || "Nao encontrado"}
                        />
                        <KeyInfo label="CNPJ emissor" value={xmlPreview.supplierCnpj || "Nao encontrado"} />
                        <KeyInfo
                          label="Itens encontrados"
                          value={String(xmlPreview.items.length)}
                        />
                      </div>

                      <div className="mt-4 max-h-48 overflow-y-auto rounded-lg border border-slate-200">
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="bg-slate-100 text-slate-600">
                              <Th>Produto</Th>
                              <Th>Qtd.</Th>
                              <Th>Lote</Th>
                              <Th>Validade</Th>
                            </tr>
                          </thead>
                          <tbody>
                            {xmlPreview.items.map((item, index) => (
                              <tr className="border-t border-slate-100" key={index}>
                                <Td>{item.product}</Td>
                                <Td>
                                  {item.expected} {item.unit}
                                </Td>
                                <Td>{item.batch || "-"}</Td>
                                <Td>{item.validity || "-"}</Td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                        <button
                          className="flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 py-3.5 text-sm font-bold text-emerald-950 shadow-sm transition hover:bg-emerald-400 active:scale-[0.98] sm:py-3"
                          onClick={confirmXmlImport}
                          type="button"
                        >
                          Importar {xmlPreview.items.length} item(ns) para a conferencia
                        </button>
                        <button
                          className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
                          onClick={cancelXmlPreview}
                          type="button"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : scanMode === "photo" ? (
                <div className="mt-5 flex min-h-72 flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-5 text-center sm:min-h-80">
                  <input
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={handleNotePhotoChange}
                    ref={notePhotoInputRef}
                    type="file"
                  />

                  {notePhotoUrl ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element -- blob: local do arquivo capturado na hora; next/image nao otimiza (nem precisa) URLs de objeto locais */}
                      <img
                        alt="Foto da nota capturada"
                        className="max-h-56 w-full rounded-xl border border-slate-200 object-contain"
                        src={notePhotoUrl}
                      />
                      <p className="mt-4 max-w-sm text-sm leading-6 text-slate-600">
                        Foto capturada e guardada como evidencia do
                        recebimento. A leitura automatica dos produtos (OCR)
                        ainda nao esta disponivel nesta fase — use a chave de
                        acesso pela camera ou cadastre os itens na
                        conferencia.
                      </p>
                      <button
                        className="mt-4 rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
                        onClick={() => notePhotoInputRef.current?.click()}
                        type="button"
                      >
                        Tirar outra foto
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="grid h-20 w-20 place-items-center rounded-xl bg-[#09233f] text-3xl font-bold text-white sm:h-24 sm:w-24 sm:text-4xl">
                        NF
                      </div>
                      <h3 className="mt-5 text-lg font-semibold">
                        Fotografe a nota com a camera
                      </h3>
                      <p className="mt-2 max-w-sm text-sm leading-6 text-slate-600">
                        Abre a camera do aparelho de verdade e guarda a foto
                        como evidencia. A leitura automatica dos itens (OCR)
                        ainda nao esta disponivel — para importar sem digitar,
                        use a chave de acesso pela camera ao lado.
                      </p>

                      <button
                        className="mt-5 flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 py-3.5 text-sm font-bold text-emerald-950 shadow-sm transition hover:bg-emerald-400 active:scale-[0.98] sm:w-auto sm:py-3"
                        onClick={() => notePhotoInputRef.current?.click()}
                        type="button"
                      >
                        <IconCamera className="h-4 w-4" />
                        Tirar foto da nota
                      </button>
                    </>
                  )}
                </div>
              ) : (
                <div className="mt-5 min-h-72 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:min-h-80 sm:p-5">
                  <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                    <div>
                      <h3 className="text-lg font-semibold">
                        Chave de acesso da NF-e
                      </h3>
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        Aponte a camera para o codigo de barras ou QR da DANFE
                        para nao digitar nada. Se preferir, cole ou digite os
                        44 numeros — com pontos, tracos ou espacos, tanto faz.
                      </p>
                    </div>
                    <span
                      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${
                        isInvoiceKeyValid
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-rose-100 text-rose-800"
                      }`}
                    >
                      {isInvoiceKeyValid ? <IconCheck className="h-3.5 w-3.5" /> : null}
                      {cleanInvoiceKey.length}/44 digitos
                    </span>
                  </div>

                  <button
                    className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[#09233f] px-5 py-3.5 text-sm font-bold text-white transition hover:bg-[#12385f] active:scale-[0.98] sm:py-3"
                    onClick={openKeyScanner}
                    type="button"
                  >
                    <IconCamera className="h-4 w-4" />
                    Escanear codigo de barras / QR com a camera
                  </button>

                  {cameraError && (
                    <p className="mt-2 flex items-start gap-2 text-xs font-semibold leading-5 text-amber-700">
                      <IconAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      {cameraError}
                    </p>
                  )}

                  <div className="mt-5 flex items-center justify-between gap-3">
                    <label className="text-sm font-bold text-slate-700" htmlFor="invoice-key-input">
                      Ou cole/digite a chave
                    </label>
                    <button
                      className="flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-100"
                      onClick={pasteInvoiceKeyFromClipboard}
                      type="button"
                    >
                      <IconClipboard className="h-3.5 w-3.5" />
                      Colar
                    </button>
                  </div>
                  <textarea
                    aria-label="Chave de acesso da NF-e"
                    className="mt-2 h-24 w-full resize-none rounded-lg border border-slate-300 bg-white p-3 font-mono text-sm font-semibold tracking-[0.08em] outline-none focus:border-cyan-600 sm:text-base"
                    id="invoice-key-input"
                    inputMode="numeric"
                    onChange={(event) => handleInvoiceKeyChange(event.target.value)}
                    onPaste={(event) => {
                      event.preventDefault();
                      const text = event.clipboardData.getData("text");
                      handleInvoiceKeyChange(cleanInvoiceKey + text);
                    }}
                    placeholder="Digite ou cole os 44 digitos"
                    value={formatInvoiceKey(invoiceKey)}
                  />

                  {pasteError && (
                    <p className="mt-2 flex items-start gap-2 text-xs font-semibold leading-5 text-amber-700">
                      <IconAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      {pasteError}
                    </p>
                  )}

                  {invoiceKeyTouched && !isInvoiceKeyComplete && (
                    <p className="mt-3 flex items-start gap-2 rounded-lg bg-rose-50 p-3 text-xs font-semibold leading-5 text-rose-800">
                      <IconAlert className="mt-0.5 h-4 w-4 shrink-0" />
                      Chave incompleta: a NF-e precisa de exatamente 44 numeros.
                      Faltam {44 - cleanInvoiceKey.length} digito(s).
                    </p>
                  )}

                  {isInvoiceKeyComplete && !isInvoiceKeyChecksumValid && (
                    <p className="mt-3 flex items-start gap-2 rounded-lg bg-rose-50 p-3 text-xs font-semibold leading-5 text-rose-800">
                      <IconAlert className="mt-0.5 h-4 w-4 shrink-0" />
                      Chave incorreta: o digito verificador nao confere. Confira
                      se todos os numeros foram digitados/escaneados certinho.
                    </p>
                  )}

                  {isInvoiceKeyValid && (
                    <p className="mt-3 flex items-start gap-2 rounded-lg bg-emerald-50 p-3 text-xs font-semibold leading-5 text-emerald-800">
                      <IconCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      Chave valida com 44 digitos. Confira os dados abaixo antes
                      de importar.
                    </p>
                  )}

                  {isInvoiceKeyValid && (fiscalLookupLoading || fiscalLookup) && (
                    <FiscalLookupBanner
                      loading={fiscalLookupLoading}
                      onVincular={vincularDocumentoFiscal}
                      result={fiscalLookup}
                    />
                  )}

                  <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                    <KeyInfo label="UF" value={invoiceKeyParts.uf} />
                    <KeyInfo label="Emissao" value={invoiceKeyParts.issue} />
                    <KeyInfo label="CNPJ emissor" value={invoiceKeyParts.cnpj} />
                    <KeyInfo label="Modelo" value={invoiceKeyParts.model} />
                    <KeyInfo label="Serie" value={invoiceKeyParts.series} />
                    <KeyInfo label="Numero da NF" value={invoiceKeyParts.number} />
                  </div>

                  <button
                    className="mt-5 w-full rounded-xl bg-emerald-500 px-5 py-3.5 text-sm font-bold text-emerald-950 shadow-sm transition hover:bg-emerald-400 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 sm:py-3"
                    disabled={!isInvoiceKeyValid || scanState === "reading"}
                    onClick={useKeyAndImportItems}
                    type="button"
                  >
                    {scanState === "reading"
                      ? "Validando chave..."
                      : "Usar chave e importar itens"}
                  </button>
                  <p className="mt-2 text-xs leading-5 text-slate-500">
                    Ao confirmar, o numero da nota e preenchido automaticamente
                    e voce vai direto para a conferencia.
                  </p>
                </div>
              )}
            </div>

            <div className="rounded-2xl bg-white p-4 shadow-sm sm:p-5">
              <h2 className="text-xl font-semibold sm:text-2xl">Fila inteligente</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                O app transforma a nota em tarefas de conferencia, separando o
                que ja esta certo do que precisa de atencao.
              </p>

              <div className="mt-5 grid gap-3">
                <ProcessCard
                  detail="Identifica CNPJ, numero da NF, emissao, fornecedor e chave de acesso."
                  label="Leitura da nota"
                  status={
                    scanState === "idle" ? "Aguardando captura" : "Pronto"
                  }
                />
                <ProcessCard
                  detail="Limpa separadores, formata em blocos e confere o digito verificador."
                  label="Validacao da chave"
                  status={
                    isInvoiceKeyValid
                      ? "Chave valida"
                      : isInvoiceKeyComplete
                        ? "Digito nao confere"
                        : "Incompleta"
                  }
                />
                <ProcessCard
                  detail="Extrai codigo, descricao, unidade e quantidade."
                  label="Itens importados"
                  status={
                    items.length > 0 ? `${items.length} na lista` : "Nenhum ainda"
                  }
                />
                <ProcessCard
                  detail="Botoes rapidos para recebido, falta, sobra, avaria, validade e lote."
                  label="Conferencia fisica"
                  status="Preparada"
                />
                <ProcessCard
                  detail="Gera PDF/Excel e mensagem pronta para WhatsApp com as divergencias."
                  label="Relatorio final"
                  status="Ao finalizar"
                />
              </div>
            </div>
          </section>
        )}

        {activeTab === "Conferencia" && (
          <section className="grid min-w-0 gap-4 sm:gap-5">
            <div className="min-w-0 rounded-2xl bg-white p-4 shadow-sm sm:p-5">
              <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
                <div>
                  <p className="text-sm font-semibold text-cyan-700">Etapa 2</p>
                  <h2 className="mt-1 text-xl font-semibold sm:text-2xl">
                    Conferencia de recebimento
                  </h2>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                    Use os botoes rapidos para marcar cada produto sem digitar.
                    O status muda automaticamente.
                  </p>
                </div>
                <div className="grid grid-cols-4 gap-2 text-center">
                  <Pill label="OK" value={totals.done} tone="green" />
                  <Pill label="Diverg." value={totals.divergent} tone="amber" />
                  <Pill label="Pend." value={totals.pending} tone="red" />
                  <Pill label="Avaria" value={totals.damaged} tone="slate" />
                </div>
              </div>

              {!isFinalized && items.length > 0 && (
                <button
                  className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[#09233f] px-5 py-3.5 text-sm font-bold text-white shadow-sm transition hover:bg-[#12385f] active:scale-[0.98] sm:py-3"
                  onClick={openConferenceScanner}
                  type="button"
                >
                  <IconCamera className="h-4 w-4" />
                  Escanear produtos (camera) — soma 1 a cada leitura
                </button>
              )}

              {cameraError && scannerTarget === null && (
                <p className="mt-2 flex items-start gap-2 text-xs font-semibold leading-5 text-amber-700">
                  <IconAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {cameraError}
                </p>
              )}

              {isFinalized && (
                <p className="mt-4 flex items-start gap-2 rounded-lg bg-cyan-50 p-3 text-xs font-semibold leading-5 text-cyan-900">
                  <IconCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  Recebimento finalizado em {finalizedAt}. Os campos ficam
                  bloqueados. Use &quot;Reabrir conferencia&quot; para editar
                  de novo.
                </p>
              )}

              {!isFinalized && (
                <div className="mt-5 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4">
                  <p className="text-sm font-bold text-slate-700">
                    Adicionar item da nota
                  </p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    Enquanto a importacao automatica nao esta conectada,
                    cadastre os produtos manualmente.
                  </p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-[0.9fr_1.6fr_0.6fr_0.7fr_auto]">
                    <div className="flex gap-1">
                      <input
                        aria-label="Codigo do produto"
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-cyan-600"
                        onChange={(event) =>
                          setNewItem((current) => ({ ...current, code: event.target.value }))
                        }
                        placeholder="Codigo"
                        value={newItem.code}
                      />
                      <button
                        aria-label="Escanear codigo de barras do produto"
                        className="flex shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white px-2.5 text-slate-600 transition hover:bg-slate-100"
                        onClick={openItemCodeScanner}
                        title="Escanear codigo de barras"
                        type="button"
                      >
                        <IconCamera className="h-4 w-4" />
                      </button>
                    </div>
                    <input
                      aria-label="Nome do produto"
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-cyan-600"
                      onChange={(event) =>
                        setNewItem((current) => ({ ...current, product: event.target.value }))
                      }
                      placeholder="Nome do produto"
                      value={newItem.product}
                    />
                    <input
                      aria-label="Unidade"
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-cyan-600"
                      onChange={(event) =>
                        setNewItem((current) => ({ ...current, unit: event.target.value }))
                      }
                      placeholder="UN"
                      value={newItem.unit}
                    />
                    <input
                      aria-label="Quantidade da nota"
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-cyan-600"
                      min="0"
                      onChange={(event) =>
                        setNewItem((current) => ({ ...current, expected: event.target.value }))
                      }
                      placeholder="Qtd."
                      type="number"
                      value={newItem.expected}
                    />
                    <button
                      className="rounded-lg bg-[#09233f] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#12385f] disabled:cursor-not-allowed disabled:bg-slate-300"
                      disabled={!newItem.product.trim() || !newItem.expected}
                      onClick={addItem}
                      type="button"
                    >
                      Adicionar
                    </button>
                  </div>
                </div>
              )}

              {items.length === 0 && (
                <p className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-6 text-center text-sm leading-6 text-slate-500">
                  Nenhum item na conferencia ainda. Use o formulario acima
                  para adicionar os produtos da nota.
                </p>
              )}

              {/* Mobile: card list */}
              <div className="mt-5 grid gap-3 sm:hidden">
                {items.map((item) => (
                  <article
                    className={`rounded-xl border p-4 ${
                      item.damaged ? "border-rose-200 bg-rose-50/40" : "border-slate-200"
                    }`}
                    key={item.id}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                          {item.code} - {item.unit}
                        </p>
                        <p className="mt-0.5 font-semibold text-slate-900">
                          {item.product}
                        </p>
                      </div>
                      <StatusBadge status={item.status} />
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                          Nota
                        </p>
                        <p className="mt-1 font-semibold">
                          {item.expected} {item.unit}
                        </p>
                      </div>
                      <label className="block">
                        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                          Recebido
                        </p>
                        <input
                          aria-label={`Quantidade recebida de ${item.product}`}
                          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-semibold outline-none focus:border-cyan-600 disabled:bg-slate-100 disabled:text-slate-500"
                          disabled={isFinalized}
                          min="0"
                          onChange={(event) => updateReceived(item.id, event.target.value)}
                          type="number"
                          value={item.received}
                        />
                      </label>
                    </div>

                    {item.received > 0 && item.received !== item.expected && (
                      <p
                        className={`mt-2 text-xs font-bold ${
                          item.received < item.expected ? "text-rose-700" : "text-amber-700"
                        }`}
                      >
                        {item.received < item.expected
                          ? `Falta ${item.expected - item.received} ${item.unit}`
                          : `Sobra ${item.received - item.expected} ${item.unit}`}
                      </p>
                    )}

                    <p className="mt-3 text-xs font-bold uppercase tracking-wide text-slate-500">
                      Acoes rapidas
                    </p>
                    <div className="mt-2 grid grid-cols-3 gap-2">
                      <QuickActionButton
                        disabled={isFinalized}
                        icon={IconCheckCircle}
                        label="Recebido tudo"
                        onClick={() => markReceivedAll(item.id)}
                        tone="green"
                      />
                      <QuickActionButton
                        active={item.shortageFlag}
                        disabled={isFinalized}
                        icon={IconArrowDown}
                        label="Faltou"
                        onClick={() => toggleShortage(item.id)}
                        tone="rose"
                      />
                      <QuickActionButton
                        active={item.surplusFlag}
                        disabled={isFinalized}
                        icon={IconArrowUp}
                        label="Sobrou"
                        onClick={() => toggleSurplus(item.id)}
                        tone="amber"
                      />
                      <QuickActionButton
                        active={item.damaged}
                        disabled={isFinalized}
                        icon={IconAlert}
                        label="Avaria"
                        onClick={() => toggleDamaged(item.id)}
                        tone="rose"
                      />
                      <QuickActionButton
                        active={item.shortValidity}
                        disabled={isFinalized}
                        icon={IconClock}
                        label="Validade curta"
                        onClick={() => toggleShortValidity(item.id)}
                        tone="amber"
                      />
                      <QuickActionButton
                        active={item.missingBatchFlag}
                        disabled={isFinalized}
                        icon={IconTag}
                        label="Lote nao informado"
                        onClick={() => toggleMissingBatch(item.id)}
                        tone="amber"
                      />
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-3">
                      <label className="block">
                        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                          Lote
                        </p>
                        <input
                          aria-label={`Lote de ${item.product}`}
                          className={`mt-1 w-full rounded-lg border px-3 py-2 outline-none focus:border-cyan-600 disabled:bg-slate-100 disabled:text-slate-500 ${
                            item.missingBatchFlag ? "border-amber-400 bg-amber-50" : "border-slate-300"
                          }`}
                          disabled={isFinalized}
                          onChange={(event) => updateField(item.id, "batch", event.target.value)}
                          placeholder="Escanear"
                          value={item.batch}
                        />
                      </label>
                      <label className="block">
                        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                          Validade
                        </p>
                        <input
                          aria-label={`Validade de ${item.product}`}
                          className={`mt-1 w-full rounded-lg border px-3 py-2 outline-none focus:border-cyan-600 disabled:bg-slate-100 disabled:text-slate-500 ${
                            item.shortValidity ? "border-amber-400 bg-amber-50" : "border-slate-300"
                          }`}
                          disabled={isFinalized}
                          onChange={(event) => updateField(item.id, "validity", event.target.value)}
                          type="date"
                          value={item.validity}
                        />
                      </label>
                    </div>

                    {item.damaged && (
                      <input
                        aria-label={`Observacao de avaria de ${item.product}`}
                        className="mt-2 w-full rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs outline-none focus:border-rose-500 disabled:bg-slate-100"
                        disabled={isFinalized}
                        onChange={(event) => updateField(item.id, "note", event.target.value)}
                        placeholder="Descreva a avaria"
                        value={item.note}
                      />
                    )}

                    {!isFinalized && (
                      <button
                        className="mt-3 text-xs font-bold text-rose-600 hover:text-rose-800"
                        onClick={() => removeItem(item.id)}
                        type="button"
                      >
                        Remover item
                      </button>
                    )}
                  </article>
                ))}
              </div>

              {/* Desktop / tablet: table */}
              <div className="mt-5 hidden overflow-x-auto sm:block">
                <table className="w-full min-w-[1320px] border-separate border-spacing-0 text-left text-sm">
                  <thead>
                    <tr className="bg-slate-100 text-xs uppercase tracking-wide text-slate-600">
                      <Th>Codigo</Th>
                      <Th>Produto</Th>
                      <Th>Un.</Th>
                      <Th>Nota</Th>
                      <Th>Recebido</Th>
                      <Th>Lote</Th>
                      <Th>Validade</Th>
                      <Th>Acoes rapidas</Th>
                      <Th>Status</Th>
                      <Th>{""}</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr
                        className={`border-b border-slate-200 ${item.damaged ? "bg-rose-50/40" : ""}`}
                        key={item.id}
                      >
                        <Td>{item.code}</Td>
                        <Td>
                          <span className="font-semibold text-slate-900">{item.product}</span>
                          {item.received > 0 && item.received !== item.expected && (
                            <p
                              className={`text-xs font-bold ${
                                item.received < item.expected ? "text-rose-700" : "text-amber-700"
                              }`}
                            >
                              {item.received < item.expected
                                ? `Falta ${item.expected - item.received}`
                                : `Sobra ${item.received - item.expected}`}
                            </p>
                          )}
                        </Td>
                        <Td>{item.unit}</Td>
                        <Td>{item.expected}</Td>
                        <Td>
                          <input
                            aria-label={`Quantidade recebida de ${item.product}`}
                            className="w-24 rounded-lg border border-slate-300 px-3 py-2 font-semibold outline-none focus:border-cyan-600 disabled:bg-slate-100 disabled:text-slate-500"
                            disabled={isFinalized}
                            min="0"
                            onChange={(event) => updateReceived(item.id, event.target.value)}
                            type="number"
                            value={item.received}
                          />
                        </Td>
                        <Td>
                          <input
                            aria-label={`Lote de ${item.product}`}
                            className={`w-28 rounded-lg border px-3 py-2 outline-none focus:border-cyan-600 disabled:bg-slate-100 disabled:text-slate-500 ${
                              item.missingBatchFlag ? "border-amber-400 bg-amber-50" : "border-slate-300"
                            }`}
                            disabled={isFinalized}
                            onChange={(event) => updateField(item.id, "batch", event.target.value)}
                            placeholder="Escanear"
                            value={item.batch}
                          />
                        </Td>
                        <Td>
                          <input
                            aria-label={`Validade de ${item.product}`}
                            className={`w-36 rounded-lg border px-3 py-2 outline-none focus:border-cyan-600 disabled:bg-slate-100 disabled:text-slate-500 ${
                              item.shortValidity ? "border-amber-400 bg-amber-50" : "border-slate-300"
                            }`}
                            disabled={isFinalized}
                            onChange={(event) => updateField(item.id, "validity", event.target.value)}
                            type="date"
                            value={item.validity}
                          />
                        </Td>
                        <Td>
                          <div className="grid w-[210px] grid-cols-3 gap-1.5">
                            <QuickActionButton
                              disabled={isFinalized}
                              icon={IconCheckCircle}
                              label="Tudo"
                              onClick={() => markReceivedAll(item.id)}
                              tone="green"
                            />
                            <QuickActionButton
                              active={item.shortageFlag}
                              disabled={isFinalized}
                              icon={IconArrowDown}
                              label="Faltou"
                              onClick={() => toggleShortage(item.id)}
                              tone="rose"
                            />
                            <QuickActionButton
                              active={item.surplusFlag}
                              disabled={isFinalized}
                              icon={IconArrowUp}
                              label="Sobrou"
                              onClick={() => toggleSurplus(item.id)}
                              tone="amber"
                            />
                            <QuickActionButton
                              active={item.damaged}
                              disabled={isFinalized}
                              icon={IconAlert}
                              label="Avaria"
                              onClick={() => toggleDamaged(item.id)}
                              tone="rose"
                            />
                            <QuickActionButton
                              active={item.shortValidity}
                              disabled={isFinalized}
                              icon={IconClock}
                              label="Validade"
                              onClick={() => toggleShortValidity(item.id)}
                              tone="amber"
                            />
                            <QuickActionButton
                              active={item.missingBatchFlag}
                              disabled={isFinalized}
                              icon={IconTag}
                              label="S/ lote"
                              onClick={() => toggleMissingBatch(item.id)}
                              tone="amber"
                            />
                          </div>
                        </Td>
                        <Td>
                          <StatusBadge status={item.status} />
                        </Td>
                        <Td>
                          {!isFinalized && (
                            <button
                              className="text-xs font-bold text-rose-600 hover:text-rose-800"
                              onClick={() => removeItem(item.id)}
                              type="button"
                            >
                              Remover
                            </button>
                          )}
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-2xl bg-white p-4 shadow-sm sm:p-5">
              <h3 className="text-lg font-semibold">
                Resumo automatico de divergencias
              </h3>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                Calculado em tempo real a partir da conferencia acima.
              </p>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <SummaryStat label="Itens conferidos" tone="green" value={totals.done} />
                <SummaryStat label="Itens pendentes" tone="slate" value={totals.pending} />
                <SummaryStat label="Divergencias" tone="amber" value={totals.divergent} />
                <SummaryStat label="Produtos com falta" tone="red" value={totals.shortageCount} />
                <SummaryStat label="Produtos com sobra" tone="amber" value={totals.surplusCount} />
                <SummaryStat label="Produtos com avaria" tone="red" value={totals.damaged} />
                <SummaryStat label="Produtos sem lote" tone="amber" value={totals.missingBatchCount} />
                <SummaryStat
                  label="Validade curta"
                  tone="amber"
                  value={totals.shortValidityCount}
                />
              </div>

              <label className="mt-5 block text-sm font-bold text-slate-700">
                Observacoes do recebimento
                <textarea
                  aria-label="Observacoes do recebimento"
                  className="mt-2 h-20 w-full resize-none rounded-lg border border-slate-300 bg-white p-3 text-sm font-normal outline-none focus:border-cyan-600 disabled:bg-slate-100 disabled:text-slate-500"
                  disabled={isFinalized}
                  onChange={(event) => setReceivingNotes(event.target.value)}
                  placeholder="Ex.: motorista relatou pallet molhado, aguardando retorno do fornecedor..."
                  value={receivingNotes}
                />
              </label>

              <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                {isFinalized ? (
                  <button
                    className="rounded-xl border border-slate-300 px-5 py-3.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50 active:scale-[0.98] sm:py-3"
                    onClick={reopenReceiving}
                    type="button"
                  >
                    Reabrir conferencia
                  </button>
                ) : (
                  <button
                    className="rounded-xl bg-emerald-500 px-5 py-3.5 text-sm font-bold text-emerald-950 shadow-sm transition hover:bg-emerald-400 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 sm:py-3"
                    disabled={items.length === 0}
                    onClick={finalizeReceiving}
                    type="button"
                  >
                    Finalizar recebimento
                  </button>
                )}
                <button
                  className="rounded-xl border border-slate-300 px-5 py-3.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50 active:scale-[0.98] sm:py-3"
                  onClick={() => setActiveTab("Relatorio")}
                  type="button"
                >
                  Ver relatorio
                </button>
              </div>
            </div>
          </section>
        )}

        {activeTab === "Inventario" && (
          <section className="grid gap-4 sm:gap-5 lg:grid-cols-[1fr_0.8fr]">
            <div className="rounded-2xl bg-white p-4 shadow-sm sm:p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-cyan-700">Etapa 3</p>
                  <h2 className="mt-1 text-xl font-semibold sm:text-2xl">
                    Inventario por leitura rapida
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Controle por endereco, lote e validade. Ideal para contagem
                    de palete, rua, prateleira ou camara fria.
                  </p>
                </div>
                <button
                  className="hidden shrink-0 rounded-xl bg-[#09233f] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#12385f] sm:inline-block"
                  onClick={addInventoryRow}
                  type="button"
                >
                  Nova contagem
                </button>
              </div>

              {inventoryRows.length === 0 && (
                <p className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-6 text-center text-sm leading-6 text-slate-500">
                  Nenhuma contagem registrada ainda. Use &quot;Nova
                  contagem&quot; para comecar.
                </p>
              )}

              <div className="mt-5 grid gap-3">
                {inventoryRows.map((row, index) => (
                  <article
                    className="grid gap-3 rounded-xl border border-slate-200 p-4 sm:grid-cols-[1fr_1fr_0.6fr_0.6fr_0.6fr_auto]"
                    key={index}
                  >
                    <label className="block">
                      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                        Endereco
                      </p>
                      <input
                        aria-label="Endereco"
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-cyan-600"
                        onChange={(event) => updateInventoryRow(index, "location", event.target.value)}
                        placeholder="Rua A / Palete 04"
                        value={row.location}
                      />
                    </label>
                    <label className="block">
                      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                        Produto
                      </p>
                      <input
                        aria-label="Produto"
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-cyan-600"
                        onChange={(event) => updateInventoryRow(index, "product", event.target.value)}
                        placeholder="Nome do produto"
                        value={row.product}
                      />
                    </label>
                    <label className="block">
                      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                        Qtd.
                      </p>
                      <input
                        aria-label="Quantidade"
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-cyan-600"
                        onChange={(event) => updateInventoryRow(index, "quantity", event.target.value)}
                        placeholder="148 un"
                        value={row.quantity}
                      />
                    </label>
                    <label className="block">
                      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                        Lotes
                      </p>
                      <input
                        aria-label="Lotes"
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-cyan-600"
                        onChange={(event) => updateInventoryRow(index, "lots", event.target.value)}
                        placeholder="2 lotes"
                        value={row.lots}
                      />
                    </label>
                    <label className="block">
                      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                        Status
                      </p>
                      <select
                        aria-label="Status da contagem"
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-cyan-600"
                        onChange={(event) => updateInventoryRow(index, "status", event.target.value)}
                        value={row.status}
                      >
                        <option value="OK">OK</option>
                        <option value="Baixo">Baixo</option>
                        <option value="Contar">Contar</option>
                      </select>
                    </label>
                    <div className="flex items-end">
                      <button
                        className="text-xs font-bold text-rose-600 hover:text-rose-800"
                        onClick={() => removeInventoryRow(index)}
                        type="button"
                      >
                        Remover
                      </button>
                    </div>
                  </article>
                ))}
                <button
                  className="rounded-xl bg-[#09233f] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#12385f] sm:hidden"
                  onClick={addInventoryRow}
                  type="button"
                >
                  Nova contagem
                </button>
              </div>
            </div>

            <div className="rounded-2xl bg-[#09233f] p-4 text-white shadow-sm sm:p-5">
              <p className="text-sm font-semibold text-cyan-200">
                Ideia para a proxima fase
              </p>
              <h2 className="mt-2 text-xl font-semibold sm:text-2xl">
                Escanear produto, caixa e lote
              </h2>
              <p className="mt-3 text-sm leading-6 text-slate-200">
                Quando a nota em papel nao trouxer lote e validade, o operador
                aponta a camera para a embalagem. O app salva a imagem como
                evidencia e sugere os campos por OCR.
              </p>
              <div className="mt-5 grid gap-3">
                <MiniStep step="01" text="Ler codigo de barras do produto" />
                <MiniStep step="02" text="Capturar lote e validade da caixa" />
                <MiniStep step="03" text="Vincular tudo ao recebimento" />
              </div>
            </div>
          </section>
        )}

        {activeTab === "Relatorio" && (
          <section className="grid gap-4 sm:gap-5 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="rounded-2xl bg-white p-4 shadow-sm sm:p-5">
              <p className="text-sm font-semibold text-cyan-700">Etapa 4</p>
              <h2 className="mt-1 text-xl font-semibold sm:text-2xl">
                Relatorio de divergencia
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Documento pronto para auditoria: quem recebeu, quando recebeu,
                o que faltou, o que sobrou e quais produtos ficaram sem lote ou
                validade.
              </p>

              <p
                className={`mt-4 flex items-start gap-2 rounded-lg p-3 text-xs font-semibold leading-5 ${
                  isFinalized ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"
                }`}
              >
                {isFinalized ? (
                  <IconCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                ) : (
                  <IconAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                )}
                {isFinalized
                  ? `Recebimento finalizado em ${finalizedAt}.`
                  : "Recebimento ainda nao finalizado. Volte na Conferencia para concluir."}
              </p>

              <div className="mt-5 grid gap-3">
                <ReportLine label="Numero da NF" value={invoiceNumber || "nao informado"} />
                <ReportLine label="Fornecedor" value={supplier || "nao informado"} />
                <ReportLine label="Responsavel" value={responsible || "nao informado"} />
                <ReportLine label="Data/hora de entrada" value={entryDateTime || "nao informada"} />
                <ReportLine label="Itens conferidos" value={`${totals.done}/${items.length}`} />
                <ReportLine label="Divergencias de quantidade" value={`${totals.divergent}`} />
                <ReportLine label="Unidades em falta" value={`${totals.missingUnits}`} />
                <ReportLine label="Unidades em sobra" value={`${totals.surplusUnits}`} />
                <ReportLine label="Itens com avaria" value={`${totals.damaged}`} />
                <ReportLine label="Itens sem lote" value={`${totals.missingBatchCount}`} />
                <ReportLine label="Itens com validade curta" value={`${totals.shortValidityCount}`} />
              </div>

              {receivingNotes && (
                <div className="mt-5">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                    Observacoes
                  </p>
                  <p className="mt-1 rounded-lg bg-slate-50 p-3 text-sm leading-6 text-slate-700">
                    {receivingNotes}
                  </p>
                </div>
              )}

              <div className="no-print mt-5 flex flex-col gap-3 sm:flex-row">
                <button
                  className="flex items-center justify-center gap-2 rounded-xl bg-[#09233f] px-5 py-3.5 text-sm font-bold text-white transition hover:bg-[#12385f] active:scale-[0.98] sm:py-3"
                  onClick={generatePdf}
                  type="button"
                >
                  <IconDoc className="h-4 w-4" />
                  Gerar PDF
                </button>
                <button
                  className="flex items-center justify-center gap-2 rounded-xl border border-slate-300 px-5 py-3.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50 active:scale-[0.98] sm:py-3"
                  onClick={exportExcel}
                  type="button"
                >
                  <IconClipboard className="h-4 w-4" />
                  Exportar Excel
                </button>
              </div>
              <p className="no-print mt-3 text-xs leading-5 text-slate-400">
                &quot;Gerar PDF&quot; abre a janela de impressao do navegador
                (salve como PDF). &quot;Exportar Excel&quot; baixa um arquivo
                .csv com todos os itens, pronto para abrir no Excel. A
                consulta real do XML da NF-e entra numa proxima fase.
              </p>
            </div>

            <div className="no-print rounded-2xl bg-white p-4 shadow-sm sm:p-5">
              <h3 className="text-lg font-semibold">Mensagem para WhatsApp</h3>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                Gera um resumo pronto para colar ou enviar direto no
                WhatsApp do fornecedor ou gerente.
              </p>

              <button
                className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 py-3.5 text-sm font-bold text-emerald-950 shadow-sm transition hover:bg-emerald-400 active:scale-[0.98] sm:py-3"
                onClick={generateWhatsappMessage}
                type="button"
              >
                <IconWhatsapp className="h-4 w-4" />
                Gerar mensagem para WhatsApp
              </button>

              {whatsappMessage && (
                <div className="mt-4">
                  <textarea
                    aria-label="Mensagem para WhatsApp"
                    className="h-48 w-full resize-none rounded-lg border border-slate-300 bg-slate-50 p-3 text-sm leading-6 text-slate-800 outline-none focus:border-cyan-600"
                    readOnly
                    value={whatsappMessage}
                  />
                  <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                    <button
                      className="flex items-center justify-center gap-2 rounded-xl border border-slate-300 px-5 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50 active:scale-[0.98]"
                      onClick={copyWhatsappMessage}
                      type="button"
                    >
                      <IconClipboard className="h-4 w-4" />
                      Copiar mensagem
                    </button>
                    <a
                      className="flex items-center justify-center gap-2 rounded-xl bg-[#09233f] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#12385f] active:scale-[0.98]"
                      href={`https://wa.me/?text=${encodeURIComponent(whatsappMessage)}`}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      <IconWhatsapp className="h-4 w-4" />
                      Abrir no WhatsApp
                    </a>
                  </div>
                  {copyFeedback && (
                    <p className="mt-2 text-xs font-semibold text-emerald-700">{copyFeedback}</p>
                  )}
                </div>
              )}
            </div>

            <div className="rounded-2xl bg-white p-4 shadow-sm sm:p-5">
              <h3 className="text-lg font-semibold">Resumo para aprovacao</h3>
              <div className="mt-4 space-y-3">
                {items.length === 0 && (
                  <p className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-500">
                    Nenhum item cadastrado ainda. Adicione os produtos na aba
                    Conferencia para gerar o resumo.
                  </p>
                )}
                {items.length > 0 &&
                  items.filter(
                    (item) => item.status !== "Conferido" || item.shortValidity || hasMissingBatch(item),
                  ).length === 0 && (
                    <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">
                      Nenhuma divergencia pendente. Recebimento pronto para
                      finalizar.
                    </p>
                  )}
                {items
                  .filter(
                    (item) => item.status !== "Conferido" || item.shortValidity || hasMissingBatch(item),
                  )
                  .map((item) => (
                    <article
                      className="rounded-xl border border-amber-200 bg-amber-50 p-4"
                      key={item.id}
                    >
                      <div className="flex flex-col justify-between gap-2 sm:flex-row">
                        <div>
                          <p className="font-semibold text-amber-950">{item.product}</p>
                          <p className="mt-1 text-sm text-amber-900">
                            Nota: {item.expected} {item.unit} | Recebido: {item.received} {item.unit}
                            {item.received !== item.expected && (
                              <>
                                {" "}
                                (
                                {item.received < item.expected
                                  ? `falta ${item.expected - item.received}`
                                  : `sobra ${item.received - item.expected}`}
                                )
                              </>
                            )}
                          </p>
                          <p className="mt-1 text-sm text-amber-900">
                            Lote: {item.batch || "nao informado"} | Validade:{" "}
                            {item.validity || "nao informada"}
                          </p>
                          {item.damaged && (
                            <p className="mt-1 text-sm font-semibold text-rose-700">
                              Avaria: {item.note || "sem descricao"}
                            </p>
                          )}
                          {item.shortValidity && (
                            <p className="mt-1 text-sm font-semibold text-amber-800">
                              Validade curta
                            </p>
                          )}
                        </div>
                        <StatusBadge status={item.status} />
                      </div>
                    </article>
                  ))}
              </div>
            </div>

            <div className="min-w-0 rounded-2xl bg-white p-4 shadow-sm sm:col-span-2 sm:p-5">
              <h3 className="text-lg font-semibold">
                Itens do recebimento ({items.length})
              </h3>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                Lista completa com lote, validade e avaria, para conferencia e
                auditoria.
              </p>
              {items.length === 0 ? (
                <p className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-6 text-center text-sm leading-6 text-slate-500">
                  Nenhum item cadastrado ainda.
                </p>
              ) : (
                <>
                  {/* Mobile: card list */}
                  <div className="mt-4 grid gap-3 sm:hidden">
                    {items.map((item) => (
                      <article className="rounded-xl border border-slate-200 p-4" key={item.id}>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                              {item.code}
                            </p>
                            <p className="mt-0.5 font-semibold text-slate-900">{item.product}</p>
                          </div>
                          <StatusBadge status={item.status} />
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-2 text-sm text-slate-600">
                          <p>
                            Nota: <strong>{item.expected} {item.unit}</strong>
                          </p>
                          <p>
                            Recebido: <strong>{item.received} {item.unit}</strong>
                          </p>
                          <p>Lote: {item.batch || "-"}</p>
                          <p>Validade: {item.validity || "-"}</p>
                          <p>Avaria: {item.damaged ? "Sim" : "Nao"}</p>
                        </div>
                      </article>
                    ))}
                  </div>

                  {/* Desktop / tablet: table */}
                  <div className="mt-4 hidden overflow-x-auto sm:block">
                    <table className="w-full min-w-[760px] border-separate border-spacing-0 text-left text-sm">
                      <thead>
                        <tr className="bg-slate-100 text-xs uppercase tracking-wide text-slate-600">
                          <Th>Codigo</Th>
                          <Th>Produto</Th>
                          <Th>Nota</Th>
                          <Th>Recebido</Th>
                          <Th>Lote</Th>
                          <Th>Validade</Th>
                          <Th>Avaria</Th>
                          <Th>Status</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((item) => (
                          <tr className="border-b border-slate-200" key={item.id}>
                            <Td>{item.code}</Td>
                            <Td>
                              <span className="font-semibold text-slate-900">{item.product}</span>
                            </Td>
                            <Td>
                              {item.expected} {item.unit}
                            </Td>
                            <Td>
                              {item.received} {item.unit}
                            </Td>
                            <Td>{item.batch || "-"}</Td>
                            <Td>{item.validity || "-"}</Td>
                            <Td>{item.damaged ? "Sim" : "Nao"}</Td>
                            <Td>
                              <StatusBadge status={item.status} />
                            </Td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </section>
        )}
      </div>

      {/* Mobile bottom navigation, app-like */}
      <nav
        aria-label="Modulos do StockScan Pro"
        className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 pb-safe backdrop-blur sm:hidden"
      >
        <div className="grid grid-cols-4">
          {tabs.map((tab) => (
            <button
              className={`flex flex-col items-center gap-1 px-2 py-2.5 text-[11px] font-semibold transition ${
                activeTab === tab.id ? "text-[#09233f]" : "text-slate-400"
              }`}
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              type="button"
            >
              <span
                className={`grid h-8 w-8 place-items-center rounded-lg transition ${
                  activeTab === tab.id ? "bg-cyan-100" : ""
                }`}
              >
                <tab.icon className="h-5 w-5" />
              </span>
              {tab.label}
            </button>
          ))}
        </div>
      </nav>

      {scannerTarget && (
        <div className="no-print fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black/90 p-4">
          <div className="relative w-full max-w-md">
            <video
              className="max-h-[55vh] w-full rounded-2xl bg-black"
              muted
              playsInline
              ref={videoRef}
            />
            {scannerTarget === "conferenceLoop" && scanFeedback && (
              <div
                className={`absolute inset-x-3 top-3 rounded-xl px-4 py-2.5 text-center text-sm font-bold shadow-lg ${
                  scanFeedback.tone === "success"
                    ? "bg-emerald-500 text-emerald-950"
                    : "bg-rose-500 text-white"
                }`}
              >
                {scanFeedback.text}
              </div>
            )}
          </div>

          <p className="max-w-xs text-center text-sm text-white">
            {scannerTarget === "invoiceKey"
              ? "Aponte para o codigo de barras ou QR da chave de acesso."
              : scannerTarget === "conferenceLoop"
                ? "Aponte para o codigo de barras de cada produto. A quantidade recebida soma 1 a cada leitura — pode continuar escaneando."
                : "Aponte para o codigo de barras do produto."}
          </p>

          {scannerTarget === "conferenceLoop" && scanLog.length > 0 && (
            <div className="w-full max-w-md rounded-xl bg-white/10 p-3">
              <ul className="space-y-1.5">
                {scanLog.map((entry, index) => (
                  <li
                    className={`text-xs font-semibold ${
                      entry.tone === "success" ? "text-emerald-300" : "text-rose-300"
                    }`}
                    key={index}
                  >
                    {entry.text}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <button
            className="rounded-xl bg-white px-6 py-3 text-sm font-bold text-slate-900 transition active:scale-[0.98]"
            onClick={closeScanner}
            type="button"
          >
            {scannerTarget === "conferenceLoop" ? "Concluir" : "Cancelar"}
          </button>
        </div>
      )}
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/15 bg-white/10 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-cyan-100">{label}</p>
      <p className="mt-1 text-xl font-semibold sm:text-2xl">{value}</p>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-2 last:border-b-0">
      <span className="text-slate-300">{label}</span>
      <strong className="text-right font-semibold">{value}</strong>
    </div>
  );
}

function EditableInfoRow({
  disabled,
  label,
  onChange,
  placeholder,
  value,
}: {
  disabled?: boolean;
  label: string;
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-2 last:border-b-0">
      <span className="shrink-0 text-slate-300">{label}</span>
      <input
        aria-label={label}
        className="min-w-0 flex-1 bg-transparent text-right font-semibold text-white outline-none placeholder:text-slate-400"
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        value={value}
      />
    </div>
  );
}

function ProcessCard({
  detail,
  label,
  status,
}: {
  detail: string;
  label: string;
  status: string;
}) {
  return (
    <article className="rounded-xl border border-slate-200 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold">{label}</h3>
          <p className="mt-1 text-sm leading-6 text-slate-600">{detail}</p>
        </div>
        <span className="shrink-0 rounded-full bg-cyan-50 px-3 py-1 text-xs font-bold text-cyan-800">
          {status}
        </span>
      </div>
    </article>
  );
}

function KeyInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 truncate font-semibold text-slate-900">{value}</p>
    </div>
  );
}

type FiscalLookupBannerResult = {
  status: string;
  tipo?: string;
  documentId?: string;
  numero?: string | null;
  serie?: string | null;
  emitenteNome?: string | null;
  emitenteCnpj?: string | null;
} | null;

// Mostra o status da consulta ao documento fiscal sincronizado (Atualizacao
// 2 — certificado A1). Se o backend fiscal nao estiver configurado, o
// resultado vem como "INDISPONIVEL" e nada e mostrado (a conferencia
// manual continua funcionando normalmente).
function FiscalLookupBanner({
  loading,
  onVincular,
  result,
}: {
  loading: boolean;
  onVincular: () => void;
  result: FiscalLookupBannerResult;
}) {
  if (loading) {
    return (
      <p className="mt-3 rounded-lg bg-slate-50 p-3 text-xs font-semibold leading-5 text-slate-600">
        Consultando documento fiscal sincronizado...
      </p>
    );
  }

  if (!result || result.status === "INDISPONIVEL") return null;

  if (result.status === "LOCALIZADO") {
    return (
      <div className="mt-3 rounded-lg bg-emerald-50 p-3 text-xs leading-5 text-emerald-900">
        <p className="font-bold">
          Documento localizado ({result.tipo === "CTE" ? "CT-e" : "NF-e"})
        </p>
        <p className="mt-1">
          {result.emitenteNome || "Emitente nao identificado"}
          {result.numero ? ` — numero ${result.numero}` : ""}
          {result.serie ? `, serie ${result.serie}` : ""}
        </p>
        <button
          className="mt-2 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-emerald-700"
          onClick={onVincular}
          type="button"
        >
          Vincular a este recebimento
        </button>
      </div>
    );
  }

  if (result.status === "JA_VINCULADO") {
    return (
      <p className="mt-3 rounded-lg bg-cyan-50 p-3 text-xs font-semibold leading-5 text-cyan-900">
        Documento ja vinculado a este (ou outro) recebimento.
      </p>
    );
  }

  if (result.status === "NAO_SINCRONIZADO") {
    return (
      <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs font-semibold leading-5 text-amber-900">
        Documento ainda nao sincronizado. Sincronize em Configuracoes &gt;
        Documentos Fiscais, ou continue preenchendo manualmente.
      </p>
    );
  }

  return null;
}

function Pill({
  label,
  tone,
  value,
}: {
  label: string;
  tone: "green" | "amber" | "red" | "slate";
  value: number;
}) {
  const colors = {
    amber: "bg-amber-50 text-amber-800",
    green: "bg-emerald-50 text-emerald-800",
    red: "bg-rose-50 text-rose-800",
    slate: "bg-slate-100 text-slate-700",
  };

  return (
    <div className={`rounded-xl px-4 py-3 ${colors[tone]}`}>
      <p className="text-xl font-bold">{value}</p>
      <p className="text-xs font-bold uppercase tracking-wide">{label}</p>
    </div>
  );
}

function SummaryStat({
  label,
  tone,
  value,
}: {
  label: string;
  tone: "green" | "amber" | "red" | "slate";
  value: number;
}) {
  const colors = {
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    green: "border-emerald-200 bg-emerald-50 text-emerald-900",
    red: "border-rose-200 bg-rose-50 text-rose-900",
    slate: "border-slate-200 bg-slate-50 text-slate-900",
  };

  return (
    <div className={`rounded-xl border p-4 ${colors[tone]}`}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="mt-1 text-xs font-bold uppercase tracking-wide">{label}</p>
    </div>
  );
}

function QuickActionButton({
  active,
  disabled,
  icon: Icon,
  label,
  onClick,
  tone,
}: {
  active?: boolean;
  disabled?: boolean;
  icon: (props: IconProps) => React.ReactElement;
  label: string;
  onClick: () => void;
  tone: "green" | "amber" | "rose";
}) {
  const toneActive = {
    amber: "border-amber-300 bg-amber-100 text-amber-900",
    green: "border-emerald-300 bg-emerald-100 text-emerald-900",
    rose: "border-rose-300 bg-rose-100 text-rose-900",
  };

  return (
    <button
      className={`flex flex-col items-center gap-1 rounded-lg border px-1.5 py-2 text-center text-[10.5px] font-bold leading-tight transition disabled:cursor-not-allowed disabled:opacity-50 ${
        active ? toneActive[tone] : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
      }`}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-3 first:rounded-l-lg last:rounded-r-lg">{children}</th>;
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="border-b border-slate-100 px-3 py-3 align-middle">{children}</td>;
}

function StatusBadge({ status }: { status: ItemStatus }) {
  const colors = {
    Conferido: "bg-emerald-50 text-emerald-800 ring-emerald-200",
    Divergente: "bg-amber-50 text-amber-800 ring-amber-200",
    Pendente: "bg-rose-50 text-rose-800 ring-rose-200",
  };

  return (
    <span className={`inline-flex shrink-0 rounded-full px-3 py-1 text-xs font-bold ring-1 ${colors[status]}`}>
      {status}
    </span>
  );
}

function MiniStep({ step, text }: { step: string; text: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-white/10 p-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-cyan-300 text-sm font-bold text-cyan-950">
        {step}
      </span>
      <p className="text-sm font-semibold text-slate-100">{text}</p>
    </div>
  );
}

function ReportLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl bg-slate-50 px-4 py-3">
      <span className="text-sm text-slate-600">{label}</span>
      <strong className="text-right">{value}</strong>
    </div>
  );
}

function escapeCsvCell(value: string) {
  if (/[";\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function formatInvoiceKey(digitsOnly: string) {
  return digitsOnly.match(/.{1,4}/g)?.join(" ") ?? "";
}

// Digito verificador real da chave de acesso da NF-e (modulo 11), conforme o
// manual de especificacoes tecnicas da NF-e. Nao depende de internet nem de
// consulta ao SEFAZ: e so matematica sobre os 43 primeiros digitos da chave.
function computeNfeCheckDigit(first43Digits: string) {
  const weights = [2, 3, 4, 5, 6, 7, 8, 9];
  let sum = 0;
  let weightIndex = 0;
  for (let i = first43Digits.length - 1; i >= 0; i--) {
    sum += Number(first43Digits[i]) * weights[weightIndex % weights.length];
    weightIndex++;
  }
  const remainder = sum % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

function isValidNfeKeyChecksum(key44Digits: string) {
  if (key44Digits.length !== 44) return false;
  const expectedDv = computeNfeCheckDigit(key44Digits.slice(0, 43));
  return expectedDv === Number(key44Digits[43]);
}

// --- Importacao real do XML da NF-e ---
// O XML padrao da NF-e (schema oficial da SEFAZ) ja traz produto, unidade,
// quantidade e, quando o fornecedor preenche rastreabilidade, lote e
// validade (tag <rastro>). Tudo processado no proprio navegador — nenhum
// arquivo sai da maquina do usuario.

type ParsedNfeItem = {
  code: string;
  barcode: string;
  product: string;
  unit: string;
  expected: number;
  batch: string;
  validity: string;
};

type ParsedNfe = {
  invoiceNumber: string;
  supplier: string;
  supplierCnpj: string;
  entryDateTime: string;
  accessKey: string;
  items: ParsedNfeItem[];
};

// Busca por nome local da tag, ignorando o namespace da NF-e
// (http://www.portalfiscal.inf.br/nfe), que atrapalha querySelector comum.
function getElsByLocalName(root: Document | Element, name: string): Element[] {
  return Array.from(root.getElementsByTagName("*")).filter(
    (el) => el.localName === name,
  );
}

function getTextByLocalName(root: Element, name: string): string {
  return getElsByLocalName(root, name)[0]?.textContent?.trim() ?? "";
}

function formatNfNumberFromXml(rawNumber: string) {
  const digits = rawNumber.replace(/\D/g, "");
  if (!digits) return "";
  const padded = digits.padStart(9, "0").slice(-9);
  return `${padded.slice(0, 3)}.${padded.slice(3, 6)}.${padded.slice(6, 9)}`;
}

function formatXmlDateTime(iso: string) {
  if (!iso) return "";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function parseNfeXml(xmlText: string): ParsedNfe {
  const doc = new DOMParser().parseFromString(xmlText, "application/xml");
  if (doc.getElementsByTagName("parsererror").length > 0) {
    throw new Error("Arquivo XML invalido ou corrompido.");
  }

  const infNFe = getElsByLocalName(doc, "infNFe")[0];
  if (!infNFe) {
    throw new Error("Este arquivo nao parece ser um XML de NF-e.");
  }

  const ide = getElsByLocalName(infNFe, "ide")[0];
  const emit = getElsByLocalName(infNFe, "emit")[0];

  const nNF = ide ? getTextByLocalName(ide, "nNF") : "";
  const dhEmi = ide
    ? getTextByLocalName(ide, "dhEmi") || getTextByLocalName(ide, "dEmi")
    : "";
  const supplierName = emit ? getTextByLocalName(emit, "xNome") : "";
  const supplierCnpj = emit ? getTextByLocalName(emit, "CNPJ") : "";

  let accessKey = "";
  const idAttr = infNFe.getAttribute("Id") ?? infNFe.getAttribute("id") ?? "";
  const idMatch = idAttr.match(/(\d{44})/);
  if (idMatch) accessKey = idMatch[1];

  const items: ParsedNfeItem[] = getElsByLocalName(infNFe, "det")
    .map((det) => {
      const prod = getElsByLocalName(det, "prod")[0];
      if (!prod) return null;

      const quantityRaw = getTextByLocalName(prod, "qCom").replace(",", ".");
      const quantity = Number(quantityRaw);
      const rastro = getElsByLocalName(prod, "rastro")[0];

      const cEAN = getTextByLocalName(prod, "cEAN");

      return {
        code: getTextByLocalName(prod, "cProd"),
        barcode: cEAN && cEAN.toUpperCase() !== "SEM GTIN" ? cEAN : "",
        product: getTextByLocalName(prod, "xProd") || "Produto sem descricao",
        unit: getTextByLocalName(prod, "uCom") || "UN",
        expected: Number.isFinite(quantity) ? Math.round(quantity * 100) / 100 : 0,
        batch: rastro ? getTextByLocalName(rastro, "nLote") : "",
        validity: rastro ? getTextByLocalName(rastro, "dVal").slice(0, 10) : "",
      };
    })
    .filter((item): item is ParsedNfeItem => item !== null && item.expected > 0);

  return {
    invoiceNumber: formatNfNumberFromXml(nNF),
    supplier: supplierName,
    supplierCnpj,
    entryDateTime: formatXmlDateTime(dhEmi),
    accessKey,
    items,
  };
}

function parseInvoiceKey(key: string) {
  if (key.length < 25) {
    return {
      cnpj: "Aguardando",
      issue: "Aguardando",
      model: "Aguardando",
      number: "Aguardando",
      series: "Aguardando",
      uf: "Aguardando",
    };
  }

  const ufCodes: Record<string, string> = {
    "11": "RO",
    "12": "AC",
    "13": "AM",
    "14": "RR",
    "15": "PA",
    "16": "AP",
    "17": "TO",
    "21": "MA",
    "22": "PI",
    "23": "CE",
    "24": "RN",
    "25": "PB",
    "26": "PE",
    "27": "AL",
    "28": "SE",
    "29": "BA",
    "31": "MG",
    "32": "ES",
    "33": "RJ",
    "35": "SP",
    "41": "PR",
    "42": "SC",
    "43": "RS",
    "50": "MS",
    "51": "MT",
    "52": "GO",
    "53": "DF",
  };

  const year = key.slice(2, 4);
  const month = key.slice(4, 6);
  const cnpj = key.slice(6, 20);
  const model = key.slice(20, 22);
  const series = key.slice(22, 25);
  const number = key.slice(25, 34).replace(/^0+(?=\d)/, "");

  return {
    cnpj: cnpj ? formatCnpj(cnpj) : "Aguardando",
    issue: `${month}/20${year}`,
    model: model || "Aguardando",
    number: number || "Aguardando",
    series: series || "Aguardando",
    uf: ufCodes[key.slice(0, 2)] ?? "UF nao identificada",
  };
}

function formatCnpj(digits: string) {
  if (digits.length !== 14) return digits;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12, 14)}`;
}

type IconProps = { className?: string };

function IconInbox({ className }: IconProps) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M4 12h4l2 3h4l2-3h4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5.5 5h13l2 7v6a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1v-6l2-7Z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconCheckList({ className }: IconProps) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M9 6h11M9 12h11M9 18h11" strokeLinecap="round" />
      <path d="m4 6 1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconGrid({ className }: IconProps) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <rect height="7" rx="1.5" width="7" x="3.5" y="3.5" />
      <rect height="7" rx="1.5" width="7" x="13.5" y="3.5" />
      <rect height="7" rx="1.5" width="7" x="3.5" y="13.5" />
      <rect height="7" rx="1.5" width="7" x="13.5" y="13.5" />
    </svg>
  );
}

function IconDoc({ className }: IconProps) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M7 3.5h7l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-16a1 1 0 0 1 1-1Z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14 3.5v4h4M9 12.5h6M9 16h6" strokeLinecap="round" />
    </svg>
  );
}

function IconCheck({ className }: IconProps) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
      <path d="m5 12 5 5 9-10" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconCheckCircle({ className }: IconProps) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12.5 2.5 2.5L16 9.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconAlert({ className }: IconProps) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M12 9v4M12 17h.01" strokeLinecap="round" />
      <path d="M10.29 3.86 1.82 18a1 1 0 0 0 .86 1.5h18.64a1 1 0 0 0 .86-1.5L13.71 3.86a1 1 0 0 0-1.72 0Z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconClipboard({ className }: IconProps) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <rect height="16" rx="1.5" width="12" x="6" y="5" />
      <path d="M9 5V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 11h6M9 15h6" strokeLinecap="round" />
    </svg>
  );
}

function IconCamera({ className }: IconProps) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path
        d="M4 8.5a1.5 1.5 0 0 1 1.5-1.5h2l1-2h7l1 2h2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5v-9Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}

function IconArrowDown({ className }: IconProps) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M12 4v14M6 13l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconArrowUp({ className }: IconProps) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M12 20V6M6 11l6-6 6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconClock({ className }: IconProps) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconTag({ className }: IconProps) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path
        d="M11.5 3.5H5a1.5 1.5 0 0 0-1.5 1.5v6.5a1.5 1.5 0 0 0 .44 1.06l9 9a1.5 1.5 0 0 0 2.12 0l6.5-6.5a1.5 1.5 0 0 0 0-2.12l-9-9a1.5 1.5 0 0 0-1.06-.44Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="8.5" cy="8.5" r="1.25" />
    </svg>
  );
}

function IconWhatsapp({ className }: IconProps) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path
        d="M4 20l1.3-3.9A8 8 0 1 1 8.9 19L4 20Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9 9.5c0 3 2.5 5.5 5.5 5.5.6 0 1-.5.9-1.1l-.2-1a.7.7 0 0 0-.7-.5l-1.3.2a4 4 0 0 1-2.3-2.3l.2-1.3a.7.7 0 0 0-.5-.7l-1-.2c-.6-.1-1.1.3-1.1.9V9.5Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
