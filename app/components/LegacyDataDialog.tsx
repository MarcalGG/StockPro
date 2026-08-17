"use client";

import type { LegacyDataSummary } from "../../lib/localOperationalMigration";

type Props = {
  summary: LegacyDataSummary;
  onAssociate: () => void;
  onIgnore: () => void;
};

function describe(summary: LegacyDataSummary): string[] {
  const parts: string[] = [];
  if (summary.recebimentoAtual) parts.push("1 recebimento em andamento");
  if (summary.recebimentos > 0) {
    parts.push(`${summary.recebimentos} recebimento(s) finalizado(s)`);
  }
  if (summary.inventarios > 0) parts.push(`${summary.inventarios} inventário(s)`);
  if (summary.documentosFiscais > 0) parts.push(`${summary.documentosFiscais} documento(s) fiscal(is)`);
  if (summary.remessas > 0) parts.push(`${summary.remessas} remessa(s) para contabilidade`);
  return parts;
}

export default function LegacyDataDialog({ summary, onAssociate, onIgnore }: Props) {
  const items = describe(summary);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-slate-900">Dados encontrados neste navegador</h2>
        <p className="mt-2 text-sm text-slate-600">
          Antes de você entrar com o Google, este navegador já tinha dados salvos sem dono:
        </p>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-700">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-slate-600">
          Deseja associar esses dados à sua conta atual? O original continua salvo neste navegador de
          qualquer forma — nada é apagado.
        </p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onIgnore}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Ignorar
          </button>
          <button
            type="button"
            onClick={onAssociate}
            className="rounded-lg bg-[#09233f] px-4 py-2 text-sm font-medium text-white hover:bg-[#0d2f52]"
          >
            Associar à minha conta
          </button>
        </div>
      </div>
    </div>
  );
}
