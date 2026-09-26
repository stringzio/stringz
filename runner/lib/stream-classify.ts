/**
 * Per-line NDJSON classification for the live stream tailer (Phase 2).
 * Byte-for-byte parity with classify.sh's classify_emit_events is a hard
 * requirement: entry.sh emits the batch stream from classify.sh after the
 * run, while stream.ts emits the live stream from these functions during
 * the run - the two streams must be identical. Parity is pinned by
 * runner/test/contract-test.ts against the captured-output fixtures.
 */

/** JSON-encode a string: backslash first, then quote, tab, newline. Same
 *  order and rules as classify_json_encode in classify.sh. */
export function jsonEncode(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\t/g, "\\t")
    .replace(/\n/g, "\\n");
}

/** Same shape as classify.sh's `\[USER LOG\][[:space:]]+([^:]+):` match. */
const NODE_RE = /\[USER LOG\]\s+([^:]+):/;

/**
 * Classify one raw CLI output line into zero or more NDJSON event strings.
 * Every line yields one {"t":"log",...} event; lines carrying a
 * "[USER LOG] <nodeId>: ..." prefix additionally yield a {"t":"node",...}
 * event right after, preserving stream order.
 */
export function classifyLine(line: string): string[] {
  const esc = jsonEncode(line);
  const out = [`{"t":"log","line":"${esc}"}`];
  const m = NODE_RE.exec(line);
  if (m) {
    const id = m[1].replace(/\s+$/, "");
    out.push(`{"t":"node","id":"${jsonEncode(id)}","line":"${esc}"}`);
  }
  return out;
}
