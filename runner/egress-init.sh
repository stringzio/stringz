#!/bin/sh
# egress-init: root prelude for the sim-runner container (Phase 1 egress
# lockdown, issue #11).
#
# Runs as root for exactly one job: pin the GCP metadata server hostnames in
# /etc/hosts at container start. BuildKit mounts /etc/hosts read-only during
# image builds, and both Docker and Cloud Run shadow any baked /etc/hosts with
# a runtime file, so the pin must happen here. The append is best effort on
# purpose: if the platform ever delivers a read-only /etc/hosts, the run must
# still work (the entry script's env scrub still applies) - only the name-based
# metadata block degrades.
#
# Immediately after the pin, privileges drop to the bun user and the real
# entrypoint execs; nothing else runs as root.
set -u

if grep -q 'metadata\.google\.internal' /etc/hosts 2>/dev/null; then
  echo '[egress-init] metadata hosts already pinned' >&2
elif printf '0.0.0.0 metadata.google.internal\n0.0.0.0 metadata\n' >> /etc/hosts 2>/dev/null; then
  echo '[egress-init] metadata hosts pinned to 0.0.0.0' >&2
else
  echo '[egress-init] WARN: cannot write /etc/hosts; metadata pin skipped (env scrub still active)' >&2
fi

exec setpriv --reuid=bun --regid=bun --clear-groups /usr/local/bin/sim-entry "$@"
