"use client";

import { useMemo, useState } from "react";

export type ConferenceStatus = "Pendente" | "Conferido" | "Falta" | "Sobra" | "Avaria";

export type ConferenceItem = {
  id: number;
  code: string;
  barcode: string;
  product: string;
  unit: string;
  expected: number;
  received: number;
  note: string;
  status: ConferenceStatus;
  manual?: boolean;
};

export type ConferenceDocument = {
  type: string;
  number: string;
  series: string;
  supplier: string;
  issueDate: string;
  responsible: string;
  accessKey: string;
  entryDateTime: string;
  notes: string;
  finalizedAt: string | null;
  hasActiveReceiving: boolean;
};

type ManualItemDraft = {
  code: string;
  product: string;
  unit: string;
  expected: string;
  received: string;
  note: string;
};

type ScanResult = {
  matched: boolean;
  itemId?: number;
  message: string;
};

type Props = {
  document: ConferenceDocument;
  items: ConferenceItem[];
  highlightedItemId: number | null;
  message: { tone: "success" | "error" | "info"; text: string } | null;
  onNavigate: (tab: "Recebimento" | "Conferencia" | "Inventario" | "Relatorio") => void;
  onConfirmItem: (id: number) => void;
  onUpdateReceived: (id: number, value: string) => void;
  onRegisterDamage: (id: number, note: string) => void;
  onUpdateNote: (id: number, value: string) => void;
  onScanProduct: (code: string) => ScanResult;
  onOpenScanner: () => void;
  onAddManualItem: (item: ManualItemDraft) => void;
  onSaveDraft: () => void;
  onFinalize: () => void;
  onReopen: () => void;
};

const emptyManualItem: ManualItemDraft = {
  code: "",
  product: "",
  unit: "UN",
  expected: "",
  received: "",
  note: "",
};

const tabs: { id: Props["onNavigate"] extends (tab: infer T) => void ? T : never; label: string }[] = [
  { id: "Recebimento", label: "Recebimento" },
  { id: "Conferencia", label: "Conferencia" },
  { id: "Inventario", label: "Inventario" },
  { id: "Relatorio", label: "Relatorios" },
];

