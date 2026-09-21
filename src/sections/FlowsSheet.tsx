import { useEffect, useState } from "react";
import { Link } from "react-router";
import { FolderOpen, Trash2 } from "lucide-react";
import Sheet from "../components/Sheet";
import { api } from "../lib/api";
import type { SavedFlow } from "../lib/contract";

function relativeTime(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

/**
 * "My flows" sheet: lists the signed-in user's saved scenarios with
 * Load (undoable, replaces the canvas) and Delete. Anonymous users get a
 * sign-in pointer; empty accounts get a save hint.
 */
export default function FlowsSheet({
  open,
  onClose,
  onLoad,
}: {
  open: boolean;
  onClose: () => void;
  onLoad: (flow: SavedFlow) => void;
}) {
  const [flows, setFlows] = useState<SavedFlow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    api.flows
      .list()
      .then((list) => !cancelled && setFlows(list))
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : "";
        setError(msg.toLowerCase().includes("sign in") ? "auth" : "server");
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  /** Close + reset so the next open re-fetches with clean state (event, not effect). */
  const close = () => {
    setFlows(null);
    setError(null);
    onClose();
  };

  const remove = async (id: string) => {
    setBusyId(id);
    try {
      await api.flows.remove({ id });
      setFlows((fs) => fs?.filter((f) => f.id !== id) ?? null);
    } catch {
      setError("server");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Sheet open={open} onClose={close} title="My flows">
      {error === "auth" && (
        <div className="mb-3 rounded-2xl bg-gray-50 px-4 py-4 text-[13px] leading-snug text-gray-500">
          Flows are saved per account.{" "}
          <Link to="/auth" className="font-bold text-[#3f6b4f]">
            Sign in via /auth
          </Link>{" "}
          to see yours.
        </div>
      )}
      {error === "server" && (
        <div className="mb-3 rounded-2xl bg-[#FBE9EC] px-4 py-4 text-[13px] font-medium text-[#C0435A]">
          Couldn't reach the server - is `bun run dev:all` running?
        </div>
      )}

      {!error && flows === null && <div className="px-2 py-8 text-center text-[12.5px] text-gray-400">Loading…</div>}

      {!error && flows !== null && flows.length === 0 && (
        <div className="flex flex-col items-center px-4 py-10 text-center">
          <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100 text-gray-300">
            <FolderOpen size={24} />
          </span>
          <div className="text-[14px] font-bold text-[#1a1a1a]">No saved flows yet</div>
          <div className="mt-1 text-[12px] leading-snug text-gray-400">
            Build a scenario on the canvas, then tap Save in the toolbar.
          </div>
        </div>
      )}

      {!error &&
        flows?.map((f) => (
          <div key={f.id} className="mb-2 flex items-center justify-between gap-3 rounded-2xl bg-gray-50 px-4 py-3">
            <div className="min-w-0">
              <div className="truncate text-[14px] font-semibold text-[#1a1a1a]">{f.name}</div>
              <div className="text-[11.5px] text-gray-400">
                {f.nodes.length} modules · {relativeTime(f.updatedAt)}
              </div>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                onClick={() => onLoad(f)}
                className="rounded-full bg-[#1a1a1a] px-4 py-1.5 text-[12px] font-bold text-white transition active:scale-95"
              >
                Load
              </button>
              <button
                onClick={() => void remove(f.id)}
                disabled={busyId === f.id}
                aria-label={`Delete ${f.name}`}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-[#C0435A] shadow-sm transition active:scale-95 disabled:opacity-40"
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        ))}
    </Sheet>
  );
}
