"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  canMarkFiscalDocumentReady,
  findDocumentAccountingShipmentBlock,
  getReceivingRecord,
  listAccountingShipmentDrafts,
  listDocumentsAvailableForAccountingShipment,
  listFiscalDocuments,
  saveAccountingShipmentDraft,
  updateAccountingShipmentStatus,
  updateFiscalDocumentStatus,
  type AccountingShipmentDraft,
  type AccountingShipmentStatus,
  type FiscalDocumentRecord,
  type FiscalDocumentStatus,
  type FiscalDocumentType,
  type StoredReceivingRecord,
} from "../../lib/localOperationalStore";

type PeriodFilter = "all" | "today" | "7" | "30";
type TypeFilter = "Todos" | FiscalDocumentType;
type StatusFilter = "Todos" | FiscalDocumentStatus;
type Message = { tone: "success" | "error" | "info"; text: string };
type ShipmentForm = { name: string; period: string; responsible: string; notes: string };

const emptyForm: ShipmentForm = { name: "", period: "", responsible: "", notes: "" };

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
  const [activeShipment, setActiveShipment] = useState<AccountingShipmentDraft | null>(null);
  const [shipmentForm, setShipmentForm] = useState<ShipmentForm>(emptyForm);
  const [message, setMessage] = useState<Message | null>(null);
  const [copyFeedback, setCopyFeedback] = useState("");

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

  const modalDocuments = useMemo(() => {
    if (activeShipment) {
      return documents.filter((document) => activeShipment.documentIds.includes(document.id));
    }
    return selectedDocuments;
  }, [activeShipment, documents, selectedDocuments]);

  const metrics = useMemo(() => {
    const pendingStatuses: FiscalDocumentStatus[] = ["Pendente", "Incompleto", "Duplicado"];
    return {
      nfePending: documents.filter((document) => document.type === "NFE" && pendingStatuses.includes(document.status)).length,
      ctePending: documents.filter((document) => document.type === "CTE" && pendingStatuses.includes(document.status)).length,
      ready: documents.filter((document) => document.status === "Pronto para envio").length,
      sent: documents.filter((document) => document.status === "Enviado").length,
    };
  }, [documents]);

  const shipmentSummary = useMemo(() => buildShipmentSummary(modalDocuments), [modalDocuments]);

  const validation = useMemo(() => {
    const blocks = listDocumentsAvailableForAccountingShipment(
      modalDocuments.map((document) => document.id),
      activeShipment?.id,
    );
    const blockedByDocument = new Map(blocks.map((item) => [item.documentId, item.shipment]));
    const invalid = modalDocuments
      .map((document) => {
        const check = canMarkFiscalDocumentReady(document);
        const block = blockedByDocument.get(document.id);
        const reasons = [...check.missing];
        if (block) reasons.push(`em outra remessa (${block.name})`);
        return { document, reasons };
      })
      .filter((item) => item.reasons.length > 0);
    return {
      invalid,
      validCount: modalDocuments.length - invalid.length,
      filesAvailable: modalDocuments.filter((document) => document.hasXml || document.hasPdf).length,
      withoutPdfButWithXml: modalDocuments.filter((document) => document.hasXml && !document.hasPdf).length,
    };
  }, [activeShipment?.id, modalDocuments]);

  const linkedReceiving = useMemo<StoredReceivingRecord | null>(() => {
    if (!detail?.linkedReceivingId) return null;
    return getReceivingRecord(detail.linkedReceivingId);
  }, [detail]);

  const shipmentLocked = activeShipment?.status === "Enviada" || activeShipment?.status === "Cancelada";
  const canPrepareShipment = Boolean(
    modalDocuments.length > 0 &&
      validation.invalid.length === 0 &&
      shipmentForm.name.trim() &&
      shipmentForm.period.trim() &&
      shipmentForm.responsible.trim() &&
      !shipmentLocked,
  );

  const whatsappPreview = buildWhatsappMessage(shipmentForm, shipmentSummary);

  function clearFilters() {
    setPeriod("30");
    setType("Todos");
    setStatus("Todos");
    setIssuer("Todos");
    setSearch("");
  }

  function markReady(document: FiscalDocumentRecord) {
    const check = canMarkFiscalDocumentReady(document);
    const block = findDocumentAccountingShipmentBlock(document.id);
    if (!check.ok || block) {
      const missing = [...check.missing];
      if (block) missing.push(`documento já vinculado à remessa ${block.name}`);
      setMessage({
        tone: "error",
        text: `Documento incompleto para remessa: falta ${missing.join(", ")}.`,
      });
      return;
    }
    updateFiscalDocumentStatus(document.id, "Pronto para envio");
    setMessage({ tone: "success", text: "Documento marcado como pronto para envio." });
    refresh();
  }

  function markPending(document: FiscalDocumentRecord) {
    const block = findDocumentAccountingShipmentBlock(document.id);
    if (block) {
      setMessage({ tone: "error", text: `Este documento está vinculado à remessa ${block.name}.` });
      return;
    }
    updateFiscalDocumentStatus(document.id, "Pendente");
    setSelectedIds((current) => removeFromSet(current, document.id));
    setMessage({ tone: "info", text: "Documento voltou para pendente." });
    refresh();
  }

  function toggleSelection(document: FiscalDocumentRecord) {
    if (document.status !== "Pronto para envio") {
      setMessage({ tone: "info", text: "Selecione apenas documentos com status Pronto para envio." });
      return;
    }
    const block = findDocumentAccountingShipmentBlock(document.id);
    if (block) {
      setMessage({ tone: "error", text: `Documento já está na remessa ${block.name}. Abra o histórico para revisar.` });
      return;
    }
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(document.id)) next.delete(document.id);
      else next.add(document.id);
      return next;
    });
  }

  function openNewShipmentReview() {
    if (selectedDocuments.length === 0) {
      setMessage({ tone: "error", text: "Selecione ao menos um documento pronto para preparar a remessa." });
      return;
    }
    const now = new Date();
    setActiveShipment(null);
    setShipmentForm({
      name: defaultShipmentName(now),
      period: inferPeriod(selectedDocuments),
      responsible: "",
      notes: "",
    });
    setCopyFeedback("");
    setReviewOpen(true);
  }

  function openShipmentDetails(shipment: AccountingShipmentDraft) {
    setActiveShipment(shipment);
    setSelectedIds(new Set());
    setShipmentForm({
      name: shipment.name,
      period: shipment.period,
      responsible: shipment.responsible,
      notes: shipment.notes,
    });
    setCopyFeedback("");
    setReviewOpen(true);
  }

  function removeDocumentFromShipment(documentId: string) {
    if (shipmentLocked) return;
    if (activeShipment) {
      const nextIds = activeShipment.documentIds.filter((id) => id !== documentId);
      setActiveShipment({ ...activeShipment, documentIds: nextIds });
      return;
    }
    setSelectedIds((current) => removeFromSet(current, documentId));
  }

  function saveShipment(statusToSave: AccountingShipmentStatus = "Rascunho") {
    if (shipmentLocked) {
      setMessage({ tone: "error", text: "Remessas enviadas ou canceladas não podem ser editadas." });
      return null;
    }
    if (!shipmentForm.name.trim() || !shipmentForm.period.trim() || !shipmentForm.responsible.trim()) {
      setMessage({ tone: "error", text: "Informe nome, período e responsável para salvar a remessa." });
      return null;
    }
    if (modalDocuments.length === 0) {
      setMessage({ tone: "error", text: "Inclua ao menos um documento na remessa." });
      return null;
    }
    const invalidBlock = validation.invalid.find((item) =>
      item.reasons.some((reason) => reason.includes("outra remessa")),
    );
    if (invalidBlock) {
      setMessage({ tone: "error", text: "Há documento vinculado a outra remessa ativa ou enviada." });
      return null;
    }
    const saved = saveAccountingShipmentDraft({
      id: activeShipment?.id,
      name: shipmentForm.name.trim(),
      period: shipmentForm.period.trim(),
      documentIds: modalDocuments.map((document) => document.id),
      responsible: shipmentForm.responsible.trim(),
      notes: shipmentForm.notes.trim(),
      status: statusToSave,
    });
    setActiveShipment(saved);
    setSelectedIds(new Set());
    refresh();
    setMessage({
      tone: "success",
      text: statusToSave === "Pronta para envio"
        ? `Remessa ${saved.name} marcada como pronta para envio.`
        : `Remessa ${saved.name} salva como rascunho.`,
    });
    return saved;
  }

  function markShipmentReady() {
    if (!canPrepareShipment) {
      setMessage({ tone: "error", text: "Revise a conferência da remessa antes de marcar como pronta." });
      return;
    }
    saveShipment("Pronta para envio");
  }

  function markShipmentSent() {
    if (!canPrepareShipment && activeShipment?.status !== "Pronta para envio") {
      setMessage({ tone: "error", text: "A remessa precisa estar válida e pronta antes do registro de envio." });
      return;
    }
    const confirmed = window.confirm(
      "Confirme somente após enviar os documentos à contabilidade. Esta ação registrará data, hora e responsável.",
    );
    if (!confirmed) return;
    const base = activeShipment?.status === "Pronta para envio"
      ? activeShipment
      : saveShipment("Pronta para envio");
    if (!base) return;
    const sent = updateAccountingShipmentStatus(base.id, "Enviada", { responsible: shipmentForm.responsible });
    modalDocuments.forEach((document) => updateFiscalDocumentStatus(document.id, "Enviado"));
    if (sent) setActiveShipment(sent);
    refresh();
    setMessage({ tone: "success", text: "Remessa marcada manualmente como enviada. Nenhum envio automático foi realizado." });
  }

  function cancelShipment() {
    const base = activeShipment ?? saveShipment("Rascunho");
    if (!base) return;
    if (base.status === "Enviada") {
      setMessage({ tone: "error", text: "Remessa enviada não pode ser cancelada nesta etapa." });
      return;
    }
    const proceed = window.confirm("Cancelar esta remessa? O histórico será mantido e os documentos serão liberados.");
    if (!proceed) return;
    const reason = window.prompt("Motivo do cancelamento (opcional):") ?? "";
    const cancelled = updateAccountingShipmentStatus(base.id, "Cancelada", { cancellationReason: reason });
    if (cancelled) setActiveShipment(cancelled);
    setSelectedIds(new Set());
    refresh();
    setMessage({ tone: "info", text: "Remessa cancelada. Os documentos foram liberados para uma nova remessa, se não estiverem enviados." });
  }

  function downloadCurrentCsv() {
    downloadShipmentCsv({
      form: shipmentForm,
      documents: modalDocuments,
      status: activeShipment?.status ?? "Rascunho",
    });
  }

  async function copyWhatsappMessage() {
    try {
      await navigator.clipboard.writeText(whatsappPreview);
      setCopyFeedback("Mensagem copiada.");
    } catch {
      setCopyFeedback("Não foi possível copiar automaticamente. Selecione o texto e copie manualmente.");
    }
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
              Separe NF-e e CT-e finalizadas, revise pendências e prepare remessas sem envio externo.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
            <strong className="text-slate-950">{shipments.length}</strong> remessa(s) no histórico
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
            <button className="rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-sky-700 disabled:bg-slate-300" disabled={selectedDocuments.length === 0} onClick={openNewShipmentReview} type="button">
              Nova remessa
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
                        shipmentBlock={findDocumentAccountingShipmentBlock(document.id)}
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
                    shipmentBlock={findDocumentAccountingShipmentBlock(document.id)}
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

        <section className="mt-5 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-4 py-4 sm:px-5">
            <h2 className="text-lg font-bold">Histórico de remessas</h2>
            <p className="text-sm text-slate-500">Rascunhos, remessas prontas, enviadas manualmente e canceladas.</p>
          </div>
          {shipments.length === 0 ? (
            <div className="p-6 text-sm text-slate-500">Nenhuma remessa criada ainda.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-3">Nome</th>
                    <th className="px-5 py-3">Período</th>
                    <th className="px-5 py-3">Responsável</th>
                    <th className="px-5 py-3">Documentos</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3">Data</th>
                    <th className="px-5 py-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {shipments.map((shipment) => {
                    const shipmentDocuments = documents.filter((document) => shipment.documentIds.includes(document.id));
                    return (
                      <tr key={shipment.id}>
                        <td className="px-5 py-4 font-semibold">{shipment.name}</td>
                        <td className="px-5 py-4">{shipment.period || "Não informado"}</td>
                        <td className="px-5 py-4">{shipment.responsible || "Não informado"}</td>
                        <td className="px-5 py-4">{shipment.documentIds.length}</td>
                        <td className="px-5 py-4"><ShipmentStatusBadge status={shipment.status} /></td>
                        <td className="px-5 py-4">{formatDate(shipment.sentAt || shipment.updatedAt || shipment.createdAt)}</td>
                        <td className="px-5 py-4">
                          <div className="flex justify-end gap-2">
                            <button className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold" onClick={() => openShipmentDetails(shipment)} type="button">Ver detalhes</button>
                            <button className="rounded-lg border border-sky-300 px-3 py-2 text-xs font-bold text-sky-700" onClick={() => downloadShipmentCsv({ form: shipment, documents: shipmentDocuments, status: shipment.status })} type="button">Baixar CSV</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>

      {selectedDocuments.length > 0 && (
        <div className="fixed inset-x-3 bottom-3 z-40 rounded-2xl border border-sky-200 bg-white p-3 shadow-2xl sm:left-auto sm:right-6 sm:w-[520px]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm">
              <strong>{selectedDocuments.length}</strong> documento(s) selecionado(s)
              <p className="text-slate-500">
                NF-e: {selectedDocuments.filter((document) => document.type === "NFE").length} · CT-e: {selectedDocuments.filter((document) => document.type === "CTE").length}
              </p>
            </div>
            <button className="rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-sky-700" onClick={openNewShipmentReview} type="button">
              Nova remessa
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
        <Modal title={activeShipment ? "Detalhes da remessa" : "Nova remessa para Contabilidade"} onClose={() => setReviewOpen(false)} wide>
          <p className="mb-4 text-sm text-slate-600">Revise os documentos antes de preparar o envio.</p>

          <div className="grid gap-3 lg:grid-cols-2">
            <label className="text-sm font-semibold text-slate-700">
              Nome da remessa
              <input className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal disabled:bg-slate-100" disabled={shipmentLocked} value={shipmentForm.name} onChange={(event) => setShipmentForm((current) => ({ ...current, name: event.target.value }))} />
            </label>
            <label className="text-sm font-semibold text-slate-700">
              Período
              <input className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal disabled:bg-slate-100" disabled={shipmentLocked} value={shipmentForm.period} onChange={(event) => setShipmentForm((current) => ({ ...current, period: event.target.value }))} />
            </label>
            <label className="text-sm font-semibold text-slate-700">
              Responsável
              <input className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal disabled:bg-slate-100" disabled={shipmentLocked} value={shipmentForm.responsible} onChange={(event) => setShipmentForm((current) => ({ ...current, responsible: event.target.value }))} />
            </label>
            <label className="text-sm font-semibold text-slate-700">
              Observação opcional
              <input className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal disabled:bg-slate-100" disabled={shipmentLocked} value={shipmentForm.notes} onChange={(event) => setShipmentForm((current) => ({ ...current, notes: event.target.value }))} />
            </label>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <MetricCard accent="blue" label="Total" value={shipmentSummary.total} compact />
            <MetricCard accent="emerald" label="NF-e" value={shipmentSummary.nfe} compact />
            <MetricCard accent="violet" label="CT-e" value={shipmentSummary.cte} compact />
            <MetricCard accent="blue" label="XMLs" value={shipmentSummary.xml} compact />
            <MetricCard accent="slate" label="PDFs" value={shipmentSummary.pdf} compact />
          </div>

          <section className="mt-5 rounded-2xl border border-slate-200 p-4">
            <h3 className="font-bold">Conferência da remessa</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <ValidationPill label="Documentos válidos" ok={validation.invalid.length === 0} value={validation.validCount} />
              <ValidationPill label="Arquivos disponíveis" ok={validation.filesAvailable === modalDocuments.length} value={validation.filesAvailable} />
              <ValidationPill label="Documentos incompletos" ok={validation.invalid.length === 0} value={validation.invalid.length} />
            </div>
            {validation.withoutPdfButWithXml > 0 && (
              <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
                {validation.withoutPdfButWithXml} documento(s) não possuem PDF, mas têm XML disponível. Isso não bloqueia a remessa.
              </p>
            )}
            {validation.invalid.length > 0 && (
              <div className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-800">
                {validation.invalid.map((item) => (
                  <p key={item.document.id}>
                    {labelType(item.document.type)} {item.document.number || "sem número"}: {item.reasons.join(", ")}
                  </p>
                ))}
              </div>
            )}
          </section>

          <section className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Tipo</th>
                    <th className="px-4 py-3">Número</th>
                    <th className="px-4 py-3">Emitente</th>
                    <th className="px-4 py-3">XML disponível</th>
                    <th className="px-4 py-3">PDF disponível</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Remover</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {modalDocuments.map((document) => (
                    <tr key={document.id}>
                      <td className="px-4 py-3 font-bold">{labelType(document.type)}</td>
                      <td className="px-4 py-3">{document.number || "Sem número"}</td>
                      <td className="px-4 py-3">{document.issuer || "Não informado"}</td>
                      <td className="px-4 py-3">{document.hasXml ? "Sim" : "Não"}</td>
                      <td className="px-4 py-3">{document.hasPdf ? "Sim" : "Não"}</td>
                      <td className="px-4 py-3"><StatusBadge status={document.status} /></td>
                      <td className="px-4 py-3 text-right">
                        <button className="rounded-lg px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-50 disabled:text-slate-400" disabled={shipmentLocked} onClick={() => removeDocumentFromShipment(document.id)} type="button">
                          Remover
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="mt-5 rounded-2xl border border-slate-200 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h3 className="font-bold">Prévia da mensagem para WhatsApp</h3>
                <p className="text-sm text-slate-500">Apenas copia o texto. Nenhuma conversa será aberta automaticamente.</p>
              </div>
              <button className="rounded-xl border border-sky-300 px-4 py-2.5 text-sm font-bold text-sky-700" onClick={() => void copyWhatsappMessage()} type="button">
                Copiar mensagem
              </button>
            </div>
            <pre className="mt-3 whitespace-pre-wrap rounded-xl bg-slate-950 p-4 text-sm text-white">{whatsappPreview}</pre>
            {copyFeedback && <p className="mt-2 text-sm font-semibold text-emerald-700">{copyFeedback}</p>}
          </section>

          <div className="mt-5 flex flex-col gap-2 border-t border-slate-200 pt-4 sm:flex-row sm:flex-wrap sm:justify-end">
            <button className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-bold disabled:text-slate-400" disabled={shipmentLocked} onClick={() => saveShipment("Rascunho")} type="button">
              Salvar rascunho
            </button>
            <button className="rounded-xl border border-emerald-300 px-4 py-2.5 text-sm font-bold text-emerald-700 disabled:text-slate-400" disabled={!canPrepareShipment} onClick={markShipmentReady} type="button">
              Marcar como pronta
            </button>
            <button className="rounded-xl border border-sky-300 px-4 py-2.5 text-sm font-bold text-sky-700" disabled={modalDocuments.length === 0} onClick={downloadCurrentCsv} type="button">
              Baixar resumo CSV
            </button>
            <button className="rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-bold text-white disabled:bg-slate-300" disabled={shipmentLocked || modalDocuments.length === 0} onClick={markShipmentSent} type="button">
              Marcar como enviada
            </button>
            <button className="rounded-xl px-4 py-2.5 text-sm font-bold text-rose-700 hover:bg-rose-50 disabled:text-slate-400" disabled={activeShipment?.status === "Enviada" || activeShipment?.status === "Cancelada"} onClick={cancelShipment} type="button">
              Cancelar remessa
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

type DocumentActionsProps = {
  document: FiscalDocumentRecord;
  selected: boolean;
  shipmentBlock: AccountingShipmentDraft | null;
  onSelect: (document: FiscalDocumentRecord) => void;
  onDetail: (document: FiscalDocumentRecord) => void;
  onMarkReady: (document: FiscalDocumentRecord) => void;
  onMarkPending: (document: FiscalDocumentRecord) => void;
};

function DocumentRow({
  document,
  selected,
  shipmentBlock,
  onSelect,
  onDetail,
  onMarkReady,
  onMarkPending,
}: DocumentActionsProps) {
  return (
    <tr className="align-top">
      <td className="px-5 py-4">
        <input checked={selected} disabled={document.status !== "Pronto para envio" || Boolean(shipmentBlock)} onChange={() => onSelect(document)} type="checkbox" />
      </td>
      <td className="px-5 py-4 font-bold">{labelType(document.type)}</td>
      <td className="px-5 py-4">
        <p className="font-semibold">{document.number || "Sem número"}</p>
        <p className="mt-1 max-w-52 break-all font-mono text-xs text-slate-500">{maskAccessKey(document.accessKey)}</p>
        {shipmentBlock && <p className="mt-1 text-xs font-semibold text-amber-700">Na remessa {shipmentBlock.name}</p>}
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
            <button className="rounded-lg border border-sky-300 px-3 py-2 text-xs font-bold text-sky-700 disabled:text-slate-400" disabled={Boolean(shipmentBlock)} onClick={() => onMarkPending(document)} type="button">Pendente</button>
          ) : (
            <button className="rounded-lg bg-sky-600 px-3 py-2 text-xs font-bold text-white" onClick={() => onMarkReady(document)} type="button">Pronto</button>
          )}
        </div>
      </td>
    </tr>
  );
}

function DocumentCard(props: DocumentActionsProps) {
  const { document, selected, shipmentBlock, onSelect, onDetail, onMarkReady, onMarkPending } = props;
  return (
    <article className="rounded-2xl border border-slate-200 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-sky-700">{labelType(document.type)}</p>
          <h3 className="mt-1 text-lg font-bold">{document.number || "Sem número"}</h3>
          <p className="text-sm text-slate-600">{document.issuer || "Emitente não informado"}</p>
        </div>
        <input checked={selected} disabled={document.status !== "Pronto para envio" || Boolean(shipmentBlock)} onChange={() => onSelect(document)} type="checkbox" />
      </div>
      {shipmentBlock && <p className="mt-2 rounded-lg bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800">Na remessa {shipmentBlock.name}</p>}
      <div className="mt-3 grid gap-2 text-sm">
        <Info label="Emissão" value={formatDate(document.issuedAt)} />
        <Info label="Arquivos" value={fileLabel(document)} />
        <Info label="Status" value={document.status} />
      </div>
      <div className="mt-4 flex gap-2">
        <button className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm font-bold" onClick={() => onDetail(document)} type="button">Detalhes</button>
        {document.status === "Pronto para envio" ? (
          <button className="flex-1 rounded-xl border border-sky-300 px-3 py-2 text-sm font-bold text-sky-700 disabled:text-slate-400" disabled={Boolean(shipmentBlock)} onClick={() => onMarkPending(document)} type="button">Pendente</button>
        ) : (
          <button className="flex-1 rounded-xl bg-sky-600 px-3 py-2 text-sm font-bold text-white" onClick={() => onMarkReady(document)} type="button">Pronto</button>
        )}
      </div>
    </article>
  );
}

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

function ShipmentStatusBadge({ status }: { status: AccountingShipmentStatus }) {
  const styles: Record<AccountingShipmentStatus, string> = {
    Rascunho: "bg-slate-50 text-slate-700 ring-slate-200",
    "Pronta para envio": "bg-emerald-50 text-emerald-800 ring-emerald-200",
    Enviada: "bg-blue-50 text-blue-800 ring-blue-200",
    Cancelada: "bg-rose-50 text-rose-800 ring-rose-200",
  };
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${styles[status]}`}>{status}</span>;
}

function ValidationPill({ label, ok, value }: { label: string; ok: boolean; value: number }) {
  return (
    <div className={`rounded-2xl px-4 py-3 ${ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}>
      <p className="text-xs font-bold uppercase tracking-wide">{label}</p>
      <strong className="mt-1 block text-2xl">{value}</strong>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl bg-slate-50 px-3 py-2">
      <span className="text-sm text-slate-500">{label}</span>
      <strong className="max-w-[65%] break-words text-right text-sm">{value}</strong>
    </div>
  );
}

function Modal({ children, title, onClose, wide = false }: { children: React.ReactNode; title: string; onClose: () => void; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4">
      <section className={`max-h-[90vh] w-full overflow-auto rounded-3xl bg-white p-5 shadow-2xl ${wide ? "max-w-6xl" : "max-w-3xl"}`}>
        <div className="mb-2 flex items-center justify-between gap-4">
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

function buildShipmentSummary(documents: FiscalDocumentRecord[]) {
  return {
    total: documents.length,
    nfe: documents.filter((document) => document.type === "NFE").length,
    cte: documents.filter((document) => document.type === "CTE").length,
    xml: documents.filter((document) => document.hasXml).length,
    pdf: documents.filter((document) => document.hasPdf).length,
  };
}

function buildWhatsappMessage(form: ShipmentForm, summary: ReturnType<typeof buildShipmentSummary>) {
  return [
    "Olá!",
    `Segue a remessa de documentos fiscais referente ao período ${form.period || "[PERÍODO]"}.`,
    "",
    `Total: ${summary.total} documentos`,
    `NF-e: ${summary.nfe}`,
    `CT-e: ${summary.cte}`,
    `XMLs disponíveis: ${summary.xml}`,
    `PDFs disponíveis: ${summary.pdf}`,
    "",
    `Remessa: ${form.name || "[NOME]"}`,
    "",
    "Atenciosamente,",
    form.responsible || "[RESPONSÁVEL]",
  ].join("\n");
}

function downloadShipmentCsv(input: {
  form: Pick<ShipmentForm, "name" | "period" | "responsible">;
  documents: FiscalDocumentRecord[];
  status: AccountingShipmentStatus;
}) {
  const rows = [
    ["nome da remessa", "status", "período", "responsável", "tipo", "número", "emitente", "chave mascarada", "XML disponível", "PDF disponível"],
    ...input.documents.map((document) => [
      input.form.name,
      input.status,
      input.form.period,
      input.form.responsible,
      labelType(document.type),
      document.number || "",
      document.issuer || "",
      maskAccessKey(document.accessKey),
      document.hasXml ? "Sim" : "Não",
      document.hasPdf ? "Sim" : "Não",
    ]),
  ];
  const csv = rows.map((row) => row.map(escapeCsvCell).join(";")).join("\r\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `stockscan-remessa-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
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

function formatDate(value: string | null) {
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

function inferPeriod(documents: FiscalDocumentRecord[]) {
  const values = documents.map((document) => formatDate(document.issuedAt)).filter((value) => value !== "Não informado");
  if (values.length === 0) return "Período não informado";
  return values.length === 1 ? values[0] : `${values[0]} — ${values[values.length - 1]}`;
}

function defaultShipmentName(now: Date) {
  return `Remessa contábil ${now.toLocaleDateString("pt-BR")}`;
}

function maskAccessKey(key: string) {
  const digits = key.replace(/\D/g, "");
  if (digits.length < 12) return "Chave não informada";
  return `${digits.slice(0, 6)}••••••••••••••••••••••••••••••••${digits.slice(-6)}`;
}

function escapeCsvCell(value: string) {
  if (/[";\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function removeFromSet(current: Set<string>, value: string) {
  const next = new Set(current);
  next.delete(value);
  return next;
}

function messageClass(tone: "success" | "error" | "info") {
  if (tone === "success") return "bg-emerald-50 text-emerald-800";
  if (tone === "error") return "bg-rose-50 text-rose-800";
  return "bg-sky-50 text-sky-800";
}
