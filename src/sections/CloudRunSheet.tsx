import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, CircleDashed, Cloud, KeyRound, Loader2, XCircle } from "lucide-react";
import Sheet from "../components/Sheet";
import { isTerminal, type CloudRunState } from "../lib/cloudSim";

/**
 * "Test in cloud" result view (issue #11 Phase 2). Shows the live runner
 * output while the cloud run executes and the final per-node results after.
 * CloudRunDetail is also reused by the stats screen for history replay.
 */

const STATUS_META: Record<string, { label: string; className: string }> = {
  preparing: { label: "Compiling your flow", className: "bg-gray-100 text-gray-500" },
  uploading: { label: "Uploading project", className: "bg-gray-100 text-gray-500" },
  queued: { label: "Queued for a runner", className: "bg-[#FDF3E3] text-[#b0803a]" },
  running: { label: "Running on Stringz cloud", className: "bg-[#E9F0F7] text-[#3d5f8a]" },
  succeeded: { label: "Run succeeded", className: "bg-[#EAF2EA] text-[#3f6b4f]" },
  failed: { label: "Run failed", className: "bg-[#FBE9EC] text-[#C0435A]" },
  auth_error: { label: "Runner auth hiccup", className: "bg-[#FBE9EC] text-[#C0435A]" },
  timeout: { label: "Run timed out", className: "bg-[#FBE9EC] text-[#C0435A]" },
  cancelled: { label: "Run cancelled", className: "bg-gray-100 text-gray-500" },
};

/** Strip the "ts [USER LOG] id: " prefix from a node event line. */
function nodeLine(raw: unknown): string {
  const s = typeof raw === "string" ? raw : "";
  const m = /^\S+ \[USER LOG\] [^:]+:([\s\S]*)$/.exec(s);
  return (m ? m[1] : s).trim();
}

