"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type DocumentoResumo = {
  id: string;
  tipo: "NFE" | "CTE";
  chaveAcesso: string;
  numero: string | null;
  serie: string | null;
  emissao: string | null;
  emitenteNome: string | null;
  emitenteCnpj: string | null;
  valorTotal: number | null;
  temXml: boolean;
  temPdf: boolean;
  pdfUploadedAt: string | null;
  remessaId: string | null;
};

type RemessaResumo = {
  id: string;
  nome: string;
  status: string;
  periodoInicio: string | null;
  periodoFim: string | null;
  criadoPorEmail: string;
  criadoEm: string;
  enviadaEm: string | null;
  totalDocumentos: number;
  totalNfe: number;
  totalCte: number;
};

type RemessaDetail = RemessaResumo & {
  observacao: string | null;
  confirmadaEm: string | null;
  enviadaPorEmail: string | null;
  canceladaEm: string | null;
  motivoCancelamento: string | null;
  documentos: DocumentoResumo[];
};

const STATUS_LABEL: Record<string, string> = {
  RASCUNHO: "Rascunho",
  PRONTA: "Pronta para envio",
  ENVIADA: "Enviada",
  ENVIADA_COM_PENDENCIAS: "Enviada com pendencias",
  CANCELADA: "Cancelada",
};

const STATUS_TONE: Record<string, string> = {
  RASCUNHO: "bg-slate-100 text-slate-700",
  PRONTA: "bg-cyan-100 text-cyan-800",
  ENVIADA: "bg-emerald-100 text-emerald-800",
  ENVIADA_COM_PENDENCIAS: "bg-amber-100 text-amber-800",
  CANCELADA: "bg-rose-100 text-rose-800",
};

function formatDate(iso: string | null | undefined) {
  if (!iso) return "-";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
}

function formatDateOnly(iso: string | null | undefined) {
  if (!iso) return "-";
  return new Intl.DateTimeFormat("pt-BR").format(new Date(iso));
}

function formatCurrency(value: number | null) {
  if (value === null) return "-";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatPeriodo(inicio: string | null, fim: string | null) {
  if (!inicio && !fim) return "-";
  return `${formatDateOnly(inicio)} a ${formatDateOnly(fim)}`;
}

function periodoDeSelecionados(docs: DocumentoResumo[]): { inicio: string | null; fim: string | null } {
  const datas = docs.map((d) => d.emissao).filter((d): d is string => d !== null);
  if (datas.length === 0) return { inicio: null, fim: null };
  const times = datas.map((d) => new Date(d).getTime());
  return { inicio: new Date(Math.min(...times)).toISOString(), fim: new Date(Math.max(...times)).toISOString() };
}

function nomeRemessaPreview() {
  return `Remessa Contabilidade — ${new Intl.DateTimeFormat("pt-BR").format(new Date())}`;
}

async function downloadBlob(url: string, filenameFallback: string) {
  const res = await fetch(url);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Nao foi possivel baixar o arquivo.");
  }
  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition") || "";
  const match = disposition.match(/filename="([^"]+)"/);
  const filename = match?.[1] ?? filenameFallback;
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}

