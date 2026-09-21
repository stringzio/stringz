import LogoMark from "./LogoMark";

/** Shared brand loading state (lazy-route fallback + auth gating).
 *  `fill` sizes it to its parent instead of the viewport for in-page boots. */
export default function FullLoader({ fill = false }: { fill?: boolean }) {
  return (
    <div className={`flex ${fill ? "h-full" : "h-[100dvh]"} w-full items-center justify-center bg-[#F7F9F7]`}>
      <div className="flex flex-col items-center gap-4">
        <span className="flex items-center gap-2.5">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#171717]">
            <LogoMark className="h-6 w-auto" />
          </span>
          <span className="text-[19px] font-extrabold tracking-tight text-[#171717]">Stringz</span>
        </span>
        <div className="h-1 w-24 overflow-hidden rounded-full bg-gray-200">
          <div className="h-full w-1/3 animate-loader-slide rounded-full bg-[#3F6B4F]" />
        </div>
      </div>
    </div>
  );
}
