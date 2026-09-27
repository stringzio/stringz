/** Full-value secret masking shared by the API-side log-redaction backstop
 *  (Phase 4 Slice 4D). Same semantic as the runner's scrubbers: values under
 *  4 characters are skipped (too short to mask safely) and every full-value
 *  match is replaced with "***". Partial echoes are documented accepted
 *  residual - a pinned contract test asserts a partial echo is NOT scrubbed
 *  by the runner, and this backstop matches that semantic on purpose. */

export function scrubSecretValues(line: string, values: string[]): string {
  let out = line;
  for (const v of values) {
    if (v.length >= 4 && out.includes(v)) out = out.split(v).join("***");
  }
  return out;
}
