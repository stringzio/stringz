import { Monitor } from "lucide-react";

/**
 * Shown in place of the builder on small screens. Node-graph editing is a
 * desktop experience across the category (n8n/Zapier/Make are all desktop-only
 * for building), so we steer phone users to a bigger screen while still letting
 * them look around via "Continue anyway".
 */
export default function MobileCanvasGate({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center bg-white px-8 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100">
        <Monitor size={28} className="text-[#1a1a1a]" />
      </div>
      <h1 className="mt-6 text-[22px] font-bold leading-tight text-[#1a1a1a]">
        The Stringz canvas isn’t designed for small screens
      </h1>
      <p className="mt-3 max-w-[300px] text-[14px] leading-relaxed text-gray-500">
        The visual builder works best on a laptop or desktop. Open Stringz on a bigger screen to
        design and edit your automations comfortably.
      </p>
      <button
        onClick={onContinue}
        className="mt-7 rounded-full bg-[#1a1a1a] px-6 py-3 text-[13.5px] font-semibold text-white transition active:scale-95"
      >
        Continue anyway
      </button>
    </div>
  );
}
