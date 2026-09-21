import { useState } from "react";
import { FileSearch, Loader2 } from "lucide-react";
import type { FlowNode } from "../data/services";
import { CHAIN_IDS } from "../lib/chainIds";

interface AbiFunction {
  name: string;
  inputs: { name: string; type: string }[];
  stateMutability?: string;
}

function extractFunctions(abi: unknown[]): AbiFunction[] {
  return abi
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    .filter((item) => item.type === "function")
    .map((item) => ({
      name: String(item.name ?? ""),
      inputs: Array.isArray(item.inputs)
        ? (item.inputs as { name?: string; type?: string }[]).map((i) => ({ name: i.name ?? "", type: i.type ?? "" }))
        : [],
      stateMutability: typeof item.stateMutability === "string" ? item.stateMutability : undefined,
    }))
    .filter((f) => f.name);
}

/**
 * ABI autodetect (Phase 3d): paste a verified contract address, pick the
 * chain, fetch the ABI through our Sourcify proxy, then pick a function -
 * the sheet's ABI/function/args fields fill themselves.
 */
export default function AbiFetcher({
  node,
  onParam,
}: {
  node: FlowNode;
  onParam: (key: string, value: string) => void;
}) {
  const [state, setState] = useState<"idle" | "loading" | "error" | "done">("idle");
  const [error, setError] = useState("");
  const [functions, setFunctions] = useState<AbiFunction[]>([]);
  const [contractName, setContractName] = useState<string | null>(null);

  const address = node.params?.contractAddress?.trim() ?? "";
  const chain = node.chain ?? "ethereum";

  const fetchAbi = () => {
    if (!address || state === "loading") return;
    setState("loading");
    setError("");
    fetch(`/api/abi?chain=${chain}&address=${encodeURIComponent(address)}`)
      .then(async (res) => {
        const body = (await res.json()) as { ok?: boolean; abi?: unknown[]; contractName?: string | null; error?: string };
        if (!res.ok || !body.ok || !body.abi) throw new Error(body.error ?? "Lookup failed.");
        onParam("abi", JSON.stringify(body.abi));
        setFunctions(extractFunctions(body.abi));
        setContractName(body.contractName ?? null);
        setState("done");
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Lookup failed.");
        setFunctions([]);
        setState("error");
      });
  };

  const pickFunction = (fn: AbiFunction) => {
    onParam("functionName", fn.name);
    onParam("args", fn.inputs.map((i) => i.name).filter(Boolean).join(", "));
  };

  return (
    <div className="mb-4">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">ABI autodetect</div>
      <button
        onClick={fetchAbi}
        disabled={!address || state === "loading"}
        className="flex w-full items-center justify-center gap-2 rounded-full bg-gray-100 py-2.5 text-[12.5px] font-semibold text-[#1a1a1a] transition active:scale-[0.98] disabled:opacity-40"
      >
        {state === "loading" ? <Loader2 size={14} className="animate-spin" /> : <FileSearch size={14} />}
        {state === "loading" ? "Fetching verified ABI…" : `Fetch ABI from Sourcify (${chain}, chain ${CHAIN_IDS[chain]})`}
      </button>
      {state === "error" && <div className="mt-1.5 text-[11.5px] font-medium text-[#C0435A]">{error}</div>}
      {state === "done" && (
        <div className="mt-2">
          <div className="mb-1.5 text-[11.5px] text-gray-400">
            {functions.length} function{functions.length === 1 ? "" : "s"} found{contractName ? ` in ${contractName}` : ""} - tap to fill the fields:
          </div>
          <div className="no-scrollbar flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
            {functions.map((fn) => (
              <button
                key={fn.name}
                onClick={() => pickFunction(fn)}
                className={`rounded-full px-3 py-1.5 text-[11.5px] font-semibold transition active:scale-95 ${
                  fn.stateMutability === "view" || fn.stateMutability === "pure"
                    ? "bg-[#EAF2EA] text-[#3f6b4f]"
                    : "bg-[#FDF3E3] text-[#b0803a]"
                }`}
                title={`${fn.name}(${(fn.stateMutability ?? "nonpayable")})`}
              >
                {fn.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
