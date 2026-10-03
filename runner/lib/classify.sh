#!/usr/bin/env bash
# Classification and NDJSON event emission for the Stringz simulation runner.
#
# This file is the single source of truth for turning raw `cre workflow
# simulate` output into (a) a terminal status and (b) the stdout NDJSON event
# stream. It is sourced by sim-entry (runner/entry.sh) inside the container
# and executed directly by the contract tests (runner/test/contract-test.ts).
#
# Why this exists: the CRE CLI's exit codes are unreliable (exit 0 on auth
# failure, 1 on some errors). Status is classified from output markers only.
#
# CLI usage (used by the tests, no network needed):
#   classify.sh status <raw.log> [exit_code]   -> succeeded|failed|auth_error|timeout
#   classify.sh events <raw.log> [run_id]      -> NDJSON log/node events on stdout
#   classify.sh result <raw.log>               -> raw result block (post-marker), no trailing blank lines
#   classify.sh summary <raw.log> [exit_code]  -> NDJSON result event on stdout

set -u

# Markers, from empirically captured CLI output (v1.35.0):
#   success: "✓ Workflow Simulation Result:" followed by a quoted result block
#   auth:    "Credential validation failed" (dead OAuth session; exits 0), or
#            "authentication required: no credentials found" (mount missing or
#            not a recognizable session; exits 1). Both mean the /secrets/cre
#            session did not yield usable credentials.
CLASSIFY_OK_MARKER="Workflow Simulation Result"
CLASSIFY_AUTH_MARKER="Credential validation failed"
CLASSIFY_AUTH_MARKER_2="authentication required: no credentials found"

# Redaction (Phase 3): when SECRET_VALUES_FILE points at a file of secret
# values (one per line), every raw line is scrubbed of those values (replaced
# with ***) BEFORE JSON encoding or emission. Values shorter than 4 chars are
# skipped - scrubbing tiny substrings would destroy logs. init is called by
# sim-entry after the secrets merge; the contract tests exercise it directly.
CLASSIFY_SECRETS_FILE=""
classify_redact_init() {
  CLASSIFY_SECRETS_FILE="${1:-}"
}

classify_redact() {
  local line="$1"
  if [ -z "$CLASSIFY_SECRETS_FILE" ] || [ ! -f "$CLASSIFY_SECRETS_FILE" ]; then
    printf '%s' "$line"
    return
  fi
  REDACT_LINE="$line" REDACT_FILE="$CLASSIFY_SECRETS_FILE" awk '
    BEGIN {
      line = ENVIRON["REDACT_LINE"]; file = ENVIRON["REDACT_FILE"]
      n = 0
      while ((getline v < file) > 0) { if (length(v) >= 4) vals[n++] = v }
      close(file)
      for (i = 0; i < n; i++) {
        v = vals[i]
        pos = index(line, v)
        while (pos > 0) {
          line = substr(line, 1, pos - 1) "***" substr(line, pos + length(v))
          pos = index(line, v)
        }
      }
      printf "%s", line
    }'
}

classify_status() {
  local raw="$1" code="${2:-0}"
  if grep -qF -e "$CLASSIFY_AUTH_MARKER" -e "$CLASSIFY_AUTH_MARKER_2" "$raw"; then
    echo "auth_error"
  elif [ "$code" = "124" ]; then
    echo "timeout"
  elif grep -qF "$CLASSIFY_OK_MARKER" "$raw"; then
    echo "succeeded"
  else
    echo "failed"
  fi
}

# JSON-encode a string passed as $1: escape backslash, double quote, tab, and
# newline. Pure bash (no sed) so it behaves identically on GNU and BSD hosts.
# Backslash must be escaped first. Caller uses $(...) so trailing newlines are
# already stripped before entry.
classify_json_encode() {
  local s="$1"
  s="${s//\\/\\\\}"
  s="${s//\"/\\\"}"
  s="${s//$'\t'/\\t}"
  s="${s//$'\n'/\\n}"
  printf '%s' "$s"
}

