import { useEffect } from "react";
import { Command } from "cmdk";
import { Search } from "lucide-react";
import { SERVICES, type ServiceId } from "../data/services";

/**
 * Keyboard-first node search (Phase 3d): Cmd/Ctrl+K opens it, typing filters
 * every module, Enter adds it to the canvas. Complements the tools panel.
 */
export default function AddPalette({
  open,
  onClose,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (service: ServiceId) => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="absolute inset-0 z-40 flex items-start justify-center pt-24" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[min(520px,92%)] overflow-hidden rounded-[26px] bg-white shadow-[0_30px_70px_-20px_rgba(30,50,38,0.45)]"
      >
        <Command
          label="Add a module"
          loop
          filter={(value, search) => (value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0)}
        >
          <div className="flex items-center gap-2.5 border-b border-gray-100 px-4">
            <Search size={15} className="text-gray-400" />
            <Command.Input
              autoFocus
              placeholder="Search modules and actions…"
              className="w-full bg-transparent py-3.5 text-[14px] font-medium text-[#1a1a1a] outline-none placeholder:text-gray-300"
            />
          </div>
          <Command.List className="no-scrollbar max-h-[340px] overflow-y-auto p-2">
            <Command.Empty className="px-4 py-8 text-center text-[12.5px] text-gray-400">
              No modules match.
            </Command.Empty>
            {(Object.keys(SERVICES) as ServiceId[]).map((sid) => (
              <Command.Item
                key={sid}
                value={`${SERVICES[sid].name} ${sid} ${SERVICES[sid].actions.join(" ")}`}
                onSelect={() => {
                  onAdd(sid);
                  onClose();
                }}
                className="flex cursor-pointer items-center gap-3 rounded-2xl px-3 py-2.5 data-[selected=true]:bg-gray-50 [&>svg]:h-6 [&>svg]:w-6"
              >
                {SERVICES[sid].icon}
                <span>
                  <span className="block text-[13.5px] font-bold text-[#1a1a1a]">{SERVICES[sid].name}</span>
                  <span className="block text-[11px] text-gray-400">{SERVICES[sid].actions.join(" · ")}</span>
                </span>
              </Command.Item>
            ))}
          </Command.List>
          <div className="border-t border-gray-100 px-4 py-2.5 text-[10.5px] font-medium text-gray-300">
            Enter to add - Esc to close
          </div>
        </Command>
      </div>
    </div>
  );
}
