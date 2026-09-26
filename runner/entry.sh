#!/usr/bin/env bash
# sim-entry: Stringz simulation runner entrypoint (Phase 1).
#
# ENV INPUTS
#   SRC_URL       required. https:// signed URL (GCS) or file:// absolute path
#                 to a gzipped tarball of the CRE PROJECT ROOT (project.yaml,
#                 <slug>-workflow/, .env.example at the archive top level).
#   RESULT_URL    optional. https:// signed PUT URL (GCS) or file:// absolute
#                 path. The NDJSON event stream is uploaded there after the
#                 run; an upload failure is a stderr warning only and never
#                 changes the status or exit code.
#   RUN_ID        optional. Echoed into the final result event.
#   TRIGGER_IDX   optional, default 0. --trigger-index for the CLI.
#   TARGET        optional, default staging-settings. --target for the CLI.
#   SIM_TIMEOUT   optional, default 150 (seconds). Killed with SIGKILL 10s after.
#   SECRETS_JSON  optional. JSON object merged into the project .env.
#                 Values are written to disk and never logged.
#   CRE_SECRETS   optional, default /secrets/cre. Auth session mount: a
#                 directory (docker -v for local runs) OR a single file
#                 (Secret Manager volume mounts deliver the payload as one
#                 file - base64-encoded session tar.gz per the rotation
#                 runbook, decoded by entry.sh into $HOME/.cre).
#   INGEST_URL    optional (Phase 2). API endpoint that accepts live event
#                 batches; set via job env override at dispatch. Absent in
#                 local runs: the live tailer stays off.
#   INGEST_TOKEN  optional (Phase 2). Per-run HMAC token for INGEST_URL,
#                 delivered the same way. Never logged.
#   SECRETS_URL   optional (Phase 3). Signed GET for the run's ephemeral
#                 secrets JSON ({"ENV_VAR":"value"}). 404 = no secrets.
#                 Values are merged into the project .env (mode 0600, tmpfs)
#                 and recorded in a values file so every emitted log line is
#                 scrubbed of them before it reaches stdout/GCS/ingest.
#   SECRETS_DELETE_URL optional (Phase 3). Signed DELETE the runner uses to
#                 destroy the secrets object at actual run end.
#   SECRETS_JSON  optional. Local-dev equivalent of SECRETS_URL (env-delivered
#                 JSON, same merge + redaction).
#
# OUTPUT CONTRACT
#   stdout: pure NDJSON event stream, one object per line.
#     {"t":"log","line":...}              one per raw CLI output line
#     {"t":"node","id":...,"line":...}    additionally, for "[USER LOG] <id>: ..." lines
#     {"t":"result","status":...,"exitCode":...,"result"?:"...","runId"?:...}
#       status in succeeded|failed|auth_error|timeout, classified from output
#       markers (the CLI's own exit codes are unreliable; see RUNNER.md).
#   stderr: runner diagnostics, prefixed "[sim-entry]". Always human-readable,
#     never contains SECRETS_JSON values.
#   RESULT_URL: when set, the same NDJSON stream is uploaded there after the
#     run (best effort). Upload failures are stderr warnings only.
#
# EXIT CODE (this script's own - trustworthy, unlike the CLI's):
#   0 only when status=succeeded, 1 otherwise (incl. setup failures).

set -u -o pipefail

log() { printf '[sim-entry] %s\n' "$*" >&2; }
die() { log "ERROR: $*"; exit 1; }

# --- locate classify.sh (container install, else repo-relative for local runs)
SIM_LIB="${SIM_LIB:-}"
if [ -z "$SIM_LIB" ]; then
  if [ -f /usr/local/lib/sim/classify.sh ]; then
    SIM_LIB=/usr/local/lib/sim/classify.sh
  else
    SIM_LIB="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/classify.sh"
  fi
fi
# shellcheck source=lib/classify.sh
. "$SIM_LIB" || die "cannot source classify.sh at $SIM_LIB"

# --- locate stream.ts the same way (live tailer, Phase 2; may not exist in
# older image builds - the tailer is optional, so absence only disables it)
STREAM_TS="${STREAM_TS:-}"
if [ -z "$STREAM_TS" ]; then
  if [ -f /usr/local/lib/sim/stream.ts ]; then
    STREAM_TS=/usr/local/lib/sim/stream.ts
  else
    STREAM_TS="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/stream.ts"
  fi
fi

