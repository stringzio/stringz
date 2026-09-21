import { Link } from "react-router";
import { Home, Shapes, Users, BarChart3, Settings, CircleHelp } from "lucide-react";
import LogoMark from "./LogoMark";
import type { PublicUser } from "../lib/contract";
import type { Screen } from "../types";

const NAV: { key: Screen; icon: React.ElementType; label: string }[] = [
  { key: "canvas", icon: Home, label: "Canvas" },
  { key: "templates", icon: Shapes, label: "Templates" },
  { key: "org", icon: Users, label: "Organization" },
  { key: "stats", icon: BarChart3, label: "Statistics" },
];

export default function DesktopSidebar({
  active,
  onNavigate,
  user,
}: {
  active: Screen;
  onNavigate: (s: Screen) => void;
  user?: PublicUser | null;
}) {
  const initial = (user?.name?.trim()?.[0] ?? user?.email?.trim()?.[0] ?? "S").toUpperCase();
  return (
    <div className="flex w-[84px] shrink-0 flex-col items-center bg-[#141414] py-5">
      {/* logo mark — back to marketing site */}
      <Link
        to="/"
        title="Back to stringz.io"
        aria-label="Back to home"
        className="mb-8 flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 transition hover:bg-white/20 active:scale-95"
      >
        <LogoMark className="h-6 w-auto" />
      </Link>

      <div className="flex flex-col items-center gap-2.5">
        {NAV.map(({ key, icon: Icon, label }) => (
          <button
            key={key}
            onClick={() => onNavigate(key)}
            title={label}
            aria-label={label}
            className={`flex h-11 w-11 items-center justify-center rounded-full transition active:scale-90 ${
              active === key ? "bg-white text-[#141414]" : "text-gray-400 hover:text-white"
            }`}
          >
            <Icon size={19} />
          </button>
        ))}
      </div>

      <div className="mt-auto flex flex-col items-center gap-2.5">
        <button
          title="Help"
          aria-label="Help"
          className="flex h-11 w-11 items-center justify-center rounded-full text-gray-400 transition hover:text-white active:scale-90"
        >
          <CircleHelp size={19} />
        </button>
        <button
          title="Settings"
          aria-label="Settings"
          onClick={() => onNavigate("settings")}
          className={`flex h-11 w-11 items-center justify-center rounded-full transition active:scale-90 ${
            active === "settings" ? "bg-white text-[#141414]" : "text-gray-400 hover:text-white"
          }`}
        >
          <Settings size={19} />
        </button>
        <div
          title={user?.name ?? user?.email ?? "Profile"}
          className="mt-2 flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-[#3f6b4f] to-[#7ba488] text-[13px] font-bold text-white ring-2 ring-white/20"
        >
          {user?.avatar ? (
            <img src={user.avatar} alt="" className="h-full w-full object-cover" />
          ) : (
            initial
          )}
        </div>
      </div>
    </div>
  );
}
