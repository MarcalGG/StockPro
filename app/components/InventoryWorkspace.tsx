"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  createInventory,
  createOperationalId,
  finalizeInventory,
  getActiveInventoryDraft,
  listFinalizedInventories,
  saveInventoryDraft,
  type InventoryCountItem,
  type InventoryCountStatus,
  type StoredInventoryRecord,
} from "../../lib/localOperationalStore";

type Props = {
  onNavigate: (tab: "Recebimento" | "Conferencia" | "Inventario" | "Relatorio") => void;
};

type Message = { tone: "success" | "error" | "info"; text: string };

type SetupDraft = {
  title: string;
  sector: string;
  responsible: string;
  startedAt: string;
  notes: string;
};

type ManualProductDraft = {
  code: string;
  product: string;
  unit: string;
  expected: string;
  counted: string;
  note: string;
};

const emptySetup: SetupDraft = {
  title: "",
  sector: "Deposito A",
  responsible: "",
  startedAt: "",
  notes: "",
};

const emptyManualProduct: ManualProductDraft = {
  code: "",
  product: "",
  unit: "UN",
  expected: "",
  counted: "",
  note: "",
};

const sectors = ["Deposito A", "Deposito B", "Loja", "Estoque de vendas", "Outro"];
const emptyItems: InventoryCountItem[] = [];

const tabs: { id: Parameters<Props["onNavigate"]>[0]; label: string }[] = [
  { id: "Recebimento", label: "Recebimento" },
  { id: "Conferencia", label: "Conferencia" },
  { id: "Inventario", label: "Inventario" },
  { id: "Relatorio", label: "Relatorios" },
];

