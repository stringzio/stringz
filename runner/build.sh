#!/usr/bin/env bash
# Build the Stringz simulation runner image.
#
#   runner/build.sh [TAG] [PLATFORM]
#
# Defaults: TAG=us-central1-docker.pkg.dev/project-1b9280b0-8678-4006-a48/flowkit/sim-runner:local
# (override with env REPO_TAG), PLATFORM=linux/amd64 (Cloud Run target).
#
# Local arm64 builds (Apple Silicon dev): runner/build.sh tag:local linux/arm64
# then run runner/test/e2e-local.sh against it.
set -euo pipefail

TAG="${1:-${REPO_TAG:-us-central1-docker.pkg.dev/project-1b9280b0-8678-4006-a48/flowkit/sim-runner:local}}"
PLATFORM="${2:-linux/amd64}"

cd "$(dirname "$0")"
echo "building $TAG for $PLATFORM"
docker buildx build \
  --platform "$PLATFORM" \
  -t "$TAG" \
  --load \
  .
echo "built $TAG"
