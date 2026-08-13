"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const UF_OPTIONS = [
  { codigo: 12, sigla: "AC" },
  { codigo: 27, sigla: "AL" },
  { codigo: 16, sigla: "AP" },
  { codigo: 13, sigla: "AM" },
  { codigo: 29, sigla: "BA" },
  { codigo: 23, sigla: "CE" },
  { codigo: 53, sigla: "DF" },
  { codigo: 32, sigla: "ES" },
  { codigo: 52, sigla: "GO" },
  { codigo: 21, sigla: "MA" },
  { codigo: 51, sigla: "MT" },
  { codigo: 50, sigla: "MS" },
  { codigo: 31, sigla: "MG" },
  { codigo: 15, sigla: "PA" },
  { codigo: 25, sigla: "PB" },
  { codigo: 41, sigla: "PR" },
  { codigo: 26, sigla: "PE" },
  { codigo: 22, sigla: "PI" },
  { codigo: 33, sigla: "RJ" },
  { codigo: 24, sigla: "RN" },
  { codigo: 43, sigla: "RS" },
  { codigo: 11, sigla: "RO" },
  { codigo: 14, sigla: "RR" },
  { codigo: 42, sigla: "SC" },
  { codigo: 35, sigla: "SP" },
  { codigo: 28, sigla: "SE" },
  { codigo: 17, sigla: "TO" },
];

const STATUS_LABEL: Record<string, string> = {
  NAO_CONFIGURADO: "Nao configurado",
  CONFIGURADO: "Configurado",
  CONEXAO_VALIDADA: "Conexao validada",
  PROXIMO_DO_VENCIMENTO: "Certificado proximo do vencimento",
  VENCIDO: "Certificado vencido",
  ERRO_AUTENTICACAO: "Erro de autenticacao",
  ERRO_CONEXAO: "Erro de conexao com SEFAZ",
};

const STATUS_TONE: Record<string, string> = {
  NAO_CONFIGURADO: "bg-slate-100 text-slate-700",
  CONFIGURADO: "bg-cyan-100 text-cyan-800",
  CONEXAO_VALIDADA: "bg-emerald-100 text-emerald-800",
  PROXIMO_DO_VENCIMENTO: "bg-amber-100 text-amber-800",
  VENCIDO: "bg-rose-100 text-rose-800",
  ERRO_AUTENTICACAO: "bg-rose-100 text-rose-800",
  ERRO_CONEXAO: "bg-rose-100 text-rose-800",
};

type CertificateStatus = {
  status: string;
  subjectCn?: string | null;
  validFrom?: string | null;
  validTo?: string | null;
  uploadedByEmail?: string | null;
  uploadedAt?: string | null;
  lastTestedAt?: string | null;
  lastTestResult?: string | null;
  lastTestMessage?: string | null;
};

type SyncStatus = {
  ultimaSincronizacao: string | null;
  status: string;
  novosDocumentos: number;
  novasNfe: number;
  novasCte: number;
  ultNsu: string;
  errorMessage: string | null;
};

type FiscalDocument = {
  id: string;
  tipo: "NFE" | "CTE";
  chaveAcesso: string;
  numero: string | null;
  serie: string | null;
  emissao: string | null;
  emitenteNome: string | null;
  emitenteCnpj: string | null;
  valorTotal: number | null;
  importadoEm: string;
  vinculadoRecebimentoId: string | null;
};

type AuditEntry = {
  id: string;
  actorEmail: string;
  action: string;
  detail: Record<string, unknown> | null;
  createdAt: string;
};

function formatDate(iso: string | null | undefined) {
  if (!iso) return "-";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(
    new Date(iso),
  );
}

