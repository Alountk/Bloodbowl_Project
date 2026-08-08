"use client";

/**
 * Rulebook-styled confirmation modal for archiving (soft-deleting) a team.
 * Controlled by the parent: `team` is the pending team or `null` to close.
 */
export function TeamDeleteModal({
  team,
  onCancel,
  onConfirm,
}: {
  team: { id: string; name: string } | null;
  onCancel: () => void;
  onConfirm: (id: string) => void;
}) {
  if (!team) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-team-dialog-title"
        className="w-full max-w-sm border border-slate-200 bg-white p-6 shadow-xl"
      >
        <h2
          id="delete-team-dialog-title"
          className="text-[15px] font-extrabold text-[#12225a]"
        >
          {team.name}
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          Esta acción no se puede deshacer. El equipo se archivará y se eliminará
          de tu lista.
        </p>
        <div className="mt-5 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:border-slate-400"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => onConfirm(team.id)}
            className="rounded-md bg-[#d11938] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[#a9132e]"
          >
            Eliminar
          </button>
        </div>
      </div>
    </div>
  );
}
