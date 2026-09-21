import { useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Menu, Settings2, Plus, ArrowLeftRight, UserPlus, UsersRound,
  KeyRound, Webhook, Copy, ArrowRight, Eye,
} from "lucide-react";
import Toast, { type ToastData } from "../components/Toast";
import ProSheet from "../components/ProSheet";

type Tab = "org" | "teams" | "users";

const TEAMS = [
  { name: "Treasury ops", members: 6, admins: 1, colors: ["#F6CBD6", "#B9CFDD", "#E5F1E5"] },
  { name: "Automation crew", members: 4, admins: 1, colors: ["#EAE7FA", "#FDF3EC"] },
  { name: "Community", members: 3, admins: 1, colors: ["#E2EFFA", "#FAE9ED"] },
];

const PENDING_INVITES = [
  { email: "kai@acme.xyz", when: "2d ago" },
  { email: "rio@acme.xyz", when: "5h ago" },
];

const USERS = [
  { name: "Ava Kim", initial: "AK", color: "#3f6b4f" },
  { name: "Marco Ruiz", initial: "MR", color: "#5B5FC7" },
  { name: "Lena Park", initial: "LP", color: "#C0435A" },
  { name: "Tom Adler", initial: "TA", color: "#b07d2b" },
];

const ACTIVITY = [
  { who: "Ava", what: "created", flow: "Price alert", target: "swap", when: "2h ago" },
  { who: "Marco", what: "connected wallet", flow: null, target: null, when: "4h ago" },
  { who: "Lena", what: "invited", flow: "rio@acme.xyz", target: null, when: "5h ago" },
  { who: "Tom", what: "ran", flow: "Whale watcher", target: null, when: "1d ago" },
];

function QuotaCard({
  icon,
  title,
  usedPct,
  big,
  unit,
  filled,
  total,
  fillColor,
  bg,
  delay,
}: {
  icon: React.ReactNode;
  title: string;
  usedPct: string;
  big: string;
  unit: string;
  filled: number;
  total: number;
  fillColor: string;
  bg: string;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 22 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, type: "spring", damping: 26, stiffness: 260 }}
      className="rounded-[28px] p-5"
      style={{ backgroundColor: bg }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/80 text-gray-500">{icon}</span>
          <span className="text-[15px] font-bold text-[#1a1a1a]">{title}</span>
        </div>
        <span className="rounded-full bg-[#1a1a1a] px-3 py-1.5 text-[11px] font-bold text-white">{usedPct} Used</span>
      </div>
      <div className="mt-4 flex items-baseline gap-1.5">
        <span className="text-[42px] font-extrabold leading-none tracking-tight text-[#1a1a1a]">{big}</span>
        <span className="text-[13px] font-medium text-gray-400">/ {unit}</span>
      </div>
      <div className="mt-4 flex gap-1.5">
        {Array.from({ length: total }).map((_, i) => (
          <motion.div
            key={i}
            initial={{ scaleY: 0 }}
            animate={{ scaleY: 1 }}
            transition={{ delay: delay + 0.15 + i * 0.04 }}
            className="h-9 w-7 origin-bottom rounded-full"
            style={
              i < filled
                ? { backgroundColor: fillColor }
                : { border: "1.5px dashed #c3c9d6", backgroundColor: "transparent" }
            }
          />
        ))}
      </div>
    </motion.div>
  );
}