export default function ConfiguracoesFiscaisClient({ email }: { email: string }) {
  const router = useRouter();

  const [certStatus, setCertStatus] = useState<CertificateStatus | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [documents, setDocuments] = useState<FiscalDocument[] | null>(null);
  const [auditLog, setAuditLog] = useState<AuditEntry[] | null>(null);
  const [showDocuments, setShowDocuments] = useState(false);
  const [showAuditLog, setShowAuditLog] = useState(false);
  // Momento fixo no primeiro render, para os calculos de "dias ate vencer"
  // abaixo nao chamarem Date.now() durante a renderizacao (mantem o render
  // puro/deterministico).
  const [nowMs] = useState(() => Date.now());

  const [formVisible, setFormVisible] = useState(false);
  const [razaoSocial, setRazaoSocial] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [ufCodigo, setUfCodigo] = useState("");
  const [ambiente, setAmbiente] = useState<"PRODUCAO" | "HOMOLOGACAO">("HOMOLOGACAO");
  const [file, setFile] = useState<File | null>(null);
  const [senha, setSenha] = useState("");

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [testing, setTesting] = useState(false);
  const [testMessage, setTestMessage] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState("");

  const loadCertStatus = useCallback(async () => {
    const res = await fetch("/api/fiscal/certificate");
    if (res.ok) setCertStatus(await res.json());
  }, []);

  const loadSyncStatus = useCallback(async () => {
    const res = await fetch("/api/fiscal/sync");
    if (res.ok) setSyncStatus(await res.json());
  }, []);

  const loadDocuments = useCallback(async () => {
    const res = await fetch("/api/fiscal/documents");
    if (res.ok) {
      const data = await res.json();
      setDocuments(data.documents);
    }
  }, []);

  const loadAuditLog = useCallback(async () => {
    const res = await fetch("/api/fiscal/audit-log");
    if (res.ok) {
      const data = await res.json();
      setAuditLog(data.logs);
    }
  }, []);

  useEffect(() => {
    // Busca inicial dos dados ao montar a tela — nao ha como fazer isso no
    // corpo do componente (precisa de fetch, so roda no cliente).
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga unica ao montar
    loadCertStatus();
    loadSyncStatus();
  }, [loadCertStatus, loadSyncStatus]);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  async function handleSaveCertificate(event: React.FormEvent) {
    event.preventDefault();
    setSaveError("");

    if (!file) {
      setSaveError("Selecione o arquivo do certificado (.pfx ou .p12).");
      return;
    }

    const formData = new FormData();
    formData.append("arquivo", file);
    formData.append("razaoSocial", razaoSocial);
    formData.append("cnpj", cnpj);
    formData.append("ufCodigo", ufCodigo);
    formData.append("ambiente", ambiente);
    formData.append("senha", senha);

    setSaving(true);
    try {
      const res = await fetch("/api/fiscal/certificate", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setSaveError(data.error || "Nao foi possivel salvar o certificado.");
        return;
      }
      // Nunca reaproveita a senha depois de enviada.
      setSenha("");
      setFile(null);
      setFormVisible(false);
      await loadCertStatus();
    } catch {
      setSaveError("Nao foi possivel conectar ao servidor.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveCertificate() {
    const confirmed = window.confirm(
      "Remover o certificado configurado? Sera preciso fazer o upload de novo para sincronizar documentos fiscais.",
    );
    if (!confirmed) return;

    await fetch("/api/fiscal/certificate", { method: "DELETE" });
    await loadCertStatus();
  }

  async function handleTestConnection() {
    setTesting(true);
    setTestMessage("");
    try {
      const res = await fetch("/api/fiscal/certificate/test-connection", { method: "POST" });
      const data = await res.json();
      setTestMessage(data.message ?? "Sem resposta do servidor.");
      await loadCertStatus();
    } catch {
      setTestMessage("Nao foi possivel conectar ao servidor.");
    } finally {
      setTesting(false);
    }
  }

  async function handleSync() {
    setSyncing(true);
    setSyncError("");
    try {
      const res = await fetch("/api/fiscal/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setSyncError(data.error || "Nao foi possivel sincronizar.");
        return;
      }
      await loadSyncStatus();
    } catch {
      setSyncError("Nao foi possivel conectar ao servidor.");
    } finally {
      setSyncing(false);
    }
  }

  async function handleShowDocuments() {
    const next = !showDocuments;
    setShowDocuments(next);
    if (next && !documents) await loadDocuments();
  }

  async function handleShowAuditLog() {
    const next = !showAuditLog;
    setShowAuditLog(next);
    if (next && !auditLog) await loadAuditLog();
  }

  const status = certStatus?.status ?? "NAO_CONFIGURADO";
  const daysToExpire = certStatus?.validTo
    ? Math.floor((new Date(certStatus.validTo).getTime() - nowMs) / (1000 * 60 * 60 * 24))
    : null;

  const alerts: string[] = [];
  if (daysToExpire !== null) {
    if (daysToExpire < 0) alerts.push("O certificado A1 esta vencido. Substitua antes de sincronizar.");
    else if (daysToExpire <= 7) alerts.push(`O certificado A1 vence em ${daysToExpire} dia(s).`);
    else if (daysToExpire <= 30) alerts.push(`O certificado A1 vence em ${daysToExpire} dias.`);
    else if (daysToExpire <= 60) alerts.push(`O certificado A1 vence em ${daysToExpire} dias.`);
  }
  if (syncStatus?.ultimaSincronizacao) {
    const daysSinceSync =
      (nowMs - new Date(syncStatus.ultimaSincronizacao).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceSync > 7) {
      alerts.push("Nao ha sincronizacao de documentos fiscais ha mais de 7 dias.");
    }
  }
  if (syncStatus?.status === "ERRO") {
    alerts.push("A ultima sincronizacao falhou. Confira a mensagem de erro abaixo.");
  }

  return (
    <main className="min-h-screen bg-[#eef3f8] text-slate-950">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-3 py-3 sm:gap-5 sm:px-6 sm:py-4 lg:px-8">
        <header className="overflow-hidden rounded-2xl bg-[#09233f] p-4 text-white shadow-sm sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-200">
                Configuracoes
              </p>
              <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">Documentos Fiscais</h1>
              <p className="mt-2 max-w-xl text-sm leading-6 text-slate-200">
                Certificado A1, sincronizacao automatica de NF-e/CT-e e
                historico de auditoria. Logado como {email}.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
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

        {alerts.length > 0 && (
          <div className="grid gap-2">
            {alerts.map((alert, index) => (
              <p
                key={index}
                className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900"
              >
                {alert}
              </p>
            ))}
          </div>
        )}

        {/* Card do certificado */}
        <div className="rounded-2xl bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-semibold">Certificado Digital A1</h2>
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${STATUS_TONE[status]}`}>
              {STATUS_LABEL[status] ?? status}
            </span>
          </div>

          {certStatus && status !== "NAO_CONFIGURADO" && (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <InfoField label="Identificado no certificado" value={certStatus.subjectCn || "-"} />
              <InfoField
                label="Valido ate"
                value={certStatus.validTo ? new Intl.DateTimeFormat("pt-BR").format(new Date(certStatus.validTo)) : "-"}
              />
              <InfoField label="Enviado por" value={certStatus.uploadedByEmail || "-"} />
              <InfoField label="Enviado em" value={formatDate(certStatus.uploadedAt)} />
            </div>
          )}

          {testMessage && (
            <p className="mt-4 rounded-lg bg-slate-50 p-3 text-sm leading-6 text-slate-700">
              {testMessage}
            </p>
          )}

          <div className="mt-5 flex flex-wrap gap-3">
            {status === "NAO_CONFIGURADO" ? (
              <button
                className="rounded-xl bg-emerald-500 px-5 py-3 text-sm font-bold text-emerald-950 shadow-sm transition hover:bg-emerald-400"
                onClick={() => setFormVisible(true)}
                type="button"
              >
                Salvar certificado
              </button>
            ) : (
              <>
                <button
                  className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                  disabled={testing}
                  onClick={handleTestConnection}
                  type="button"
                >
                  {testing ? "Testando..." : "Testar conexao"}
                </button>
                <button
                  className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
                  onClick={() => setFormVisible(true)}
                  type="button"
                >
                  Substituir certificado
                </button>
                <button
                  className="rounded-xl border border-rose-300 px-5 py-3 text-sm font-bold text-rose-700 transition hover:bg-rose-50"
                  onClick={handleRemoveCertificate}
                  type="button"
                >
                  Remover certificado
                </button>
              </>
            )}
          </div>

          {formVisible && (
            <form
              className="mt-5 grid gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4"
              onSubmit={handleSaveCertificate}
            >
              <label className="block text-sm font-bold text-slate-700">
                Razao social
                <input
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-cyan-600"
                  onChange={(event) => setRazaoSocial(event.target.value)}
                  required
                  value={razaoSocial}
                />
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm font-bold text-slate-700">
                  CNPJ da empresa
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-cyan-600"
                    inputMode="numeric"
                    onChange={(event) => setCnpj(event.target.value)}
                    placeholder="Somente numeros"
                    required
                    value={cnpj}
                  />
                </label>
                <label className="block text-sm font-bold text-slate-700">
                  UF da empresa
                  <select
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-cyan-600"
                    onChange={(event) => setUfCodigo(event.target.value)}
                    required
                    value={ufCodigo}
                  >
                    <option value="">Selecione</option>
                    {UF_OPTIONS.map((uf) => (
                      <option key={uf.codigo} value={uf.codigo}>
                        {uf.sigla}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="block text-sm font-bold text-slate-700">
                Ambiente
                <select
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-cyan-600"
                  onChange={(event) => setAmbiente(event.target.value as "PRODUCAO" | "HOMOLOGACAO")}
                  value={ambiente}
                >
                  <option value="HOMOLOGACAO">Homologacao (testes)</option>
                  <option value="PRODUCAO">Producao</option>
                </select>
              </label>

              <label className="block text-sm font-bold text-slate-700">
                Arquivo do certificado (.pfx ou .p12)
                <input
                  accept=".pfx,.p12"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-cyan-600"
                  onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                  required
                  type="file"
                />
              </label>

              <label className="block text-sm font-bold text-slate-700">
                Senha do certificado
                <input
                  autoComplete="new-password"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-cyan-600"
                  onChange={(event) => setSenha(event.target.value)}
                  required
                  type="password"
                  value={senha}
                />
                <span className="mt-1 block text-xs font-normal text-slate-500">
                  Usada so para ler o certificado agora. Nao fica salva em
                  lugar nenhum depois deste envio.
                </span>
              </label>

              {saveError && (
                <p className="rounded-lg bg-rose-50 p-3 text-xs font-semibold text-rose-800">
                  {saveError}
                </p>
              )}

              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  className="rounded-xl bg-emerald-500 px-5 py-3 text-sm font-bold text-emerald-950 shadow-sm transition hover:bg-emerald-400 disabled:opacity-60"
                  disabled={saving}
                  type="submit"
                >
                  {saving ? "Salvando..." : "Salvar certificado"}
                </button>
                <button
                  className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-bold text-slate-700 transition hover:bg-white"
                  onClick={() => setFormVisible(false)}
                  type="button"
                >
                  Cancelar
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Sincronizacao */}
        <div className="rounded-2xl bg-white p-4 shadow-sm sm:p-5">
          <h2 className="text-xl font-semibold">Sincronizar Documentos Fiscais</h2>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <InfoField label="Ultima sincronizacao" value={formatDate(syncStatus?.ultimaSincronizacao)} />
            <InfoField label="Status" value={syncStatus?.status ?? "-"} />
            <InfoField label="Novos documentos" value={String(syncStatus?.novosDocumentos ?? 0)} />
            <InfoField label="Ultimo NSU" value={syncStatus?.ultNsu ?? "0"} />
            <InfoField label="Novas NF-e" value={String(syncStatus?.novasNfe ?? 0)} />
            <InfoField label="Novas CT-e" value={String(syncStatus?.novasCte ?? 0)} />
          </div>

          {(syncStatus?.errorMessage || syncError) && (
            <p className="mt-4 rounded-lg bg-rose-50 p-3 text-sm font-semibold text-rose-800">
              {syncError || syncStatus?.errorMessage}
            </p>
          )}

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              className="rounded-xl bg-[#09233f] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#12385f] disabled:opacity-60"
              disabled={syncing || status === "NAO_CONFIGURADO"}
              onClick={handleSync}
              type="button"
            >
              {syncing ? "Buscando..." : "Buscar novos documentos"}
            </button>
            <button
              className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
              onClick={handleShowDocuments}
              type="button"
            >
              {showDocuments ? "Esconder resultados" : "Ver resultados da ultima busca"}
            </button>
          </div>

          {status === "NAO_CONFIGURADO" && (
            <p className="mt-2 text-xs text-slate-500">
              Configure o certificado acima antes de sincronizar.
            </p>
          )}

          {showDocuments && (
            <div className="mt-5 overflow-x-auto">
              {!documents || documents.length === 0 ? (
                <p className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-center text-sm text-slate-500">
                  Nenhum documento sincronizado ainda.
                </p>
              ) : (
                <table className="w-full min-w-[720px] border-separate border-spacing-0 text-left text-sm">
                  <thead>
                    <tr className="bg-slate-100 text-xs uppercase tracking-wide text-slate-600">
                      <th className="px-3 py-2 first:rounded-l-lg">Tipo</th>
                      <th className="px-3 py-2">Numero/Serie</th>
                      <th className="px-3 py-2">Emitente</th>
                      <th className="px-3 py-2">Valor</th>
                      <th className="px-3 py-2">Importado em</th>
                      <th className="px-3 py-2 last:rounded-r-lg">Vinculo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {documents.map((doc) => (
                      <tr className="border-b border-slate-100" key={doc.id}>
                        <td className="px-3 py-2 font-semibold">{doc.tipo}</td>
                        <td className="px-3 py-2">
                          {doc.numero ?? "-"} / {doc.serie ?? "-"}
                        </td>
                        <td className="px-3 py-2">{doc.emitenteNome ?? "-"}</td>
                        <td className="px-3 py-2">
                          {doc.valorTotal != null
                            ? doc.valorTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
                            : "-"}
                        </td>
                        <td className="px-3 py-2">{formatDate(doc.importadoEm)}</td>
                        <td className="px-3 py-2">
                          {doc.vinculadoRecebimentoId ? "Vinculado" : "Disponivel"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>

        {/* Historico / auditoria */}
        <div className="rounded-2xl bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-semibold">Historico tecnico e auditoria</h2>
            <button
              className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
              onClick={handleShowAuditLog}
              type="button"
            >
              {showAuditLog ? "Esconder" : "Ver historico"}
            </button>
          </div>

          {showAuditLog && (
            <div className="mt-4 grid gap-2">
              {!auditLog || auditLog.length === 0 ? (
                <p className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-center text-sm text-slate-500">
                  Nenhuma acao registrada ainda.
                </p>
              ) : (
                auditLog.map((entry) => (
                  <div className="rounded-lg bg-slate-50 px-4 py-3 text-sm" key={entry.id}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold text-slate-800">{entry.action}</span>
                      <span className="text-xs text-slate-500">{formatDate(entry.createdAt)}</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{entry.actorEmail}</p>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
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
