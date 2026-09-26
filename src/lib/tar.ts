import { gzipSync, strToU8 } from "fflate";

/**
 * Minimal ustar (.tar) packer - just enough for the cloud-sim upload, which
 * must be a gzipped tar of the CRE project root (the runner extracts with
 * `tar -xzf`). Pure TypeScript so it runs in the browser; verified against
 * system tar in the live e2e (extraction + run succeed on the packed bytes).
 */

export interface TarEntry {
  path: string;
  content: string | Uint8Array;
  mode?: number;
}

const BLOCK = 512;

function octal(value: number, width: number): string {
  return Math.max(0, value).toString(8).padStart(width - 1, "0") + "\0";
}

function header(entry: { name: string; prefix: string; size: number; mode: number; type: number }): Uint8Array {
  const h = new Uint8Array(BLOCK);
  const put = (offset: number, max: number, s: string) => {
    for (let i = 0; i < s.length && i < max; i++) h[offset + i] = s.charCodeAt(i);
  };
  put(0, 100, entry.name);
  put(100, 8, octal(entry.mode, 8));
  put(108, 8, octal(0, 8)); // uid
  put(116, 8, octal(0, 8)); // gid
  put(124, 12, octal(entry.size, 12));
  put(136, 12, octal(0, 12)); // mtime: epoch is fine for an upload artifact
  // chksum is written as 8 spaces, summed, then replaced ("%06o\0 ").
  h.fill(0x20, 148, 156);
  h[156] = 0x30 + entry.type; // '0' regular file, '5' directory
  put(257, 6, "ustar\0");
  put(263, 2, "00");
  put(345, 155, entry.prefix);
  let sum = 0;
  for (let i = 0; i < BLOCK; i++) sum += h[i];
  put(148, 8, sum.toString(8).padStart(6, "0") + "\0 ");
  return h;
}

/** Split a path into (prefix, name) so both fit the ustar fields (255 max). */
function splitName(path: string): { name: string; prefix: string } {
  if (path.length <= 100) return { name: path, prefix: "" };
  const cut = path.lastIndexOf("/", path.length - 101 < 100 ? 100 : path.length - 101);
  if (cut > 0 && cut <= 155 && path.length - cut - 1 <= 100) {
    return { name: path.slice(cut + 1), prefix: path.slice(0, cut) };
  }
  throw new Error(`tar: path too long: ${path}`);
}

function fileBytes(content: string | Uint8Array): Uint8Array {
  return typeof content === "string" ? strToU8(content) : content;
}

/** Pack entries into a gzipped tar archive. Parent directories are added. */
export function packTarGz(entries: TarEntry[]): Uint8Array {
  const out: number[] = [];
  const dirs = new Set<string>();
  const push = (b: Uint8Array) => out.push(...b);

  const emitDir = (path: string) => {
    if (!path || dirs.has(path)) return;
    const parent = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
    emitDir(parent);
    dirs.add(path);
    const { name, prefix } = splitName(path + "/");
    push(header({ name, prefix, size: 0, mode: 0o755, type: 5 }));
  };

  for (const entry of entries) {
    const clean = entry.path.replace(/^\/+/, "").replace(/\/+$/, "");
    const parent = clean.includes("/") ? clean.slice(0, clean.lastIndexOf("/")) : "";
    emitDir(parent);
    const body = fileBytes(entry.content);
    const { name, prefix } = splitName(clean);
    push(header({ name, prefix, size: body.length, mode: entry.mode ?? 0o644, type: 0 }));
    push(body);
    const pad = (BLOCK - (body.length % BLOCK)) % BLOCK;
    if (pad) push(new Uint8Array(pad));
  }

  push(new Uint8Array(BLOCK * 2)); // end-of-archive
  return gzipSync(new Uint8Array(out));
}
