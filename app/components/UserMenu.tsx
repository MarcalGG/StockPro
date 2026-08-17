"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../providers/AuthProvider";
import {
  downloadBackupFile,
  exportUserBackup,
  importUserBackup,
  readBackupFile,
  type OperationalBackup,
} from "../../lib/backupExport";

function initialsOf(name: string | null, email: string | null): string {
  const source = name || email || "?";
  const parts = source.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function UserMenu() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pendingImport, setPendingImport] = useState<{ backup: OperationalBackup } | null>(null);
  const [confirmDifferentOwner, setConfirmDifferentOwner] = useState(false);
  const [message, setMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!user) return null;

  async function handleSignOut() {
    await signOut();
    router.replace("/login");
  }

  function handleExport() {
    if (!user) return;
    const backup = exportUserBackup(user.uid);
    downloadBackupFile(backup);
    setMessage("Backup baixado.");
  }

  async function handleFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !user) return;
    const parsed = await readBackupFile(file);
    if (!parsed.ok) {
      setMessage(parsed.error);
      return;
    }
    if (parsed.backup.ownerUid === user.uid) {
      const result = importUserBackup(parsed.backup, user.uid);
      setMessage(result.ok ? "Backup restaurado." : "Falha ao importar o backup.");
      return;
    }
    // Backup de outra conta: exige confirmacao reforcada antes de importar.
    setPendingImport({ backup: parsed.backup });
    setConfirmDifferentOwner(false);
  }

  function confirmImportFromOtherOwner() {
    if (!user || !pendingImport) return;
    const result = importUserBackup(pendingImport.backup, user.uid, true);
    setMessage(result.ok ? "Backup de outra conta importado." : "Falha ao importar o backup.");
    setPendingImport(null);
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-2 rounded-full bg-white/10 px-2 py-1 text-white hover:bg-white/20"
      >
        {user.photoURL ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.photoURL} alt="" className="h-7 w-7 rounded-full" referrerPolicy="no-referrer" />
        ) : (
          <span className="grid h-7 w-7 place-items-center rounded-full bg-cyan-400 text-xs font-bold text-cyan-950">
            {initialsOf(user.displayName, user.email)}
          </span>
        )}
        <span className="hidden max-w-[10rem] truncate text-xs font-medium sm:inline">
          {user.displayName || user.email || "Conta"}
        </span>
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-3 text-slate-900 shadow-lg">
          <p className="truncate text-sm font-semibold">{user.displayName || "Sem nome"}</p>
          <p className="truncate text-xs text-slate-500">{user.email}</p>

          <div className="mt-3 flex flex-col gap-1.5 border-t border-slate-100 pt-3">
            <button
              type="button"
              onClick={handleExport}
              className="rounded-lg px-2 py-1.5 text-left text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Exportar backup
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="rounded-lg px-2 py-1.5 text-left text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Importar backup
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={handleFileSelected}
            />
            {message && <p className="px-2 text-xs text-slate-500">{message}</p>}
          </div>

          <div className="mt-3 border-t border-slate-100 pt-3">
            <button
              type="button"
              onClick={handleSignOut}
              className="w-full rounded-lg bg-rose-50 px-2 py-1.5 text-left text-xs font-semibold text-rose-700 hover:bg-rose-100"
            >
              Sair
            </button>
          </div>
        </div>
      )}

      {pendingImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-base font-semibold text-slate-900">
              Este backup pertence a outra conta
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              O arquivo selecionado foi exportado por outra conta Google, diferente da que está logada
              agora. Importar vai adicionar esses dados à sua conta atual.
            </p>
            <label className="mt-4 flex items-start gap-2 text-xs text-slate-700">
              <input
                type="checkbox"
                checked={confirmDifferentOwner}
                onChange={(event) => setConfirmDifferentOwner(event.target.checked)}
                className="mt-0.5"
              />
              Entendo que este backup é de outra conta e quero importar mesmo assim.
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingImport(null)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={!confirmDifferentOwner}
                onClick={confirmImportFromOtherOwner}
                className="rounded-lg bg-[#09233f] px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                Importar mesmo assim
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
