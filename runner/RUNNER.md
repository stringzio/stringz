# Stringz Simulation Runner (Phase 1)

The runner executes `cre workflow simulate` on Stringz-compiled CRE TypeScript projects inside a container.
It is built for headless execution, first locally and later as a Cloud Run Job.
It turns one compiled canvas flow into a structured NDJSON event stream that the Stringz backend can store and stream to the editor.

Everything under `runner/` is self-contained.
Nothing here touches `.github/workflows`, `server/`, `src/`, or any GCP resource.

## Run contract

`runner/entry.sh` is the entrypoint (installed as `/usr/local/bin/sim-entry` in the image).

### Env inputs

| Variable      | Required | Default           | Meaning                                                        |
| ------------- | -------- | ----------------- | -------------------------------------------------------------- |
| `SRC_URL`     | yes      |                   | Signed HTTPS URL (GCS) or `file://` absolute path to a gzipped tarball of the CRE project root. |
| `RESULT_URL`  | no       |                   | Signed HTTPS PUT URL (GCS) or `file://` absolute path. The NDJSON event stream is uploaded there after the run. Upload failure is a stderr warning only and never changes the status or exit code. |
| `RUN_ID`      | no       |                   | Echoed into the final result event and stderr diagnostics.     |
| `TRIGGER_IDX` | no       | `0`               | `--trigger-index` for the CLI.                                 |
| `TARGET`      | no       | `staging-settings`| `--target` for the CLI.                                        |
| `SIM_TIMEOUT` | no       | `150`             | Seconds before the CLI is killed (SIGKILL 10s after SIGTERM).  |
| `CRE_SECRETS` | no       | `/secrets/cre`    | Auth session mount: directory (local docker) or single file (Secret Manager archive, auto-extracted). |
| `SECRETS_JSON`| no       |                   | Phase 3 stub. JSON object merged into the project `.env`. Values are never logged. |

### Output contract

STDOUT is a pure NDJSON stream, one JSON object per line.
STDERR carries runner diagnostics prefixed with `[sim-entry]`.

When `RESULT_URL` is set, the same NDJSON stream is uploaded there after the run via a signed HTTPS PUT or a plain `file://` copy.
This is best effort: an upload failure is a stderr warning and never changes the run status or exit code.
The orchestrator reconciles run state from the uploaded stream, so STDOUT stays the only real-time channel.

Event types:

- `{"t":"log","line":"..."}` - one per raw CLI output line, in order.
- `{"t":"node","id":"...","line":"..."}` - emitted immediately after the matching log event when the line matches `\[USER LOG\] ([^:]+):`.
  This is how per-node output from the canvas map back to editor nodes.
- `{"t":"result","status":"...","exitCode":N,"result":"...","runId":"..."}` - exactly one, last line.
  `status` is `succeeded`, `failed`, `auth_error`, or `timeout`.
  `result` (present on success) is the raw quoted result block from the CLI.
  `runId` is present only when `RUN_ID` was set.

Real example from a captured run:

```json
{"t":"log","line":"2026-09-25T14:42:34Z [USER LOG] fmt: replace -> ETH/USD = $2689.72"}
{"t":"node","id":"fmt","line":"2026-09-25T14:42:34Z [USER LOG] fmt: replace -> ETH/USD = $2689.72"}
{"t":"log","line":"✓ Workflow Simulation Result:"}
{"t":"log","line":"\"ETH/USD = $2689.72 | ETH/USD = $2689.72\""}
{"t":"result","status":"succeeded","exitCode":0,"result":"\"ETH/USD = $2689.72 | ETH/USD = $2689.72\"","runId":"e2e-local"}
```

### Status classification and the exit-code asymmetry

The CRE CLI's own exit codes are unreliable and must never be used alone.
Verified behaviors: a dead OAuth session prints `Credential validation failed` and still exits 0; some failures exit 1.

The runner therefore classifies by output markers, in this order:

1. `Credential validation failed` or `authentication required: no credentials found` in the output -> `auth_error`.
2. `timeout(1)` returned 124 -> `timeout`.
3. `Workflow Simulation Result` marker present -> `succeeded`.
4. Anything else -> `failed`.

