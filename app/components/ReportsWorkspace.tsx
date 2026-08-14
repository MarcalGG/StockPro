"use client";

import { useMemo, useState } from "react";
import {
  listConferenceDivergences,
  listFinalizedInventories,
  listFinalizedReceivings,
  type InventoryCountItem,
  type StoredDivergence,
  type StoredInventoryRecord,
  type StoredReceivingRecord,
} from "../../lib/localOperationalStore";

type Props = {
  onNavigate: (tab: "Recebimento" | "Conferencia" | "Inventario" | "Relatorio") => void;
};

type OperationType = "Recebimento" | "Conferencia" | "Inventario";
type OperationStatus = "Finalizado" | "Concluida" | "Com divergencia";

type ReportOperation = {
  id: string;
  type: OperationType;
  date: string;
  title: string;
  responsible: string;
  status: OperationStatus;
  supplierOrSector: string;
  divergenceCount: number;
  searchText: string;
  source: StoredReceivingRecord | StoredInventoryRecord;
};

type ReportFilters = {
  period: "today" | "7" | "30" | "custom";
  startDate: string;
  endDate: string;
  type: "Todos" | OperationType;
  status: "Todos" | "Finalizado" | "Com divergencia";
  responsible: "Todos" | string;
  search: string;
};

type EnrichedDivergence = StoredDivergence & {
  receiptId: string;
  documentType?: string;
  invoiceNumber?: string;
  supplier?: string;
  responsible?: string;
  finalizedAt?: string | null;
  updatedAt?: string;
};

const tabs: { id: Parameters<Props["onNavigate"]>[0]; label: string }[] = [
  { id: "Recebimento", label: "Recebimento" },
  { id: "Conferencia", label: "Conferencia" },
  { id: "Inventario", label: "Inventario" },
  { id: "Relatorio", label: "Relatorios" },
];

