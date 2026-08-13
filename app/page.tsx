"use client";

import { useMemo, useState } from "react";

type ItemStatus = "Conferido" | "Divergente" | "Pendente";
type ScanMode = "photo" | "key";
type TabId = "Recebimento" | "Conferencia" | "Inventario" | "Relatorio";

type InvoiceItem = {
  id: number;
  code: string;
  product: string;
  unit: string;
  expected: number;
  received: number;
  batch: string;
  validity: string;
  damaged: boolean;
  note: string;
  status: ItemStatus;
};

function computeItemStatus(
  received: number,
  expected: number,
  damaged: boolean,
): ItemStatus {
  if (received === 0) return "Pendente";
  if (damaged) return "Divergente";
  return received === expected ? "Conferido" : "Divergente";
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

const tabs: { id: TabId; label: string; icon: (props: IconProps) => React.ReactElement }[] = [
  { id: "Recebimento", label: "Receber", icon: IconInbox },
  { id: "Conferencia", label: "Conferir", icon: IconCheckList },
  { id: "Inventario", label: "Estoque", icon: IconGrid },
  { id: "Relatorio", label: "Relatorio", icon: IconDoc },
];

const sampleInvoiceKey = "13260812345678000195550010004821191012345678";

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabId>("Recebimento");
  const [scanMode, setScanMode] = useState<ScanMode>("photo");
  const [scanState, setScanState] = useState<"idle" | "reading" | "done">(
    "idle",
  );
  const [invoiceKey, setInvoiceKey] = useState("");
  const [pasteError, setPasteError] = useState("");
  const [items, setItems] = useState(initialItems);
  const [nextItemId, setNextItemId] = useState(1);
  const [receivingNotes, setReceivingNotes] = useState("");
  const [finalizedAt, setFinalizedAt] = useState<string | null>(null);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [supplier, setSupplier] = useState("");
  const [responsible, setResponsible] = useState("");
  const [entryDateTime, setEntryDateTime] = useState("");
  const [inventoryRows, setInventoryRows] = useState(initialInventoryRows);
  const [newItem, setNewItem] = useState({ code: "", product: "", unit: "UN", expected: "" });
  const cleanInvoiceKey = invoiceKey.replace(/\D/g, "").slice(0, 44);
  const isInvoiceKeyValid = cleanInvoiceKey.length === 44;
  const invoiceKeyParts = parseInvoiceKey(cleanInvoiceKey);
  const invoiceKeyTouched = cleanInvoiceKey.length > 0;
  const isFinalized = finalizedAt !== null;

  const totals = useMemo(() => {
    const expected = items.reduce((sum, item) => sum + item.expected, 0);
    const received = items.reduce((sum, item) => sum + item.received, 0);
    const pending = items.filter((item) => item.status === "Pendente").length;
    const divergent = items.filter(
      (item) => item.status === "Divergente",
    ).length;
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
    const missingBatchOrValidity = items.filter(
      (item) => item.received > 0 && (!item.batch || !item.validity),
    ).length;

    return {
      expected,
      received,
      pending,
      divergent,
      done,
      damaged,
      missingUnits,
      surplusUnits,
      missingBatchOrValidity,
    };
  }, [items]);

  function simulateScan() {
    setScanState("reading");
    window.setTimeout(() => {
      setScanState("done");
      setActiveTab("Conferencia");
    }, 900);
  }

  function simulateKeyScan() {
    if (!isInvoiceKeyValid) {
      return;
    }

    setScanState("reading");
    window.setTimeout(() => {
      setScanState("done");
      setActiveTab("Conferencia");
    }, 700);
  }

  function simulateBarcodeRead() {
    setInvoiceKey(sampleInvoiceKey);
    setPasteError("");
    setScanState("idle");
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
        if (item.id !== id) {
          return item;
        }

        const nextReceived = Number.isNaN(received) || received < 0 ? 0 : received;
        const status = computeItemStatus(nextReceived, item.expected, item.damaged);

        return { ...item, received: nextReceived, status };
      }),
    );
  }

  function updateField(id: number, field: "batch" | "validity" | "note", value: string) {
    if (isFinalized) return;
    setItems((current) =>
      current.map((item) =>
        item.id === id ? { ...item, [field]: value } : item,
      ),
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
        product,
        unit: newItem.unit.trim() || "UN",
        expected,
        received: 0,
        batch: "",
        validity: "",
        damaged: false,
        note: "",
        status: "Pendente",
      },
    ]);
    setNextItemId((current) => current + 1);
    setNewItem({ code: "", product: "", unit: "UN", expected: "" });
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

  function updateInventoryRow(
    index: number,
    field: keyof InventoryRow,
    value: string,
  ) {
    setInventoryRows((current) =>
      current.map((row, i) => (i === index ? { ...row, [field]: value } : row)),
    );
  }

  function removeInventoryRow(index: number) {
    setInventoryRows((current) => current.filter((_, i) => i !== index));
  }

  function toggleDamaged(id: number) {
    if (isFinalized) return;
    setItems((current) =>
      current.map((item) => {
        if (item.id !== id) return item;
        const nextDamaged = !item.damaged;
        const status = computeItemStatus(item.received, item.expected, nextDamaged);
        return { ...item, damaged: nextDamaged, status };
      }),
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
        item.status,
      ]),
      [],
      ["Observacoes do recebimento", receivingNotes || "nenhuma"],
    ];

    const csv = rows
      .map((row) => row.map(escapeCsvCell).join(";"))
      .join("\r\n");
    const blob = new Blob(["﻿" + csv], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "relatorio-recebimento-stockscan-pro.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
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
                    Use a foto da nota em papel ou escaneie a chave de acesso
                    com 44 digitos para preparar a conferencia.
                  </p>
                </div>
                <span className="hidden shrink-0 rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600 sm:inline-block">
                  Camera + chave
                </span>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
                <button
                  className={`rounded-lg px-3 py-3 text-sm font-bold transition ${
                    scanMode === "photo"
                      ? "bg-white text-[#09233f] shadow-sm"
                      : "text-slate-600 hover:text-slate-950"
                  }`}
                  onClick={() => setScanMode("photo")}
                  type="button"
                >
                  Foto da nota
                </button>
                <button
                  className={`rounded-lg px-3 py-3 text-sm font-bold transition ${
                    scanMode === "key"
                      ? "bg-white text-[#09233f] shadow-sm"
                      : "text-slate-600 hover:text-slate-950"
                  }`}
                  onClick={() => setScanMode("key")}
                  type="button"
                >
                  Chave de acesso
                </button>
              </div>

              {scanMode === "photo" ? (
                <div className="mt-5 flex min-h-72 flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-5 text-center sm:min-h-80">
                  <div className="grid h-20 w-20 place-items-center rounded-xl bg-[#09233f] text-3xl font-bold text-white sm:h-24 sm:w-24 sm:text-4xl">
                    NF
                  </div>
                  <h3 className="mt-5 text-lg font-semibold">
                    Posicione a nota dentro da moldura
                  </h3>
                  <p className="mt-2 max-w-sm text-sm leading-6 text-slate-600">
                    A primeira versao aceita foto da nota. Depois conectamos OCR
                    real, leitura de QR Code e importacao por chave de acesso.
                  </p>

                  <button
                    className="mt-5 w-full rounded-xl bg-emerald-500 px-5 py-3.5 text-sm font-bold text-emerald-950 shadow-sm transition hover:bg-emerald-400 active:scale-[0.98] sm:w-auto sm:py-3"
                    onClick={simulateScan}
                    type="button"
                  >
                    {scanState === "reading"
                      ? "Lendo nota..."
                      : "Simular leitura da nota"}
                  </button>
                </div>
              ) : (
                <div className="mt-5 min-h-72 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:min-h-80 sm:p-5">
                  <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                    <div>
                      <h3 className="text-lg font-semibold">
                        Escanear chave de acesso
                      </h3>
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        Leia o codigo de barras da DANFE ou cole os 44 numeros
                        da chave. O app formata e valida o tamanho antes de
                        importar.
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

                  <div className="mt-5 flex items-center justify-between gap-3">
                    <label className="text-sm font-bold text-slate-700" htmlFor="invoice-key-input">
                      Chave de acesso da NF-e
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
                    placeholder="Digite, cole ou escaneie os 44 digitos"
                    value={formatInvoiceKey(invoiceKey)}
                  />

                  {pasteError && (
                    <p className="mt-2 flex items-start gap-2 text-xs font-semibold leading-5 text-amber-700">
                      <IconAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      {pasteError}
                    </p>
                  )}

                  {invoiceKeyTouched && !isInvoiceKeyValid && (
                    <p className="mt-3 flex items-start gap-2 rounded-lg bg-rose-50 p-3 text-xs font-semibold leading-5 text-rose-800">
                      <IconAlert className="mt-0.5 h-4 w-4 shrink-0" />
                      Chave invalida: a NF-e precisa de exatamente 44 numeros.
                      Faltam {44 - cleanInvoiceKey.length} digito(s).
                    </p>
                  )}

                  {isInvoiceKeyValid && (
                    <p className="mt-3 flex items-start gap-2 rounded-lg bg-emerald-50 p-3 text-xs font-semibold leading-5 text-emerald-800">
                      <IconCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      Chave valida com 44 digitos. Confira os dados abaixo antes
                      de importar.
                    </p>
                  )}

                  <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                    <KeyInfo label="UF" value={invoiceKeyParts.uf} />
                    <KeyInfo label="Emissao" value={invoiceKeyParts.issue} />
                    <KeyInfo label="CNPJ emissor" value={invoiceKeyParts.cnpj} />
                    <KeyInfo label="Modelo" value={invoiceKeyParts.model} />
                    <KeyInfo label="Serie" value={invoiceKeyParts.series} />
                    <KeyInfo label="Numero da NF" value={invoiceKeyParts.number} />
                  </div>

                  <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                    <button
                      className="flex items-center justify-center gap-2 rounded-xl bg-[#09233f] px-5 py-3.5 text-sm font-bold text-white transition hover:bg-[#12385f] active:scale-[0.98] sm:py-3"
                      onClick={simulateBarcodeRead}
                      type="button"
                    >
                      <IconScan className="h-4 w-4" />
                      Escanear codigo de barras
                    </button>
                    <button
                      className="rounded-xl bg-emerald-500 px-5 py-3.5 text-sm font-bold text-emerald-950 shadow-sm transition hover:bg-emerald-400 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 sm:py-3"
                      disabled={!isInvoiceKeyValid || scanState === "reading"}
                      onClick={simulateKeyScan}
                      type="button"
                    >
                      {scanState === "reading"
                        ? "Validando chave..."
                        : "Importar pela chave"}
                    </button>
                  </div>
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
                  detail="Com chave validada, prepara a consulta do XML da nota quando o servico estiver conectado."
                  label="Validacao da chave"
                  status={isInvoiceKeyValid ? "44 digitos OK" : "Incompleta"}
                />
                <ProcessCard
                  detail="Extrai codigo, descricao, unidade e quantidade."
                  label="Itens importados"
                  status={
                    items.length > 0
                      ? `${items.length} na lista`
                      : "Nenhum ainda"
                  }
                />
                <ProcessCard
                  detail="Cria campos para recebido, lote, validade e avarias."
                  label="Conferencia fisica"
                  status="Preparada"
                />
                <ProcessCard
                  detail="Gera PDF/Excel com faltas, sobras e validade curta."
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
                    Ajuste a quantidade recebida, marque avaria quando houver e
                    registre lote e validade. O status muda automaticamente.
                  </p>
                </div>
                <div className="grid grid-cols-4 gap-2 text-center">
                  <Pill label="OK" value={totals.done} tone="green" />
                  <Pill label="Diverg." value={totals.divergent} tone="amber" />
                  <Pill label="Pend." value={totals.pending} tone="red" />
                  <Pill label="Avaria" value={totals.damaged} tone="slate" />
                </div>
              </div>

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
                  <div className="mt-3 grid gap-2 sm:grid-cols-[0.7fr_1.6fr_0.6fr_0.7fr_auto]">
                    <input
                      aria-label="Codigo do produto"
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-cyan-600"
                      onChange={(event) =>
                        setNewItem((current) => ({ ...current, code: event.target.value }))
                      }
                      placeholder="Codigo"
                      value={newItem.code}
                    />
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
                      item.damaged
                        ? "border-rose-200 bg-rose-50/40"
                        : "border-slate-200"
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
                          onChange={(event) =>
                            updateReceived(item.id, event.target.value)
                          }
                          type="number"
                          value={item.received}
                        />
                      </label>
                    </div>

                    {item.received > 0 && item.received !== item.expected && (
                      <p
                        className={`mt-2 text-xs font-bold ${
                          item.received < item.expected
                            ? "text-rose-700"
                            : "text-amber-700"
                        }`}
                      >
                        {item.received < item.expected
                          ? `Falta ${item.expected - item.received} ${item.unit}`
                          : `Sobra ${item.received - item.expected} ${item.unit}`}
                      </p>
                    )}

                    <div className="mt-3 grid grid-cols-2 gap-3">
                      <label className="block">
                        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                          Lote
                        </p>
                        <input
                          aria-label={`Lote de ${item.product}`}
                          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-cyan-600 disabled:bg-slate-100 disabled:text-slate-500"
                          disabled={isFinalized}
                          onChange={(event) =>
                            updateField(item.id, "batch", event.target.value)
                          }
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
                          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-cyan-600 disabled:bg-slate-100 disabled:text-slate-500"
                          disabled={isFinalized}
                          onChange={(event) =>
                            updateField(item.id, "validity", event.target.value)
                          }
                          type="date"
                          value={item.validity}
                        />
                      </label>
                    </div>

                    <button
                      className={`mt-3 flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                        item.damaged
                          ? "border-rose-300 bg-rose-100 text-rose-800"
                          : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                      }`}
                      disabled={isFinalized}
                      onClick={() => toggleDamaged(item.id)}
                      type="button"
                    >
                      <IconAlert className="h-3.5 w-3.5" />
                      {item.damaged ? "Marcado com avaria" : "Marcar avaria"}
                    </button>

                    {item.damaged && (
                      <input
                        aria-label={`Observacao de avaria de ${item.product}`}
                        className="mt-2 w-full rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs outline-none focus:border-rose-500 disabled:bg-slate-100"
                        disabled={isFinalized}
                        onChange={(event) =>
                          updateField(item.id, "note", event.target.value)
                        }
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
                <table className="w-full min-w-[1120px] border-separate border-spacing-0 text-left text-sm">
                  <thead>
                    <tr className="bg-slate-100 text-xs uppercase tracking-wide text-slate-600">
                      <Th>Codigo</Th>
                      <Th>Produto</Th>
                      <Th>Un.</Th>
                      <Th>Nota</Th>
                      <Th>Recebido</Th>
                      <Th>Lote</Th>
                      <Th>Validade</Th>
                      <Th>Avaria</Th>
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
                          <span className="font-semibold text-slate-900">
                            {item.product}
                          </span>
                          {item.received > 0 && item.received !== item.expected && (
                            <p
                              className={`text-xs font-bold ${
                                item.received < item.expected
                                  ? "text-rose-700"
                                  : "text-amber-700"
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
                            onChange={(event) =>
                              updateReceived(item.id, event.target.value)
                            }
                            type="number"
                            value={item.received}
                          />
                        </Td>
                        <Td>
                          <input
                            aria-label={`Lote de ${item.product}`}
                            className="w-28 rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-cyan-600 disabled:bg-slate-100 disabled:text-slate-500"
                            disabled={isFinalized}
                            onChange={(event) =>
                              updateField(item.id, "batch", event.target.value)
                            }
                            placeholder="Escanear"
                            value={item.batch}
                          />
                        </Td>
                        <Td>
                          <input
                            aria-label={`Validade de ${item.product}`}
                            className="w-36 rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-cyan-600 disabled:bg-slate-100 disabled:text-slate-500"
                            disabled={isFinalized}
                            onChange={(event) =>
                              updateField(item.id, "validity", event.target.value)
                            }
                            type="date"
                            value={item.validity}
                          />
                        </Td>
                        <Td>
                          <button
                            aria-pressed={item.damaged}
                            className={`rounded-lg border px-3 py-2 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                              item.damaged
                                ? "border-rose-300 bg-rose-100 text-rose-800"
                                : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                            }`}
                            disabled={isFinalized}
                            onClick={() => toggleDamaged(item.id)}
                            type="button"
                          >
                            {item.damaged ? "Avariado" : "Marcar"}
                          </button>
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
                <SummaryStat label="Unidades em falta" tone="red" value={totals.missingUnits} />
                <SummaryStat label="Unidades em sobra" tone="amber" value={totals.surplusUnits} />
                <SummaryStat label="Itens com avaria" tone="slate" value={totals.damaged} />
                <SummaryStat
                  label="Sem lote/validade"
                  tone="amber"
                  value={totals.missingBatchOrValidity}
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
                        onChange={(event) =>
                          updateInventoryRow(index, "location", event.target.value)
                        }
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
                        onChange={(event) =>
                          updateInventoryRow(index, "product", event.target.value)
                        }
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
                        onChange={(event) =>
                          updateInventoryRow(index, "quantity", event.target.value)
                        }
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
                        onChange={(event) =>
                          updateInventoryRow(index, "lots", event.target.value)
                        }
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
                        onChange={(event) =>
                          updateInventoryRow(index, "status", event.target.value)
                        }
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
                  isFinalized
                    ? "bg-emerald-50 text-emerald-800"
                    : "bg-amber-50 text-amber-800"
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
                <ReportLine
                  label="Itens sem lote/validade"
                  value={`${totals.missingBatchOrValidity}`}
                />
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
                  items.filter((item) => item.status !== "Conferido").length === 0 && (
                    <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">
                      Nenhuma divergencia pendente. Recebimento pronto para
                      finalizar.
                    </p>
                  )}
                {items
                  .filter((item) => item.status !== "Conferido")
                  .map((item) => (
                    <article
                      className="rounded-xl border border-amber-200 bg-amber-50 p-4"
                      key={item.id}
                    >
                      <div className="flex flex-col justify-between gap-2 sm:flex-row">
                        <div>
                          <p className="font-semibold text-amber-950">
                            {item.product}
                          </p>
                          <p className="mt-1 text-sm text-amber-900">
                            Nota: {item.expected} {item.unit} | Recebido:{" "}
                            {item.received} {item.unit}
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
              <div className="mt-4 overflow-x-auto">
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
                          <span className="font-semibold text-slate-900">
                            {item.product}
                          </span>
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
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/15 bg-white/10 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-cyan-100">
        {label}
      </p>
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
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-1 truncate font-semibold text-slate-900">{value}</p>
    </div>
  );
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
    <span
      className={`inline-flex shrink-0 rounded-full px-3 py-1 text-xs font-bold ring-1 ${colors[status]}`}
    >
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

function IconAlert({ className }: IconProps) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M12 9v4M12 17h.01" strokeLinecap="round" />
      <path d="M10.29 3.86 1.82 18a1 1 0 0 0 .86 1.5h18.64a1 1 0 0 0 .86-1.5L13.71 3.86a1 1 0 0 0-1.72 0Z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconScan({ className }: IconProps) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M4 8V5a1 1 0 0 1 1-1h3M20 8V5a1 1 0 0 0-1-1h-3M4 16v3a1 1 0 0 0 1 1h3M20 16v3a1 1 0 0 1-1 1h-3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 12h16" strokeLinecap="round" />
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