The first marker is the dead-session case (verified, exits 0); the second was captured from a container run with a missing session and exits 1.
Both map to `auth_error` because for alerting they mean the same thing: the mounted session did not work.

The entry script's OWN exit code is the trustworthy one: 0 only when status is `succeeded`, 1 otherwise (including setup failures).
Orchestrators should key off the NDJSON result event and this exit code, never the CLI's raw exit code.

## PoC auth model

Auth uses an OAuth session, not an API key.
The CLI needs a deployed-workflow approval for API-key mode that we do not have, so API keys are not viable for the PoC.

The session lives in `~/.cre` on the owner's machine and contains `cre.yaml` (OAuth tokens) and `context.yaml` (tenant manifest).
At runtime it is mounted read-only at `/secrets/cre`, and the entry script copies it to `$HOME/.cre` before running the CLI.
The copy is required, not cosmetic: the CLI writes refreshed tokens back into `$HOME/.cre`, and a read-only mount makes that write fail, which surfaces as an auth failure with exit code 0 (verified).

Two mount forms are supported (`CRE_SECRETS` overrides the path, default `/secrets/cre`):

- **Directory** - local docker runs (`-v ~/.cre:/secrets/cre:ro`); copied as-is.
- **Single file** - Secret Manager volume mounts deliver the payload as ONE file holding the session tar.gz **base64-encoded** (binary payloads do not survive every transport layer intact - gcloud's `secrets versions access` re-encodes stdout as UTF-8, and the raw-gzip mount failed live); the entry script base64-decodes and extracts it into `$HOME` and verifies `.cre/cre.yaml` came out.

### Rotation runbook

1. The owner re-authenticates locally with `cre login`.
2. Pack and encode the refreshed session, then add it as a new secret version:
   `tar -czf /tmp/cre.tgz -C "$HOME" .cre && base64 < /tmp/cre.tgz > /tmp/cre.b64 && gcloud secrets versions add stringz-cre-credentials --data-file=/tmp/cre.b64`
   (stdin redirection, not file args - GNU and BSD base64 disagree on flags.)
3. No running jobs are affected; each task decodes the mount at start.

### Accepted risk

When the session dies between rotations, every run returns `status: auth_error` and exits 1.
Alerting keys off that status; the owner re-logs and refreshes the secret.

## Version pins

Verified 2026-09-25. Asset names and URLs below match the GitHub release APIs at that date; the Dockerfile verifies a digest for every downloaded artifact.
One adaptation: the CLI's `checksums.txt` is NOT in `sha256sum` format, it carries `<name>: <hexhash>` lines, and the names are the extracted binary names (`cre_v1.35.0_linux_arm64.tar.gz`), not the release asset names (`cre_linux_arm64.tar.gz`), so the Dockerfile looks the hash up by the former and compares it against `sha256sum` output.
Exact matching matters: `cre_linux_arm64.tar.gz` would also match the `cre_linux_arm64_ldd2-35` variant line if it were a substring, and it is not a substring of the versioned name at all.

| Component        | Pin                 | Source                                                        |
| ---------------- | ------------------- | ------------------------------------------------------------- |
| Bun base image   | `oven/bun:1.3.13`   | Docker Hub, tag verified with `docker manifest inspect`       |
| CRE CLI          | `v1.35.0`           | github.com/smartcontractkit/cre-cli releases                  |
| CRE TS SDK       | `1.22.0`            | warmed into the bun install cache (`runner/warm/package.json`)|
| javy             | `v8.1.0`            | github.com/bytecodealliance/javy releases                     |
| viem / zod (warm)| `2.56.8` / `4.6.5`  | warmed into the bun install cache                             |

Arch mapping inside the Dockerfile (buildx `TARGETPLATFORM`):

- `linux/amd64` -> CLI asset `cre_linux_amd64.tar.gz`, javy asset `javy-x86_64-linux-v8.1.0.gz`, cache dir `linux-x64`.
- `linux/arm64` -> CLI asset `cre_linux_arm64.tar.gz`, javy asset `javy-arm-linux-v8.1.0.gz`, cache dir `linux-arm64`.

Note the naming asymmetry: javy asset names use `x86_64`/`arm`, but the SDK cache directory uses Node-style `os.arch()` values `x64`/`arm64`.
This is confirmed from the `@chainlink/cre-sdk-javy-plugin` `ensure-javy` source in SDK 1.22.0, which installs to `$HOME/.cache/javy/v8.1.0/linux-<os.arch()>/javy`.
The javy `.sha256` files contain the bare hex digest (no filename), so verification compares digests directly rather than using `sha256sum -c`.

Why the javy pre-bake matters: on a fresh `$HOME` the SDK downloads javy itself, which took about 9 minutes inside a container over a slow CDN.
The image bakes the verified binary into the cache path so the per-run compile never touches the network for it.
The warm `bun install` layer pins the exact dependency set of generated projects so per-run installs resolve from the bun cache.

## Build and push

```bash
# Cloud Run target (from repo root)
runner/build.sh us-central1-docker.pkg.dev/project-1b9280b0-8678-4006-a48/flowkit/sim-runner:local linux/amd64

# Apple Silicon local dev
runner/build.sh sim-runner:local linux/arm64
```

`runner/build.sh` wraps `docker buildx build --platform ... --load`.
For the multi-arch push to a registry, run the same `docker buildx build` with `--push` and both platforms.

The release downloads (CRE CLI tarball, `checksums.txt`, javy asset and `.sha256`) can be slow, about 80MB for the CLI over a CDN.
The build checks `runner/dl/` first and only downloads what is missing, so drop the four files for your target arch in there to make rebuilds fast.
`runner/dl/` is git-ignored except for a `.gitkeep`; checksum verification still runs on every build, so a stale or partial cache file fails loudly instead of poisoning the image.
The cache is arch-specific: building `linux/amd64` with only arm64 files present simply downloads the amd64 files.

## Local end-to-end

```bash
# from repo root; generates /tmp/sim-spike first if absent
runner/test/e2e-local.sh sim-runner:local
```

The script packs `/tmp/sim-spike` (project root contents minus `node_modules`) into `project.tgz`, runs the image with `SRC_URL=file:///project.tgz`, and validates the NDJSON contract.
If `~/.cre` exists on the host it is mounted and the success path is expected; otherwise a mock `/secrets/cre` is mounted and the `auth_error` path is expected.
The script prints which path it exercised.

## Contract tests (no network)

```bash
bun runner/test/contract-test.ts
```

Fixtures in `runner/test/fixtures/` are built from real captured CLI output lines and cover success, auth failure, write failure, and timeout.
The tests exercise `runner/lib/classify.sh` (the same functions the entrypoint sources) plus the real `entry.sh` end to end in FILE mode with a stubbed `cre` binary.

## Cloud Run Job spec (later phase, not created here)

- 1 vCPU, 1 GiB memory per task.
- Task timeout 90-180s (the runner's `SIM_TIMEOUT` must stay below the task timeout).
- `maxRetries: 0`; retries are the caller's decision, not the platform's.
- Env: `SRC_URL` (signed at dispatch), `RESULT_URL` (signed at dispatch), `RUN_ID`, `TRIGGER_IDX`, `TARGET`, `SIM_TIMEOUT`.
- Secret volume: the `cre` session mounted read-only at `/secrets/cre`.

## Egress requirements

- Chainlink auth and tenant APIs (session validation and token refresh).
- Public RPC endpoints that workflow triggers read from.
- No other egress on the hot path: the CRE CLI, javy, and npm dependencies are baked in.
- Registry egress only if the bun cache misses (for example a generated project pinning a dependency outside the warmed set).

## Security notes

- The `/secrets/cre` mount is read-only; the CLI only ever sees a writable copy under the ephemeral container `$HOME`.
- The work directory is a fresh `mktemp -d` under `/tmp` and is removed on exit; in Cloud Run the whole filesystem is ephemeral.
- `SECRETS_JSON` values are written into the project `.env` and are never printed to stdout or stderr.
- Runner diagnostics go to stderr only; stdout stays machine-parseable NDJSON.
- Compiled user workflows run as WASM inside the CRE sandbox, which itself runs inside the Cloud Run gVisor microVM; the container adds no extra privileges (runs as the `bun` user).
- Project archives come from signed URLs or local files; treat archive contents as untrusted input, same as any uploaded build artifact.