export default function ReportsWorkspace({ onNavigate }: Props) {
  const [receivings] = useState(() => listFinalizedReceivings());
  const [inventories] = useState(() => listFinalizedInventories());
  const [divergences] = useState(() => listConferenceDivergences() as EnrichedDivergence[]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedOperation, setSelectedOperation] = useState<ReportOperation | null>(null);
  const [showDivergenceDetails, setShowDivergenceDetails] = useState(false);
  const [filters, setFilters] = useState<ReportFilters>(() => ({
    period: "30",
    startDate: toInputDate(daysAgo(29)),
    endDate: toInputDate(new Date()),
    type: "Todos",
    status: "Todos",
    responsible: "Todos",
    search: "",
  }));

  const operations = useMemo(() => buildOperations(receivings, inventories), [receivings, inventories]);
  const responsibleOptions = useMemo(() => {
    return Array.from(new Set(operations.map((operation) => operation.responsible).filter(Boolean))).sort();
  }, [operations]);
  const filteredOperations = useMemo(() => {
    const range = periodRange(filters);
    const search = normalize(filters.search);
    return operations
      .filter((operation) => isWithin(operation.date, range.start, range.end))
      .filter((operation) => filters.type === "Todos" || operation.type === filters.type)
      .filter((operation) => filters.status === "Todos" || (filters.status === "Com divergencia" ? operation.divergenceCount > 0 : operation.status === "Finalizado" || operation.status === "Concluida"))
      .filter((operation) => filters.responsible === "Todos" || operation.responsible === filters.responsible)
      .filter((operation) => !search || normalize(operation.searchText).includes(search))
      .sort((a, b) => dateValue(b.date) - dateValue(a.date));
  }, [filters, operations]);

  const filteredReceiptIds = new Set(filteredOperations.filter((operation) => operation.type !== "Inventario").map((operation) => operation.id.replace(/^conf:/, "")));
  const filteredDivergences = divergences.filter((divergence) => filteredReceiptIds.has(divergence.receiptId));
  const stats = {
    finishedReceivings: filteredOperations.filter((operation) => operation.type === "Recebimento").length,
    finishedConferences: filteredOperations.filter((operation) => operation.type === "Conferencia").length,
    pendingDivergences: filteredDivergences.length,
    finishedInventories: filteredOperations.filter((operation) => operation.type === "Inventario").length,
  };
  const divergenceGroups = {
    Falta: filteredDivergences.filter((item) => item.status === "Falta"),
    Sobra: filteredDivergences.filter((item) => item.status === "Sobra"),
    Avaria: filteredDivergences.filter((item) => item.status === "Avaria"),
  };
  const chartDays = buildChartDays(filteredOperations, filters);

  function updateFilter<K extends keyof ReportFilters>(key: K, value: ReportFilters[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function clearFilters() {
    setFilters({
      period: "30",
      startDate: toInputDate(daysAgo(29)),
      endDate: toInputDate(new Date()),
      type: "Todos",
      status: "Todos",
      responsible: "Todos",
      search: "",
    });
  }

  function showDivergences() {
    setShowDivergenceDetails(true);
    setFilters((current) => ({ ...current, status: "Com divergencia" }));
    window.setTimeout(() => documentQuery("#report-divergence-details")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }

  function exportCsv() {
    const rows = [
      ["tipo", "data/hora", "titulo", "responsavel", "status", "fornecedor/setor", "quantidade de divergencias"],
      ...filteredOperations.map((operation) => [
        operation.type,
        formatDateTime(operation.date),
        operation.title,
        operation.responsible || "",
        operation.status,
        operation.supplierOrSector || "",
        String(operation.divergenceCount),
      ]),
    ];
    const csv = rows.map((row) => row.map(escapeCsvCell).join(";")).join("\r\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `stockscan-relatorio-${toInputDate(new Date())}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="reports-shell min-h-screen bg-[#f5f7fb] text-slate-950">
      <aside className="reports-sidebar no-print">
        <div className="px-3 pb-8">
          <div className="text-4xl font-black leading-none tracking-tight">MGN</div>
          <div className="mt-1 text-xs font-semibold uppercase tracking-[0.28em] text-cyan-100">Technologies</div>
        </div>
        <nav className="grid gap-2">
          {tabs.map((tab) => (
            <button
              className={`reports-nav-link ${tab.id === "Relatorio" ? "reports-nav-link-active" : ""}`}
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

      <main className="min-w-0 px-4 py-6 pb-16 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-[1440px] gap-5">
          <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-[#071f3d] sm:text-4xl">Relatorios Operacionais</h1>
              <p className="mt-2 text-slate-600">Acompanhe recebimentos, divergencias e inventarios.</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700">
                {formatDateOnly(periodRange(filters).start)} - {formatDateOnly(periodRange(filters).end)}
              </div>
              <button className="rounded-lg border border-blue-600 px-5 py-3 font-bold text-blue-700" onClick={exportCsv} type="button">
                Exportar relatorio
              </button>
            </div>
          </header>

          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <button className="mb-4 rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 md:hidden" onClick={() => setFiltersOpen((current) => !current)} type="button">
              {filtersOpen ? "Ocultar filtros" : "Mostrar filtros"}
            </button>
            <div className={`${filtersOpen ? "grid" : "hidden"} gap-4 md:grid md:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_1fr_1.3fr_auto]`}>
              <label className="text-sm font-semibold">Periodo<select className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" value={filters.period} onChange={(event) => updateFilter("period", event.target.value as ReportFilters["period"])}><option value="today">Hoje</option><option value="7">7 dias</option><option value="30">30 dias</option><option value="custom">Personalizado</option></select></label>
              <label className="text-sm font-semibold">Tipo<select className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" value={filters.type} onChange={(event) => updateFilter("type", event.target.value as ReportFilters["type"])}><option>Todos</option><option>Recebimento</option><option>Conferencia</option><option>Inventario</option></select></label>
              <label className="text-sm font-semibold">Status<select className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" value={filters.status} onChange={(event) => updateFilter("status", event.target.value as ReportFilters["status"])}><option>Todos</option><option>Finalizado</option><option>Com divergencia</option></select></label>
              <label className="text-sm font-semibold">Responsavel<select className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" value={filters.responsible} onChange={(event) => updateFilter("responsible", event.target.value)}><option>Todos</option>{responsibleOptions.map((responsible) => <option key={responsible}>{responsible}</option>)}</select></label>
              <label className="text-sm font-semibold">Busca<input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" placeholder="Nota, fornecedor, produto ou setor" value={filters.search} onChange={(event) => updateFilter("search", event.target.value)} /></label>
              {filters.period === "custom" && (
                <div className="grid grid-cols-2 gap-2 xl:col-span-2">
                  <label className="text-sm font-semibold">Inicio<input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" type="date" value={filters.startDate} onChange={(event) => updateFilter("startDate", event.target.value)} /></label>
                  <label className="text-sm font-semibold">Fim<input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" type="date" value={filters.endDate} onChange={(event) => updateFilter("endDate", event.target.value)} /></label>
                </div>
              )}
              <button className="self-end rounded-lg px-4 py-3 text-sm font-bold text-blue-700 hover:bg-blue-50" onClick={clearFilters} type="button">Limpar filtros</button>
            </div>
          </section>

          <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <Metric label="Recebimentos finalizados" value={stats.finishedReceivings} tone="blue" />
            <Metric label="Conferencias concluidas" value={stats.finishedConferences} tone="green" />
            <Metric label="Divergencias pendentes" value={stats.pendingDivergences} tone="red" />
            <Metric label="Inventarios finalizados" value={stats.finishedInventories} tone="purple" />
          </section>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
            <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 p-4">
                <h2 className="text-xl font-bold text-[#071f3d]">Historico de operacoes</h2>
              </div>
              {filteredOperations.length === 0 ? (
                <p className="p-8 text-center text-sm text-slate-500">Nao ha operacoes para os filtros selecionados.</p>
              ) : (
                <>
                  <div className="hidden overflow-x-auto md:block">
                    <table className="w-full min-w-[820px] border-separate border-spacing-0 text-left text-sm">
                      <thead><tr className="bg-slate-50 text-xs uppercase text-slate-500"><Th>Tipo</Th><Th>Data/hora</Th><Th>Titulo</Th><Th>Responsavel</Th><Th>Status</Th><Th>Acao</Th></tr></thead>
                      <tbody>
                        {filteredOperations.map((operation) => (
                          <OperationRow key={operation.id} operation={operation} onSelect={setSelectedOperation} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="grid gap-3 p-4 md:hidden">
                    {filteredOperations.map((operation) => (
                      <OperationCard key={operation.id} operation={operation} onSelect={setSelectedOperation} />
                    ))}
                  </div>
                </>
              )}
            </section>

            <aside className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm xl:self-start">
              <h2 className="text-xl font-bold text-[#071f3d]">Divergencias pendentes</h2>
              <div className="mt-4 divide-y divide-slate-100 rounded-lg border border-slate-200">
                <DivergenceSummary label="Faltas" value={divergenceGroups.Falta.length} tone="red" />
                <DivergenceSummary label="Sobras" value={divergenceGroups.Sobra.length} tone="orange" />
                <DivergenceSummary label="Avarias" value={divergenceGroups.Avaria.length} tone="amber" />
              </div>
              <button className="mt-5 w-full rounded-lg bg-red-600 px-4 py-3 font-bold text-white disabled:bg-slate-300" disabled={filteredDivergences.length === 0} onClick={showDivergences} type="button">
                Ver divergencias
              </button>
            </aside>
          </div>

          {showDivergenceDetails && (
            <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm" id="report-divergence-details">
              <h2 className="text-xl font-bold text-[#071f3d]">Detalhe de divergencias</h2>
              {filteredDivergences.length === 0 ? (
                <p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-500">Nenhuma divergencia encontrada nos filtros atuais.</p>
              ) : (
                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {filteredDivergences.map((item, index) => <DivergenceDetail item={item} key={`${item.receiptId}-${item.itemId}-${index}`} />)}
                </div>
              )}
            </section>
          )}

          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-xl font-bold text-[#071f3d]">Operacoes por dia</h2>
            {chartDays.every((day) => day.receivings + day.conferences + day.inventories === 0) ? (
              <p className="mt-4 rounded-lg bg-slate-50 p-6 text-center text-sm text-slate-500">Nao ha operacoes suficientes para gerar o grafico neste periodo.</p>
            ) : (
              <div className="mt-5 overflow-x-auto">
                <div className="flex min-w-[720px] items-end gap-4 border-b border-slate-200 pb-6">
                  {chartDays.map((day) => <ChartDay day={day} key={day.key} />)}
                </div>
                <div className="mt-4 flex justify-center gap-6 text-sm text-slate-600">
                  <Legend color="bg-blue-500" label="Recebimentos" />
                  <Legend color="bg-emerald-500" label="Conferencias" />
                  <Legend color="bg-violet-500" label="Inventarios" />
                </div>
              </div>
            )}
          </section>
        </div>
      </main>

      {selectedOperation && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4">
          <section className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.16em] text-blue-700">{selectedOperation.type}</p>
                <h2 className="mt-1 text-2xl font-bold text-[#071f3d]">{selectedOperation.title}</h2>
                <p className="mt-1 text-sm text-slate-600">{formatDateTime(selectedOperation.date)} - {selectedOperation.responsible || "Responsavel nao informado"}</p>
              </div>
              <button className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold" onClick={() => setSelectedOperation(null)} type="button">Fechar</button>
            </div>
            <OperationDetails operation={selectedOperation} divergences={filteredDivergences} />
          </section>
        </div>
      )}
    </div>
  );
}

function buildOperations(receivings: StoredReceivingRecord[], inventories: StoredInventoryRecord[]): ReportOperation[] {
  const receiptOperations = receivings.flatMap((record): ReportOperation[] => {
    const baseDate = usableDate(record.finalizedAt, record.updatedAt);
    const titleDoc = `${record.documentType || "Documento"} ${record.invoiceNumber || "sem numero"}`;
    const searchText = [
      record.invoiceNumber,
      record.supplier,
      record.responsible,
      record.items.map((item) => item.product).join(" "),
      record.divergences.map((item) => item.product).join(" "),
    ].join(" ");
    return [
      {
        id: record.id,
        type: "Recebimento",
        date: baseDate,
        title: `Recebimento ${titleDoc}`,
        responsible: record.responsible,
        status: "Finalizado",
        supplierOrSector: record.supplier,
        divergenceCount: record.divergences.length,
        searchText,
        source: record,
      },
      {
        id: `conf:${record.id}`,
        type: "Conferencia",
        date: baseDate,
        title: `Conferencia concluida - ${record.supplier || "Fornecedor nao informado"}`,
        responsible: record.responsible,
        status: record.divergences.length > 0 ? "Com divergencia" : "Concluida",
        supplierOrSector: record.supplier,
        divergenceCount: record.divergences.length,
        searchText,
        source: record,
      },
    ];
  });
  const inventoryOperations = inventories.map((record): ReportOperation => ({
    id: record.id,
    type: "Inventario",
    date: usableDate(record.finalizedAt, record.updatedAt),
    title: `Inventario - ${record.sector || record.title}`,
    responsible: record.responsible,
    status: inventoryDifferenceCount(record) > 0 ? "Com divergencia" : "Finalizado",
    supplierOrSector: record.sector,
    divergenceCount: inventoryDifferenceCount(record),
    searchText: [record.title, record.sector, record.responsible, record.items.map((item) => item.product).join(" ")].join(" "),
    source: record,
  }));
  return [...receiptOperations, ...inventoryOperations];
}

function OperationRow({ onSelect, operation }: { onSelect: (operation: ReportOperation) => void; operation: ReportOperation }) {
  return <tr><Td><TypeIcon type={operation.type} /></Td><Td>{formatDateTime(operation.date)}</Td><Td>{operation.title}</Td><Td>{operation.responsible || "-"}</Td><Td><StatusPill status={operation.status} /></Td><Td><button className="font-bold text-blue-700" onClick={() => onSelect(operation)} type="button">Ver detalhes</button></Td></tr>;
}

function OperationCard({ onSelect, operation }: { onSelect: (operation: ReportOperation) => void; operation: ReportOperation }) {
  return <article className="rounded-lg border border-slate-200 p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase text-slate-500">{operation.type}</p><h3 className="mt-1 font-bold">{operation.title}</h3><p className="mt-1 text-sm text-slate-600">{formatDateTime(operation.date)} - {operation.responsible || "-"}</p></div><StatusPill status={operation.status} /></div><button className="mt-3 text-sm font-bold text-blue-700" onClick={() => onSelect(operation)} type="button">Ver detalhes</button></article>;
}

function OperationDetails({ divergences, operation }: { divergences: EnrichedDivergence[]; operation: ReportOperation }) {
  const source = operation.source;
  const receiptDivergences = operation.type === "Inventario" ? [] : divergences.filter((item) => item.receiptId === source.id);
  const inventoryItems = operation.type === "Inventario" ? (source as StoredInventoryRecord).items.filter((item) => item.status === "Falta" || item.status === "Sobra") : [];
  return (
    <div className="mt-5 grid gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Detail label="Status" value={operation.status} />
        <Detail label="Fornecedor/setor" value={operation.supplierOrSector || "-"} />
        <Detail label="Divergencias" value={String(operation.divergenceCount)} />
        <Detail label="Edicao" value="Somente leitura" />
      </div>
      {operation.type !== "Inventario" && (
        <div>
          <h3 className="font-bold text-[#071f3d]">Itens da conferencia</h3>
          <div className="mt-3 grid gap-2">
            {receiptDivergences.length === 0 ? <p className="text-sm text-slate-500">Nenhuma divergencia registrada.</p> : receiptDivergences.map((item, index) => <DivergenceDetail item={item} key={`${item.itemId}-${index}`} />)}
          </div>
        </div>
      )}
      {operation.type === "Inventario" && (
        <div>
          <h3 className="font-bold text-[#071f3d]">Diferencas do inventario</h3>
          <div className="mt-3 grid gap-2">
            {inventoryItems.length === 0 ? <p className="text-sm text-slate-500">Nenhuma diferenca registrada.</p> : inventoryItems.map((item) => <InventoryDifferenceDetail item={item} key={item.id} />)}
          </div>
        </div>
      )}
    </div>
  );
}

function DivergenceDetail({ item }: { item: EnrichedDivergence }) {
  return <article className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm"><p className="font-bold text-slate-950">{item.product}</p><p className="mt-1 text-slate-700">Tipo: {item.status} | Esperada: {formatNumber(item.expected)} {item.unit} | Recebida: {formatNumber(item.received)} {item.unit} | Diferenca: {formatSigned(item.difference)}</p><p className="mt-1 text-slate-600">{item.supplier || "Fornecedor nao informado"} - {item.invoiceNumber || "sem nota"} - {formatDateTime(item.finalizedAt || item.updatedAt || "")}</p>{item.note && <p className="mt-1 text-slate-600">Obs.: {item.note}</p>}</article>;
}

function InventoryDifferenceDetail({ item }: { item: InventoryCountItem }) {
  return <article className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm"><p className="font-bold">{item.product}</p><p className="mt-1">Tipo: {item.status} | Esperado: {item.expected === null ? "-" : formatNumber(item.expected)} | Contado: {item.counted === null ? "-" : formatNumber(item.counted)} | Diferenca: {item.difference === null ? "-" : formatSigned(item.difference)}</p></article>;
}

function Metric({ label, tone, value }: { label: string; tone: "blue" | "green" | "red" | "purple"; value: number }) {
  const colors = { blue: "border-blue-500 text-blue-700", green: "border-emerald-500 text-emerald-700", purple: "border-violet-500 text-violet-700", red: "border-red-500 text-red-700" };
  return <div className={`rounded-lg border-l-4 bg-white p-5 shadow-sm ${colors[tone]}`}><p className="text-sm font-medium text-slate-700">{label}</p><p className="mt-2 text-4xl font-bold">{value}</p></div>;
}

function DivergenceSummary({ label, tone, value }: { label: string; tone: "red" | "orange" | "amber"; value: number }) {
  const colors = { amber: "text-amber-600 bg-amber-50", orange: "text-orange-600 bg-orange-50", red: "text-red-600 bg-red-50" };
  return <div className="flex items-center justify-between gap-4 p-4"><span className={`rounded-full px-3 py-2 font-bold ${colors[tone]}`}>{label}</span><strong className={`text-3xl ${colors[tone].split(" ")[0]}`}>{value}</strong></div>;
}

function ChartDay({ day }: { day: { key: string; label: string; receivings: number; conferences: number; inventories: number; max: number } }) {
  return <div className="flex min-w-12 flex-1 flex-col items-center gap-2"><div className="flex h-32 items-end gap-1"><Bar color="bg-blue-500" max={day.max} value={day.receivings} /><Bar color="bg-emerald-500" max={day.max} value={day.conferences} /><Bar color="bg-violet-500" max={day.max} value={day.inventories} /></div><span className="text-xs text-slate-600">{day.label}</span></div>;
}

function Bar({ color, max, value }: { color: string; max: number; value: number }) {
  const height = max === 0 ? 0 : Math.max(6, Math.round((value / max) * 112));
  return <div className={`w-3 rounded-t ${color}`} style={{ height }} title={String(value)} />;
}

function Legend({ color, label }: { color: string; label: string }) {
  return <span className="inline-flex items-center gap-2"><span className={`h-3 w-3 rounded ${color}`} />{label}</span>;
}

function TypeIcon({ type }: { type: OperationType }) {
  const colors = { Conferencia: "bg-emerald-50 text-emerald-700", Inventario: "bg-violet-50 text-violet-700", Recebimento: "bg-blue-50 text-blue-700" };
  return <span className={`inline-grid h-9 w-9 place-items-center rounded-full font-bold ${colors[type]}`}>{type[0]}</span>;
}

function StatusPill({ status }: { status: OperationStatus }) {
  const color = status === "Com divergencia" ? "bg-orange-50 text-orange-700 ring-orange-200" : "bg-emerald-50 text-emerald-700 ring-emerald-200";
  return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ring-1 ${color}`}>{status}</span>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-slate-50 p-3"><p className="text-xs font-bold uppercase text-slate-500">{label}</p><p className="mt-1 font-semibold">{value}</p></div>;
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-3 first:rounded-l-lg last:rounded-r-lg">{children}</th>;
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="border-b border-slate-100 px-4 py-3 align-middle">{children}</td>;
}

function buildChartDays(operations: ReportOperation[], filters: ReportFilters) {
  const range = periodRange(filters);
  const days: Date[] = [];
  const cursor = startOfDay(range.start);
  while (cursor <= range.end && days.length < 31) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  const raw = days.map((day) => {
    const key = toInputDate(day);
    const dayOps = operations.filter((operation) => toInputDate(new Date(operation.date)) === key);
    return {
      key,
      label: day.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
      receivings: dayOps.filter((operation) => operation.type === "Recebimento").length,
      conferences: dayOps.filter((operation) => operation.type === "Conferencia").length,
      inventories: dayOps.filter((operation) => operation.type === "Inventario").length,
      max: 0,
    };
  });
  const max = Math.max(1, ...raw.flatMap((day) => [day.receivings, day.conferences, day.inventories]));
  return raw.map((day) => ({ ...day, max }));
}

function periodRange(filters: ReportFilters) {
  const end = endOfDay(filters.period === "custom" ? parseDate(filters.endDate) : new Date());
  if (filters.period === "today") return { start: startOfDay(new Date()), end };
  if (filters.period === "7") return { start: startOfDay(daysAgo(6)), end };
  if (filters.period === "30") return { start: startOfDay(daysAgo(29)), end };
  return { start: startOfDay(parseDate(filters.startDate)), end };
}

function isWithin(value: string, start: Date, end: Date) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return date >= start && date <= end;
}

function inventoryDifferenceCount(record: StoredInventoryRecord) {
  return record.items.filter((item) => item.status === "Falta" || item.status === "Sobra").length;
}

function dateValue(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function usableDate(primary: string | null | undefined, fallback: string) {
  const primaryDate = primary ? new Date(primary) : null;
  return primaryDate && !Number.isNaN(primaryDate.getTime()) ? primary! : fallback;
}

function parseDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

function daysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

function toInputDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatDateOnly(date: Date) {
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

function formatDateTime(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
}

function formatSigned(value: number) {
  if (value === 0) return "0";
  return `${value > 0 ? "+" : ""}${formatNumber(value)}`;
}

function normalize(value: string) {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

function escapeCsvCell(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function navIcon(id: string) {
  const icons: Record<string, string> = { Conferencia: "✓", Inventario: "#", Recebimento: "↓", Relatorio: "▥" };
  return icons[id] ?? "•";
}

function documentQuery(selector: string) {
  if (typeof document === "undefined") return null;
  return document.querySelector<HTMLElement>(selector);
}
