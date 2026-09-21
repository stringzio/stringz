import React from "react";
import { Signal, Wifi, BatteryFull } from "lucide-react";

export default function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="min-h-screen w-full flex items-center justify-center p-0 sm:p-6"
      style={{
        background: "linear-gradient(160deg, #cfe0d1 0%, #c4d8c8 45%, #b9d0bf 100%)",
      }}
    >
      {/* soft decorative blobs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden hidden sm:block">
        <div className="absolute -top-24 -left-24 h-96 w-96 rounded-full bg-white/20 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-[28rem] w-[28rem] rounded-full bg-[#9fbcaa]/30 blur-3xl" />
      </div>

      <div className="relative w-full h-[100dvh] sm:h-[min(900px,94vh)] sm:w-[410px] sm:rounded-[3.4rem] sm:border-[10px] sm:border-[#111] sm:shadow-[0_40px_90px_-20px_rgba(20,40,28,0.55)] bg-white overflow-hidden">
        {/* status bar - only inside the decorative desktop frame; a real
            phone already paints its own status bar over the app */}
        <div className="absolute top-0 inset-x-0 z-40 hidden sm:flex items-center justify-between px-7 pt-3.5 pointer-events-none">
          <span className="text-[13px] font-semibold text-[#1a1a1a] tracking-tight">9:41</span>
          <div className="flex items-center gap-1.5 text-[#1a1a1a]">
            <Signal size={14} strokeWidth={2.4} />
            <Wifi size={14} strokeWidth={2.4} />
            <BatteryFull size={16} strokeWidth={2} />
          </div>
        </div>
        {/* dynamic island */}
        <div className="absolute top-2.5 left-1/2 -translate-x-1/2 z-40 h-[26px] w-[104px] rounded-full bg-black hidden sm:block" />

        <div className="h-full w-full">{children}</div>

        {/* home indicator - same: only inside the desktop frame */}
        <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 z-40 hidden sm:block h-1 w-32 rounded-full bg-black/80 pointer-events-none" />
      </div>
    </div>
  );
}
