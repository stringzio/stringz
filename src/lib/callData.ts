import { encodeFunctionData, type Abi } from "viem";

/**
 * Encode calldata for contract-call nodes from the sheet config
 * (ABI JSON + function name + comma-separated args). Shared by the CRE
 * compiler (config.contracts callData) and the transaction preview.
 * Returns "0x" while the config is incomplete (no ABI or no function yet);
 * throws a descriptive error when the ABI is present but invalid or the
 * call cannot be encoded - the CRE compiler wraps that in a BlueprintError.
 */
export function splitArgs(raw: string): unknown[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      if (/^0x[0-9a-fA-F]{40}$/.test(s)) return s; // address
      if (/^-?\d+$/.test(s)) return BigInt(s); // integer
      if (/^-?\d*\.\d+$/.test(s)) return s; // decimal: leave typing to the ABI
      return s;
    });
}

export function encodeCallData(p: Record<string, string>): `0x${string}` {
  const abiRaw = p.abi?.trim();
  const functionName = p.functionName?.trim();
  if (!abiRaw || !functionName) return "0x";
  let abi: unknown;
  try {
    abi = JSON.parse(abiRaw);
  } catch (err) {
    throw new Error(`the ABI is not valid JSON (${err instanceof Error ? err.message : String(err)})`);
  }
  try {
    return encodeFunctionData({ abi: abi as Abi, functionName, args: splitArgs(p.args ?? "") });
  } catch (err) {
    throw new Error(
      `cannot encode ${functionName}(${p.args ?? ""}) from this ABI - ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/** Short human label for preview rows. */
export function describeCall(p: Record<string, string>): { label: string; detail: string } {
  if (p.functionName) {
    return { label: p.functionName, detail: `(${p.args || "no args"})` };
  }
  return { label: "Contract call", detail: "set a function to encode calldata" };
}