export default function DocumentosContabilidadeClient({ email }: { email: string }) {
  const router = useRouter();

  const [view, setView] = useState<"disponiveis" | "historico">("disponiveis");

  const [documentos, setDocumentos] = useState<DocumentoResumo[] | null>(null);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [remessas, setRemessas] = useState<RemessaResumo[] | null>(null);
  const [loadingRemessas, setLoadingRemessas] = useState(false);

  const [detailCache, setDetailCache] = useState<Record<string, RemessaDetail>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [reviewOpen, setReviewOpen] = useState(false);
  const [observacao, setObservacao] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [createdMessage, setCreatedMessage] = useState("");

  const [uploadingPdfId, setUploadingPdfId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");

  const [cancelModal, setCancelModal] = useState<{ id: string; nome: string } | null>(null);
  const [cancelMotivo, setCancelMotivo] = useState("");
  const [cancelling, setCancelling] = useState(false);

  const [whatsappModal, setWhatsappModal] = useState<{ remessa: RemessaDetail } | null>(null);
  const [whatsappPhone, setWhatsappPhone] = useState("");

  const [emailModal, setEmailModal] = useState<{ remessa: RemessaDetail } | null>(null);

  const [marking, setMarking] = useState<string | null>(null);

  const loadDocumentos = useCallback(async () => {
    setLoadingDocs(true);
    try {
      const res = await fetch("/api/remessas/documentos-disponiveis");
      if (res.ok) {
        const data = await res.json();
        setDocumentos(data.documentos);
      }
    } finally {
      setLoadingDocs(false);
    }
  }, []);

  const loadRemessas = useCallback(async () => {
    setLoadingRemessas(true);
    try {
      const res = await fetch("/api/remessas");
      if (res.ok) {
        const data = await res.json();
        setRemessas(data.remessas);
      }
    } finally {
      setLoadingRemessas(false);
    }
  }, []);

  useEffect(() => {
    // Carga inicial ao montar a tela.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga unica ao montar
    loadDocumentos();
    loadRemessas();
  }, [loadDocumentos, loadRemessas]);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selecionarTodosVisiveis() {
    if (!documentos) return;
    setSelectedIds(new Set(documentos.map((d) => d.id)));
  }

  function limparSelecao() {
    setSelectedIds(new Set());
  }

  const selecionados = useMemo(
    () => (documentos ?? []).filter((d) => selectedIds.has(d.id)),
    [documentos, selectedIds],
  );

  const resumoSelecao = useMemo(() => {
    const periodo = periodoDeSelecionados(selecionados);
    return {
      total: selecionados.length,
      nfe: selecionados.filter((d) => d.tipo === "NFE").length,
      cte: selecionados.filter((d) => d.tipo === "CTE").length,
      periodo,
      arquivosDisponiveis: selecionados.reduce((acc, d) => acc + (d.temXml ? 1 : 0) + (d.temPdf ? 1 : 0), 0),
      semPdf: selecionados.filter((d) => !d.temPdf).length,
      semXml: selecionados.filter((d) => !d.temXml).length,
    };
  }, [selecionados]);

  async function handleUploadPdf(documentId: string, file: File) {
    setUploadingPdfId(documentId);
    setActionError("");
    try {
      const formData = new FormData();
      formData.append("arquivo", file);
      const res = await fetch(`/api/fiscal/documents/${documentId}/pdf`, { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setActionError(data.error || "Nao foi possivel anexar o PDF.");
        return;
      }
      await loadDocumentos();
    } catch {
      setActionError("Nao foi possivel conectar ao servidor.");
    } finally {
      setUploadingPdfId(null);
    }
  }

  function removerDaRevisao(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  async function handleCreateRemessa(confirmar: boolean) {
    setCreating(true);
    setCreateError("");
    try {
      const res = await fetch("/api/remessas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentIds: Array.from(selectedIds),
          observacao: observacao || null,
          confirmar,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCreateError(data.error || "Nao foi possivel criar a remessa.");
        return;
      }
      setCreatedMessage(
        confirmar
          ? "Remessa confirmada com sucesso. Os documentos ja saem da lista de disponiveis."
          : "Rascunho salvo. Voce pode confirmar depois pelo historico de remessas.",
      );
      setReviewOpen(false);
      setSelectedIds(new Set());
      setObservacao("");
      await loadDocumentos();
      await loadRemessas();
      setView("historico");
    } catch {
      setCreateError("Nao foi possivel conectar ao servidor.");
    } finally {
      setCreating(false);
    }
  }

  async function toggleExpand(id: string) {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    if (!detailCache[id]) {
      const res = await fetch(`/api/remessas/${id}`);
      if (res.ok) {
        const data = await res.json();
        setDetailCache((prev) => ({ ...prev, [id]: data.remessa }));
      }
    }
  }

  async function getDetail(id: string): Promise<RemessaDetail | null> {
    if (detailCache[id]) return detailCache[id];
    const res = await fetch(`/api/remessas/${id}`);
    if (!res.ok) return null;
    const data = await res.json();
    setDetailCache((prev) => ({ ...prev, [id]: data.remessa }));
    return data.remessa;
  }

  async function handleBaixarPacote(id: string) {
    setDownloadingId(id);
    setActionError("");
    try {
      await downloadBlob(`/api/remessas/${id}/pacote`, `Remessa_${id}.zip`);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Nao foi possivel baixar o pacote.");
    } finally {
      setDownloadingId(null);
    }
  }

  async function handleAbrirWhatsapp(id: string) {
    const detail = await getDetail(id);
    if (!detail) return;
    setWhatsappPhone("");
    setWhatsappModal({ remessa: detail });
  }

  async function handleAbrirEmail(id: string) {
    const detail = await getDetail(id);
    if (!detail) return;
    setEmailModal({ remessa: detail });
  }

  function abrirCancelamento(id: string, nome: string) {
    setCancelMotivo("");
    setCancelModal({ id, nome });
  }

  async function confirmarCancelamento() {
    if (!cancelModal) return;
    setCancelling(true);
    setActionError("");
    try {
      const res = await fetch(`/api/remessas/${cancelModal.id}/cancelar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ motivo: cancelMotivo }),
      });
      const data = await res.json();
      if (!res.ok) {
        setActionError(data.error || "Nao foi possivel cancelar a remessa.");
        return;
      }
      setCancelModal(null);
      setDetailCache((prev) => {
        const next = { ...prev };
        delete next[cancelModal.id];
        return next;
      });
      await loadRemessas();
      await loadDocumentos();
    } catch {
      setActionError("Nao foi possivel conectar ao servidor.");
    } finally {
      setCancelling(false);
    }
  }

  async function handleConfirmarRascunho(id: string) {
    setActionError("");
    const res = await fetch(`/api/remessas/${id}/confirmar`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      setActionError(data.error || "Nao foi possivel confirmar a remessa.");
      return;
    }
    setDetailCache((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    await loadRemessas();
  }

  async function handleMarcarEnviada(id: string) {
    const confirmed = window.confirm(
      "Confirme somente apos enviar os documentos a contabilidade. Esta acao registrara a data, hora e responsavel pelo envio.",
    );
    if (!confirmed) return;

    setMarking(id);
    setActionError("");
    try {
      const res = await fetch(`/api/remessas/${id}/marcar-enviada`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setActionError(data.error || "Nao foi possivel marcar a remessa como enviada.");
        return;
      }
      setDetailCache((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      await loadRemessas();
    } catch {
      setActionError("Nao foi possivel conectar ao servidor.");
    } finally {
      setMarking(null);
    }
  }

  return (
    <main className="min-h-screen bg-[#eef3f8] text-slate-950">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-3 py-3 sm:gap-5 sm:px-6 sm:py-4 lg:px-8">
        <header className="overflow-hidden rounded-2xl bg-[#09233f] p-4 text-white shadow-sm sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-200">Documentos</p>
              <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">Remessas para Contabilidade</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-200">
                Selecione NF-e e CT-e prontos e envie uma unica remessa organizada para a
                contabilidade — sem misturar fotos, conferencias ou dados de inventario. Logado como {email}.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Link
                className="rounded-lg border border-white/20 px-4 py-2 text-center text-sm font-bold text-white transition hover:bg-white/10"
                href="/configuracoes"
              >
                Documentos fiscais
              </Link>
              <Link
                className="rounded-lg border border-white/20 px-4 py-2 text-center text-sm font-bold text-white transition hover:bg-white/10"
                href="/"
              >
                Voltar ao app
              </Link>
              <button
                className="rounded-lg border border-white/20 px-4 py-2 text-sm font-bold text-white transition hover:bg-white/10"
                onClick={handleLogout}
                type="button"
              >
                Sair
              </button>
            </div>
          </div>
        </header>

        {createdMessage && (
          <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-900">
            {createdMessage}
          </p>
        )}
        {actionError && (
          <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-800">
            {actionError}
          </p>
        )}

        <div className="flex gap-2 rounded-xl bg-white p-1 shadow-sm">
          <button
            className={`flex-1 rounded-lg px-4 py-2 text-sm font-bold transition ${
              view === "disponiveis" ? "bg-[#09233f] text-white" : "text-slate-600 hover:bg-slate-100"
            }`}
            onClick={() => setView("disponiveis")}
            type="button"
          >
            Documentos prontos para envio
          </button>
          <button
            className={`flex-1 rounded-lg px-4 py-2 text-sm font-bold transition ${
              view === "historico" ? "bg-[#09233f] text-white" : "text-slate-600 hover:bg-slate-100"
            }`}
            onClick={() => setView("historico")}
            type="button"
          >
            Historico de remessas
          </button>
        </div>

        {view === "disponiveis" && (
          <div className="rounded-2xl bg-white p-4 shadow-sm sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-semibold">Documentos prontos para envio</h2>
              <div className="flex flex-wrap gap-2">
                <button
                  className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
                  onClick={selecionarTodosVisiveis}
                  type="button"
                >
                  Selecionar todos visiveis
                </button>
                <button
                  className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
                  onClick={limparSelecao}
                  type="button"
                >
                  Limpar selecao
                </button>
              </div>
            </div>

            {loadingDocs && !documentos && <p className="mt-4 text-sm text-slate-500">Carregando...</p>}

            {documentos && documentos.length === 0 && (
              <p className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-center text-sm text-slate-500">
                Nenhum documento pronto para envio no momento. Sincronize NF-e/CT-e em
                Documentos fiscais ou aguarde novas notas.
              </p>
            )}

            {documentos && documentos.length > 0 && (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[860px] border-separate border-spacing-0 text-left text-sm">
                  <thead>
                    <tr className="bg-slate-100 text-xs uppercase tracking-wide text-slate-600">
                      <th className="px-3 py-2 first:rounded-l-lg"></th>
                      <th className="px-3 py-2">Tipo</th>
                      <th className="px-3 py-2">Numero</th>
                      <th className="px-3 py-2">Emitente</th>
                      <th className="px-3 py-2">Emissao</th>
                      <th className="px-3 py-2">Valor</th>
                      <th className="px-3 py-2">XML</th>
                      <th className="px-3 py-2 last:rounded-r-lg">PDF</th>
                    </tr>
                  </thead>
                  <tbody>
                    {documentos.map((doc) => (
                      <tr className="border-b border-slate-100" key={doc.id}>
                        <td className="px-3 py-2">
                          <input
                            checked={selectedIds.has(doc.id)}
                            className="h-4 w-4"
                            onChange={() => toggleSelected(doc.id)}
                            type="checkbox"
                          />
                        </td>
                        <td className="px-3 py-2 font-semibold">{doc.tipo === "NFE" ? "NF-e" : "CT-e"}</td>
                        <td className="px-3 py-2">
                          {doc.numero ?? "-"} / {doc.serie ?? "-"}
                        </td>
                        <td className="px-3 py-2">{doc.emitenteNome ?? "-"}</td>
                        <td className="px-3 py-2">{formatDateOnly(doc.emissao)}</td>
                        <td className="px-3 py-2">{formatCurrency(doc.valorTotal)}</td>
                        <td className="px-3 py-2">
                          {doc.temXml ? (
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">
                              Sim
                            </span>
                          ) : (
                            <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-800">
                              Nao
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {doc.temPdf ? (
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">
                              Sim
                            </span>
                          ) : (
                            <label className="cursor-pointer rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-700 hover:bg-slate-200">
                              {uploadingPdfId === doc.id ? "Enviando..." : "Anexar PDF"}
                              <input
                                accept="application/pdf"
                                className="hidden"
                                disabled={uploadingPdfId === doc.id}
                                onChange={(event) => {
                                  const file = event.target.files?.[0];
                                  if (file) handleUploadPdf(doc.id, file);
                                  event.target.value = "";
                                }}
                                type="file"
                              />
                            </label>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Resumo dinamico */}
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
              <InfoField label="Selecionados" value={String(resumoSelecao.total)} />
              <InfoField label="NF-e" value={String(resumoSelecao.nfe)} />
              <InfoField label="CT-e" value={String(resumoSelecao.cte)} />
              <InfoField label="Periodo" value={formatPeriodo(resumoSelecao.periodo.inicio, resumoSelecao.periodo.fim)} />
              <InfoField label="Arquivos disponiveis" value={String(resumoSelecao.arquivosDisponiveis)} />
              <InfoField label="Sem PDF" value={String(resumoSelecao.semPdf)} />
              <InfoField label="Sem XML" value={String(resumoSelecao.semXml)} />
            </div>

            <div className="mt-5">
              <button
                className="rounded-xl bg-emerald-500 px-5 py-3 text-sm font-bold text-emerald-950 shadow-sm transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={selectedIds.size === 0}
                onClick={() => {
                  setCreateError("");
                  setReviewOpen(true);
                }}
                type="button"
              >
                Criar remessa para contabilidade
              </button>
            </div>
          </div>
        )}

        {view === "historico" && (
          <div className="rounded-2xl bg-white p-4 shadow-sm sm:p-5">
            <h2 className="text-xl font-semibold">Historico de remessas</h2>

            {loadingRemessas && !remessas && <p className="mt-4 text-sm text-slate-500">Carregando...</p>}

            {remessas && remessas.length === 0 && (
              <p className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-center text-sm text-slate-500">
                Nenhuma remessa criada ainda.
              </p>
            )}

            {remessas && remessas.length > 0 && (
              <div className="mt-4 grid gap-3">
                {remessas.map((r) => (
                  <div className="rounded-xl border border-slate-200 p-4" key={r.id}>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-900">{r.nome}</p>
                        <p className="text-xs text-slate-500">
                          {formatPeriodo(r.periodoInicio, r.periodoFim)} · criada em {formatDate(r.criadoEm)} por{" "}
                          {r.criadoPorEmail}
                        </p>
                      </div>
                      <span className={`rounded-full px-3 py-1 text-xs font-bold ${STATUS_TONE[r.status]}`}>
                        {STATUS_LABEL[r.status] ?? r.status}
                      </span>
                    </div>

                    <div className="mt-3 grid grid-cols-3 gap-3 sm:max-w-md">
                      <InfoField label="Documentos" value={String(r.totalDocumentos)} />
                      <InfoField label="NF-e" value={String(r.totalNfe)} />
                      <InfoField label="CT-e" value={String(r.totalCte)} />
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
                        onClick={() => toggleExpand(r.id)}
                        type="button"
                      >
                        {expandedId === r.id ? "Esconder" : "Visualizar remessa"}
                      </button>
                      {r.status !== "CANCELADA" && (
                        <button
                          className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                          disabled={downloadingId === r.id}
                          onClick={() => handleBaixarPacote(r.id)}
                          type="button"
                        >
                          {downloadingId === r.id ? "Gerando..." : "Baixar pacote"}
                        </button>
                      )}
                      {r.status !== "CANCELADA" && (
                        <button
                          className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
                          onClick={() => handleAbrirWhatsapp(r.id)}
                          type="button"
                        >
                          Mensagem WhatsApp
                        </button>
                      )}
                      {r.status !== "CANCELADA" && (
                        <button
                          className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
                          onClick={() => handleAbrirEmail(r.id)}
                          type="button"
                        >
                          Preparar e-mail
                        </button>
                      )}
                      {r.status === "RASCUNHO" && (
                        <button
                          className="rounded-lg bg-[#09233f] px-3 py-2 text-xs font-bold text-white transition hover:bg-[#12385f]"
                          onClick={() => handleConfirmarRascunho(r.id)}
                          type="button"
                        >
                          Confirmar remessa
                        </button>
                      )}
                      {r.status === "PRONTA" && (
                        <button
                          className="rounded-lg bg-emerald-500 px-3 py-2 text-xs font-bold text-emerald-950 transition hover:bg-emerald-400 disabled:opacity-60"
                          disabled={marking === r.id}
                          onClick={() => handleMarcarEnviada(r.id)}
                          type="button"
                        >
                          {marking === r.id ? "Marcando..." : "Marcar remessa como enviada"}
                        </button>
                      )}
                      {(r.status === "RASCUNHO" || r.status === "PRONTA") && (
                        <button
                          className="rounded-lg border border-rose-300 px-3 py-2 text-xs font-bold text-rose-700 transition hover:bg-rose-50"
                          onClick={() => abrirCancelamento(r.id, r.nome)}
                          type="button"
                        >
                          Cancelar remessa
                        </button>
                      )}
                    </div>

                    {expandedId === r.id && (
                      <RemessaDetailView detail={detailCache[r.id]} />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal de revisao da remessa */}
      {reviewOpen && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-950/50 p-0 sm:items-center sm:p-4">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-t-2xl bg-white p-4 shadow-xl sm:rounded-2xl sm:p-6">
            <h3 className="text-xl font-semibold text-slate-900">Revisar remessa</h3>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <InfoField label="Nome da remessa" value={nomeRemessaPreview()} />
              <InfoField label="Periodo dos documentos" value={formatPeriodo(resumoSelecao.periodo.inicio, resumoSelecao.periodo.fim)} />
              <InfoField label="Responsavel" value={email} />
              <InfoField label="Data e hora" value={formatDate(new Date().toISOString())} />
            </div>

            <label className="mt-4 block text-sm font-bold text-slate-700">
              Observacao (opcional)
              <textarea
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-cyan-600"
                onChange={(event) => setObservacao(event.target.value)}
                rows={2}
                value={observacao}
              />
            </label>

            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
              <InfoField label="Total" value={String(resumoSelecao.total)} />
              <InfoField label="NF-e" value={String(resumoSelecao.nfe)} />
              <InfoField label="CT-e" value={String(resumoSelecao.cte)} />
              <InfoField label="Sem XML" value={String(resumoSelecao.semXml)} />
              <InfoField label="Sem PDF" value={String(resumoSelecao.semPdf)} />
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[760px] border-separate border-spacing-0 text-left text-sm">
                <thead>
                  <tr className="bg-slate-100 text-xs uppercase tracking-wide text-slate-600">
                    <th className="px-3 py-2 first:rounded-l-lg">Tipo</th>
                    <th className="px-3 py-2">Numero</th>
                    <th className="px-3 py-2">Emitente</th>
                    <th className="px-3 py-2">Data</th>
                    <th className="px-3 py-2">Chave de acesso</th>
                    <th className="px-3 py-2">XML</th>
                    <th className="px-3 py-2">PDF</th>
                    <th className="px-3 py-2 last:rounded-r-lg"></th>
                  </tr>
                </thead>
                <tbody>
                  {selecionados.map((doc) => (
                    <tr className="border-b border-slate-100" key={doc.id}>
                      <td className="px-3 py-2 font-semibold">{doc.tipo === "NFE" ? "NF-e" : "CT-e"}</td>
                      <td className="px-3 py-2">{doc.numero ?? "-"}</td>
                      <td className="px-3 py-2">{doc.emitenteNome ?? "-"}</td>
                      <td className="px-3 py-2">{formatDateOnly(doc.emissao)}</td>
                      <td className="px-3 py-2 font-mono text-xs">{doc.chaveAcesso}</td>
                      <td className="px-3 py-2">{doc.temXml ? "Sim" : "Nao"}</td>
                      <td className="px-3 py-2">{doc.temPdf ? "Sim" : "Nao"}</td>
                      <td className="px-3 py-2">
                        <button
                          className="text-xs font-bold text-rose-600 underline decoration-dotted"
                          onClick={() => removerDaRevisao(doc.id)}
                          type="button"
                        >
                          Remover
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {createError && (
              <p className="mt-4 rounded-lg bg-rose-50 p-3 text-xs font-semibold text-rose-800">{createError}</p>
            )}

            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <button
                className="rounded-xl bg-emerald-500 px-5 py-3 text-sm font-bold text-emerald-950 shadow-sm transition hover:bg-emerald-400 disabled:opacity-60"
                disabled={creating || selecionados.length === 0}
                onClick={() => handleCreateRemessa(true)}
                type="button"
              >
                {creating ? "Confirmando..." : "Confirmar remessa"}
              </button>
              <button
                className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                disabled={creating || selecionados.length === 0}
                onClick={() => handleCreateRemessa(false)}
                type="button"
              >
                Salvar como rascunho
              </button>
              <button
                className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-bold text-slate-700 transition hover:bg-white"
                onClick={() => setReviewOpen(false)}
                type="button"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de cancelamento */}
      {cancelModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900">Cancelar remessa</h3>
            <p className="mt-2 text-sm text-slate-600">
              A remessa &quot;{cancelModal.nome}&quot; sera cancelada e os documentos voltam a
              aparecer como prontos para envio. Nenhum documento sera apagado.
            </p>
            <label className="mt-4 block text-sm font-bold text-slate-700">
              Motivo do cancelamento
              <textarea
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-cyan-600"
                onChange={(event) => setCancelMotivo(event.target.value)}
                rows={2}
                value={cancelMotivo}
              />
            </label>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <button
                className="rounded-xl bg-rose-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-rose-500 disabled:opacity-60"
                disabled={cancelling || !cancelMotivo.trim()}
                onClick={confirmarCancelamento}
                type="button"
              >
                {cancelling ? "Cancelando..." : "Confirmar cancelamento"}
              </button>
              <button
                className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
                onClick={() => setCancelModal(null)}
                type="button"
              >
                Voltar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal WhatsApp */}
      {whatsappModal && (
        <WhatsappModal
          onClose={() => setWhatsappModal(null)}
          phone={whatsappPhone}
          remessa={whatsappModal.remessa}
          setPhone={setWhatsappPhone}
        />
      )}

      {/* Modal e-mail */}
      {emailModal && <EmailModal onClose={() => setEmailModal(null)} remessa={emailModal.remessa} />}
    </main>
  );
}

function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function RemessaDetailView({ detail }: { detail: RemessaDetail | undefined }) {
  if (!detail) return <p className="mt-4 text-sm text-slate-500">Carregando...</p>;

  return (
    <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
      {detail.observacao && <p className="text-sm text-slate-700">Observacao: {detail.observacao}</p>}
      {detail.motivoCancelamento && (
        <p className="mt-1 text-sm font-semibold text-rose-700">
          Motivo do cancelamento: {detail.motivoCancelamento}
        </p>
      )}
      {detail.enviadaEm && (
        <p className="mt-1 text-sm text-slate-700">
          Marcada como enviada em {formatDate(detail.enviadaEm)} por {detail.enviadaPorEmail}
        </p>
      )}
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[680px] border-separate border-spacing-0 text-left text-xs">
          <thead>
            <tr className="bg-slate-200 uppercase tracking-wide text-slate-600">
              <th className="px-3 py-2 first:rounded-l-lg">Tipo</th>
              <th className="px-3 py-2">Numero</th>
              <th className="px-3 py-2">Emitente</th>
              <th className="px-3 py-2">Chave de acesso</th>
              <th className="px-3 py-2">XML</th>
              <th className="px-3 py-2 last:rounded-r-lg">PDF</th>
            </tr>
          </thead>
          <tbody>
            {detail.documentos.map((doc) => (
              <tr className="border-b border-slate-200 bg-white" key={doc.id}>
                <td className="px-3 py-2 font-semibold">{doc.tipo === "NFE" ? "NF-e" : "CT-e"}</td>
                <td className="px-3 py-2">{doc.numero ?? "-"}</td>
                <td className="px-3 py-2">{doc.emitenteNome ?? "-"}</td>
                <td className="px-3 py-2 font-mono">{doc.chaveAcesso}</td>
                <td className="px-3 py-2">{doc.temXml ? "Sim" : "Nao"}</td>
                <td className="px-3 py-2">{doc.temPdf ? "Sim" : "Nao"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function buildWhatsappMessage(remessa: RemessaDetail) {
  return [
    "Ola!",
    `Segue a remessa de documentos fiscais referente ao periodo ${formatPeriodo(remessa.periodoInicio, remessa.periodoFim)}.`,
    `Total: ${remessa.totalDocumentos} documentos`,
    `NF-e: ${remessa.totalNfe}`,
    `CT-e: ${remessa.totalCte}`,
    "Arquivos disponiveis: XML e PDFs correspondentes.",
    `Remessa: ${remessa.nome}`,
  ].join("\n");
}

function WhatsappModal({
  remessa,
  phone,
  setPhone,
  onClose,
}: {
  remessa: RemessaDetail;
  phone: string;
  setPhone: (value: string) => void;
  onClose: () => void;
}) {
  const mensagem = buildWhatsappMessage(remessa);
  const digits = phone.replace(/\D/g, "");

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/50 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
        <h3 className="text-lg font-semibold text-slate-900">Preparar mensagem para WhatsApp</h3>
        <p className="mt-2 text-xs text-slate-500">
          A mensagem abaixo e apenas preparada — nada e enviado automaticamente. O WhatsApp so
          abre com a mensagem preenchida se voce informar um numero de destino.
        </p>

        <label className="mt-4 block text-sm font-bold text-slate-700">
          Numero do destinatario (com DDD)
          <input
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-cyan-600"
            inputMode="numeric"
            onChange={(event) => setPhone(event.target.value)}
            placeholder="Ex.: 11999998888"
            value={phone}
          />
        </label>

        <label className="mt-3 block text-sm font-bold text-slate-700">
          Mensagem
          <textarea className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm" readOnly rows={7} value={mensagem} />
        </label>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <button
            className="rounded-xl bg-emerald-500 px-5 py-3 text-sm font-bold text-emerald-950 shadow-sm transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={digits.length < 10}
            onClick={() => {
              const url = `https://wa.me/${digits}?text=${encodeURIComponent(mensagem)}`;
              window.open(url, "_blank", "noopener,noreferrer");
            }}
            type="button"
          >
            Abrir WhatsApp com a mensagem
          </button>
          <button
            className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
            onClick={async () => {
              await navigator.clipboard.writeText(mensagem);
            }}
            type="button"
          >
            Copiar mensagem
          </button>
          <button
            className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-bold text-slate-700 transition hover:bg-white"
            onClick={onClose}
            type="button"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

function EmailModal({ remessa, onClose }: { remessa: RemessaDetail; onClose: () => void }) {
  const assunto = `Remessa de documentos fiscais - ${remessa.nome}`;
  const listaDocumentos = remessa.documentos
    .map((d) => `- ${d.tipo === "NFE" ? "NF-e" : "CT-e"} n. ${d.numero ?? "-"} (${d.chaveAcesso})`)
    .join("\n");
  const corpo = [
    "Ola,",
    "",
    `Segue a remessa de documentos fiscais referente ao periodo ${formatPeriodo(remessa.periodoInicio, remessa.periodoFim)}.`,
    `Total: ${remessa.totalDocumentos} documentos (NF-e: ${remessa.totalNfe}, CT-e: ${remessa.totalCte}).`,
    "",
    "Documentos:",
    listaDocumentos,
    "",
    "Os arquivos (XML e PDFs) estao no pacote .zip desta remessa — baixe pelo historico de remessas e anexe a este e-mail.",
  ].join("\n");

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/50 p-4">
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
        <h3 className="text-lg font-semibold text-slate-900">Preparar e-mail para contabilidade</h3>
        <p className="mt-2 rounded-lg bg-amber-50 p-3 text-xs font-semibold text-amber-900">
          O e-mail foi preparado. A integracao de envio sera habilitada apos a configuracao do provedor.
        </p>

        <label className="mt-4 block text-sm font-bold text-slate-700">
          Assunto
          <input className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm" readOnly value={assunto} />
        </label>

        <label className="mt-3 block text-sm font-bold text-slate-700">
          Corpo do e-mail
          <textarea className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm" readOnly rows={10} value={corpo} />
        </label>

        <p className="mt-3 text-xs text-slate-500">
          Anexos que devem ser incluidos: pacote .zip da remessa (XMLs, PDFs disponiveis e
          resumo-remessa.pdf). O mailto abaixo nao anexa arquivos automaticamente — baixe o
          pacote antes e anexe manualmente.
        </p>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <a
            className="rounded-xl bg-[#09233f] px-5 py-3 text-center text-sm font-bold text-white transition hover:bg-[#12385f]"
            href={`mailto:?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(corpo)}`}
          >
            Abrir no aplicativo de e-mail
          </a>
          <button
            className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
            onClick={async () => {
              await navigator.clipboard.writeText(`${assunto}\n\n${corpo}`);
            }}
            type="button"
          >
            Copiar texto
          </button>
          <button
            className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-bold text-slate-700 transition hover:bg-white"
            onClick={onClose}
            type="button"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