export default function ConferenceWorkspace({
  document,
  items,
  highlightedItemId,
  message,
  onNavigate,
  onConfirmItem,
  onUpdateReceived,
  onRegisterDamage,
  onUpdateNote,
  onScanProduct,
  onOpenScanner,
  onAddManualItem,
  onSaveDraft,
  onFinalize,
  onReopen,
}: Props) {
  const [manualOpen, setManualOpen] = useState(false);
  const [manualItem, setManualItem] = useState(emptyManualItem);
  const [scanCode, setScanCode] = useState("");
  const [scanMessage, setScanMessage] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [damageId, setDamageId] = useState<number | null>(null);

  const stats = useMemo(() => {
    const checkedStatuses: ConferenceStatus[] = ["Conferido", "Falta", "Sobra", "Avaria"];
    const checked = items.filter((item) => checkedStatuses.includes(item.status)).length;
    const divergences = items.filter((item) => ["Falta", "Sobra", "Avaria"].includes(item.status)).length;
    const pending = items.filter((item) => item.status === "Pendente").length;
    const shortages = items.filter((item) => item.status === "Falta").length;
    const surplus = items.filter((item) => item.status === "Sobra").length;
    const damaged = items.filter((item) => item.status === "Avaria").length;
    const progress = items.length ? Math.round((checked / items.length) * 100) : 0;
    return { checked, divergences, pending, shortages, surplus, damaged, progress };
  }, [items]);

  const divergenceItems = items.filter((item) => item.status === "Falta" || item.status === "Sobra" || item.status === "Avaria");
  const hasNoImportedItems = document.hasActiveReceiving && items.length === 0;
  const isFinalized = Boolean(document.finalizedAt);

  function submitScan() {
    const clean = scanCode.trim();
    if (!clean) return;
    const result = onScanProduct(clean);
    setScanMessage(result.message);
    if (result.matched) setEditingId(result.itemId ?? null);
    setScanCode("");
  }

  function submitManualItem() {
    onAddManualItem(manualItem);
    setManualItem(emptyManualItem);
    setManualOpen(false);
  }

  function reviewDivergences() {
    const first = documentQuery(`[data-conference-status="Falta"], [data-conference-status="Sobra"], [data-conference-status="Avaria"]`);
    first?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  return (
    <div className="conference-shell min-h-screen bg-[#f4f6f9] text-slate-950">
      <aside className="conference-sidebar no-print">
        <div className="px-3 pb-8">
          <div className="text-4xl font-black leading-none tracking-tight">MGN</div>
          <div className="mt-1 text-xs font-semibold uppercase tracking-[0.28em] text-cyan-100">Technologies</div>
        </div>
        <nav className="grid gap-2">
          {tabs.map((tab) => (
            <button
              className={`conference-nav-link ${tab.id === "Conferencia" ? "conference-nav-link-active" : ""}`}
              key={tab.id}
              onClick={() => onNavigate(tab.id)}
              type="button"
            >
              <span aria-hidden>{navIcon(tab.id)}</span>
              {tab.label}
            </button>
          ))}
        </nav>
        <button className="conference-back" onClick={() => onNavigate("Recebimento")} type="button" title="Voltar">
          &lt;
        </button>
      </aside>

      <main className="min-w-0 px-4 py-6 pb-28 sm:px-6 lg:px-8 lg:py-8">
        {!document.hasActiveReceiving ? (
          <section className="mx-auto grid min-h-[70vh] max-w-3xl place-items-center text-center">
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 shadow-sm">
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-cyan-700">Conferencia</p>
              <h1 className="mt-3 text-3xl font-bold tracking-tight">Nenhuma conferencia esta em andamento.</h1>
              <p className="mt-3 text-slate-600">Inicie um recebimento para conferir os produtos.</p>
              <button className="mt-6 rounded-lg bg-[#071f3d] px-5 py-3 font-bold text-white" onClick={() => onNavigate("Recebimento")} type="button">
                Ir para Recebimento
              </button>
            </div>
          </section>
        ) : (
          <div className="mx-auto grid max-w-[1440px] gap-5">
            <header className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-[#071f3d] sm:text-4xl">Conferencia de Produtos</h1>
                <p className="mt-2 text-slate-600">Compare a mercadoria fisica com os itens da nota.</p>
              </div>
              <div className="text-left text-sm text-slate-700 md:text-right">
                <p className="font-bold text-[#071f3d]">{document.type || "Documento"} {document.number || "sem numero"}</p>
                <p>{document.supplier || "Fornecedor nao informado"}</p>
              </div>
            </header>

            <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
                <div>
                  <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
                    <DocChip label="Tipo" value={document.type || "-"} />
                    <DocChip label="Numero" value={document.number || "-"} />
                    <DocChip label="Serie" value={document.series || "-"} />
                    <DocChip label="Emissao" value={formatDateTime(document.issueDate || document.entryDateTime)} />
                    <DocChip label="Responsavel" value={document.responsible || "-"} />
                    <DocChip label="Chave" value={summarizeKey(document.accessKey)} />
                  </div>
                  <div className="mt-5">
                    <div className="mb-2 flex items-center justify-between gap-3 text-sm font-bold text-[#071f3d]">
                      <span>{stats.checked} de {items.length} itens conferidos</span>
                      <span>{stats.progress}%</span>
                    </div>
                    <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-cyan-500 transition-all" style={{ width: `${stats.progress}%` }} />
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:min-w-[560px]">
                  <MetricCard label="Itens da nota" value={items.length} tone="blue" />
                  <MetricCard label="Conferidos" value={stats.checked} tone="green" />
                  <MetricCard label="Divergencias" value={stats.divergences} tone="red" />
                  <MetricCard label="Pendentes" value={stats.pending} tone="slate" />
                </div>
              </div>
            </section>

            {message && (
              <p className={`rounded-lg border px-4 py-3 text-sm font-semibold ${messageClass(message.tone)}`}>{message.text}</p>
            )}

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_350px]">
              <section className="min-w-0 rounded-lg border border-slate-200 bg-white shadow-sm">
                <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <h2 className="text-xl font-bold text-[#071f3d]">Itens da nota</h2>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <div className="flex rounded-lg border border-slate-300 bg-white">
                      <input
                        aria-label="Codigo do produto"
                        className="min-w-0 flex-1 rounded-l-lg px-3 py-2 text-sm outline-none"
                        inputMode="numeric"
                        onChange={(event) => setScanCode(event.target.value)}
                        onKeyDown={(event) => { if (event.key === "Enter") submitScan(); }}
                        placeholder="Codigo do produto"
                        value={scanCode}
                      />
                      <button className="rounded-r-lg border-l border-slate-300 px-3 text-sm font-bold text-blue-700" onClick={submitScan} type="button">
                        Buscar
                      </button>
                    </div>
                    <button className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-bold text-white shadow-sm" onClick={onOpenScanner} type="button">
                      Escanear produto
                    </button>
                  </div>
                </div>

                {scanMessage && <p className="mx-4 mt-4 rounded-lg bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-800">{scanMessage}</p>}

                {hasNoImportedItems && (
                  <div className="m-4 rounded-lg border border-dashed border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
                    Este recebimento nao possui itens importados. Adicione os itens manualmente para realizar a conferencia.
                  </div>
                )}

                <div className="p-4">
                  <button className="rounded-lg border border-blue-300 px-4 py-2 text-sm font-bold text-blue-700" onClick={() => setManualOpen((current) => !current)} type="button">
                    Adicionar item manual
                  </button>

                  {manualOpen && !isFinalized && (
                    <div className="mt-4 grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-6">
                      <Input label="Codigo" value={manualItem.code} onChange={(value) => setManualItem((current) => ({ ...current, code: value }))} />
                      <Input className="lg:col-span-2" label="Produto" value={manualItem.product} onChange={(value) => setManualItem((current) => ({ ...current, product: value }))} />
                      <Input label="Unidade" value={manualItem.unit} onChange={(value) => setManualItem((current) => ({ ...current, unit: value }))} />
                      <Input label="Qtd. esperada" type="number" value={manualItem.expected} onChange={(value) => setManualItem((current) => ({ ...current, expected: value }))} />
                      <Input label="Qtd. recebida" type="number" value={manualItem.received} onChange={(value) => setManualItem((current) => ({ ...current, received: value }))} />
                      <label className="text-sm font-semibold sm:col-span-2 lg:col-span-5">
                        Observacao
                        <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" value={manualItem.note} onChange={(event) => setManualItem((current) => ({ ...current, note: event.target.value }))} />
                      </label>
                      <button className="rounded-lg bg-[#071f3d] px-4 py-2 text-sm font-bold text-white disabled:bg-slate-300" disabled={!manualItem.product.trim()} onClick={submitManualItem} type="button">
                        Adicionar
                      </button>
                    </div>
                  )}
                </div>

                {items.length === 0 ? (
                  <p className="mx-4 mb-4 rounded-lg bg-slate-50 p-6 text-center text-sm text-slate-500">
                    Nenhum item para conferencia ainda.
                  </p>
                ) : (
                  <>
                    <div className="hidden overflow-x-auto px-4 pb-4 md:block">
                      <table className="w-full min-w-[980px] border-separate border-spacing-0 text-left text-sm">
                        <thead>
                          <tr className="bg-slate-50 text-xs uppercase text-slate-500">
                            <Th>Codigo</Th>
                            <Th>Produto</Th>
                            <Th>Unidade</Th>
                            <Th>Qtd. esperada</Th>
                            <Th>Qtd. recebida</Th>
                            <Th>Diferenca</Th>
                            <Th>Status</Th>
                            <Th>Acao</Th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((item) => (
                            <ConferenceRow
                              damageId={damageId}
                              editingId={editingId}
                              highlighted={highlightedItemId === item.id}
                              isFinalized={isFinalized}
                              item={item}
                              key={item.id}
                              onConfirmItem={onConfirmItem}
                              onRegisterDamage={onRegisterDamage}
                              onSetDamageId={setDamageId}
                              onSetEditingId={setEditingId}
                              onUpdateNote={onUpdateNote}
                              onUpdateReceived={onUpdateReceived}
                            />
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="grid gap-3 px-4 pb-4 md:hidden">
                      {items.map((item) => (
                        <ConferenceCard
                          damageId={damageId}
                          editingId={editingId}
                          highlighted={highlightedItemId === item.id}
                          isFinalized={isFinalized}
                          item={item}
                          key={item.id}
                          onConfirmItem={onConfirmItem}
                          onRegisterDamage={onRegisterDamage}
                          onSetDamageId={setDamageId}
                          onSetEditingId={setEditingId}
                          onUpdateNote={onUpdateNote}
                          onUpdateReceived={onUpdateReceived}
                        />
                      ))}
                    </div>
                  </>
                )}
              </section>

              <aside className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm xl:sticky xl:top-5 xl:self-start">
                <h2 className="text-xl font-bold text-[#071f3d]">Atencao necessaria</h2>
                <div className="mt-4 grid gap-3">
                  {divergenceItems.length === 0 ? (
                    <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">Nenhuma divergencia registrada.</p>
                  ) : (
                    divergenceItems.map((item) => <DivergenceCard item={item} key={item.id} />)
                  )}
                </div>
                <button className="mt-5 w-full rounded-lg border border-blue-500 px-4 py-3 font-bold text-blue-700 disabled:border-slate-200 disabled:text-slate-400" disabled={divergenceItems.length === 0} onClick={reviewDivergences} type="button">
                  Revisar divergencias
                </button>
              </aside>
            </div>
          </div>
        )}
      </main>

      {document.hasActiveReceiving && (
        <footer className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 p-3 shadow-[0_-6px_24px_rgba(15,23,42,0.10)] backdrop-blur lg:left-[244px]">
          <div className="mx-auto flex max-w-[1440px] flex-col gap-2 sm:flex-row sm:justify-end">
            {isFinalized ? (
              <button className="rounded-lg border border-slate-300 px-5 py-3 font-bold text-slate-700" onClick={onReopen} type="button">
                Reabrir conferencia
              </button>
            ) : (
              <>
                <button className="rounded-lg border border-blue-500 px-5 py-3 font-bold text-blue-700" onClick={onSaveDraft} type="button">
                  Salvar rascunho
                </button>
                <button className="rounded-lg bg-cyan-500 px-5 py-3 font-bold text-white shadow-sm" onClick={onFinalize} type="button">
                  Finalizar conferencia
                </button>
              </>
            )}
          </div>
        </footer>
      )}
    </div>
  );
}

function ConferenceRow(props: {
  item: ConferenceItem;
  highlighted: boolean;
  editingId: number | null;
  damageId: number | null;
  isFinalized: boolean;
  onConfirmItem: (id: number) => void;
  onUpdateReceived: (id: number, value: string) => void;
  onRegisterDamage: (id: number, note: string) => void;
  onUpdateNote: (id: number, value: string) => void;
  onSetEditingId: (id: number | null) => void;
  onSetDamageId: (id: number | null) => void;
}) {
  const { item, highlighted, editingId, damageId, isFinalized } = props;
  const isEditing = editingId === item.id;
  const isDamageOpen = damageId === item.id;
  return (
    <tr className={`${highlighted ? "bg-cyan-50 ring-2 ring-inset ring-cyan-300" : ""}`} data-conference-status={item.status}>
      <Td>{item.code || "-"}</Td>
      <Td>
        <span className="font-semibold text-slate-950">{item.product}</span>
        {item.manual && <span className="ml-2 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-700">Item manual</span>}
        {(isDamageOpen || item.note) && (
          <input className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs outline-none" disabled={isFinalized} onChange={(event) => props.onUpdateNote(item.id, event.target.value)} placeholder="Observacao" value={item.note} />
        )}
      </Td>
      <Td>{item.unit}</Td>
      <Td>{formatQuantity(item.expected)}</Td>
      <Td>
        {isEditing ? (
          <input autoFocus className="w-24 rounded-lg border border-blue-300 px-3 py-2 font-semibold outline-none" min="0" onBlur={() => props.onSetEditingId(null)} onChange={(event) => props.onUpdateReceived(item.id, event.target.value)} type="number" value={item.received} />
        ) : (
          formatQuantity(item.received)
        )}
      </Td>
      <Td className={differenceClass(item)}>{formatDifference(item)}</Td>
      <Td><StatusBadge status={item.status} /></Td>
      <Td>
        <div className="flex flex-wrap gap-2">
          <ActionButton disabled={isFinalized} label="Confirmar" onClick={() => props.onConfirmItem(item.id)} tone="green" />
          <ActionButton disabled={isFinalized} label="Ajustar" onClick={() => props.onSetEditingId(item.id)} tone="blue" />
          <ActionButton disabled={isFinalized} label="Avaria" onClick={() => { props.onSetDamageId(item.id); props.onRegisterDamage(item.id, item.note); }} tone="amber" />
        </div>
      </Td>
    </tr>
  );
}

function ConferenceCard(props: React.ComponentProps<typeof ConferenceRow>) {
  const { item, highlighted, editingId, damageId, isFinalized } = props;
  const isEditing = editingId === item.id;
  const isDamageOpen = damageId === item.id;
  return (
    <article className={`rounded-lg border p-4 ${highlighted ? "border-cyan-400 bg-cyan-50" : "border-slate-200 bg-white"}`} data-conference-status={item.status}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase text-slate-500">{item.code || "-"} - {item.unit}</p>
          <h3 className="mt-1 font-bold text-slate-950">{item.product}</h3>
          {item.manual && <span className="mt-2 inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-700">Item manual</span>}
        </div>
        <StatusBadge status={item.status} />
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
        <Info label="Esperada" value={formatQuantity(item.expected)} />
        <Info label="Recebida" value={isEditing ? "" : formatQuantity(item.received)} />
        <Info className={differenceClass(item)} label="Diferenca" value={formatDifference(item)} />
      </div>
      {isEditing && (
        <input autoFocus className="mt-3 w-full rounded-lg border border-blue-300 px-3 py-3 font-semibold outline-none" min="0" onBlur={() => props.onSetEditingId(null)} onChange={(event) => props.onUpdateReceived(item.id, event.target.value)} type="number" value={item.received} />
      )}
      {(isDamageOpen || item.note) && (
        <input className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-3 text-sm outline-none" disabled={isFinalized} onChange={(event) => props.onUpdateNote(item.id, event.target.value)} placeholder="Observacao" value={item.note} />
      )}
      <div className="mt-4 grid grid-cols-3 gap-2">
        <ActionButton disabled={isFinalized} label="Confirmar" onClick={() => props.onConfirmItem(item.id)} tone="green" />
        <ActionButton disabled={isFinalized} label="Ajustar" onClick={() => props.onSetEditingId(item.id)} tone="blue" />
        <ActionButton disabled={isFinalized} label="Avaria" onClick={() => { props.onSetDamageId(item.id); props.onRegisterDamage(item.id, item.note); }} tone="amber" />
      </div>
    </article>
  );
}

function DivergenceCard({ item }: { item: ConferenceItem }) {
  return (
    <article className={`rounded-lg border p-4 ${item.status === "Falta" ? "border-rose-200 bg-rose-50" : item.status === "Sobra" ? "border-orange-200 bg-orange-50" : "border-amber-200 bg-amber-50"}`}>
      <p className="font-bold text-slate-950">{item.product}</p>
      <p className={`mt-2 font-bold ${item.status === "Falta" ? "text-rose-700" : item.status === "Sobra" ? "text-orange-700" : "text-amber-700"}`}>{item.status}: {formatDifference(item)}</p>
      <p className="mt-3 text-sm text-slate-700">Esperada: {formatQuantity(item.expected)} {item.unit}</p>
      <p className="text-sm text-slate-700">Recebida: {formatQuantity(item.received)} {item.unit}</p>
      {item.note && <p className="mt-2 text-sm text-slate-700">Obs.: {item.note}</p>}
    </article>
  );
}

function MetricCard({ label, value, tone }: { label: string; value: number; tone: "blue" | "green" | "red" | "slate" }) {
  const colors = {
    blue: "text-blue-700",
    green: "text-emerald-700",
    red: "text-rose-700",
    slate: "text-slate-600",
  };
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium text-slate-600">{label}</p>
      <p className={`mt-2 text-3xl font-bold ${colors[tone]}`}>{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: ConferenceStatus }) {
  const colors = {
    Avaria: "bg-amber-50 text-amber-800 ring-amber-200",
    Conferido: "bg-emerald-50 text-emerald-800 ring-emerald-200",
    Falta: "bg-rose-50 text-rose-800 ring-rose-200",
    Pendente: "bg-slate-100 text-slate-700 ring-slate-200",
    Sobra: "bg-orange-50 text-orange-800 ring-orange-200",
  };
  return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ring-1 ${colors[status]}`}>{status}</span>;
}

function ActionButton({ disabled, label, onClick, tone }: { disabled: boolean; label: string; onClick: () => void; tone: "blue" | "green" | "amber" }) {
  const colors = {
    amber: "border-amber-300 text-amber-800 hover:bg-amber-50",
    blue: "border-blue-300 text-blue-700 hover:bg-blue-50",
    green: "border-emerald-300 text-emerald-700 hover:bg-emerald-50",
  };
  return <button className={`rounded-lg border px-3 py-2 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-50 ${colors[tone]}`} disabled={disabled} onClick={onClick} type="button">{label}</button>;
}

function Input({ className = "", label, onChange, type = "text", value }: { className?: string; label: string; onChange: (value: string) => void; type?: string; value: string }) {
  return (
    <label className={`text-sm font-semibold ${className}`}>
      {label}
      <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" min={type === "number" ? "0" : undefined} onChange={(event) => onChange(event.target.value)} type={type} value={value} />
    </label>
  );
}

function DocChip({ label, value }: { label: string; value: string }) {
  return <span className="rounded-full bg-slate-100 px-3 py-1"><strong>{label}:</strong> {value}</span>;
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

function navIcon(id: string) {
  const icons: Record<string, string> = {
    Conferencia: "✓",
    Inventario: "▦",
    Recebimento: "↓",
    Relatorio: "▤",
  };
  return icons[id] ?? "•";
}

function formatQuantity(value: number) {
  return Number.isInteger(value) ? String(value) : value.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
}

function formatDifference(item: ConferenceItem) {
  const diff = item.received - item.expected;
  if (diff === 0) return "0";
  return `${diff > 0 ? "+" : ""}${formatQuantity(diff)}`;
}

function differenceClass(item: ConferenceItem) {
  if (item.status === "Falta") return "font-bold text-rose-700";
  if (item.status === "Sobra") return "font-bold text-orange-700";
  if (item.status === "Avaria") return "font-bold text-amber-700";
  return "text-slate-700";
}

function summarizeKey(key: string) {
  if (!key) return "-";
  return `${key.slice(0, 6)}...${key.slice(-6)}`;
}

function formatDateTime(value: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function messageClass(tone: "success" | "error" | "info") {
  if (tone === "success") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (tone === "error") return "border-rose-200 bg-rose-50 text-rose-800";
  return "border-blue-200 bg-blue-50 text-blue-800";
}

function documentQuery(selector: string) {
  if (typeof document === "undefined") return null;
  return document.querySelector<HTMLElement>(selector);
}
