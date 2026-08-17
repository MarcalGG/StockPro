// Backup/restauracao dos dados operacionais do usuario logado (recebimentos,
// inventarios, documentos fiscais locais, remessas). E um export/import de
// JSON simples, pensado para "levar meus dados para outro navegador/
// dispositivo com a mesma conta" ou para uma copia de seguranca manual.
//
// Regras (nunca violar):
// - o backup registra o dono (ownerUid) explicitamente;
// - por padrao so importa para a mesma conta que gerou o backup;
// - se o backup for de outra conta, so importa com confirmacao reforcada
//   explicita de quem esta chamando (o componente de UI decide como pedir
//   essa confirmacao — este modulo so recusa importar sem o parametro
//   `allowDifferentOwner: true`);
// - nunca inclui token do Firebase, cookie, config do Firebase ou qualquer
//   credencial — so os dados operacionais namespaced do usuario.

const SCHEMA_VERSION = 1;

const BACKUP_SUFFIXES = [
  "recebimento-atual",
  "recebimentos:v1",
  "inventarios:v1",
  "documentos-fiscais:v1",
  "remessas-contabeis:v1",
] as const;

export type OperationalBackup = {
  schemaVersion: number;
  ownerUid: string;
  exportedAt: string;
  data: Record<string, unknown>;
};

export function exportUserBackup(uid: string): OperationalBackup {
  const data: Record<string, unknown> = {};
  if (typeof window !== "undefined") {
    for (const suffix of BACKUP_SUFFIXES) {
      const raw = window.localStorage.getItem(`stockpro:user:${uid}:${suffix}`);
      if (raw !== null) {
        try {
          data[suffix] = JSON.parse(raw);
        } catch {
          // ignora chave corrompida, nao trava o backup inteiro
        }
      }
    }
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    ownerUid: uid,
    exportedAt: new Date().toISOString(),
    data,
  };
}

export function downloadBackupFile(backup: OperationalBackup) {
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `stockpro-backup-${backup.exportedAt.slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export type ParsedBackupFile =
  | { ok: true; backup: OperationalBackup }
  | { ok: false; error: string };

export async function readBackupFile(file: File): Promise<ParsedBackupFile> {
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof parsed.ownerUid !== "string" ||
      typeof parsed.data !== "object"
    ) {
      return { ok: false, error: "Arquivo de backup inválido." };
    }
    return { ok: true, backup: parsed as OperationalBackup };
  } catch {
    return { ok: false, error: "Não foi possível ler o arquivo (JSON inválido)." };
  }
}

export type ImportBackupResult =
  | { ok: true; importedKeys: string[] }
  | { ok: false; reason: "different-owner"; backup: OperationalBackup }
  | { ok: false; reason: "error"; error: string };

// `allowDifferentOwner` só deve ser true depois de o usuário confirmar,
// explicitamente e de forma reforçada (ex.: checkbox + segundo clique), que
// sabe que o backup pertence a outra conta.
export function importUserBackup(
  backup: OperationalBackup,
  currentUid: string,
  allowDifferentOwner = false,
): ImportBackupResult {
  if (backup.ownerUid !== currentUid && !allowDifferentOwner) {
    return { ok: false, reason: "different-owner", backup };
  }
  if (typeof window === "undefined") {
    return { ok: false, reason: "error", error: "Ambiente sem localStorage." };
  }
  const importedKeys: string[] = [];
  try {
    for (const suffix of BACKUP_SUFFIXES) {
      if (!(suffix in backup.data)) continue;
      window.localStorage.setItem(
        `stockpro:user:${currentUid}:${suffix}`,
        JSON.stringify(backup.data[suffix]),
      );
      importedKeys.push(suffix);
    }
    return { ok: true, importedKeys };
  } catch (error) {
    return { ok: false, reason: "error", error: error instanceof Error ? error.message : "Erro desconhecido." };
  }
}
