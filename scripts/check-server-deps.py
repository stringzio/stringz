#!/usr/bin/env python3
"""Image-parity check: every bare import the SERVER module graph uses must be
declared in server/package.json.

The runtime image installs server/package.json STANDALONE (Dockerfile deps
stage), while local dev resolves from the repo-root node_modules - so a
dependency added at the root but not to server/package.json passes every
local gate and kills the deploy at startup (2026-10-04 docs deploy: marked
resolved in dev, was missing in the image).

The graph is walked from server/src entry points through relative imports
(including the shared src/lib modules the server imports), so frontend-only
src/lib files (shadcn cn helpers, zip utils) stay out of scope. Static by
design: importing the graph executes module side effects (db/client throws
without DATABASE_URL), and bundling resolves stricter than Bun's runtime.
"""

import json
import re
import sys
from pathlib import Path
from typing import Optional

ROOT = Path(__file__).resolve().parents[1]
SERVER_PKG = json.loads((ROOT / "server/package.json").read_text())
DECLARED = set(SERVER_PKG.get("dependencies", {})) | set(SERVER_PKG.get("devDependencies", {}))

IMPORT_RE = re.compile(
    r"(?:import|export)[^'\"]*?from\s*[\"']([^\"']+)[\"']"
    r"|\bimport\s*\(\s*[\"']([^\"']+)[\"']\s*\)"
    r"|\bimport\s*[\"']([^\"']+)[\"']"
)

BUILTINS = {
    "assert", "async_hooks", "buffer", "child_process", "crypto", "events",
    "fs", "http", "http2", "https", "net", "os", "path", "querystring",
    "stream", "string_decoder", "timers", "tls", "url", "util", "zlib",
}


def pkg_of(spec: str) -> str:
    parts = spec.split("/")
    return "/".join(parts[:2]) if spec.startswith("@") else parts[0]


def resolve_relative(base: Path, spec: str) -> Optional[Path]:
    target = (base.parent / spec).resolve()
    for candidate in (target.with_suffix(".ts"), target.with_suffix(".tsx"),
                      target / "index.ts", target / "index.tsx"):
        if candidate.is_file() and ROOT in candidate.parents:
            return candidate
    return None


# BFS the module graph starting from server/src files.
bare: set[str] = {}
queue: list[Path] = list((ROOT / "server/src").rglob("*.ts"))
seen: set[Path] = set()
while queue:
    f = queue.pop()
    if f in seen:
        continue
    seen.add(f)
    for m in IMPORT_RE.finditer(f.read_text()):
        spec = next(g for g in m.groups() if g)
        if spec.startswith("node:") or spec in BUILTINS:
            continue
        if spec.startswith("."):
            resolved = resolve_relative(f, spec)
            if resolved and (str(resolved).startswith(str(ROOT / "server")) or str(resolved).startswith(str(ROOT / "src"))):
                queue.append(resolved)
            continue
        bare.setdefault(pkg_of(spec), f.relative_to(ROOT).as_posix())

missing = sorted(p for p in bare if p not in DECLARED)
if missing:
    print("FAIL: imported by the server graph but not declared in server/package.json:")
    for p in missing:
        print(f"  {p}  (first imported from {bare[p]})")
    print("Local dev resolves these from the repo root; the runtime image does not.")
    sys.exit(1)
print(f"ok - all {len(bare)} bare imports across {len(seen)} server-graph modules are declared in server/package.json")
