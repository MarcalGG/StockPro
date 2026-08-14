"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  canMarkFiscalDocumentReady,
  getReceivingRecord,
  listAccountingShipmentDrafts,
  listFiscalDocuments,
  saveAccountingShipmentDraft,
  updateFiscalDocumentStatus,
  type AccountingShipmentDraft,
  type FiscalDocumentRecord,
  type FiscalDocumentStatus,
  type FiscalDocumentType,
  type StoredReceivingRecord,
} from "../../lib/localOperationalStore";

type PeriodFilter = "all" | "today" | "7" | "30";
type TypeFilter = "Todos" | FiscalDocumentType;
type StatusFilter = "Todos" | FiscalDocumentStatus;

const statusOptions: StatusFilter[] = [
  "Todos",
  "Pendente",
  "Pronto para envio",
  "Enviado",
  "Incompleto",
  "Duplicado",
];

export default function AccountingDocumentsWorkspace() {
  const [documents, setDocuments] = useState<FiscalDocumentRecord[]>([]);
  const [shipments, setShipments] = useState<AccountingShipmentDraft[]>([]);
  const [period, setPeriod] = useState<PeriodFilter>("30");
  const [type, setType] = useState<TypeFilter>("Todos");
  const [status, setStatus] = useState<StatusFilter>("Todos");
  const [issuer, setIssuer] = useState("Todos");
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [detail, setDetail] = useState<FiscalDocumentRecord | null>(null);
  const [showLinkedReceiving, setShowLinkedReceiving] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [shipmentResponsible, setShipmentResponsible] = useState("");
  const [shipmentNotes, setShipmentNotes] = useState("");
  const [message, setMessage] = useState<{ tone: "success" | "error" | "info"; text: string } | null>(null);

  function refresh() {
    setDocuments(listFiscalDocuments());
    setShipments(listAccountingShipmentDrafts());
  }

  useEffect(() => {
    const timer = window.setTimeout(refresh, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const issuers = useMemo(
    () => ["Todos", ...Array.from(new Set(documents.map((document) => document.issuer).filter(Boolean))).sort()],
    [documents],
  );

  const filteredDocuments = useMemo(() => {
    const query = search.replace(/\D/g, "") || search.trim().toLowerCase();
    return documents
      .filter((document) => period === "all" || isWithinPeriod(document.issuedAt || document.includedAt, period))
      .filter((document) => type === "Todos" || document.type === type)
      .filter((document) => status === "Todos" || document.status === status)
      .filter((document) => issuer === "Todos" || document.issuer === issuer)
      .filter((document) => {
        if (!query) return true;
        const haystack = [
          document.accessKey,
          document.number,
          document.series,
          document.issuer,
          document.issuerCnpj,
        ].join(" ").toLowerCase();
        return haystack.includes(query);
      })
      .sort((a, b) => (b.updatedAt || b.includedAt).localeCompare(a.updatedAt || a.includedAt));
  }, [documents, issuer, period, search, status, type]);

  const selectedDocuments = useMemo(
    () => documents.filter((document) => selectedIds.has(document.id)),
    [documents, selectedIds],
  );

  const metrics = useMemo(() => {
    const pendingStatuses: FiscalDocumentStatus[] = ["Pendente", "Incompleto", "Duplicado"];
    return {
      nfePending: documents.filter((document) => document.type === "NFE" && pendingStatuses.includes(document.status)).length,
      ctePending: documents.filter((document) => document.type === "CTE" && pendingStatuses.includes(document.status)).length,
      ready: documents.filter((document) => document.status === "Pronto para envio").length,
      sent: documents.filter((document) => document.status === "Enviado").length,
    };
  }, [documents]);

  const linkedReceiving = useMemo<StoredReceivingRecord | null>(() => {
    if (!detail?.linkedReceivingId) return null;
    return getReceivingRecord(detail.linkedReceivingId);
  }, [detail]);

  function clearFilters() {
    setPeriod("30");
    setType("Todos");
    setStatus("Todos");
    setIssuer("Todos");
    setSearch("");
  }

  function markReady(document: FiscalDocumentRecord) {
    const check = canMarkFiscalDocumentReady(document);
    if (!check.ok) {
      setMessage({
        tone: "error",
        text: `Documento incompleto para remessa: falta ${check.missing.join(", ")}.`,
      });
      return;
    }
    updateFiscalDocumentStatus(document.id, "Pronto para envio");
    setMessage({ tone: "success", text: "Documento marcado como pronto para envio." });
    refresh();
  }

  function markPending(document: FiscalDocumentRecord) {
    updateFiscalDocumentStatus(document.id, "Pendente");
    setSelectedIds((current) => {
      const next = new Set(current);
      next.delete(document.id);
      return next;
    });
    setMessage({ tone: "info", text: "Documento voltou para pendente." });
    refresh();
  }

  function toggleSelection(document: FiscalDocumentRecord) {
    if (document.status !== "Pronto para envio") {
      setMessage({ tone: "info", text: "Selecione apenas documentos com status Pronto para envio." });
      return;
    }
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(document.id)) next.delete(document.id);
      else next.add(document.id);
      return next;
    });
  }

  function openReview() {
    if (selectedDocuments.length === 0) {
      setMessage({ tone: "error", text: "Selecione ao menos um documento pronto para preparar a remessa." });
      return;
    }
    setReviewOpen(true);
  }

  function saveShipmentDraft() {
    if (!shipmentResponsible.trim()) {
      setMessage({ tone: "error", text: "Informe o responsável pela preparação da remessa." });
      return;
    }
    const draft = saveAccountingShipmentDraft({
      documentIds: selectedDocuments.map((document) => document.id),
      responsible: shipmentResponsible.trim(),
      notes: shipmentNotes.trim(),
    });
    setMessage({ tone: "success", text: `Remessa ${draft.id} salva como rascunho. Nenhum envio externo foi realizado.` });
    setReviewOpen(false);
    setShipmentResponsible("");
    setShipmentNotes("");
    setSelectedIds(new Set());
    refresh();
  }

  return (
    <div className="documents-shell min-h-screen bg-[#f3f6fb] text-slate-950">
      <aside className="documents-sidebar no-print">
        <div className="mb-8 flex items-center gap-3 px-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-sky-500 font-black text-white">SS</span>
          <div>
            <strong>StockScan</strong>
            <p className="text-xs font-bold text-sky-200">PRO</p>
          </div>
        </div>
        <nav className="grid gap-2">
          <Link className="documents-nav-link" href="/">Recebimento</Link>
          <Link className="documents-nav-link" href="/">Conferência</Link>
          <Link className="documents-nav-link" href="/">Inventário</Link>
          <Link className="documents-nav-link" href="/">Relatórios</Link>
          <Link className="documents-nav-link documents-nav-link-active" href="/documentos">Documentos</Link>
        </nav>
      </aside>

      <main className="min-w-0 p-4 pb-28 sm:p-6 lg:p-8">
        <header className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-sm font-semibold text-sky-700">Central fiscal operacional</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-4xl">Documentos para Contabilidade</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">
              Separe NF-e e CT-e finalizadas, revise pendências e prepare rascunhos de remessa sem envio externo.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
            <strong className="text-slate-950">{shipments.length}</strong> remessa(s) em rascunho
          </div>
        </header>

        <section className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard accent="blue" label="NF-e pendentes" value={metrics.nfePending} />
          <MetricCard accent="emerald" label="CT-e pendentes" value={metrics.ctePending} />
          <MetricCard accent="violet" label="Prontos para envio" value={metrics.ready} />
          <MetricCard accent="slate" label="Enviados" value={metrics.sent} />
        </section>

        <section className="mb-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_1fr_1.4fr_auto]">
            <SelectField label="Período" value={period} onChange={(value) => setPeriod(value as PeriodFilter)}>
              <option value="all">Todos</option>
              <option value="today">Hoje</option>
              <option value="7">Últimos 7 dias</option>
              <option value="30">Últimos 30 dias</option>
            </SelectField>
            <SelectField label="Tipo" value={type} onChange={(value) => setType(value as TypeFilter)}>
              <option>Todos</option>
              <option value="NFE">NF-e</option>
              <option value="CTE">CT-e</option>
            </SelectField>
            <SelectField label="Status" value={status} onChange={(value) => setStatus(value as StatusFilter)}>
              {statusOptions.map((option) => <option key={option}>{option}</option>)}
            </SelectField>
            <SelectField label="Emitente" value={issuer} onChange={setIssuer}>
              {issuers.map((option) => <option key={option}>{option}</option>)}
            </SelectField>
            <label className="text-sm font-semibold text-slate-700">
              Buscar
              <input
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 font-normal outline-none focus:border-sky-500"
                placeholder="Número, chave ou emitente"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <button className="self-end rounded-xl px-4 py-2.5 text-sm font-bold text-sky-700 hover:bg-sky-50" onClick={clearFilters} type="button">
              Limpar filtros
            </button>
          </div>
        </section>

        {message && (
          <p role="status" className={`mb-4 rounded-2xl px-4 py-3 text-sm font-semibold ${messageClass(message.tone)}`}>
            {message.text}
          </p>
        )}

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-4 sm:px-5">
            <div>
              <h2 className="text-lg font-bold">Documentos fiscais</h2>
              <p className="text-sm text-slate-500">{filteredDocuments.length} documento(s) encontrado(s)</p>
            </div>
            <button className="rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-sky-700 disabled:bg-slate-300" disabled={selectedDocuments.length === 0} onClick={openReview} type="button">
              Preparar remessa
            </button>
          </div>

          {filteredDocuments.length === 0 ? (
            <EmptyState hasDocuments={documents.length > 0} />
          ) : (
            <>
              <div className="hidden overflow-x-auto lg:block">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="w-12 px-5 py-3">Sel.</th>
                      <th className="px-5 py-3">Tipo</th>
                      <th className="px-5 py-3">Número</th>
                      <th className="px-5 py-3">Emitente</th>
                      <th className="px-5 py-3">Emissão</th>
                      <th className="px-5 py-3">Arquivos</th>
                      <th className="px-5 py-3">Status</th>
                      <th className="px-5 py-3 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredDocuments.map((document) => (
                      <DocumentRow
                        document={document}
                        key={document.id}
                        selected={selectedIds.has(document.id)}
                        onSelect={toggleSelection}
                        onDetail={(item) => { setDetail(item); setShowLinkedReceiving(false); }}
                        onMarkReady={markReady}
                        onMarkPending={markPending}
                      />
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="grid gap-3 p-3 lg:hidden">
                {filteredDocuments.map((document) => (
                  <DocumentCard
                    document={document}
                    key={document.id}
                    selected={selectedIds.has(document.id)}
                    onSelect={toggleSelection}
                    onDetail={(item) => { setDetail(item); setShowLinkedReceiving(false); }}
                    onMarkReady={markReady}
                    onMarkPending={markPending}
                  />
                ))}
              </div>
            </>
          )}
        </section>
      </main>

      {selectedDocuments.length > 0 && (
        <div className="fixed inset-x-3 bottom-3 z-40 rounded-2xl border border-sky-200 bg-white p-3 shadow-2xl sm:left-auto sm:right-6 sm:w-[520px]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm">
              <strong>{selectedDocuments.length}</strong> documento(s) selecionado(s)
              <p className="text-slate-500">
                XML: {selectedDocuments.filter((document) => document.hasXml).length} · PDF: {selectedDocuments.filter((document) => document.hasPdf).length}
              </p>
            </div>
            <button className="rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-sky-700" onClick={openReview} type="button">
              Preparar remessa
            </button>
          </div>
        </div>
      )}

      {detail && (
        <Modal title="Detalhes do documento" onClose={() => setDetail(null)}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Info label="Tipo" value={labelType(detail.type)} />
            <Info label="Status" value={detail.status} />
            <Info label="Número" value={detail.number || "Não informado"} />
            <Info label="Série" value={detail.series || "Não informada"} />
            <Info label="Emitente" value={detail.issuer || "Não informado"} />
            <Info label="CNPJ" value={detail.issuerCnpj || "Não informado"} />
            <Info label="Emissão" value={formatDate(detail.issuedAt)} />
            <Info label="Valor" value={formatCurrency(detail.totalValue)} />
            <Info label="Origem" value={detail.origin} />
            <Info label="Arquivos" value={fileLabel(detail)} />
          </div>
          <div className="mt-4 rounded-2xl bg-slate-50 p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Chave de acesso</p>
            <p className="mt-2 break-all font-mono text-sm">{detail.accessKey || "Não informada"}</p>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {detail.status === "Pronto para envio" ? (
              <button className="rounded-xl border border-sky-200 px-4 py-2.5 text-sm font-bold text-sky-700" onClick={() => markPending(detail)} type="button">
                Voltar para pendente
              </button>
            ) : (
              <button className="rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-bold text-white" onClick={() => markReady(detail)} type="button">
                Marcar como pronto
              </button>
            )}
            <button className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-bold" onClick={() => setShowLinkedReceiving((current) => !current)} type="button">
              Abrir recebimento vinculado
            </button>
          </div>
          {showLinkedReceiving && (
            <div className="mt-4 rounded-2xl border border-slate-200 p-4">
              {linkedReceiving ? (
                <div className="grid gap-2 text-sm">
                  <Info label="ID do recebimento" value={linkedReceiving.id} />
                  <Info label="Responsável" value={linkedReceiving.responsible || "Não informado"} />
                  <Info label="Entrada" value={linkedReceiving.entryDateTime || "Não informada"} />
                  <Info label="Itens conferidos" value={String(linkedReceiving.items.length)} />
                  <Info label="Divergências" value={String(linkedReceiving.divergences.length)} />
                </div>
              ) : (
                <p className="text-sm text-slate-600">Recebimento vinculado não encontrado neste navegador.</p>
              )}
            </div>
          )}
        </Modal>
      )}

      {reviewOpen && (
        <Modal title="Preparar remessa contábil" onClose={() => setReviewOpen(false)}>
          <div className="grid gap-3 sm:grid-cols-3">
            <MetricCard accent="blue" label="Documentos" value={selectedDocuments.length} compact />
            <MetricCard accent="emerald" label="Com XML" value={selectedDocuments.filter((document) => document.hasXml).length} compact />
            <MetricCard accent="violet" label="Com PDF" value={selectedDocuments.filter((document) => document.hasPdf).length} compact />
          </div>
          <div className="mt-4 max-h-56 overflow-auto rounded-2xl border border-slate-200">
            {selectedDocuments.map((document) => (
              <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 text-sm last:border-b-0" key={document.id}>
                <span className="font-semibold">{labelType(document.type)} {document.number || "sem número"}</span>
                <span className="text-slate-500">{fileLabel(document)}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 grid gap-3">
            <label className="text-sm font-semibold text-slate-700">
              Responsável pela remessa
              <input className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal" value={shipmentResponsible} onChange={(event) => setShipmentResponsible(event.target.value)} />
            </label>
            <label className="text-sm font-semibold text-slate-700">
              Observação opcional
              <textarea className="mt-1 min-h-24 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal" value={shipmentNotes} onChange={(event) => setShipmentNotes(event.target.value)} />
            </label>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <button className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-bold" onClick={() => setReviewOpen(false)} type="button">Cancelar</button>
            <button className="rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-bold text-white" onClick={saveShipmentDraft} type="button">Salvar rascunho</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function DocumentRow({
  document,
  selected,
  onSelect,
  onDetail,
  onMarkReady,
  onMarkPending,
}: DocumentActionsProps) {
  return (
    <tr className="align-top">
      <td className="px-5 py-4">
        <input checked={selected} disabled={document.status !== "Pronto para envio"} onChange={() => onSelect(document)} type="checkbox" />
      </td>
      <td className="px-5 py-4 font-bold">{labelType(document.type)}</td>
      <td className="px-5 py-4">
        <p className="font-semibold">{document.number || "Sem número"}</p>
        <p className="mt-1 max-w-52 break-all font-mono text-xs text-slate-500">{document.accessKey || "Sem chave"}</p>
      </td>
      <td className="px-5 py-4">
        <p className="font-semibold">{document.issuer || "Não informado"}</p>
        <p className="text-xs text-slate-500">{document.issuerCnpj || "CNPJ não informado"}</p>
      </td>
      <td className="px-5 py-4">{formatDate(document.issuedAt)}</td>
      <td className="px-5 py-4">{fileLabel(document)}</td>
      <td className="px-5 py-4"><StatusBadge status={document.status} /></td>
      <td className="px-5 py-4">
        <div className="flex justify-end gap-2">
          <button className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold" onClick={() => onDetail(document)} type="button">Detalhes</button>
          {document.status === "Pronto para envio" ? (
            <button className="rounded-lg border border-sky-300 px-3 py-2 text-xs font-bold text-sky-700" onClick={() => onMarkPending(document)} type="button">Pendente</button>
          ) : (
            <button className="rounded-lg bg-sky-600 px-3 py-2 text-xs font-bold text-white" onClick={() => onMarkReady(document)} type="button">Pronto</button>
          )}
        </div>
      </td>
    </tr>
  );
}

function DocumentCard(props: DocumentActionsProps) {
  const { document, selected, onSelect, onDetail, onMarkReady, onMarkPending } = props;
  return (
    <article className="rounded-2xl border border-slate-200 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-sky-700">{labelType(document.type)}</p>
          <h3 className="mt-1 text-lg font-bold">{document.number || "Sem número"}</h3>
          <p className="text-sm text-slate-600">{document.issuer || "Emitente não informado"}</p>
        </div>
        <input checked={selected} disabled={document.status !== "Pronto para envio"} onChange={() => onSelect(document)} type="checkbox" />
      </div>
      <div className="mt-3 grid gap-2 text-sm">
        <Info label="Emissão" value={formatDate(document.issuedAt)} />
        <Info label="Arquivos" value={fileLabel(document)} />
        <Info label="Status" value={document.status} />
      </div>
      <div className="mt-4 flex gap-2">
        <button className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm font-bold" onClick={() => onDetail(document)} type="button">Detalhes</button>
        {document.status === "Pronto para envio" ? (
          <button className="flex-1 rounded-xl border border-sky-300 px-3 py-2 text-sm font-bold text-sky-700" onClick={() => onMarkPending(document)} type="button">Pendente</button>
        ) : (
          <button className="flex-1 rounded-xl bg-sky-600 px-3 py-2 text-sm font-bold text-white" onClick={() => onMarkReady(document)} type="button">Pronto</button>
        )}
      </div>
    </article>
  );
}

type DocumentActionsProps = {
  document: FiscalDocumentRecord;
  selected: boolean;
  onSelect: (document: FiscalDocumentRecord) => void;
  onDetail: (document: FiscalDocumentRecord) => void;
  onMarkReady: (document: FiscalDocumentRecord) => void;
  onMarkPending: (document: FiscalDocumentRecord) => void;
};

function MetricCard({ accent, label, value, compact = false }: { accent: "blue" | "emerald" | "violet" | "slate"; label: string; value: number; compact?: boolean }) {
  const accents = {
    blue: "border-l-sky-500 text-sky-700 bg-sky-50",
    emerald: "border-l-emerald-500 text-emerald-700 bg-emerald-50",
    violet: "border-l-violet-500 text-violet-700 bg-violet-50",
    slate: "border-l-slate-500 text-slate-700 bg-slate-50",
  };
  return (
    <div className={`rounded-2xl border border-l-4 border-slate-200 bg-white p-4 shadow-sm ${accents[accent]}`}>
      <p className="text-sm font-medium text-slate-600">{label}</p>
      <strong className={compact ? "mt-1 block text-2xl" : "mt-2 block text-4xl"}>{value}</strong>
    </div>
  );
}

function SelectField({ children, label, value, onChange }: { children: React.ReactNode; label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="text-sm font-semibold text-slate-700">
      {label}
      <select className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 font-normal outline-none focus:border-sky-500" value={value} onChange={(event) => onChange(event.target.value)}>
        {children}
      </select>
    </label>
  );
}

function StatusBadge({ status }: { status: FiscalDocumentStatus }) {
  const styles: Record<FiscalDocumentStatus, string> = {
    Pendente: "bg-amber-50 text-amber-800 ring-amber-200",
    "Pronto para envio": "bg-emerald-50 text-emerald-800 ring-emerald-200",
    Enviado: "bg-blue-50 text-blue-800 ring-blue-200",
    Incompleto: "bg-rose-50 text-rose-800 ring-rose-200",
    Duplicado: "bg-orange-50 text-orange-800 ring-orange-200",
  };
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${styles[status]}`}>{status}</span>;
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl bg-slate-50 px-3 py-2">
      <span className="text-sm text-slate-500">{label}</span>
      <strong className="max-w-[65%] break-words text-right text-sm">{value}</strong>
    </div>
  );
}

function Modal({ children, title, onClose }: { children: React.ReactNode; title: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4">
      <section className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-3xl bg-white p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-xl font-bold">{title}</h2>
          <button className="rounded-full border border-slate-300 px-3 py-1 text-sm font-bold" onClick={onClose} type="button">Fechar</button>
        </div>
        {children}
      </section>
    </div>
  );
}

function EmptyState({ hasDocuments }: { hasDocuments: boolean }) {
  return (
    <div className="grid min-h-72 place-items-center p-8 text-center">
      <div>
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-sky-50 text-2xl">📄</div>
        <h3 className="mt-4 text-lg font-bold">{hasDocuments ? "Nenhum documento nos filtros" : "Nenhum documento fiscal ainda"}</h3>
        <p className="mt-2 max-w-md text-sm text-slate-500">
          {hasDocuments
            ? "Ajuste ou limpe os filtros para visualizar outros registros."
            : "Finalize uma conferência de NF-e ou CT-e identificável para alimentar esta central automaticamente."}
        </p>
      </div>
    </div>
  );
}

function labelType(type: FiscalDocumentType) {
  return type === "NFE" ? "NF-e" : "CT-e";
}

function fileLabel(document: FiscalDocumentRecord) {
  if (document.hasXml && document.hasPdf) return "XML + PDF";
  if (document.hasXml) return "XML";
  if (document.hasPdf) return "PDF";
  return "Sem arquivo";
}

function formatCurrency(value: number | null) {
  if (typeof value !== "number") return "Não informado";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(value: string) {
  if (!value) return "Não informado";
  const parsed = parseDateValue(value);
  if (!parsed) return value;
  return parsed.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isWithinPeriod(value: string, period: PeriodFilter) {
  const parsed = parseDateValue(value);
  if (!parsed) return true;
  const now = new Date();
  if (period === "today") return parsed.toDateString() === now.toDateString();
  const days = Number(period);
  const start = new Date(now);
  start.setDate(now.getDate() - days);
  start.setHours(0, 0, 0, 0);
  return parsed >= start;
}

function parseDateValue(value: string) {
  const iso = new Date(value);
  if (!Number.isNaN(iso.getTime())) return iso;
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:,\s*|\s+)?(\d{2})?:?(\d{2})?/);
  if (!match) return null;
  const [, day, month, year, hour = "00", minute = "00"] = match;
  const parsed = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function messageClass(tone: "success" | "error" | "info") {
  if (tone === "success") return "bg-emerald-50 text-emerald-800";
  if (tone === "error") return "bg-rose-50 text-rose-800";
  return "bg-sky-50 text-sky-800";
}