# Emit one NDJSON event per raw CLI output line. Each line becomes
# {"t":"log","line":...}; lines matching "[USER LOG] <nodeId>: ..." additionally
# (before the log event's successor) emit {"t":"node","id":...,"line":...} right
# after their log event, preserving stream order.
classify_emit_events() {
  local raw="$1"
  while IFS= read -r line || [ -n "$line" ]; do
    # The CLI's self-update banner is noise for the user: the runner image
    # pins the CLI on purpose (log-parse stability), so "there is a newer
    # version" has no action for the user and just pollutes the runner log.
    if [[ "$line" == *"Update available!"* || "$line" == *'Run `cre update`'* ]]; then
      continue
    fi
    local scrubbed esc
    scrubbed="$(classify_redact "$line")"
    esc="$(classify_json_encode "$scrubbed")"
    printf '{"t":"log","line":"%s"}\n' "$esc"
    if [[ "$scrubbed" =~ \[USER\ LOG\][[:space:]]+([^:]+): ]]; then
      local id="${BASH_REMATCH[1]}"
      id="${id%"${id##*[![:space:]]}"}"
      printf '{"t":"node","id":"%s","line":"%s"}\n' "$(classify_json_encode "$id")" "$esc"
    fi
  done < "$raw"
}

# Extract the quoted result block that follows the success marker.
# Best effort: the block starts at the first non-blank line after the marker
# (a quoted block opens with ") and closes when the cumulative count of
# UNESCAPED double quotes in the block becomes even (opening quote = odd).
# Trailing blank lines are trimmed. If no even-parity line is found, falls
# back to everything-to-EOF.
classify_extract_result() {
  local raw="$1"
  awk '
    function uq(s,   t) { t = s; gsub(/\\"/, "", t); return gsub(/"/, "&", t) }
    index($0, "'"$CLASSIFY_OK_MARKER"'") { f=1; next }
    f && !started && $0 ~ /[^[:space:]]/ { started=1 }
    started && !done {
      lines[n++] = $0
      q = (q + uq($0)) % 2
      if (q == 0) done=1
    }
    END {
      while (n > 0 && lines[n-1] == "") n--
      for (i = 0; i < n; i++) {
        if (i > 0) printf "\n"
        printf "%s", lines[i]
      }
    }
  ' "$raw"
}

# Emit the final result event: {"t":"result","status":...,"exitCode":...}.
# Optional extras: "result" (raw result block) when present, "runId" when set.
classify_emit_summary() {
  local raw="$1" code="${2:-0}" run_id="${3:-}"
  local status
  status=$(classify_status "$raw" "$code")
  local result
  result=$(classify_extract_result "$raw")
  result=$(classify_redact "$result")
  local code_json="$code"
  case "$code_json" in
    ''|*[!0-9]*) code_json=1 ;;
  esac
  printf '{"t":"result","status":"%s","exitCode":%s' "$status" "$code_json"
  if [ -n "$result" ]; then
    printf ',"result":"%s"' "$(classify_json_encode "$result")"
  fi
  if [ -n "$run_id" ]; then
    printf ',"runId":"%s"' "$(classify_json_encode "$run_id")"
  fi
  printf '}\n'
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  mode="${1:-}"
  case "$mode" in
    status)
      [ $# -ge 2 ] || { echo "usage: classify.sh status <raw.log> [exit_code]" >&2; exit 2; }
      classify_status "$2" "${3:-0}"
      ;;
    events)
      [ $# -ge 2 ] || { echo "usage: classify.sh events <raw.log> [run_id]" >&2; exit 2; }
      classify_emit_events "$2" "${3:-}"
      ;;
    result)
      [ $# -ge 2 ] || { echo "usage: classify.sh result <raw.log>" >&2; exit 2; }
      classify_extract_result "$2"
      ;;
    summary)
      [ $# -ge 2 ] || { echo "usage: classify.sh summary <raw.log> [exit_code] [run_id]" >&2; exit 2; }
      classify_emit_summary "$2" "${3:-0}" "${4:-}"
      ;;
    redact)
      [ $# -ge 2 ] || { echo "usage: ... | classify.sh redact <values-file>" >&2; exit 2; }
      classify_redact_init "$2"
      classify_redact "$(cat)"
      ;;
    redacted-events)
      [ $# -ge 3 ] || { echo "usage: classify.sh redacted-events <values-file> <raw.log>" >&2; exit 2; }
      classify_redact_init "$2"
      classify_emit_events "$3"
      ;;
    redacted-summary)
      [ $# -ge 3 ] || { echo "usage: classify.sh redacted-summary <values-file> <raw.log> [exit_code]" >&2; exit 2; }
      classify_redact_init "$2"
      classify_emit_summary "$3" "${4:-0}"
      ;;
    *)
      echo "usage: classify.sh {status|events|result|summary} ..." >&2
      exit 2
      ;;
  esac
fi
