/**
 * Per-line NDJSON classification for the live stream tailer (Phase 2).
 * Byte-for-byte parity with classify.sh's classify_emit_events is a hard
 * requirement: entry.sh emits the batch stream from classify.sh after the
 * run, while stream.ts emits the live stream from these functions during
 * the run - the two streams must be identical. Parity is pinned by
 * runner/test/contract-test.ts against the captured-output fixtures.
 */

import fs from "node:fs";

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
 * Phase 3 redaction, mirroring classify.sh's classify_redact exactly: fixed-
 * string replacement of each value with *** (values under 4 chars skipped,
 * same rule on both sides). Raw-line scrub happens BEFORE JSON encoding;
 * parity is pinned by runner/test/contract-test.ts.
 */
export function scrubSecrets(line: string, values: string[]): string {
  let out = line;
  for (const v of values) {
    if (v.length < 4) continue;
    let i = out.indexOf(v);
    while (i >= 0) {
      out = out.slice(0, i) + "***" + out.slice(i + v.length);
      i = out.indexOf(v);
    }
  }
  return out;
}

/** Load the entry.sh secrets-values file (one value per line, >=4 chars kept). */
export function loadSecretValues(file: string | undefined): string[] {
  if (!file || !fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8").split("\n").filter((v) => v.length >= 4);
}

/**
 * The CLI's self-update banner ("Update available! ..." / "Run `cre update`
 * ...") is noise: the runner image pins the CLI on purpose, so the user can
 * never act on it. Dropped before any event is produced, mirroring
 * classify.sh's classify_emit_events filter (parity-pinned).
 */
const UPDATE_BANNER_RE = /Update available!|Run `cre update`/;

/**
 * Classify one raw CLI output line into zero or more NDJSON event strings.
 * Banner lines yield nothing; every other line yields one {"t":"log",...}
 * event, and lines carrying a "[USER LOG] <nodeId>: ..." prefix additionally
 * yield a {"t":"node",...} event right after, preserving stream order.
 */
export function classifyLine(line: string): string[] {
  if (UPDATE_BANNER_RE.test(line)) return [];
  const esc = jsonEncode(line);
  const out = [`{"t":"log","line":"${esc}"}`];
  const m = NODE_RE.exec(line);
  if (m) {
    const id = m[1].replace(/\s+$/, "");
    out.push(`{"t":"node","id":"${jsonEncode(id)}","line":"${esc}"}`);
  }
  return out;
}