# --- egress scrub: strip ambient proxy and metadata overrides so traffic only
# goes where this script sends it. The runner never uses a proxy, and GCS is
# reached via signed URLs, not application-default credentials, so nothing in
# the run needs the metadata server. Complements the metadata hostname pin
# applied at container start by egress-init (before this script runs).
unset HTTP_PROXY HTTPS_PROXY ALL_PROXY NO_PROXY http_proxy https_proxy all_proxy no_proxy
unset GCE_METADATA_HOST GCE_METADATA_IP GOOGLE_METADATA_REQUEST_HEADERS
log "egress scrub applied (proxy/metadata env stripped; metadata hosts pinned at start)"

# --- validate inputs
[ -n "${SRC_URL:-}" ] || die "SRC_URL is required (https:// signed URL or file:// path to project .tgz)"
TRIGGER_IDX="${TRIGGER_IDX:-0}"
TARGET="${TARGET:-staging-settings}"
SIM_TIMEOUT="${SIM_TIMEOUT:-150}"
RUN_ID="${RUN_ID:-}"
case "$TRIGGER_IDX" in ''|*[!0-9]*) die "TRIGGER_IDX must be a non-negative integer, got '$TRIGGER_IDX'" ;; esac
case "$SIM_TIMEOUT" in ''|*[!0-9]*) die "SIM_TIMEOUT must be seconds as an integer, got '$SIM_TIMEOUT'" ;; esac

log "start run_id='${RUN_ID:-<unset>}' trigger_idx=$TRIGGER_IDX target=$TARGET timeout=${SIM_TIMEOUT}s"

workdir="$(mktemp -d /tmp/simrun.XXXXXX)" || die "mktemp failed"
trap 'rm -rf "$workdir"' EXIT
proj="$workdir/project"
mkdir -p "$proj" || die "cannot create project dir"
rawlog="$workdir/raw.log"
: > "$rawlog"

# --- live stream tailer (Phase 2). Best effort: INGEST_URL/INGEST_TOKEN
# arrive as job env overrides; a tailer problem must never change the run
# outcome, so nothing here is fatal.
stream_pid=""
if [ -n "${INGEST_URL:-}" ] && [ -n "${INGEST_TOKEN:-}" ] && [ -f "$STREAM_TS" ]; then
  INGEST_URL="$INGEST_URL" INGEST_TOKEN="$INGEST_TOKEN" bun "$STREAM_TS" "$rawlog" "$workdir" >&2 &
  stream_pid=$!
  log "live stream tailer started pid=$stream_pid"
elif [ -n "${INGEST_URL:-}" ]; then
  log "WARN INGEST_URL set but stream.ts missing at $STREAM_TS; live stream disabled"
fi

# --- fetch the project archive
tgz="$workdir/project.tgz"
case "$SRC_URL" in
  https://* | http://*)
    log "fetching project archive over HTTPS"
    SRC_URL="$SRC_URL" DEST="$tgz" bun -e '
      const url = process.env.SRC_URL
      const dest = process.env.DEST
      const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(120000) })
      if (!res.ok || !res.body) { console.error(`fetch failed: HTTP ${res.status}`); process.exit(1) }
      const writer = Bun.file(dest).writer()
      for await (const chunk of res.body) writer.write(chunk)
      writer.end()
    ' || die "download failed (see stderr above)"
    ;;
  file://*)
    src_path="${SRC_URL#file://}"
    [ -f "$src_path" ] || die "file:// source not found: $src_path"
    cp "$src_path" "$tgz" || die "cannot copy $src_path"
    log "using local archive $src_path"
    ;;
  *)
    die "unsupported SRC_URL scheme (want https:// or file://): ${SRC_URL%%://*}://"
    ;;
esac

