export default function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 640 900" className={className} aria-label="Stringz logo">
      <defs>
        <linearGradient id="fk-g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#DFF0E3" />
          <stop offset="100%" stopColor="#5E8A6F" />
        </linearGradient>
      </defs>
      {/* top node */}
      <path d="M320,20 A90,90 0 1 1 319,20 Z" fill="url(#fk-g)" />
      {/* connector down-right */}
      <path d="M195,270 A52,52 0 0 1 320,218 L410,270 A52,52 0 0 1 320,322 Z" fill="url(#fk-g)" />
      {/* middle node (ring) */}
      <path d="M320,355 A95,95 0 1 1 319,355 Z M320,400 A50,50 0 1 0 319,400 Z" fill="url(#fk-g)" fillRule="evenodd" />
      {/* connector down-left */}
      <path d="M445,630 A52,52 0 0 0 320,578 L230,630 A52,52 0 0 0 320,682 Z" fill="url(#fk-g)" />
      {/* bottom node */}
      <path d="M320,700 A90,90 0 1 1 319,700 Z" fill="url(#fk-g)" />
    </svg>
  );
}