export default function InventoryWorkspace({ onNavigate }: Props) {
  const [activeInventory, setActiveInventory] = useState<StoredInventoryRecord | null>(null);
  const [draftAvailable, setDraftAvailable] = useState<StoredInventoryRecord | null>(() => getActiveInventoryDraft());
  const [recentInventories, setRecentInventories] = useState<StoredInventoryRecord[]>(() => listFinalizedInventories().slice(0, 5));
  const [setupOpen, setSetupOpen] = useState(false);
  const [setup, setSetup] = useState<SetupDraft>(() => ({
    ...emptySetup,
    startedAt: toInputDateTime(new Date()),
  }));
  const [manualProduct, setManualProduct] = useState(emptyManualProduct);
  const [manualOpen, setManualOpen] = useState(false);
  const [searchCode, setSearchCode] = useState("");
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [countValue, setCountValue] = useState("");
  const [message, setMessage] = useState<Message | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanFrameRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (scanFrameRef.current) window.cancelAnimationFrame(scanFrameRef.current);
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const items = activeInventory?.items ?? emptyItems;
  const isFinalized = activeInventory?.status === "Finalizado";
  const selectedItem = selectedItemId
    ? items.find((item) => item.id === selectedItemId) ?? null
    : null;

  const stats = useMemo(() => {
    const counted = items.filter((item) => item.counted !== null).length;
    const differences = items.filter((item) => item.status === "Falta" || item.status === "Sobra").length;
    const pending = items.filter((item) => item.status === "Pendente").length;
    const shortages = items.filter((item) => item.status === "Falta").length;
    const surplus = items.filter((item) => item.status === "Sobra").length;
    const progress = items.length ? Math.round((counted / items.length) * 100) : 0;
    return { counted, differences, pending, shortages, surplus, progress };
  }, [items]);

  const differenceItems = items.filter((item) => item.status === "Falta" || item.status === "Sobra");
  const recentCounted = [...items]
    .filter((item) => item.lastCountedAt)
    .sort((a, b) => String(b.lastCountedAt).localeCompare(String(a.lastCountedAt)));

  function refreshLists() {
    setDraftAvailable(getActiveInventoryDraft());
    setRecentInventories(listFinalizedInventories().slice(0, 5));
  }

  function startNewInventory() {
    if (!setup.title.trim() || !setup.sector.trim() || !setup.responsible.trim() || !setup.startedAt) {
      setMessage({ tone: "error", text: "Informe nome, setor, responsavel e data/hora para iniciar a contagem." });
      return;
    }
    const created = createInventory({
      title: setup.title.trim(),
      sector: setup.sector.trim(),
      responsible: setup.responsible.trim(),
      startedAt: setup.startedAt,
      notes: setup.notes.trim(),
      items: [],
    });
    setActiveInventory(created);
    setDraftAvailable(created);
    setSetupOpen(false);
    setMessage({ tone: "success", text: "Inventario iniciado. Adicione produtos ou localize uma contagem existente pelo codigo." });
  }

  function continueDraft() {
    const draft = getActiveInventoryDraft();
    if (!draft) {
      setMessage({ tone: "error", text: "Nenhum rascunho de inventario foi encontrado." });
      return;
    }
    setActiveInventory(draft);
    setMessage({ tone: "info", text: "Rascunho de inventario retomado." });
  }

  function persistInventory(next: StoredInventoryRecord, successMessage?: string) {
    const saved = saveInventoryDraft(next);
    setActiveInventory(saved);
    setDraftAvailable(saved);
    if (successMessage) setMessage({ tone: "success", text: successMessage });
  }

  function findItemByCode(code: string) {
    const clean = code.trim();
    if (!activeInventory || !clean) return;
    const found = items.find((item) => item.code === clean);
    if (!found) {
      setSelectedItemId(null);
      setCountValue("");
      setMessage({
        tone: "error",
        text: "Produto nao encontrado neste inventario. Tente novamente, busque manualmente ou adicione produto manual.",
      });
      return;
    }
    setSelectedItemId(found.id);
    setCountValue(found.counted === null ? "" : String(found.counted));
    setMessage({ tone: "success", text: `${found.product} localizado para contagem.` });
  }

  function registerCount() {
    if (!activeInventory || !selectedItem || isFinalized) return;
    const counted = Number(countValue);
    if (!Number.isFinite(counted) || counted < 0) {
      setMessage({ tone: "error", text: "Quantidade contada nao pode ser negativa." });
      return;
    }
    const nextItems = items.map((item) =>
      item.id === selectedItem.id ? applyCount(item, counted) : item,
    );
    persistInventory({ ...activeInventory, items: nextItems }, "Contagem registrada com sucesso.");
  }

  function addManualProduct() {
    if (!activeInventory || isFinalized) return;
    const product = manualProduct.product.trim();
    if (!product) {
      setMessage({ tone: "error", text: "Informe o nome do produto para adicionar ao inventario." });
      return;
    }
    const expected = parseOptionalNumber(manualProduct.expected);
    const counted = parseOptionalNumber(manualProduct.counted);
    if (expected === "invalid" || counted === "invalid") {
      setMessage({ tone: "error", text: "Informe quantidades validas, sem valores negativos." });
      return;
    }
    const item: InventoryCountItem = {
      id: createOperationalId("item"),
      code: manualProduct.code.trim() || createOperationalId("produto"),
      product,
      unit: manualProduct.unit.trim() || "UN",
      expected,
      counted,
      difference: expected !== null && counted !== null ? counted - expected : null,
      status: statusForCount(expected, counted),
      lastCountedAt: counted !== null ? new Date().toISOString() : null,
      note: manualProduct.note.trim(),
      manual: true,
    };
    persistInventory(
      { ...activeInventory, items: [...items, item] },
      "Produto manual adicionado ao inventario.",
    );
    setSelectedItemId(item.id);
    setCountValue(item.counted === null ? "" : String(item.counted));
    setManualProduct(emptyManualProduct);
    setManualOpen(false);
  }

  function editItem(item: InventoryCountItem) {
    setSelectedItemId(item.id);
    setCountValue(item.counted === null ? "" : String(item.counted));
    documentQuery("#inventory-count-input")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function saveDraft() {
    if (!activeInventory) return;
    persistInventory(activeInventory, "Inventario salvo como rascunho.");
  }

  function finishInventory() {
    if (!activeInventory) return;
    if (stats.pending > 0 && !window.confirm("Ainda existem produtos sem contagem. Deseja finalizar mesmo assim?")) {
      return;
    }
    const summary = [
      "Resumo do inventario:",
      `Produtos previstos: ${items.length}`,
      `Produtos contados: ${stats.counted}`,
      `Pendentes: ${stats.pending}`,
      `Faltas: ${stats.shortages}`,
      `Sobras: ${stats.surplus}`,
      `Responsavel: ${activeInventory.responsible}`,
      `Setor: ${activeInventory.sector}`,
      `Data/hora: ${new Date().toLocaleString("pt-BR")}`,
      "",
      "Confirmar finalizacao?",
    ].join("\n");
    if (!window.confirm(summary)) return;
    const finalized = finalizeInventory(activeInventory.id, new Date().toISOString());
    if (finalized) {
      setActiveInventory(finalized);
      setDraftAvailable(getActiveInventoryDraft());
      setRecentInventories(listFinalizedInventories().slice(0, 5));
      setMessage({ tone: "success", text: "Inventario finalizado e bloqueado para edicao direta." });
    }
  }

  function reviewDifferences() {
    const first = documentQuery('[data-inventory-status="Falta"], [data-inventory-status="Sobra"]');
    first?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function openScanner() {
    setCameraError("");
    if (!activeInventory || isFinalized) return;
    if (!("mediaDevices" in navigator) || !("BarcodeDetector" in window)) {
      setCameraError("Camera indisponivel neste navegador. Use a busca manual por codigo.");
      setMessage({ tone: "info", text: "Camera indisponivel. A digitacao manual continua funcionando." });
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      setScannerOpen(true);
      window.setTimeout(() => {
        void startBarcodeLoop(stream);
      }, 0);
    } catch {
      setCameraError("Nao foi possivel acessar a camera. Verifique a permissao e use a busca manual.");
    }
  }

  async function startBarcodeLoop(stream: MediaStream) {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
    await video.play().catch(() => {});
    // BarcodeDetector ainda nao tem tipos estaveis no TypeScript.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const detector = new (window as any).BarcodeDetector({
      formats: ["code_128", "code_39", "codabar", "itf", "ean_13", "qr_code"],
    });
    const scan = async () => {
      if (!streamRef.current || !videoRef.current) return;
      try {
        const codes = await detector.detect(videoRef.current);
        const raw = String(codes[0]?.rawValue ?? "").trim();
        if (raw) {
          findItemByCode(raw.replace(/\D/g, "") || raw);
          stopScanner();
          return;
        }
      } catch {
        // tenta o proximo quadro
      }
      scanFrameRef.current = window.requestAnimationFrame(scan);
    };
    scanFrameRef.current = window.requestAnimationFrame(scan);
  }

  function stopScanner() {
    if (scanFrameRef.current) window.cancelAnimationFrame(scanFrameRef.current);
    scanFrameRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setScannerOpen(false);
  }

  return (
    <div className="inventory-shell min-h-screen bg-[#f5f7fb] text-slate-950">
      <aside className="inventory-sidebar no-print">
        <div className="px-3 pb-8">
          <div className="text-4xl font-black leading-none tracking-tight">MGN</div>
          <div className="mt-1 text-xs font-semibold uppercase tracking-[0.28em] text-cyan-100">Technologies</div>
        </div>
        <nav className="grid gap-2">
          {tabs.map((tab) => (
            <button
              className={`inventory-nav-link ${tab.id === "Inventario" ? "inventory-nav-link-active" : ""}`}
              key={tab.id}
              onClick={() => onNavigate(tab.id)}
              type="button"
            >
              <span aria-hidden>{navIcon(tab.id)}</span>
              {tab.label}
            </button>
          ))}
        </nav>
      </aside>

      <main className="min-w-0 px-4 py-6 pb-28 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-[1440px] gap-5">
          <header className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-[#071f3d] sm:text-4xl">Inventario Fisico</h1>
              <p className="mt-2 text-slate-600">Conte produtos por setor sem misturar com notas fiscais ou recebimentos.</p>
            </div>
            {activeInventory && (
              <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm md:text-right">
                <p className="font-bold text-[#071f3d]">{activeInventory.status}</p>
                <p>{activeInventory.sector}</p>
              </div>
            )}
          </header>

          {message && (
            <p className={`rounded-lg border px-4 py-3 text-sm font-semibold ${messageClass(message.tone)}`}>{message.text}</p>
          )}

          {!activeInventory ? (
            <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
                <div>
                  <p className="text-sm font-bold uppercase tracking-[0.16em] text-blue-700">Contagem</p>
                  <h2 className="mt-2 text-2xl font-bold">Nenhuma contagem esta em andamento.</h2>
                  <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                    <button className="rounded-lg bg-[#071f3d] px-5 py-3 font-bold text-white" onClick={() => setSetupOpen(true)} type="button">
                      Nova contagem
                    </button>
                    {draftAvailable && (
                      <button className="rounded-lg border border-blue-500 px-5 py-3 font-bold text-blue-700" onClick={continueDraft} type="button">
                        Continuar contagem
                      </button>
                    )}
                    <button className="rounded-lg border border-slate-300 px-5 py-3 font-bold text-slate-700" onClick={refreshLists} type="button">
                      Ver contagens recentes
                    </button>
                  </div>

                  {setupOpen && (
                    <div className="mt-6 grid gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
                      <Input label="Nome da contagem" value={setup.title} onChange={(value) => setSetup((current) => ({ ...current, title: value }))} />
                      <label className="text-sm font-semibold">
                        Setor/localizacao
                        <select className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" value={setup.sector} onChange={(event) => setSetup((current) => ({ ...current, sector: event.target.value }))}>
                          {sectors.map((sector) => <option key={sector} value={sector}>{sector}</option>)}
                        </select>
                      </label>
                      <Input label="Responsavel" value={setup.responsible} onChange={(value) => setSetup((current) => ({ ...current, responsible: value }))} />
                      <Input label="Data/hora" type="datetime-local" value={setup.startedAt} onChange={(value) => setSetup((current) => ({ ...current, startedAt: value }))} />
                      <label className="text-sm font-semibold sm:col-span-2">
                        Observacao opcional
                        <textarea className="mt-1 min-h-20 w-full rounded-lg border border-slate-300 p-3 font-normal" value={setup.notes} onChange={(event) => setSetup((current) => ({ ...current, notes: event.target.value }))} />
                      </label>
                      <button className="rounded-lg bg-[#071f3d] px-5 py-3 font-bold text-white sm:w-fit" onClick={startNewInventory} type="button">
                        Iniciar contagem
                      </button>
                    </div>
                  )}
                </div>

                <RecentInventories inventories={recentInventories} onOpen={setActiveInventory} />
              </div>
            </section>
          ) : (
            <>
              <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
                  <div>
                    <div className="flex flex-wrap gap-2 text-sm text-slate-600">
                      <Chip label="Contagem" value={activeInventory.title} />
                      <Chip label="Setor" value={activeInventory.sector} />
                      <Chip label="Responsavel" value={activeInventory.responsible} />
                      <Chip label="Inicio" value={formatDateTime(activeInventory.startedAt)} />
                    </div>
                    <div className="mt-5">
                      <div className="mb-2 flex items-center justify-between gap-3 text-sm font-bold text-[#071f3d]">
                        <span>{stats.counted} de {items.length} produtos contados</span>
                        <span>{stats.progress}%</span>
                      </div>
                      <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${stats.progress}%` }} />
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:min-w-[560px]">
                    <Metric label="Produtos previstos" value={items.length} tone="blue" />
                    <Metric label="Contados" value={stats.counted} tone="green" />
                    <Metric label="Com diferenca" value={stats.differences} tone="red" />
                    <Metric label="Pendentes" value={stats.pending} tone="slate" />
                  </div>
                </div>
              </section>

              <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
                <section className="grid gap-5">
                  <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h2 className="text-xl font-bold text-[#071f3d]">Registrar contagem</h2>
                        <p className="mt-1 text-sm text-slate-600">Localize o produto pelo codigo e informe a quantidade fisica.</p>
                      </div>
                      <button className="rounded-lg bg-blue-600 px-5 py-3 font-bold text-white disabled:bg-slate-300" disabled={isFinalized} onClick={openScanner} type="button">
                        Escanear codigo
                      </button>
                    </div>
                    {cameraError && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">{cameraError}</p>}
                    <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                      <input
                        className="min-w-0 flex-1 rounded-lg border border-slate-300 px-4 py-3 outline-none"
                        disabled={isFinalized}
                        inputMode="numeric"
                        onChange={(event) => setSearchCode(event.target.value)}
                        onKeyDown={(event) => { if (event.key === "Enter") findItemByCode(searchCode); }}
                        placeholder="Digite o codigo do produto"
                        value={searchCode}
                      />
                      <button className="rounded-lg border border-blue-500 px-5 py-3 font-bold text-blue-700 disabled:border-slate-200 disabled:text-slate-400" disabled={isFinalized} onClick={() => findItemByCode(searchCode)} type="button">
                        Buscar manualmente
                      </button>
                    </div>

                    {selectedItem ? (
                      <div className="mt-5 rounded-xl border border-blue-100 bg-blue-50/50 p-4">
                        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                          <div>
                            <p className="text-xs font-bold uppercase tracking-wide text-blue-700">Produto localizado</p>
                            <h3 className="mt-1 text-xl font-bold">{selectedItem.product}</h3>
                            <p className="mt-1 text-sm text-slate-600">{selectedItem.code} - {selectedItem.unit}</p>
                            <p className="mt-2 text-sm text-slate-700">Estoque esperado: {selectedItem.expected === null ? "Nao informado" : formatNumber(selectedItem.expected)}</p>
                            <p className="text-sm text-slate-700">Ja contado: {selectedItem.counted === null ? "Sem contagem" : formatNumber(selectedItem.counted)}</p>
                          </div>
                          <StatusBadge status={selectedItem.status} />
                        </div>
                        <label className="mt-4 block text-sm font-bold" htmlFor="inventory-count-input">
                          Quantidade contada
                          <input
                            className="mt-2 w-full rounded-lg border border-blue-300 px-4 py-4 text-2xl font-bold outline-none"
                            disabled={isFinalized}
                            id="inventory-count-input"
                            min="0"
                            onChange={(event) => setCountValue(event.target.value)}
                            type="number"
                            value={countValue}
                          />
                        </label>
                        <button className="mt-4 rounded-lg bg-[#071f3d] px-5 py-3 font-bold text-white disabled:bg-slate-300" disabled={isFinalized} onClick={registerCount} type="button">
                          Registrar contagem
                        </button>
                      </div>
                    ) : (
                      <p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-500">Nenhum produto selecionado.</p>
                    )}

                    <div className="mt-5">
                      <button className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 disabled:text-slate-400" disabled={isFinalized} onClick={() => setManualOpen((current) => !current)} type="button">
                        Adicionar produto manual
                      </button>
                      {manualOpen && (
                        <div className="mt-4 grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-6">
                          <Input label="Codigo" value={manualProduct.code} onChange={(value) => setManualProduct((current) => ({ ...current, code: value }))} />
                          <Input className="lg:col-span-2" label="Nome do produto" value={manualProduct.product} onChange={(value) => setManualProduct((current) => ({ ...current, product: value }))} />
                          <Input label="Unidade" value={manualProduct.unit} onChange={(value) => setManualProduct((current) => ({ ...current, unit: value }))} />
                          <Input label="Estoque esperado" type="number" value={manualProduct.expected} onChange={(value) => setManualProduct((current) => ({ ...current, expected: value }))} />
                          <Input label="Qtd. contada" type="number" value={manualProduct.counted} onChange={(value) => setManualProduct((current) => ({ ...current, counted: value }))} />
                          <Input className="sm:col-span-2 lg:col-span-5" label="Observacao" value={manualProduct.note} onChange={(value) => setManualProduct((current) => ({ ...current, note: value }))} />
                          <button className="rounded-lg bg-[#071f3d] px-4 py-2 text-sm font-bold text-white" onClick={addManualProduct} type="button">
                            Adicionar
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  <CountedList disabled={isFinalized} items={recentCounted} onEdit={editItem} />
                </section>

                <aside className="grid gap-5 self-start xl:sticky xl:top-5">
                  <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                    <h2 className="text-xl font-bold text-[#071f3d]">Resumo de diferencas</h2>
                    <div className="mt-4 grid gap-3">
                      {differenceItems.length === 0 ? (
                        <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">Nenhuma falta ou sobra registrada.</p>
                      ) : (
                        differenceItems.map((item) => <DifferenceCard item={item} key={item.id} />)
                      )}
                    </div>
                    <button className="mt-5 w-full rounded-lg border border-blue-500 px-4 py-3 font-bold text-blue-700 disabled:border-slate-200 disabled:text-slate-400" disabled={differenceItems.length === 0} onClick={reviewDifferences} type="button">
                      Ver todas as diferencas
                    </button>
                  </section>

                  <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                    <h2 className="text-lg font-bold text-[#071f3d]">Produtos do inventario</h2>
                    <p className="mt-2 text-sm text-slate-600">Sem base real de produtos conectada ainda. Adicione produtos manualmente quando necessario; nenhum estoque real sera ajustado.</p>
                  </section>
                </aside>
              </div>
            </>
          )}
        </div>
      </main>

      {activeInventory && (
        <footer className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 p-3 shadow-[0_-6px_24px_rgba(15,23,42,0.10)] backdrop-blur lg:left-[244px]">
          <div className="mx-auto flex max-w-[1440px] flex-col gap-2 sm:flex-row sm:justify-end">
            {isFinalized ? (
              <button className="rounded-lg border border-slate-300 px-5 py-3 font-bold text-slate-700" onClick={() => { setActiveInventory(null); refreshLists(); }} type="button">
                Voltar ao inicio
              </button>
            ) : (
              <>
                <button className="rounded-lg border border-blue-500 px-5 py-3 font-bold text-blue-700" onClick={saveDraft} type="button">
                  Salvar rascunho
                </button>
                <button className="rounded-lg bg-blue-600 px-5 py-3 font-bold text-white shadow-sm" onClick={finishInventory} type="button">
                  Finalizar inventario
                </button>
              </>
            )}
          </div>
        </footer>
      )}

      {scannerOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/80 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-4 shadow-2xl">
            <video className="aspect-video w-full rounded-xl bg-black object-cover" muted playsInline ref={videoRef} />
            <p className="mt-3 text-sm text-slate-600">Aponte para o codigo de barras do produto.</p>
            <button className="mt-3 w-full rounded-xl border px-4 py-3 font-bold" onClick={stopScanner} type="button">
              Fechar camera
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function CountedList({ disabled, items, onEdit }: { disabled: boolean; items: InventoryCountItem[]; onEdit: (item: InventoryCountItem) => void }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 p-4">
        <h2 className="text-xl font-bold text-[#071f3d]">Ultimos produtos contados</h2>
      </div>
      {items.length === 0 ? (
        <p className="p-6 text-center text-sm text-slate-500">Nenhum produto contado ainda.</p>
      ) : (
        <>
          <div className="hidden overflow-x-auto p-4 md:block">
            <table className="w-full min-w-[820px] border-separate border-spacing-0 text-left text-sm">
              <thead>
                <tr className="bg-slate-50 text-xs uppercase text-slate-500">
                  <Th>Produto</Th>
                  <Th>Estoque esperado</Th>
                  <Th>Quantidade contada</Th>
                  <Th>Diferenca</Th>
                  <Th>Status</Th>
                  <Th>Horario</Th>
                  <Th>Acao</Th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr data-inventory-status={item.status} key={item.id}>
                    <Td>
                      <span className="font-bold">{item.product}</span>
                      {item.manual && <span className="ml-2 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-700">Item adicionado manualmente</span>}
                      <p className="text-xs text-slate-500">{item.code} - {item.unit}</p>
                    </Td>
                    <Td>{item.expected === null ? "Nao informado" : formatNumber(item.expected)}</Td>
                    <Td>{item.counted === null ? "-" : formatNumber(item.counted)}</Td>
                    <Td className={differenceClass(item)}>{formatDifference(item)}</Td>
                    <Td><StatusBadge status={item.status} /></Td>
                    <Td>{formatDateTime(item.lastCountedAt)}</Td>
                    <Td><button className="text-xs font-bold text-blue-700 disabled:text-slate-400" disabled={disabled} onClick={() => onEdit(item)} type="button">Editar</button></Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid gap-3 p-4 md:hidden">
            {items.map((item) => (
              <article className="rounded-lg border border-slate-200 p-4" data-inventory-status={item.status} key={item.id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-bold">{item.product}</p>
                    <p className="text-xs text-slate-500">{item.code} - {item.unit}</p>
                    {item.manual && <span className="mt-2 inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-700">Item adicionado manualmente</span>}
                  </div>
                  <StatusBadge status={item.status} />
                </div>
                <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
                  <Info label="Esperado" value={item.expected === null ? "-" : formatNumber(item.expected)} />
                  <Info label="Contado" value={item.counted === null ? "-" : formatNumber(item.counted)} />
                  <Info className={differenceClass(item)} label="Diferenca" value={formatDifference(item)} />
                </div>
                <p className="mt-3 text-xs text-slate-500">{formatDateTime(item.lastCountedAt)}</p>
                <button className="mt-3 text-sm font-bold text-blue-700 disabled:text-slate-400" disabled={disabled} onClick={() => onEdit(item)} type="button">Editar contagem</button>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function RecentInventories({ inventories, onOpen }: { inventories: StoredInventoryRecord[]; onOpen: (inventory: StoredInventoryRecord) => void }) {
  return (
    <aside className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <h3 className="font-bold text-[#071f3d]">Contagens recentes</h3>
      <div className="mt-3 grid gap-2">
        {inventories.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhum inventario finalizado ainda.</p>
        ) : (
          inventories.map((inventory) => (
            <button className="rounded-lg border border-slate-200 bg-white p-3 text-left text-sm hover:border-blue-300" key={inventory.id} onClick={() => onOpen(inventory)} type="button">
              <p className="font-bold">{inventory.title}</p>
              <p className="text-slate-500">{inventory.sector} - {formatDateTime(inventory.finalizedAt)}</p>
            </button>
          ))
        )}
      </div>
    </aside>
  );
}

function DifferenceCard({ item }: { item: InventoryCountItem }) {
  return (
    <article className={`rounded-lg border p-4 ${item.status === "Falta" ? "border-rose-200 bg-rose-50" : "border-orange-200 bg-orange-50"}`}>
      <p className="font-bold">{item.product}</p>
      <p className={`mt-1 font-bold ${item.status === "Falta" ? "text-rose-700" : "text-orange-700"}`}>{item.status}: {formatDifference(item)}</p>
      <p className="mt-2 text-sm text-slate-700">Esperado: {item.expected === null ? "Nao informado" : formatNumber(item.expected)} {item.unit}</p>
      <p className="text-sm text-slate-700">Contado: {item.counted === null ? "-" : formatNumber(item.counted)} {item.unit}</p>
    </article>
  );
}

function Metric({ label, tone, value }: { label: string; tone: "blue" | "green" | "red" | "slate"; value: number }) {
  const colors = {
    blue: "text-blue-700",
    green: "text-emerald-700",
    red: "text-rose-700",
    slate: "text-slate-600",
  };
  return <div className="rounded-lg border border-slate-200 bg-white p-4"><p className="text-xs font-medium text-slate-600">{label}</p><p className={`mt-2 text-3xl font-bold ${colors[tone]}`}>{value}</p></div>;
}

function StatusBadge({ status }: { status: InventoryCountStatus }) {
  const colors = {
    Confirmado: "bg-emerald-50 text-emerald-800 ring-emerald-200",
    Falta: "bg-rose-50 text-rose-800 ring-rose-200",
    Pendente: "bg-slate-100 text-slate-700 ring-slate-200",
    Sobra: "bg-orange-50 text-orange-800 ring-orange-200",
  };
  return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ring-1 ${colors[status]}`}>{status}</span>;
}

function Input({ className = "", label, onChange, type = "text", value }: { className?: string; label: string; onChange: (value: string) => void; type?: string; value: string }) {
  return <label className={`text-sm font-semibold ${className}`}>{label}<input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" min={type === "number" ? "0" : undefined} onChange={(event) => onChange(event.target.value)} type={type} value={value} /></label>;
}

function Chip({ label, value }: { label: string; value: string }) {
  return <span className="rounded-full bg-slate-100 px-3 py-1"><strong>{label}:</strong> {value || "-"}</span>;
}

function Info({ className = "", label, value }: { className?: string; label: string; value: string }) {
  return <div><p className="text-xs font-bold uppercase text-slate-500">{label}</p><p className={`mt-1 font-bold ${className}`}>{value}</p></div>;
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-3 first:rounded-l-lg last:rounded-r-lg">{children}</th>;
}

function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`border-b border-slate-100 px-3 py-3 align-middle ${className}`}>{children}</td>;
}

function applyCount(item: InventoryCountItem, counted: number): InventoryCountItem {
  return {
    ...item,
    counted,
    difference: item.expected === null ? null : counted - item.expected,
    status: statusForCount(item.expected, counted),
    lastCountedAt: new Date().toISOString(),
  };
}

function statusForCount(expected: number | null, counted: number | null): InventoryCountStatus {
  if (counted === null) return "Pendente";
  if (expected === null) return "Confirmado";
  const difference = counted - expected;
  if (difference < 0) return "Falta";
  if (difference > 0) return "Sobra";
  return "Confirmado";
}

function parseOptionalNumber(value: string): number | null | "invalid" {
  if (!value.trim()) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return "invalid";
  return parsed;
}

function formatDifference(item: InventoryCountItem) {
  if (item.difference === null) return "-";
  if (item.difference === 0) return "0";
  return `${item.difference > 0 ? "+" : ""}${formatNumber(item.difference)}`;
}

function differenceClass(item: InventoryCountItem) {
  if (item.status === "Falta") return "font-bold text-rose-700";
  if (item.status === "Sobra") return "font-bold text-orange-700";
  return "text-slate-700";
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
}

function formatDateTime(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function toInputDateTime(date: Date) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function messageClass(tone: Message["tone"]) {
  if (tone === "success") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (tone === "error") return "border-rose-200 bg-rose-50 text-rose-800";
  return "border-blue-200 bg-blue-50 text-blue-800";
}

function navIcon(id: string) {
  const icons: Record<string, string> = {
    Conferencia: "✓",
    Inventario: "#",
    Recebimento: "↓",
    Relatorio: "▤",
  };
  return icons[id] ?? "•";
}

function documentQuery(selector: string) {
  if (typeof document === "undefined") return null;
  return document.querySelector<HTMLElement>(selector);
}
