# syntax=docker/dockerfile:1
# Stringz simulation runner (Phase 1).
# Executes `cre workflow simulate` on Stringz-compiled CRE projects.
#
# Multi-stage, arch-aware via buildx TARGETPLATFORM:
#   linux/amd64 -> cre_linux_amd64.tar.gz, javy-x86_64-linux, cache linux-x64
#   linux/arm64 -> cre_linux_arm64.tar.gz, javy-arm-linux,    cache linux-arm64
# (cache dir names follow node os.arch(): x64/arm64, confirmed in the
# @chainlink/cre-sdk-javy-plugin ensure-javy source, SDK 1.22.0.)

ARG BUN_TAG=1.3.13
ARG CRE_VERSION=1.35.0
ARG JAVY_VERSION=8.1.0

# --- stage: CRE CLI ----------------------------------------------------------
FROM oven/bun:${BUN_TAG} AS cli-builder
ARG CRE_VERSION
ARG TARGETPLATFORM
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
# dl/ is normally empty (.gitkeep only): artifacts are fetched below. Drop the
# release assets in locally to skip the (slow, ~80MB) download on rebuilds.
COPY dl/ /tmp/dl/
RUN set -eux; \
    case "$TARGETPLATFORM" in \
      linux/amd64) CRE_ARCH=amd64 ;; \
      linux/arm64) CRE_ARCH=arm64 ;; \
      *) echo "unsupported TARGETPLATFORM: $TARGETPLATFORM" >&2; exit 1 ;; \
    esac; \
    mkdir -p /out; \
    cd /tmp/dl; \
    if [ ! -f "cre_linux_${CRE_ARCH}.tar.gz" ]; then \
      curl -fsSLO "https://github.com/smartcontractkit/cre-cli/releases/download/v${CRE_VERSION}/cre_linux_${CRE_ARCH}.tar.gz"; \
    fi; \
    if [ ! -f checksums.txt ]; then \
      curl -fsSLO "https://github.com/smartcontractkit/cre-cli/releases/download/v${CRE_VERSION}/checksums.txt"; \
    fi; \
    # checksums.txt is NOT sha256sum format; it is "<name>: <hexhash>" lines    \
    # keyed by the EXTRACTED binary name (cre_v<ver>_linux_<arch>.tar.gz),     \
    # not the release asset name (cre_linux_<arch>.tar.gz).                    \
    want="$(awk -v f="cre_v${CRE_VERSION}_linux_${CRE_ARCH}.tar.gz" -F':' '$1 == f {h=$2; gsub(/[[:space:]]/, "", h); print h; exit}' checksums.txt)"; \
    got="$(sha256sum "cre_linux_${CRE_ARCH}.tar.gz" | awk '{print $1}')"; \
    [ -n "$want" ] && [ "$want" = "$got" ] || { echo "checksum mismatch for cre_linux_${CRE_ARCH}.tar.gz: want $want got $got" >&2; exit 1; }; \
    echo "checksum OK: cre_linux_${CRE_ARCH}.tar.gz"; \
    tar -xzf "cre_linux_${CRE_ARCH}.tar.gz"; \
    install -m 0755 "cre_v${CRE_VERSION}_linux_${CRE_ARCH}" /out/cre; \
    /out/cre --help >/dev/null

# --- stage: javy WASM toolchain (pre-baked; SDK download took ~9 min) --------
FROM oven/bun:${BUN_TAG} AS javy-builder
ARG JAVY_VERSION
ARG TARGETPLATFORM
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates gzip \
 && rm -rf /var/lib/apt/lists/*
# same dl/ cache as above, for the javy asset + its bare-digest checksum file.
COPY dl/ /tmp/dl/
RUN set -eux; \
    case "$TARGETPLATFORM" in \
      linux/amd64) JAVY_ASSET=javy-x86_64-linux; JAVY_ARCH=x64 ;; \
      linux/arm64) JAVY_ASSET=javy-arm-linux;    JAVY_ARCH=arm64 ;; \
      *) echo "unsupported TARGETPLATFORM: $TARGETPLATFORM" >&2; exit 1 ;; \
    esac; \
    cd /tmp/dl; \
    if [ ! -f "${JAVY_ASSET}-v${JAVY_VERSION}.gz" ]; then \
      curl -fsSLO "https://github.com/bytecodealliance/javy/releases/download/v${JAVY_VERSION}/${JAVY_ASSET}-v${JAVY_VERSION}.gz"; \
    fi; \
    if [ ! -f "${JAVY_ASSET}-v${JAVY_VERSION}.gz.sha256" ]; then \
      curl -fsSLO "https://github.com/bytecodealliance/javy/releases/download/v${JAVY_VERSION}/${JAVY_ASSET}-v${JAVY_VERSION}.gz.sha256"; \
    fi; \
    echo "$(cat "${JAVY_ASSET}-v${JAVY_VERSION}.gz.sha256")  ${JAVY_ASSET}-v${JAVY_VERSION}.gz" | sha256sum -c -; \
    gzip -dc "${JAVY_ASSET}-v${JAVY_VERSION}.gz" > /tmp/dl/javy; \
    chmod 0755 /tmp/dl/javy; \
    /tmp/dl/javy --version >/dev/null 2>&1; \
    mkdir -p "/out/cache/javy/v${JAVY_VERSION}/linux-${JAVY_ARCH}"; \
    mv /tmp/dl/javy "/out/cache/javy/v${JAVY_VERSION}/linux-${JAVY_ARCH}/javy"

# --- stage: warm the bun install cache ----------------------------------------
FROM oven/bun:${BUN_TAG} AS warm
ARG JAVY_VERSION
# javy first so the cre-setup postinstall finds it cached and skips the CDN.
COPY --from=javy-builder --chown=bun:bun /out/cache /home/bun/.cache
USER bun
ENV HOME=/home/bun
WORKDIR /opt/warm
COPY --chown=bun:bun warm/package.json ./
RUN bun install --no-save && rm -rf node_modules

# --- final image ---------------------------------------------------------------
FROM oven/bun:${BUN_TAG}
ARG BUN_TAG
ARG CRE_VERSION
ARG JAVY_VERSION
LABEL org.opencontainers.image.title="stringz-sim-runner" \
      org.opencontainers.image.description="Stringz Phase 1 simulation runner: cre workflow simulate in a container" \
      stringz.bun="${BUN_TAG}" \
      stringz.cre="${CRE_VERSION}" \
      stringz.javy="${JAVY_VERSION}"
# ca-certificates: bun -e fetches SRC_URL over HTTPS from the entry script.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates \
 && rm -rf /var/lib/apt/lists/*
COPY --from=cli-builder /out/cre /usr/local/bin/cre
COPY --from=javy-builder --chown=bun:bun /out/cache/ /home/bun/.cache/
COPY --from=warm --chown=bun:bun /home/bun/.bun /home/bun/.bun
COPY entry.sh /usr/local/bin/sim-entry
COPY lib/classify.sh /usr/local/lib/sim/classify.sh
RUN chmod 0755 /usr/local/bin/sim-entry /usr/local/lib/sim/classify.sh /usr/local/bin/cre
USER bun
ENV HOME=/home/bun
WORKDIR /work
ENTRYPOINT ["/usr/local/bin/sim-entry"]