export default function OrgScreen({
  desktop = false,
  onBack,
  onNewScenario,
  onOpenSettings,
}: {
  desktop?: boolean;
  onBack: () => void;
  onNewScenario: () => void;
  onOpenSettings: () => void;
}) {
  const [tab, setTab] = useState<Tab>("org");
  const [toast, setToast] = useState<ToastData | null>(null);
  const [proFeature, setProFeature] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastSeq = useRef(0);
  const [roles, setRoles] = useState<Record<string, "Admin" | "Member">>({
    "Marco Ruiz": "Admin",
    "Lena Park": "Member",
    "Tom Adler": "Member",
  });

  const showToast = (text: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastSeq.current += 1;
    setToast({ id: toastSeq.current, text });
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  };

  const cycleRole = (name: string) => {
    setRoles((r) => ({ ...r, [name]: r[name] === "Admin" ? "Member" : "Admin" }));
    showToast("Role changes land with the cloud backend");
  };

  return (
    <div className="relative h-full w-full overflow-hidden bg-white">
      {/* dotted backdrop */}
      <div
        className="absolute inset-0"
        style={{ backgroundImage: "radial-gradient(#e5eae5 1.3px, transparent 1.3px)", backgroundSize: "20px 20px" }}
      />

      <div className="no-scrollbar relative h-full overflow-y-auto px-5 pb-24 pt-14">
        {/* top row */}
        <div className="flex items-center justify-between">
          {!desktop && (
            <button
              onClick={onBack}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-[#1a1a1a] text-white shadow-md transition active:scale-95"
              aria-label="Back"
            >
              <Menu size={18} />
            </button>
          )}
          <div className="flex items-center gap-2">
            <button
              onClick={onOpenSettings}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-md transition active:scale-95"
              aria-label="Settings"
            >
              <Settings2 size={18} className="text-[#1a1a1a]" />
            </button>
            <button
              onClick={onNewScenario}
              className="flex items-center gap-1.5 rounded-full bg-white px-4 py-3 text-[13px] font-bold text-[#1a1a1a] shadow-md transition active:scale-95"
            >
              <Plus size={15} /> New scenario
            </button>
          </div>
        </div>

        <h1 className="mt-5 text-[28px] font-extrabold tracking-tight text-[#1a1a1a]">My Organization</h1>

        {/* coming-soon notice: the data below is a design preview */}
        <div className="mt-4 flex items-start gap-2.5 rounded-2xl bg-[#FDF3E3] px-4 py-3">
          <Eye size={15} className="mt-0.5 shrink-0 text-[#b07d2b]" />
          <p className="text-[12px] leading-snug text-[#7a5a22]">
            <span className="font-bold">Preview.</span> Organizations are coming soon as a Pro feature - the data
            below shows exactly how this screen will work once teams land.
          </p>
        </div>

        {/* tabs */}
        <div className="mt-4 flex gap-2">
          {([
            { key: "org", label: "Organization" },
            { key: "teams", label: "Teams" },
            { key: "users", label: "Users" },
          ] as const).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`rounded-full px-4 py-2.5 text-[13px] font-semibold transition ${
                tab === t.key ? "bg-[#1a1a1a] text-white" : "bg-white text-gray-500 shadow-sm"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* org tab */}
        {tab === "org" && (
          <div className="mt-5 space-y-4">
            {/* org profile */}
            <motion.div
              initial={{ opacity: 0, y: 22 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05, type: "spring", damping: 26, stiffness: 260 }}
              className="flex items-center gap-3 rounded-[24px] bg-white p-4 ring-1 ring-black/[0.05]"
            >
              <span
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-[15px] font-extrabold"
                style={{ backgroundColor: "#EAF2EA", color: "#3f6b4f" }}
              >
                AD
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-bold text-[#1a1a1a]">Acme DAO</div>
                <div className="text-[11.5px] text-gray-400">12 members</div>
              </div>
              <span className="shrink-0 rounded-full bg-[#1a1a1a] px-3 py-1.5 text-[11px] font-bold text-white">Community</span>
            </motion.div>

            <QuotaCard
              icon={<Settings2 size={16} />}
              title="Executions"
              usedPct="72%"
              big="780"
              unit="1 000"
              filled={5}
              total={8}
              fillColor="#A9B3F0"
              bg="#EDF0FB"
              delay={0.1}
            />
            <QuotaCard
              icon={<ArrowLeftRight size={16} />}
              title="Gas budget"
              usedPct="32%"
              big="0.163"
              unit="0.5 ETH"
              filled={3}
              total={8}
              fillColor="#A9C6D4"
              bg="#E9F2F4"
              delay={0.17}
            />

            {/* API access */}
            <motion.div
              initial={{ opacity: 0, y: 22 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.24, type: "spring", damping: 26, stiffness: 260 }}
              className="rounded-[24px] bg-white p-4 ring-1 ring-black/[0.05]"
            >
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#EDF0FB] text-gray-500">
                  <KeyRound size={16} />
                </span>
                <div>
                  <div className="text-[14.5px] font-bold text-[#1a1a1a]">API access</div>
                  <div className="text-[11.5px] text-gray-400">Trigger runs and read quotas from your stack</div>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between gap-2 rounded-2xl bg-gray-50 px-3.5 py-3">
                <span className="truncate font-mono text-[12.5px] font-semibold text-[#1a1a1a]">fk_live_••••••••3fA9</span>
                <button
                  onClick={() => showToast("API keys open with the cloud backend")}
                  className="flex shrink-0 items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[11.5px] font-semibold text-gray-600 shadow-sm transition active:scale-95"
                >
                  <Copy size={12} /> Copy
                </button>
              </div>
              <button
                onClick={() => setProFeature("Organization API keys")}
                className="mt-3 w-full rounded-full bg-[#1a1a1a] py-3 text-[13.5px] font-semibold text-white transition active:scale-[0.98]"
              >
                Create key
              </button>
            </motion.div>

            {/* organization webhook */}
            <motion.div
              initial={{ opacity: 0, y: 22 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.31, type: "spring", damping: 26, stiffness: 260 }}
              className="rounded-[24px] bg-white p-4 ring-1 ring-black/[0.05]"
            >
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#E9F2F4] text-gray-500">
                  <Webhook size={16} />
                </span>
                <div>
                  <div className="text-[14.5px] font-bold text-[#1a1a1a]">Organization webhook</div>
                  <div className="text-[11.5px] text-gray-400">POST run results to your own endpoint</div>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between gap-2 rounded-2xl bg-gray-50 px-3.5 py-3">
                <span className="truncate font-mono text-[12px] font-semibold text-[#1a1a1a]">
                  https://hooks.stringz.io/acme-dao
                </span>
                <button
                  onClick={() => showToast("Webhooks open with the cloud backend")}
                  className="flex shrink-0 items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[11.5px] font-semibold text-gray-600 shadow-sm transition active:scale-95"
                >
                  <Copy size={12} /> Copy
                </button>
              </div>
            </motion.div>

            <motion.button
              initial={{ opacity: 0, y: 22 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.38 }}
              onClick={() => setProFeature("Team seats and headroom")}
              className="w-full rounded-[28px] bg-[#1a1a1a] p-5 text-left transition active:scale-[0.99]"
            >
              <div className="text-[15px] font-bold text-white">Need more headroom?</div>
              <div className="mt-0.5 text-[12px] text-gray-400">Upgrade to Pro for team seats, monitoring and a bigger vault.</div>
            </motion.button>
          </div>
        )}

        {/* teams tab */}
        {tab === "teams" && (
          <div className="mt-5 space-y-3">
            {TEAMS.map((t, i) => (
              <motion.button
                key={t.name}
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.06 * i }}
                onClick={() => showToast(`Opening ${t.name}…`)}
                className="flex w-full items-center justify-between rounded-[24px] bg-white p-4 text-left ring-1 ring-black/[0.05] transition active:scale-[0.99]"
              >
                <div className="flex items-center gap-3">
                  <div className="flex -space-x-2">
                    {t.colors.map((c, j) => (
                      <span key={j} className="h-9 w-9 rounded-full border-2 border-white" style={{ backgroundColor: c }} />
                    ))}
                  </div>
                  <div>
                    <div className="text-[14.5px] font-bold text-[#1a1a1a]">{t.name}</div>
                    <div className="text-[11.5px] text-gray-400">{t.members} members</div>
                    <div className="text-[11.5px] text-gray-400">
                      {t.admins} admin - {t.members - t.admins} members
                    </div>
                  </div>
                </div>
                <UsersRound size={17} className="text-gray-300" />
              </motion.button>
            ))}

            {/* pending invites */}
            <div className="pt-1">
              <div className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                {PENDING_INVITES.length} pending invites
              </div>
              {PENDING_INVITES.map((inv) => (
                <div
                  key={inv.email}
                  className="mb-2 flex items-center justify-between rounded-[24px] bg-white p-4 ring-1 ring-black/[0.05]"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#FDF3E3] text-[#b07d2b]">
                      <UserPlus size={15} />
                    </span>
                    <div>
                      <div className="text-[13.5px] font-bold text-[#1a1a1a]">{inv.email}</div>
                      <div className="text-[11.5px] text-gray-400">Invited {inv.when}</div>
                    </div>
                  </div>
                  <button
                    onClick={() => showToast("Invites open when team sync ships")}
                    className="rounded-full bg-gray-100 px-3.5 py-1.5 text-[11.5px] font-semibold text-gray-500 transition active:scale-95"
                  >
                    Revoke
                  </button>
                </div>
              ))}
            </div>

            <button
              onClick={() => showToast("Teams are coming soon")}
              className="flex w-full items-center justify-center gap-2 rounded-full border-2 border-dashed border-gray-200 py-3.5 text-[13.5px] font-semibold text-gray-500 transition active:scale-[0.99]"
            >
              <Plus size={15} /> Create team
            </button>
          </div>
        )}

        {/* users tab */}
        {tab === "users" && (
          <div className="mt-5 space-y-3">
            {USERS.map((u, i) => {
              const role = u.name === "Ava Kim" ? "Owner" : roles[u.name];
              return (
                <motion.div
                  key={u.name}
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.06 * i }}
                  className="flex items-center justify-between rounded-[24px] bg-white p-4 ring-1 ring-black/[0.05]"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="flex h-10 w-10 items-center justify-center rounded-full text-[12px] font-bold text-white"
                      style={{ backgroundColor: u.color }}
                    >
                      {u.initial}
                    </span>
                    <div>
                      <div className="text-[14.5px] font-bold text-[#1a1a1a]">{u.name}</div>
                      <div className="text-[11.5px] text-gray-400">{role}</div>
                    </div>
                  </div>
                  {role !== "Owner" && (
                    <button
                      onClick={() => cycleRole(u.name)}
                      className="rounded-full bg-gray-100 px-3.5 py-1.5 text-[11.5px] font-semibold text-gray-500 transition active:scale-95"
                    >
                      Manage
                    </button>
                  )}
                </motion.div>
              );
            })}
            <button
              onClick={() => showToast("Invites open when team sync ships")}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-[#1a1a1a] py-3.5 text-[13.5px] font-semibold text-white transition active:scale-[0.99]"
            >
              <UserPlus size={15} /> Invite member
            </button>

            {/* recent activity */}
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="rounded-[24px] bg-white p-4 ring-1 ring-black/[0.05]"
            >
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                Recent activity - preview of the team feed
              </div>
              {ACTIVITY.map((a, i) => (
                <div key={i} className="flex items-center gap-2.5 border-b border-gray-50 py-2.5 last:border-0">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-gray-300" />
                  <div className="min-w-0 flex-1 truncate text-[12.5px]">
                    <span className="font-bold text-[#1a1a1a]">{a.who}</span>{" "}
                    <span className="text-gray-500">{a.what}</span>{" "}
                    {a.flow && (
                      <span className="inline-flex translate-y-[1px] items-center gap-1 font-semibold text-[#1a1a1a]">
                        {a.flow}
                        {a.target && (
                          <>
                            <ArrowRight size={11} className="text-gray-400" />
                            {a.target}
                          </>
                        )}
                      </span>
                    )}
                  </div>
                  <span className="shrink-0 text-[11px] text-gray-400">{a.when}</span>
                </div>
              ))}
            </motion.div>
          </div>
        )}
      </div>

      <Toast toast={toast} />
      <ProSheet open={!!proFeature} onClose={() => setProFeature(null)} feature={proFeature ?? undefined} />
    </div>
  );
}