# --- extract and locate the workflow dir
tar -xzf "$tgz" -C "$proj" || die "archive extraction failed (want gzip tarball of the project root)"
wfdir=""
for d in "$proj"/*-workflow; do
  if [ -d "$d" ]; then wfdir="$d"; break; fi
done
[ -n "$wfdir" ] || die "no <slug>-workflow directory found in archive"
[ -f "$proj/project.yaml" ] || die "archive has no project.yaml at its top level"
log "project extracted: $(basename "$wfdir")"

# --- auth session. /secrets/cre from Secret Manager is a read-only FILE
# (the tar.gz archive produced by the rotation runbook), while local docker
# runs mount ~/.cre as a read-only DIRECTORY. The CLI must be able to write
# refreshed OAuth tokens into $HOME/.cre, so we copy/extract it there (a
# read-only mount makes that write fail and surfaces as an auth error with
# exit code 0 - verified).
CRE_SECRETS="${CRE_SECRETS:-/secrets/cre}"
if [ -d "$CRE_SECRETS" ]; then
  cp -r "$CRE_SECRETS" "$HOME/.cre" || die "cannot copy $CRE_SECRETS to \$HOME/.cre"
  log "auth session copied from $CRE_SECRETS (read-only mount -> writable \$HOME/.cre)"
elif [ -f "$CRE_SECRETS" ]; then
  # The secret payload is the session tar.gz BASE64-ENCODED (pure ASCII).
  # Binary payloads do not survive every transport layer intact (gcloud's
  # secrets access re-encodes stdout as UTF-8, and the gzip mount itself
  # failed live), so the rotation runbook stores base64 and we decode here.
  # stdin redirect (not a file arg): GNU base64 takes positional files while
  # BSD base64 needs -i, but both decode stdin with -d.
  base64 -d < "$CRE_SECRETS" | tar -xz -C "$HOME" || die "cannot decode+extract session archive $CRE_SECRETS"
  [ -f "$HOME/.cre/cre.yaml" ] || die "session archive $CRE_SECRETS did not contain .cre/cre.yaml"
  log "auth session decoded+extracted from $CRE_SECRETS (read-only mount -> writable \$HOME/.cre)"
else
  log "WARN: $CRE_SECRETS not mounted; local mock mode, the CLI will report an auth error without a session"
fi

# --- env file: seed from .env.example if the archive carries none, then merge
# the run's ephemeral secrets (SECRETS_URL download or local SECRETS_JSON)
# into the project .env. Values are never logged: they are merged into .env
# (mode 0600, tmpfs) and recorded one-per-line in $workdir/secrets.values so
# the classifiers can scrub them from every emitted event line.
if [ ! -f "$proj/.env" ] && [ -f "$proj/.env.example" ]; then
  cp "$proj/.env.example" "$proj/.env"
  log ".env seeded from .env.example"
fi
secrets_json=""
if [ -n "${SECRETS_URL:-}" ]; then
  log "fetching run secrets over HTTPS"
  SECRETS_URL="$SECRETS_URL" DEST="$workdir/secrets.json" bun -e '
    const url = process.env.SECRETS_URL
    const res = await fetch(url, { signal: AbortSignal.timeout(30000) })
    if (res.status === 404) process.exit(7) // no secrets for this run - fine
    if (!res.ok) { console.error(`secrets fetch failed: HTTP ${res.status}`); process.exit(1) }
    const buf = await res.arrayBuffer()
    await Bun.write(process.env.DEST, buf)
  '
  fetch_code=$?
  if [ "$fetch_code" -eq 7 ]; then
    log "no run secrets (404) - continuing without"
  elif [ "$fetch_code" -ne 0 ]; then
    die "secrets download failed (see stderr above)"
  else
    secrets_json="$(cat "$workdir/secrets.json")"
    log "run secrets downloaded (values redacted)"
  fi
elif [ -n "${SECRETS_JSON:-}" ]; then
  secrets_json="$SECRETS_JSON"
  log "using SECRETS_JSON from env (values redacted)"
fi
if [ -n "$secrets_json" ]; then
  SECRETS_JSON="$secrets_json" ENV_FILE="$proj/.env" VALUES_FILE="$workdir/secrets.values" bun -e '
    const fs = await import("node:fs")
    let parsed
    try { parsed = JSON.parse(process.env.SECRETS_JSON) }
    catch { console.error("secrets payload is not valid JSON"); process.exit(1) }
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      console.error("secrets payload must be a JSON object"); process.exit(1)
    }
    const lines = []
    const values = []
    for (const [k, v] of Object.entries(parsed)) {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(k)) { console.error(`invalid env key: ${k}`); process.exit(1) }
      const val = String(v).replace(/\n/g, "\\n")
      lines.push(`${k}=${val}`)
      if (val.length >= 4) values.push(val)
    }
    fs.appendFileSync(process.env.ENV_FILE, "\n# run-scoped secrets (injected by sim-entry)\n" + lines.join("\n") + "\n")
    fs.chmodSync(process.env.ENV_FILE, 0o600)
    fs.writeFileSync(process.env.VALUES_FILE, values.join("\n") + (values.length ? "\n" : ""))
  ' || die "secrets merge failed"
  chmod 600 "$workdir/secrets.values" 2>/dev/null || true
  export SECRET_VALUES_FILE="$workdir/secrets.values"
fi

# --- install workflow dependencies. The image warms the bun cache with the
# exact dependency set of generated projects, so this hits cache on the hot
# path; registry egress only happens on a cache miss.
log "installing workflow dependencies (bun)"
( cd "$wfdir" && bun install ) >&2 || die "bun install failed in $(basename "$wfdir")"

# --- run the simulation from the PROJECT ROOT (where project.yaml lives).
# The CLI's exit code is unreliable, so we classify by output markers instead.
# timeout -k: SIGKILL 10s after SIGTERM if the CLI hangs.
log "running: cre workflow simulate $(basename "$wfdir") --target $TARGET --non-interactive --trigger-index $TRIGGER_IDX"
cd "$proj" || die "cannot cd into project dir"
timeout -k 10 "$SIM_TIMEOUT" cre workflow simulate "$wfdir" \
  --target "$TARGET" \
  --non-interactive \
  --trigger-index "$TRIGGER_IDX" \
  > "$rawlog" 2>&1
cli_code=$?
cd - >/dev/null || true
log "CLI exited code=$cli_code (informational only; status comes from output markers)"

# --- destroy the run's secrets object at ACTUAL run end (the API also purges
# at reconcile; this covers runs nobody ever polls again). Best effort: a
# failure here is a stderr warning, never a status change.
if [ -n "${SECRETS_DELETE_URL:-}" ] && [ -n "$secrets_json" ]; then
  SECRETS_DELETE_URL="$SECRETS_DELETE_URL" bun -e '
    const res = await fetch(process.env.SECRETS_DELETE_URL, { method: "DELETE", signal: AbortSignal.timeout(30000) })
    if (!res.ok && res.status !== 404) { console.error(`secrets delete returned HTTP ${res.status}`); process.exit(1) }
  ' && log "run secrets destroyed" || log "WARN could not delete run secrets object (reconcile/lifecycle will)"
fi

# --- live stream: hand the tailer its terminal event and let it flush. The
# result event must be posted after every log/node event, so it goes to the
# file before the done marker, and we wait for the tailer to exit.
if [ -n "$stream_pid" ]; then
  classify_emit_summary "$rawlog" "$cli_code" "$RUN_ID" > "$workdir/result-event.json"
  : > "$workdir/cli-done"
  waited=0
  while kill -0 "$stream_pid" 2>/dev/null && [ "$waited" -lt 60 ]; do
    sleep 0.5
    waited=$((waited + 1))
  done
  if kill -0 "$stream_pid" 2>/dev/null; then
    log "WARN tailer did not exit in 30s; killing it (run unaffected)"
    kill "$stream_pid" 2>/dev/null || true
  fi
  wait "$stream_pid" 2>/dev/null || true
  log "live stream tailer finished"
fi

# --- stream events: raw CLI lines first, then the terminal result event.
# The stream is also mirrored into $events for the optional RESULT_URL upload.
# Redaction is active whenever a secrets values file exists (Phase 3).
events="$workdir/events.ndjson"
: > "$events"
[ -n "${SECRET_VALUES_FILE:-}" ] && classify_redact_init "$SECRET_VALUES_FILE"
classify_emit_events "$rawlog" "$RUN_ID" | tee -a "$events"
classify_emit_summary "$rawlog" "$cli_code" "$RUN_ID" | tee -a "$events"
status="$(classify_status "$rawlog" "$cli_code")"

# --- upload the event stream (best effort; never changes status/exit code)
if [ -n "${RESULT_URL:-}" ]; then
  case "$RESULT_URL" in
    https://* | http://*)
      log "uploading events to RESULT_URL"
      RESULT_URL="$RESULT_URL" EVENTS="$events" bun -e '
        const res = await fetch(process.env.RESULT_URL, {
          method: "PUT",
          headers: { "Content-Type": "application/x-ndjson" },
          body: Bun.file(process.env.EVENTS),
        })
        if (!res.ok) { console.error(`upload failed: HTTP ${res.status}`); process.exit(1) }
      ' || log "WARN: events upload failed (status unchanged)"
      ;;
    file://*)
      dest="${RESULT_URL#file://}"
      if cp "$events" "$dest"; then
        log "events written to $dest"
      else
        log "WARN: cannot copy events to $dest (status unchanged)"
      fi
      ;;
    *)
      log "WARN: unsupported RESULT_URL scheme (want https:// or file://): ${RESULT_URL%%://*}://"
      ;;
  esac
fi

log "done status=$status exit_code_hint=$cli_code run_id='${RUN_ID:-<unset>}'"
if [ "$status" = "succeeded" ]; then
  exit 0
fi
exit 1
