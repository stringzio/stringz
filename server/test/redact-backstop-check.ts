// Phase 4 Slice 4D local verification: scrubSecretValues semantics.
// Pure function - no DB, no GCS. Pins the API-side backstop contract:
// full-value masking only, <4-char values skipped, partial echoes survive
// (documented accepted residual, matching the runner's pinned semantic).
// Usage: bun run server/test/redact-backstop-check.ts
import { scrubSecretValues } from "../src/scrub";

let failures = 0;
const check = (name: string, cond: boolean, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}: ${name}${detail ? ` (${detail})` : ""}`);
  if (!cond) failures++;
};

const values = ["sk-fake-PLANTEDKEY-1234567890", "short", "abc"];

check(
  "full value masked",
  scrubSecretValues(`error: key sk-fake-PLANTEDKEY-1234567890 rejected`, values) === "error: key *** rejected",
);
check(
  "multiple occurrences all masked",
  scrubSecretValues("sk-fake-PLANTEDKEY-1234567890 and sk-fake-PLANTEDKEY-1234567890", values) === "*** and ***",
);
check(
  "value inside JSON framing masked",
  scrubSecretValues(JSON.stringify({ t: "log", line: "token=sk-fake-PLANTEDKEY-1234567890" }), values).includes("***"),
);
check(
  "<4-char value untouched (too short to mask safely)",
  scrubSecretValues("prefix abc suffix", values) === "prefix abc suffix",
);
check(
  "partial echo survives (accepted residual)",
  scrubSecretValues("plantedkey in lowercase survives", values) === "plantedkey in lowercase survives",
);
check(
  "unrelated line unchanged",
  scrubSecretValues("HTTP 401 from api.openai.com", values) === "HTTP 401 from api.openai.com",
);
check("no values -> no-op", scrubSecretValues("anything at all", []) === "anything at all");

console.log(failures ? `${failures} FAILURES` : "ALL PASS");
process.exit(failures ? 1 : 0);