function elapsed(state: CloudRunState, now: number): string {
  const s = Math.max(0, Math.round((now - state.startedAt) / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

export function CloudRunDetail({ state, onCancel }: { state: CloudRunState; onCancel?: () => void }) {
  // 0 until the effect ticks (react-hooks/purity forbids Date.now() in render);
  // elapsed() clamps, so the first paint just shows "0s".
  const [now, setNow] = useState(0);
  const logRef = useRef<HTMLDivElement>(null);
  const terminal = isTerminal(state.phase);
  const cancellable = !terminal && (state.phase === "queued" || state.phase === "running");

  useEffect(() => {
    if (terminal) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [terminal]);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [state.events.length]);

  const logs = useMemo(() => state.events.filter((e) => e.t === "log"), [state.events]);
  const nodes = useMemo(() => {
    const byId = new Map<string, string[]>();
    for (const e of state.events) {
      if (e.t !== "node" || typeof e.id !== "string") continue;
      const line = nodeLine(e.line);
      const list = byId.get(e.id) ?? [];
      if (list[list.length - 1] !== line) list.push(line);
      byId.set(e.id, list);
    }
    return [...byId.entries()];
  }, [state.events]);
  const result = useMemo(() => state.events.find((e) => e.t === "result"), [state.events]);
  const meta = STATUS_META[state.phase] ?? STATUS_META.running;

  return (
    <div>
      <div className={`mb-4 flex items-center gap-2.5 rounded-2xl px-4 py-3 ${meta.className}`}>
        {state.phase === "succeeded" ? (
          <CheckCircle2 size={17} />
        ) : state.phase === "failed" || state.phase === "auth_error" || state.phase === "timeout" ? (
          <XCircle size={17} />
        ) : (
          <Loader2 size={17} className="animate-spin" />
        )}
        <span className="text-[13px] font-bold">{meta.label}</span>
        <span className="ml-auto text-[11.5px] font-medium opacity-70">
          {terminal ? "finished" : elapsed(state, now)}
        </span>
      </div>

      {cancellable && onCancel && (
        <button
          onClick={onCancel}
          className="mb-3 w-full rounded-full bg-[#FBE9EC] py-2.5 text-[12.5px] font-semibold text-[#C0435A] transition active:scale-[0.98]"
        >
          Cancel run
        </button>
      )}

      {state.phase === "auth_error" && (
        <p className="mb-3 rounded-2xl bg-gray-50 px-4 py-3 text-[11.5px] leading-snug text-gray-500">
          The cloud runner could not authenticate with Chainlink - that is on our side, not yours. Retry in a few
          minutes; if it keeps happening, tell us.
        </p>
      )}
      {!terminal && state.phase !== "auth_error" && (
        <p className="mb-3 flex items-center gap-1.5 rounded-2xl bg-gray-50 px-4 py-3 text-[11.5px] leading-snug text-gray-500">
          <Cloud size={13} className="shrink-0" />
          {state.phase === "queued"
            ? "Handing your run to a runner. The runner cold-starts on first launch, then setup lines stream into the log below - first lines land within about a minute."
            : "Spinning up an isolated runner - on a fresh node this takes 2-4 minutes (image pull, then download, install, compile). Log lines appear here as they happen."}
        </p>
      )}

      {nodes.length > 0 && (
        <div className="mb-3">
          <div className="mb-1.5 text-[10.5px] font-bold uppercase tracking-wider text-gray-400">Node outputs</div>
          <div className="space-y-1.5">
            {nodes.map(([id, lines]) => (
              <div key={id} className="rounded-xl bg-gray-50 px-3.5 py-2.5">
                <div className="text-[10.5px] font-bold uppercase tracking-wider text-[#3d5f8a]">{id}</div>
                {lines.slice(-3).map((l, i) => (
                  <pre key={i} className="mt-1 whitespace-pre-wrap font-mono text-[11px] leading-snug text-[#1a1a1a]">
                    {l}
                  </pre>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mb-3">
        <div className="mb-1.5 text-[10.5px] font-bold uppercase tracking-wider text-gray-400">Runner log</div>
        <div ref={logRef} className="no-scrollbar max-h-56 overflow-y-auto rounded-2xl bg-[#1a1a1a] p-3.5">
          {logs.length === 0 ? (
            <span className="font-mono text-[11px] text-gray-500">waiting for output…</span>
          ) : (
            logs.slice(-300).map((e, i) => (
              <pre key={i} className="whitespace-pre-wrap font-mono text-[10.5px] leading-relaxed text-[#C8F7C5]">
                {typeof e.line === "string" ? e.line : JSON.stringify(e)}
              </pre>
            ))
          )}
        </div>
      </div>

      {terminal && (
        <div className="rounded-2xl bg-gray-50 px-4 py-3">
          <div className="text-[10.5px] font-bold uppercase tracking-wider text-gray-400">Result</div>
          {state.phase === "succeeded" && result?.result ? (
            <pre className="mt-1.5 whitespace-pre-wrap font-mono text-[12px] leading-snug text-[#3f6b4f]">
              {String(result.result)}
            </pre>
          ) : state.note ? (
            <p className="mt-1.5 text-[12px] leading-snug text-[#C0435A]">{state.note}</p>
          ) : (
            <p className="mt-1.5 text-[12px] leading-snug text-gray-500">
              {state.phase === "succeeded" ? "Finished without a result payload." : "See the runner log above."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** Pre-flight secret entry (Phase 3): one password field per env-var secret
 *  the compiled flow reads. Values go straight into the run's sandbox .env
 *  and are destroyed when the run ends - never stored, never logged, and
 *  scrubbed from every emitted log line by the runner. */
function SecretPreflight({
  requiredSecrets,
  onStart,
}: {
  requiredSecrets: string[];
  onStart: (secrets: Record<string, string>) => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const complete = requiredSecrets.every((s) => (values[s] ?? "").trim().length > 0);

  return (
    <div>
      <p className="mb-1 flex items-center gap-1.5 rounded-2xl bg-[#E9F0F7] px-4 py-3 text-[11.5px] leading-snug text-[#3d5f8a]">
        <KeyRound size={14} className="shrink-0" />
        This flow reads secrets at run time. Paste them once - they exist only inside this run&apos;s isolated sandbox
        and are destroyed when it ends. Stringz never stores or logs them, and the runner scrubs them from every log
        line.
      </p>
      <div className="space-y-3">
        {requiredSecrets.map((name) => (
          <div key={name}>
            <div className="mb-1 font-mono text-[11px] font-bold text-[#1a1a1a]">{name}</div>
            <input
              type="password"
              autoComplete="off"
              placeholder={`Paste ${name}`}
              value={values[name] ?? ""}
              onChange={(e) => setValues((prev) => ({ ...prev, [name]: e.target.value }))}
              className="w-full rounded-2xl bg-gray-50 px-4 py-3 font-mono text-[12.5px] outline-none ring-1 ring-black/[0.06] focus:ring-2 focus:ring-[#3d5f8a]/50"
            />
          </div>
        ))}
      </div>
      <button
        onClick={() => onStart(Object.fromEntries(requiredSecrets.map((s) => [s, values[s].trim()])))}
        disabled={!complete}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-[#1a1a1a] py-3.5 text-[14px] font-semibold text-white transition active:scale-[0.98] disabled:opacity-40"
      >
        <Cloud size={15} /> Start cloud run
      </button>
    </div>
  );
}

export default function CloudRunSheet({
  open,
  onClose,
  state,
  requiredSecrets,
  onStart,
  onCancel,
}: {
  open: boolean;
  onClose: () => void;
  state: CloudRunState | null;
  /** Env-var secrets the compiled flow needs; empty = start immediately. */
  requiredSecrets: string[];
  onStart: (secrets: Record<string, string>) => void;
  /** Phase 4 Slice 4B: kills a queued/running run (server + local stream). */
  onCancel?: () => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title="Test in cloud">
      {state ? (
        <CloudRunDetail state={state} onCancel={onCancel} />
      ) : requiredSecrets.length > 0 ? (
        <SecretPreflight requiredSecrets={requiredSecrets} onStart={onStart} />
      ) : (
        <div className="flex items-center gap-2 rounded-2xl bg-gray-50 px-4 py-3 text-[12.5px] text-gray-500">
          <CircleDashed size={15} /> Preparing your cloud run…
        </div>
      )}
    </Sheet>
  );
}
