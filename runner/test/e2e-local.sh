#!/usr/bin/env bash
# Local end-to-end test for the simulation runner image (no cloud, no network
# egress beyond image pulls and the CRE auth/tenant APIs the CLI talks to).
#
#   runner/test/e2e-local.sh [IMAGE]
#
# IMAGE defaults to sim-runner:local. Builds it for the host platform if absent.
#
# What it does:
#   1. generates /tmp/sim-spike via tmp-verify/sim-spike-gen.ts if missing
#   2. tars the PROJECT ROOT contents (project.yaml, secrets.yaml, .env.example,
#      <slug>-workflow/ minus node_modules and build scratch) into project.tgz
#   3. runs the image with SRC_URL=file:///project.tgz
#   4. mounts a real ~/.cre if present (full path), else a MOCK /secrets/cre
#      (auth_error path); reports which was exercised
#   5. validates the NDJSON stdout contract and the entry exit code
#
# Exit: 0 when the exercised path matches expectation, 1 otherwise.
set -uo pipefail

IMAGE="${1:-sim-runner:local}"
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SPIKE=/tmp/sim-spike
WORK="$(mktemp -d /tmp/sim-e2e.XXXXXX)"
trap 'rm -rf "$WORK"' EXIT

echo "[e2e] image=$IMAGE"

# --- 1. project fixture
if [ ! -f "$SPIKE/project.yaml" ]; then
  echo "[e2e] generating $SPIKE"
  (cd "$REPO_ROOT" && bun tmp-verify/sim-spike-gen.ts) || { echo "[e2e] generator failed" >&2; exit 1; }
fi
wfdir="$(ls -d "$SPIKE"/*-workflow | head -1)"
[ -n "$wfdir" ] || { echo "[e2e] no *-workflow dir in $SPIKE" >&2; exit 1; }
wfname="$(basename "$wfdir")"

# --- 2. tar the project root contents
tgz="$WORK/project.tgz"
tar -czf "$tgz" -C "$SPIKE" \
  --exclude='node_modules' --exclude='.cre_build_tmp.js' --no-xattrs \
  project.yaml secrets.yaml .env.example "$wfname"
echo "[e2e] packed $(du -h "$tgz" | cut -f1) archive: project.yaml secrets.yaml .env.example $wfname"

# --- 3. auth mount: real session if present, else a mock (auth_error expected)
cre_args=(-v "$WORK/mock-cre:/secrets/cre:ro")
MODE=mock
if [ -d "$HOME/.cre" ]; then
  cre_args=(-v "$HOME/.cre:/secrets/cre:ro")
  MODE=real
else
  mkdir -p "$WORK/mock-cre"
  cat > "$WORK/mock-cre/cre.yaml" <<'EOF'
# MOCK session for local e2e - not a real credential.
oauth:
  access_token: mock-access-token
  refresh_token: mock-refresh-token
  expires_at: "2000-01-01T00:00:00Z"
EOF
  cat > "$WORK/mock-cre/context.yaml" <<'EOF'
# MOCK tenant manifest for local e2e.
tenant: mock-tenant
EOF
fi
echo "[e2e] auth mount mode: $MODE"

# --- 4. build image if absent
if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
  echo "[e2e] image not found, building for host platform"
  "$REPO_ROOT/runner/build.sh" "$IMAGE" "linux/$(uname -m | sed 's/x86_64/amd64/')" || exit 1
fi

# --- 5. run
ndjson="$WORK/stdout.ndjson"
stderr_log="$WORK/stderr.log"
set +e
docker run --rm \
  -v "$tgz:/project.tgz:ro" \
  "${cre_args[@]}" \
  -e SRC_URL="file:///project.tgz" \
  -e RUN_ID="e2e-local" \
  -e TRIGGER_IDX=0 \
  -e TARGET=staging-settings \
  -e SIM_TIMEOUT=150 \
  "$IMAGE" > "$ndjson" 2> "$stderr_log"
entry_code=$?
set -e

echo "[e2e] entry exit code: $entry_code"
echo "[e2e] --- stderr (runner diagnostics) ---"
cat "$stderr_log"
echo "[e2e] --- stdout (NDJSON events) ---"
cat "$ndjson"

# --- 6. validate the contract
fail=0
last_event="$(tail -n 1 "$ndjson")"
status="$(printf '%s' "$last_event" | bun -e 'try { process.stdout.write(JSON.parse(await Bun.stdin.text()).status ?? "") } catch { process.exit(1) }' 2>/dev/null)" || status=""

if [ "$MODE" = real ]; then
  [ "$status" = "succeeded" ] || { echo "[e2e] FAIL: real session, want status=succeeded got '$status'" >&2; fail=1; }
  [ "$entry_code" -eq 0 ] || { echo "[e2e] FAIL: real session, want entry exit 0" >&2; fail=1; }
else
  [ "$status" = "auth_error" ] || { echo "[e2e] FAIL: mock session, want status=auth_error got '$status'" >&2; fail=1; }
  [ "$entry_code" -eq 1 ] || { echo "[e2e] FAIL: mock session, want entry exit 1" >&2; fail=1; }
fi

# every stdout line must be a JSON object with a t field
bad_lines="$(NDJSON="$ndjson" bun -e '
  const lines = (await Bun.file(process.env.NDJSON).text()).split("\n").filter((l) => l.length > 0)
  let bad = 0
  for (const l of lines) {
    try { const o = JSON.parse(l); if (typeof o.t !== "string") bad++ } catch { bad++ }
  }
  process.stdout.write(String(bad))
' 2>/dev/null || echo 1)"
[ "$bad_lines" = "0" ] || { echo "[e2e] FAIL: $bad_lines invalid NDJSON line(s)" >&2; fail=1; }

grep -q '"t":"node","id":"fmt"' "$ndjson" || { echo "[e2e] FAIL: no node event for fmt in stream" >&2; fail=1; }

if [ "$fail" -eq 0 ]; then
  echo "[e2e] PASS (mode=$MODE, status=$status)"
else
  echo "[e2e] FAIL (mode=$MODE, status=$status)" >&2
fi
exit "$fail"
