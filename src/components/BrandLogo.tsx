import LogoMark from "./LogoMark";

export default function BrandLogo({ dark = false }: { dark?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <span
        className={`flex h-9 w-9 items-center justify-center rounded-[12px] ${
          dark ? "bg-white/10" : "bg-[#171717]"
        }`}
      >
        <LogoMark className="h-6 w-auto" />
      </span>
      <span
        className={`text-[19px] font-extrabold tracking-tight ${
          dark ? "text-white" : "text-[#171717]"
        }`}
      >
        Stringz
      </span>
    </span>
  );
}
