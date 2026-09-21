import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { useAccount } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { motion } from "framer-motion";
import {
  Menu, Play, Search, Plus, Pencil, Save, Upload, Settings2,
  History, Ellipsis, Trash2, FlaskConical, Check, Sparkles, Minus, Undo2,
  Rocket, Wallet, ExternalLink, ShieldCheck, AlertTriangle, Terminal, RefreshCcw, FolderOpen, Copy,
} from "lucide-react";
import {
  SERVICES, INITIAL_NODES, INITIAL_EDGES, AI_SUGGESTIONS, CHAINS,
  type FlowNode, type FlowEdge, type ServiceId, type Chain,
} from "../data/services";
import { getFieldsFor, fieldValue } from "../data/fields";
import type { Screen } from "../types";
import Sheet from "../components/Sheet";
import FullLoader from "../components/FullLoader";
import ProSheet from "../components/ProSheet";
import Toast, { type ToastData } from "../components/Toast";
import ToolsPanel from "./ToolsPanel";
import NodeFields from "./NodeFields";
import FlowsSheet from "./FlowsSheet";
import { useMediaQuery } from "../hooks/useMediaQuery";
import ChainBadge from "../components/ChainBadge";
import LivePrice from "../components/LivePrice";
import LiveTrigger from "../components/LiveTrigger";
import { DEFAULT_PAIR, getFeedAddress, PRICE_PAIRS, type Pair } from "../web3/priceFeeds";
import { compileFlow, BlueprintError } from "../compiler";
import { api } from "../lib/api";
import type { SavedFlow } from "../lib/contract";
import { executeRun, sampleOutput, type NodeIO, type Json, type RunSource } from "../lib/flowData";
import { logRunLocal } from "../lib/runLog";
import { collectRunOverrides } from "../lib/liveRun";
import RunData from "./RunData";
import AddPalette from "./AddPalette";
import AbiFetcher from "./AbiFetcher";
import { encodeCallData, describeCall } from "../lib/callData";
import { zipSync, strToU8 } from "fflate";

export const NODE_W = 110;
export const NODE_H = 92;
const PANEL_W = 316;

type SheetKind = null | "node" | "add" | "menu" | "settings" | "history" | "more" | "tools" | "ai" | "deploy" | "wallet" | "flows" | "txpreview";

/** Services whose actions move value or mutate chain state - previewable. */
const WRITE_SERVICES = new Set<ServiceId>(["token-transfer", "contract-call", "swap", "ccip"]);

function port(node: FlowNode, other: FlowNode) {
  const cx = node.x + NODE_W / 2;
  const cy = node.y + NODE_H / 2;
  const dx = other.x + NODE_W / 2 - cx;
  const dy = other.y + NODE_H / 2 - cy;
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0
      ? { x: node.x + NODE_W, y: cy, dx: 1, dy: 0 }
      : { x: node.x, y: cy, dx: -1, dy: 0 };
  }
  return dy > 0
    ? { x: cx, y: node.y + NODE_H, dx: 0, dy: 1 }
    : { x: cx, y: node.y, dx: 0, dy: -1 };
}

function edgePath(a: FlowNode, b: FlowNode) {
  const p1 = port(a, b);
  const p2 = port(b, a);
  const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  const c = Math.max(28, dist * 0.45);
  const c1x = p1.x + p1.dx * c, c1y = p1.y + p1.dy * c;
  const c2x = p2.x + p2.dx * c, c2y = p2.y + p2.dy * c;
  const d = `M ${p1.x} ${p1.y} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
  const mid = {
    x: 0.125 * p1.x + 0.375 * c1x + 0.375 * c2x + 0.125 * p2.x,
    y: 0.125 * p1.y + 0.375 * c1y + 0.375 * c2y + 0.125 * p2.y,
  };
  return { d, mid };
}

const RAIL_SERVICES: ServiceId[] = ["price-feed", "evm-event", "contract-call", "swap", "discord"];

const RUN_HISTORY = [
  { name: "Untitled scenario", when: "Today, 09:12", dur: "2.4s", ok: true },
  { name: "Untitled scenario", when: "Today, 08:47", dur: "2.1s", ok: true },
  { name: "ETH price alert", when: "Yesterday, 22:03", dur: "4.8s", ok: true },
  { name: "Whale watcher", when: "Yesterday, 18:30", dur: "—", ok: false },
  { name: "Auto-compound rewards", when: "Mon, 11:15", dur: "6.2s", ok: true },
];

// Module scope on purpose: keeps the toast timer and id counter out of the
// component, so render-created handler lists don't touch refs (React Compiler
// purity) and node ids don't call Date.now() during render.
let toastTimer: ReturnType<typeof setTimeout> | null = null;
let idSeq = 0;
const nextNodeId = (service: string) => `${service}-${++idSeq}`;

export default function CanvasScreen({
  onNavigate,
  onNewScenario,
  desktop = false,
  notice,
  signedIn = false,
}: {
  onNavigate: (s: Screen) => void;
  onNewScenario: () => void;
  desktop?: boolean;
  notice?: string;
  /** Signed-out boots skip the server flow list entirely (it would 401). */
  signedIn?: boolean;
}) {
  const [nodes, setNodes] = useState<FlowNode[]>(INITIAL_NODES);
  const [edges, setEdges] = useState<FlowEdge[]>(INITIAL_EDGES);
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<FlowEdge | null>(null);
  const [topNode, setTopNode] = useState<string | null>(null);
  const [pendingEdge, setPendingEdge] = useState<{ from: string; x: number; y: number; sx: number; sy: number; replace?: FlowEdge } | null>(null);
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [toast, setToast] = useState<ToastData | null>(null);
  const [running, setRunning] = useState(false);
  const [activeNode, setActiveNode] = useState<string | null>(null);
  const [activeEdge, setActiveEdge] = useState<FlowEdge | null>(null);
  const [doneNodes, setDoneNodes] = useState<Set<string>>(new Set());
  const [enabled, setEnabled] = useState<Record<string, boolean>>({});
  const [runIO, setRunIO] = useState<Record<string, NodeIO>>({});
  const [runSources, setRunSources] = useState<Record<string, RunSource>>({});
  const [runErrors, setRunErrors] = useState<Record<string, string>>({});
  const [pinned, setPinned] = useState<Record<string, Json>>({});
  const [paletteOpen, setPaletteOpen] = useState(false);
  /** Bottom-bar breathing room: labeled left chrome needs >=1760px so the
   *  canvas-centered toolbar (Add pill + 7 buttons) never meets it. */
  const wide = useMediaQuery("(min-width: 1760px)");
  const labeled = desktop && wide;
  const [wfName, setWfName] = useState("Untitled scenario");
  const [schedule, setSchedule] = useState("On demand");
  const [zoom, setZoom] = useState(1);
  const { address, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const wallet = isConnected && address ? `${address.slice(0, 6)}…${address.slice(-4)}` : null;

  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ id: string; startX: number; startY: number; nodeX: number; nodeY: number; moved: boolean } | null>(null);
  const [undoStack, setUndoStack] = useState<{ nodes: FlowNode[]; edges: FlowEdge[] }[]>([]);

  const showToast = useCallback((text: string) => {
    if (toastTimer) clearTimeout(toastTimer);
    setToast({ id: Date.now(), text });
    toastTimer = setTimeout(() => setToast(null), 2200);
  }, []);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => showToast(notice), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- boot: restore work instead of the demo flow ----------
  // Priority: an unsaved draft (dirty) > the last saved flow > a clean draft >
  // the built-in demo. "New scenario" skips this once via sessionStorage.
  // "draft-clean" is a one-shot flag: whoever applies flow content sets it so
  // the draft writer below persists the first snapshot as clean, not dirty.
  const [hydrated, setHydrated] = useState(() => {
    if (sessionStorage.getItem("stringz:skip-restore")) {
      sessionStorage.removeItem("stringz:skip-restore");
      return true;
    }
    return false;
  });

  useEffect(() => {
    if (hydrated) return; // "New scenario" boot - start blank, nothing to restore
    let cancelled = false;
    let draft: { name: string; nodes: FlowNode[]; edges: FlowEdge[]; dirty?: boolean } | null = null;
    try {
      const raw = localStorage.getItem("stringz:canvas-draft");
      if (raw) draft = JSON.parse(raw);
    } catch {
      draft = null;
    }
    const applyDraft = () => {
      if (!draft || draft.nodes.length === 0) return false;
      setNodes(draft.nodes);
      setEdges(draft.edges ?? []);
      setWfName(draft.name || "Untitled scenario");
      return true;
    };
    if (!signedIn) {
      // Deferred so state updates don't land synchronously in the effect body.
      const t = setTimeout(() => {
        if (cancelled) return;
        applyDraft();
        setHydrated(true);
      }, 0);
      return () => {
        cancelled = true;
        clearTimeout(t);
      };
    }
    api.flows
      .list()
      .then((flows) => {
        if (cancelled) return;
        if (draft?.dirty) {
          applyDraft();
        } else if (flows.length > 0) {
          const lastId = localStorage.getItem("stringz:last-flow");
          const flow = flows.find((f) => f.id === lastId) ?? flows[0];
          localStorage.setItem("stringz:last-flow", flow.id);
          localStorage.setItem("stringz:draft-clean", "1");
          setNodes(flow.nodes as FlowNode[]);
          setEdges(flow.edges as FlowEdge[]);
          setWfName(flow.name);
        } else {
          applyDraft();
        }
        setHydrated(true);
      })
      .catch(() => {
        if (cancelled) return;
        applyDraft();
        setHydrated(true);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep a local draft so leaving the canvas never loses unsaved work.
  useEffect(() => {
    if (!hydrated) return;
    const t = setTimeout(() => {
      const clean = localStorage.getItem("stringz:draft-clean") === "1";
      if (clean) localStorage.removeItem("stringz:draft-clean");
      try {
        localStorage.setItem(
          "stringz:canvas-draft",
          JSON.stringify({ name: wfName, nodes, edges, dirty: !clean }),
        );
      } catch {
        // storage full - drafts are best-effort
      }
    }, 300);
    return () => clearTimeout(t);
  }, [nodes, edges, wfName, hydrated]);

  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  const pushUndo = useCallback(() => {
    setUndoStack((prev) => [...prev.slice(-29), { nodes, edges }]);
  }, [nodes, edges]);

  const undo = useCallback(() => {
    const prev = undoStack[undoStack.length - 1];
    if (!prev) {
      showToast("Nothing to undo");
      return;
    }
    setUndoStack((s) => s.slice(0, -1));
    setNodes(prev.nodes);
    setEdges(prev.edges);
    showToast("Undone");
  }, [showToast, undoStack]);

  useEffect(() => {
    if (!desktop) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [desktop, undo]);

  // ---------- connections ----------
  const canvasPoint = (e: React.PointerEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    return { x: (e.clientX - (rect?.left ?? 0)) / zoom, y: (e.clientY - (rect?.top ?? 0)) / zoom };
  };

  const nodeAtPoint = (x: number, y: number, excludeId?: string) =>
    nodes.find(
      (n) =>
        n.id !== excludeId &&
        x >= n.x - 10 && x <= n.x + NODE_W + 10 &&
        y >= n.y - 10 && y <= n.y + NODE_H + 10
    );

  /** Drag started from a node's "+" port: begin a pending connection. */
  const startConnect = (e: React.PointerEvent, n: FlowNode) => {
    e.stopPropagation();
    if (running) return;
    const p = canvasPoint(e);
    setSelected(null);
    setSelectedEdge(null);
    setPendingEdge({ from: n.id, x: p.x, y: p.y, sx: p.x, sy: p.y });
    canvasRef.current?.setPointerCapture?.(e.pointerId);
  };

  /** Canvas pointer-up while a pending connection is active: drop on a target node. */
  const finishConnect = () => {
    if (!pendingEdge) return;
    // A tap on a port without dragging must not connect whatever happens to be nearby.
    if (!pendingEdge.replace && Math.hypot(pendingEdge.x - pendingEdge.sx, pendingEdge.y - pendingEdge.sy) < 6) {
      setPendingEdge(null);
      return;
    }
    const target = nodeAtPoint(pendingEdge.x, pendingEdge.y, pendingEdge.from);
    if (target) {
      if (edges.some((ed) => ed.from === pendingEdge.from && ed.to === target.id)) {
        showToast("Already connected");
      } else if (edges.some((ed) => ed.to === target.id && !(pendingEdge.replace && ed.from === pendingEdge.replace.from && ed.to === pendingEdge.replace.to))) {
        showToast("That module already has an incoming connection");
      } else {
        pushUndo();
        setEdges((es) => {
          const rest = pendingEdge.replace
            ? es.filter((ed) => !(ed.from === pendingEdge.replace!.from && ed.to === pendingEdge.replace!.to))
            : es;
          return [...rest, { from: pendingEdge.from, to: target.id }];
        });
        showToast(pendingEdge.replace ? "Connection rerouted" : "Modules connected");
      }
    }
    setPendingEdge(null);
  };

  const removeEdge = useCallback((edge: FlowEdge) => {
    pushUndo();
    setEdges((es) => es.filter((ed) => !(ed.from === edge.from && ed.to === edge.to)));
    setSelectedEdge(null);
    showToast("Connection removed");
  }, [pushUndo, showToast]);

  /** Pencil -> reconnect: redraw the line from the same source to a new target. */
  const startReconnect = (edge: FlowEdge) => {
    const a = nodeById.get(edge.from);
    const b = nodeById.get(edge.to);
    const mid = a && b ? edgePath(a, b).mid : { x: 0, y: 0 };
    setSelectedEdge(null);
    setPendingEdge({ from: edge.from, x: mid.x, y: mid.y, sx: mid.x, sy: mid.y, replace: edge });
  };

  // ---------- dragging ----------
  const onNodePointerDown = (e: React.PointerEvent, node: FlowNode) => {
    if (running || pendingEdge) return;
    setTopNode(node.id);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    dragRef.current = { id: node.id, startX: e.clientX, startY: e.clientY, nodeX: node.x, nodeY: node.y, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (pendingEdge) {
      const p = canvasPoint(e);
      setPendingEdge((pe) => (pe ? { ...pe, x: p.x, y: p.y } : pe));
      return;
    }
    const d = dragRef.current;
    if (!d) return;
    const dx = (e.clientX - d.startX) / zoom;
    const dy = (e.clientY - d.startY) / zoom;
    if (!d.moved && Math.hypot(dx, dy) < 5) return;
    if (!d.moved) pushUndo();
    d.moved = true;
    const rect = canvasRef.current?.getBoundingClientRect();
    const panelW = desktop ? PANEL_W : 0;
    const maxX = ((rect?.width ?? 390) - panelW) / zoom - NODE_W - 6;
    const maxY = (rect?.height ?? 800) / zoom - NODE_H - 90;
    setNodes((ns) =>
      ns.map((n) =>
        n.id === d.id
          ? { ...n, x: Math.min(Math.max(d.nodeX + dx, 6), maxX), y: Math.min(Math.max(d.nodeY + dy, desktop ? 12 : 64), maxY) }
          : n
      )
    );
  };
  const onPointerUp = (node: FlowNode) => {
    const d = dragRef.current;
    dragRef.current = null;
    if (d && !d.moved) {
      setSelected(node.id);
      setSheet("node");
    }
  };

  // ---------- run simulation ----------
  const runSequence = useMemo(() => {
    const incoming = new Set(edges.map((e) => e.to));
    let cur = nodes.find((n) => !incoming.has(n.id) && edges.some((e) => e.from === n.id))?.id;
    const seq: { node: string; via: FlowEdge | null }[] = [];
    const seen = new Set<string>();
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      const via = edges.find((e) => e.to === cur) ?? null;
      seq.push({ node: cur, via });
      cur = edges.find((e) => e.from === cur)?.to;
    }
    nodes.forEach((n) => { if (!seen.has(n.id)) seq.push({ node: n.id, via: null }); });
    return seq;
  }, [nodes, edges]);

  const runOnce = () => {
    if (running) return;
    setRunning(true);
    setDoneNodes(new Set());
    setRunErrors({});
    const startedAt = Date.now();
    // Prefetch real on-chain reads (6 s cap), then execute the sequence up
    // front and reveal stepwise, so every node carries its real input/output
    // when the animation lands. Failed reads fall back to samples.
    void collectRunOverrides(nodes).then(({ overrides, liveCount }) => {
      const { io, provenance, errors } = executeRun(nodes, runSequence.map((s) => s.node), pinned, overrides);
      setRunErrors(errors);
      // Stats feed: local log always; server row too when signed in. Neither
      // blocks the run. A run with errored modules is a "failed" run.
      const status: "failed" | "success" = Object.keys(errors).length ? "failed" : "success";
      const record = {
        flowName: wfName,
        status,
        nodeCount: runSequence.length,
        chains: [...new Set(nodes.filter((n) => n.chain).map((n) => n.chain as string))],
        durationMs: Date.now() - startedAt,
        createdAt: new Date().toISOString(),
      };
      logRunLocal(record);
      void api.runs.record(record).catch(() => {});
      let i = 0;
      const step = () => {
        if (i >= runSequence.length) {
          setActiveNode(null);
          setActiveEdge(null);
          setRunning(false);
          setRunIO(io);
          setRunSources(provenance);
          const simulated = Object.values(provenance).filter((s) => s === "sample").length;
          const failedNames = Object.keys(errors)
            .map((id) => SERVICES[nodes.find((n) => n.id === id)?.service ?? "webhooks"].name)
            .filter((v, idx, a) => a.indexOf(v) === idx);
          showToast(
            failedNames.length
              ? `${failedNames.join(", ")} need your .env keys - marked red` +
                  (simulated ? `, ${simulated} simulated` : "")
              : `Run completed - ${runSequence.length} modules` +
                  (liveCount ? `, ${liveCount} live on-chain` : "") +
                  (simulated ? `, ${simulated} simulated` : "") +
                  ", data attached"
          );
          return;
        }
        const { node, via } = runSequence[i];
        setActiveEdge(via);
        setActiveNode(node);
        setDoneNodes((prev) => new Set(prev).add(node));
        i++;
        setTimeout(step, 850);
      };
      step();
    });
  };

  /** Run one node with its real upstream input (n8n's "execute node"). */
  const testNode = (id: string) => {
    const node = nodeById.get(id);
    if (!node || running) return;
    // Execute the prefix through this node so expressions referencing
    // upstream outputs resolve against freshly computed data.
    const order = runSequence.map((s) => s.node);
    const idx = order.indexOf(id);
    void collectRunOverrides(nodes).then(({ overrides, liveCount }) => {
      const { io, provenance } = executeRun(nodes, idx >= 0 ? order.slice(0, idx + 1) : order, pinned, overrides);
      setRunIO((prev) => ({ ...prev, ...io }));
      setRunSources((prev) => ({ ...prev, ...provenance }));
      showToast(
        `Tested ${SERVICES[node.service].name}` +
          (liveCount ? ` - ${liveCount} live on-chain read${liveCount > 1 ? "s" : ""}` : "")
      );
    });
  };

  const togglePin = (id: string) => {
    setPinned((prev) => {
      if (prev[id]) {
        const next = { ...prev };
        delete next[id];
        return next;
      }
      return { ...prev, [id]: runIO[id]?.output ?? { pinned: true } };
    });
    showToast(pinned[id] ? "Pin removed" : "Output pinned for the next run");
  };

  // ---------- add / remove ----------
  /** First free grid slot: no overlap with existing nodes (ports stay reachable)
   *  and clear of the desktop tools panel. */
  const placeNode = (idx: number) => {
    const pad = 28;
    const taken = (x: number, y: number) =>
      nodes.some(
        (n) => x < n.x + NODE_W + pad && x + NODE_W + pad > n.x && y < n.y + NODE_H + pad && y + NODE_H + pad > n.y
      );
    const canvasW = canvasRef.current?.clientWidth ?? (desktop ? 1200 : 390);
    const panelW = desktop ? PANEL_W + 24 : 0;
    const startX = desktop ? 60 : 24;
    const startY = desktop ? 90 : 120;
    const stepX = NODE_W + 36;
    const stepY = NODE_H + 40;
    const cols = Math.max(1, Math.floor((canvasW - panelW - startX - NODE_W) / stepX) + 1);
    for (let row = 0; row < 12; row++) {
      for (let col = 0; col < cols; col++) {
        const x = startX + col * stepX;
        const y = startY + row * stepY;
        if (x + NODE_W > canvasW - panelW - 8) continue;
        if (!taken(x, y)) return { x, y };
      }
    }
    return { x: startX + (idx % cols) * stepX, y: startY };
  };

  const addNode = (service: ServiceId) => {
    const s = SERVICES[service];
    pushUndo();
    const { x, y } = placeNode(nodes.length);
    const id = nextNodeId(service);
    setNodes((ns) => [...ns, { id, service, action: s.actions[0], x, y }]);
    setSheet(null);
    showToast(`${s.name} added — drag it into place`);
  };

  const addChain = (services: ServiceId[]) => {
    pushUndo();
    const baseX = desktop ? 90 : 66;
    const baseY = desktop ? 80 : 110;
    const newNodes: FlowNode[] = services.map((sid, i) => ({
      id: `${nextNodeId(sid)}-${i}`,
      service: sid,
      action: SERVICES[sid].actions[0],
      x: baseX + (i % 2) * 150,
      y: baseY + i * 132,
    }));
    const newEdges: FlowEdge[] = newNodes.slice(1).map((n, i) => ({ from: newNodes[i].id, to: n.id }));
    setNodes((ns) => [...ns, ...newNodes]);
    setEdges((es) => [...es, ...newEdges]);
    setSheet(null);
    showToast(`AI added a ${services.length}-module flow`);
  };

  const removeNode = useCallback((id: string) => {
    pushUndo();
    setNodes((ns) => ns.filter((n) => n.id !== id));
    setEdges((es) => es.filter((e) => e.from !== id && e.to !== id));
    setSheet(null);
    showToast("Module removed");
  }, [pushUndo, showToast]);

  // Keyboard shortcuts (desktop): Cmd/Ctrl+K palette, Delete/Backspace removes
  // the selected node or edge, Cmd/Ctrl+Z undo. Guards against firing while
  // typing in a field or with a sheet open.
  useEffect(() => {
    if (!desktop) return;
    const onKey = (e: KeyboardEvent) => {
      const typing =
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target instanceof HTMLElement && e.target.isContentEditable);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
        return;
      }
      if (typing || running || sheet) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selected) {
          e.preventDefault();
          removeNode(selected);
        } else if (selectedEdge) {
          e.preventDefault();
          removeEdge(selectedEdge);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [desktop, running, sheet, selected, selectedEdge, removeNode, removeEdge]);

  const setNodeChain = (id: string, chain: Chain) =>
    setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, chain } : n)));

  const setNodePair = (id: string, pair: Pair) =>
    setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, pair } : n)));

  const setNodeParam = (id: string, key: string, value: string) =>
    setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, params: { ...(n.params ?? {}), [key]: value } } : n)));

  const connectWallet = () => {
    setSheet(null);
    openConnectModal?.();
  };

  const flowSlug =
    wfName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "flow";

  // What `cre workflow simulate` will actually do, per node category - the
  // readiness manifest in the Deploy sheet renders this so nothing about
  // the real run is a surprise.
  const readiness = useMemo(() => {
    const reads = nodes.filter(
      (n) =>
        n.service === "price-feed" ||
        n.service === "wallet-balance" ||
        n.service === "gas-price" ||
        (n.service === "contract-call" && n.action === "Read contract"),
    );
    const writes = nodes.filter(
      (n) =>
        n.service === "token-transfer" ||
        n.service === "ccip" ||
        (n.service === "contract-call" && n.action === "Write contract"),
    );
    const posts = nodes.filter((n) =>
      ["slack", "discord", "telegram", "google-sheets", "http-request", "webhooks", "chatgpt", "gdrive", "youtube", "gmail", "notion", "calendar", "x", "canva"].includes(n.service),
    );
    const adapters = nodes.filter((n) => n.service === "swap" || n.service === "ccip");
    const secrets = [
      ...new Set(
        posts
          .map((n) => {
            const override = n.params?.secretName?.trim();
            if (override) return override;
            const def = getFieldsFor(n.service, n.action).find((d) => d.key === "secretName");
            return def ? fieldValue(def, n.params ?? {}) : null;
          })
          .filter((s): s is string => !!s),
      ),
    ];
    const writeChains = [...new Set(writes.map((n) => n.chain ?? "ethereum"))] as (keyof typeof CHAINS)[];
    return { reads, writes, posts, adapters, secrets, writeChains };
  }, [nodes]);

  const download = (blob: Blob, filename: string) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  /** Compile the canvas into a Chainlink CRE project and download it as a zip. */
  const exportCreProject = () => {
    try {
      const result = compileFlow(wfName, nodes, edges);
      const zipped = zipSync(
        Object.fromEntries(Object.entries(result.creFiles).map(([path, contents]) => [path, strToU8(contents)]))
      );
      download(new Blob([zipped.buffer as ArrayBuffer], { type: "application/zip" }), `${flowSlug}.zip`);
      showToast(`CRE project compiled — ${result.web3Modules} on-chain, ${result.web2Modules} app modules`);
      return true;
    } catch (err) {
      showToast(err instanceof BlueprintError ? err.message : "Export failed");
      return false;
    }
  };

  /** Download the blueprint JSON (secondary export). */
  const exportBlueprint = () => {
    try {
      const result = compileFlow(wfName, nodes, edges);
      download(new Blob([result.blueprintJson], { type: "application/json" }), `${flowSlug}.stringz.json`);
      showToast(`Blueprint compiled — ${result.web3Modules} on-chain, ${result.web2Modules} app modules`);
    } catch (err) {
      showToast(err instanceof BlueprintError ? err.message : "Export failed");
    }
  };

  useEffect(() => {
    if (!wallet) return;
    const t = setTimeout(() => showToast(`Wallet connected — ${wallet}`), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet]);

  const selectedNode = selected ? nodeById.get(selected) : undefined;

  // Resolve a {{nodeId.field}} token to its source node + output shape for the
  // template-field hover popover: live run data if the flow has been run, else
  // the sample shape. Returns null for an unknown id so the chip renders muted.
  const resolveRef = useCallback(
    (id: string) => {
      const node = nodeById.get(id);
      if (!node) return null;
      return { node, output: runIO[id]?.output ?? sampleOutput(node) };
    },
    [nodeById, runIO],
  );

  useEffect(() => () => { if (toastTimer) clearTimeout(toastTimer); }, []);

  const zoomBy = (delta: number) => setZoom((z) => Math.min(1.4, Math.max(0.6, Math.round((z + delta) * 10) / 10)));

  const runButton = labeled ? (
    <button
      onClick={runOnce}
      aria-label="Simulate"
      className="flex items-center gap-2 rounded-full bg-white/90 py-1.5 pl-1.5 pr-4 shadow-lg backdrop-blur transition active:scale-95"
    >
      <span className={`flex h-9 w-9 items-center justify-center rounded-full text-white ${running ? "bg-[#3f6b4f]" : "bg-[#1a1a1a]"}`}>
        <Play size={15} fill="currentColor" />
      </span>
      <span className="text-[13.5px] font-semibold text-[#1a1a1a]">{running ? "Simulating…" : "Simulate"}</span>
    </button>
  ) : (
    <button
      onClick={runOnce}
      aria-label={running ? "Simulating" : "Simulate"}
      title="Simulate"
      className={`flex h-11 w-11 items-center justify-center rounded-full text-white shadow-lg backdrop-blur transition active:scale-95 ${running ? "bg-[#3f6b4f]" : "bg-[#1a1a1a]"}`}
    >
      <Play size={16} fill="currentColor" />
    </button>
  );

  const deployButton = labeled ? (
    <button
      onClick={() => setSheet("deploy")}
      className="flex items-center gap-1.5 rounded-full bg-[#1a1a1a] py-1.5 pl-3.5 pr-4 text-white shadow-lg backdrop-blur transition active:scale-95"
    >
      <Rocket size={14} />
      <span className="text-[13.5px] font-semibold">Deploy</span>
    </button>
  ) : (
    <button
      onClick={() => setSheet("deploy")}
      className="flex h-11 w-11 items-center justify-center rounded-full bg-[#1a1a1a] text-white shadow-lg transition active:scale-95"
      aria-label="Deploy"
    >
      <Rocket size={16} />
    </button>
  );

  const walletButton = labeled ? (
    <button
      onClick={() => (wallet ? showToast(`Connected: ${wallet}`) : setSheet("wallet"))}
      className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 shadow-lg backdrop-blur transition active:scale-95 ${
        wallet ? "bg-white/90" : "bg-[#3f6b4f] text-white"
      }`}
      aria-label="Connect wallet"
    >
      <Wallet size={14} />
      <span className="text-[12px] font-bold">{wallet ? wallet : "Connect"}</span>
    </button>
  ) : (
    <button
      onClick={() => (wallet ? showToast(`Connected: ${wallet}`) : setSheet("wallet"))}
      className={`flex h-11 w-11 items-center justify-center rounded-full shadow-lg backdrop-blur transition active:scale-95 ${
        wallet ? "bg-white/90 text-[#3f6b4f]" : "bg-[#3f6b4f] text-white"
      }`}
      aria-label={wallet ? `Connected: ${wallet}` : "Connect wallet"}
    >
      {wallet ? <Check size={16} strokeWidth={3} /> : <Wallet size={16} />}
    </button>
  );

  const [proFeature, setProFeature] = useState<string | null>(null);

  const saveFlow = async () => {
    try {
      const { id } = await api.flows.save({ name: wfName, nodes, edges });
      localStorage.setItem("stringz:last-flow", id);
      try {
        localStorage.setItem("stringz:canvas-draft", JSON.stringify({ name: wfName, nodes, edges, dirty: false }));
      } catch {
        // drafts are best-effort
      }
      showToast("Scenario saved to your account");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.toLowerCase().includes("upgrade to pro")) {
        setProFeature("Saving more than 3 flows");
      } else {
        showToast(msg.toLowerCase().includes("sign in") ? "Sign in via /auth to save flows" : "Couldn't save - is the server running?");
      }
    }
  };

  /** Load a saved scenario onto the canvas (undoable back to the previous state). */
  const loadFlow = (flow: SavedFlow) => {
    pushUndo();
    localStorage.setItem("stringz:last-flow", flow.id);
    localStorage.setItem("stringz:draft-clean", "1");
    setNodes(flow.nodes as FlowNode[]);
    setEdges(flow.edges as FlowEdge[]);
    setWfName(flow.name);
    setSelected(null);
    setSelectedEdge(null);
    setSheet(null);
    showToast(`Loaded "${flow.name}"`);
  };

  const toolbarButtons: { icon: React.ElementType; label: string; fn: () => void; primary?: boolean }[] = [
    { icon: Save, label: "Save", fn: () => void saveFlow() },
    { icon: FolderOpen, label: "Flows", fn: () => setSheet("flows") },
    { icon: Upload, label: "Export", fn: exportBlueprint },
    { icon: Settings2, label: "Scenario settings", fn: () => setSheet("settings"), primary: true },
    ...(desktop ? [{ icon: Undo2, label: "Undo", fn: undo }] : []),
    { icon: History, label: "History", fn: () => setSheet("history") },
    { icon: Ellipsis, label: "More", fn: () => setSheet("more") },
  ];

  // Boot gate: until the restore decision above settles (draft vs last saved
  // flow vs demo), rendering the canvas would flash the demo INITIAL_NODES
  // for a frame. Show the brand loader instead, then paint the definitive
  // flow exactly once.
  if (!hydrated) return <FullLoader fill />;

  return (
    <div className="relative h-full w-full select-none overflow-hidden bg-white">
      {/* dotted canvas */}
      <div
        ref={canvasRef}
        className="absolute inset-0 touch-none"
        style={{
          backgroundImage: "radial-gradient(#dfe5df 1.3px, transparent 1.3px)",
          backgroundSize: "20px 20px",
          cursor: pendingEdge ? "crosshair" : undefined,
        }}
        onPointerDown={() => setSelectedEdge(null)}
        onPointerMove={onPointerMove}
        onPointerUp={() => {
          dragRef.current = null;
          finishConnect();
        }}
      >
        <div
          className="absolute left-0 top-0"
          style={{
            width: `${100 / zoom}%`,
            height: `${100 / zoom}%`,
            transform: `scale(${zoom})`,
            transformOrigin: "0 0",
          }}
        >
          {/* edges */}
          <svg className="absolute inset-0 h-full w-full pointer-events-none">
            {edges.map((e) => {
              const a = nodeById.get(e.from);
              const b = nodeById.get(e.to);
              if (!a || !b) return null;
              const { d } = edgePath(a, b);
              const isActive = (activeEdge && activeEdge.from === e.from && activeEdge.to === e.to) ||
                (selectedEdge && selectedEdge.from === e.from && selectedEdge.to === e.to);
              return (
                <g key={`${e.from}-${e.to}`}>
                  <path
                    d={d}
                    fill="none"
                    stroke={isActive ? "#3f6b4f" : "#c2cdc3"}
                    strokeWidth={isActive ? 2.2 : 1.6}
                    strokeLinecap="round"
                    strokeDasharray={isActive ? "5 6" : undefined}
                    className={isActive ? "edge-dash" : undefined}
                  />
                  {isActive && (
                    <circle r="4.5" fill="#3f6b4f">
                      <animateMotion dur="0.8s" fill="freeze" path={d} />
                    </circle>
                  )}
                </g>
              );
            })}
            {/* pending connection rubber band */}
            {pendingEdge &&
              (() => {
                const s = nodeById.get(pendingEdge.from);
                if (!s) return null;
                const hovering = nodeAtPoint(pendingEdge.x, pendingEdge.y, pendingEdge.from);
                return (
                  <g>
                    <path
                      d={`M ${s.x + NODE_W} ${s.y + NODE_H / 2} L ${pendingEdge.x} ${pendingEdge.y}`}
                      fill="none"
                      stroke="#3f6b4f"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeDasharray="5 6"
                      className="edge-dash"
                    />
                    <circle cx={pendingEdge.x} cy={pendingEdge.y} r="5" fill={hovering ? "#3f6b4f" : "#ffffff"} stroke="#3f6b4f" strokeWidth="2" />
                    {hovering && (
                      <rect
                        x={hovering.x - 4} y={hovering.y - 4} width={NODE_W + 8} height={NODE_H + 8}
                        rx="30" fill="none" stroke="#3f6b4f" strokeWidth="2" strokeDasharray="4 4"
                      />
                    )}
                  </g>
                );
              })()}
          </svg>

          {/* pencil markers (edge edit handles) */}
          {edges.map((e) => {
            const a = nodeById.get(e.from);
            const b = nodeById.get(e.to);
            if (!a || !b) return null;
            const { mid } = edgePath(a, b);
            const isSel = selectedEdge && selectedEdge.from === e.from && selectedEdge.to === e.to;
            return (
              <div key={`mid-${e.from}-${e.to}`} className="absolute z-20" style={{ left: mid.x - 10, top: mid.y - 10 }}>
                <button
                  onClick={(ev) => {
                    ev.stopPropagation();
                    setPendingEdge(null);
                    setSelectedEdge(isSel ? null : e);
                  }}
                  onPointerDown={(ev) => ev.stopPropagation()}
                  aria-label="Edit connection"
                  className={`flex h-5 w-5 items-center justify-center rounded-full border shadow-sm transition ${
                    isSel ? "border-[#3f6b4f] bg-[#3f6b4f]" : "border-gray-100 bg-white hover:border-[#3f6b4f]"
                  }`}
                >
                  <Pencil size={10} className={isSel ? "text-white" : "text-gray-400"} />
                </button>
                {isSel && (
                  // stopPropagation on pointerdown: the canvas clears edge selection on
                  // pointerdown, which would unmount this popover before its buttons' clicks land.
                  <div
                    onPointerDown={(ev) => ev.stopPropagation()}
                    className="absolute left-1/2 top-6 flex -translate-x-1/2 items-center gap-1 rounded-full bg-[#1a1a1a] p-1 shadow-lg"
                  >
                    <button
                      onClick={(ev) => {
                        ev.stopPropagation();
                        startReconnect(e);
                      }}
                      title="Reconnect"
                      aria-label="Reconnect"
                      className="flex h-7 w-7 items-center justify-center rounded-full text-white transition hover:bg-white/20 active:scale-90"
                    >
                      <RefreshCcw size={12} />
                    </button>
                    <button
                      onClick={(ev) => {
                        ev.stopPropagation();
                        removeEdge(e);
                      }}
                      title="Delete connection"
                      aria-label="Delete connection"
                      className="flex h-7 w-7 items-center justify-center rounded-full text-[#F5A9B8] transition hover:bg-white/20 active:scale-90"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          {/* nodes */}
          {nodes.map((n) => {
            const svc = SERVICES[n.service];
            const isActive = activeNode === n.id;
            const hasError = !!runErrors[n.id];
            const isDone = doneNodes.has(n.id) && !isActive && !hasError;
            return (
              <motion.div
                key={n.id}
                className="absolute z-10 cursor-grab active:cursor-grabbing"
                style={{ left: n.x, top: n.y, width: NODE_W, zIndex: topNode === n.id ? 30 : undefined }}
                animate={isActive ? { scale: [1, 1.07, 1] } : { scale: 1 }}
                transition={isActive ? { duration: 0.8, repeat: Infinity } : { duration: 0.2 }}
                onPointerDown={(e) => onNodePointerDown(e, n)}
                onPointerUp={() => onPointerUp(n)}
              >
                <div
                  className="flex h-[92px] w-[110px] flex-col items-center justify-center gap-1 rounded-[26px] px-2 text-center transition-shadow"
                  style={{
                    backgroundColor: svc.tint,
                    boxShadow: isActive
                      ? "0 0 0 3px #3f6b4f55, 0 14px 30px -10px rgba(30,50,38,0.35)"
                      : hasError
                        ? "0 0 0 2px #C0435A, 0 8px 18px -8px rgba(120,30,45,0.3)"
                        : isDone
                          ? "0 0 0 2px #8fb89c, 0 8px 18px -8px rgba(30,50,38,0.25)"
                          : "0 8px 18px -10px rgba(30,50,38,0.25)",
                    border: svc.tint === "#FFFFFF" ? "1px solid #ececec" : "none",
                  }}
                >
                  {svc.icon}
                  <div className="text-[12.5px] font-bold leading-tight text-[#1a1a1a]">{svc.name}</div>
                  {n.service === "price-feed" ? (
                    <LivePrice compact chain={n.chain ?? "ethereum"} pair={(n.pair as Pair) ?? DEFAULT_PAIR} />
                  ) : n.service === "wallet-balance" ? (
                    <LiveTrigger compact kind="balance" chain={n.chain ?? "ethereum"} address={n.params?.address} />
                  ) : n.service === "gas-price" ? (
                    <LiveTrigger compact kind="gas" />
                  ) : (
                    <div className="text-[9.5px] leading-tight text-gray-500">{n.action}</div>
                  )}
                  {n.chain && <ChainBadge chain={n.chain} />}
                </div>
                <button
                  onPointerDown={(e) => startConnect(e, n)}
                  aria-label={`Connect from ${svc.name}`}
                  className="absolute -right-2 top-1/2 flex h-5 w-5 -translate-y-1/2 cursor-crosshair items-center justify-center rounded-full border border-gray-100 bg-white shadow transition hover:border-[#3f6b4f] hover:text-[#3f6b4f] active:scale-110"
                >
                  <Plus size={10} className="text-gray-400" />
                </button>
                <button
                  onPointerDown={(e) => startConnect(e, n)}
                  aria-label={`Connect from ${svc.name}`}
                  className="absolute -bottom-2 left-1/2 flex h-5 w-5 -translate-x-1/2 cursor-crosshair items-center justify-center rounded-full border border-gray-100 bg-white shadow transition hover:border-[#3f6b4f] hover:text-[#3f6b4f] active:scale-110"
                >
                  <Plus size={10} className="text-gray-400" />
                </button>
                {hasError ? (
                  <div
                    className="absolute -left-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-[#C0435A]"
                    title={runErrors[n.id]}
                  >
                    <AlertTriangle size={10} className="text-white" strokeWidth={3} />
                  </div>
                ) : (
                  isDone && (
                    <div className="absolute -left-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-[#3f6b4f]">
                      <Check size={11} className="text-white" strokeWidth={3} />
                    </div>
                  )
                )}
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* ---------- phone chrome ---------- */}
      {!desktop && (
        <>
          <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-4 pt-12">
            <button
              onClick={() => setSheet("menu")}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-[#1a1a1a] text-white shadow-lg transition active:scale-95"
              aria-label="Menu"
            >
              <Menu size={19} />
            </button>
            {runButton}
            {deployButton}
            {walletButton}
            <button
              onClick={() => onNavigate("templates")}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-white/90 shadow-lg backdrop-blur transition active:scale-95"
              aria-label="Search templates"
            >
              <Search size={18} className="text-[#1a1a1a]" />
            </button>
          </div>

          <div className="absolute left-3 top-[27%] z-20 flex flex-col items-center gap-3.5">
            <button
              onClick={() => setSheet("add")}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-[#1a1a1a] text-white shadow-md transition active:scale-90"
              aria-label="Add module"
            >
              <Plus size={17} />
            </button>
            {RAIL_SERVICES.map((sid) => (
              <button
                key={sid}
                onClick={() => addNode(sid)}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-md transition active:scale-90 [&>svg]:h-[18px] [&>svg]:w-[18px]"
                aria-label={`Add ${SERVICES[sid].name}`}
              >
                {SERVICES[sid].icon}
              </button>
            ))}
          </div>

          <button
            onClick={() => setSheet("tools")}
            className="absolute right-0 top-[52%] z-20 rounded-l-xl bg-white px-1.5 py-3 shadow-md"
          >
            <span className="text-[10px] font-semibold tracking-widest text-gray-400 [writing-mode:vertical-rl]">TOOLS</span>
          </button>

          <div className="absolute inset-x-0 bottom-0 z-20 flex items-center justify-around bg-gradient-to-t from-white via-white/85 to-transparent px-8 pb-7 pt-3">
            {toolbarButtons.map(({ icon: Icon, label, fn, primary }) => (
              <button
                key={label}
                onClick={fn}
                aria-label={label}
                className={
                  primary
                    ? "flex h-12 w-12 items-center justify-center rounded-full bg-[#1a1a1a] text-white shadow-lg transition active:scale-90"
                    : "flex h-10 w-10 items-center justify-center rounded-full bg-white text-gray-500 shadow-md transition active:scale-90"
                }
              >
                <Icon size={primary ? 20 : 17} />
              </button>
            ))}
          </div>
        </>
      )}

      {/* ---------- desktop chrome ---------- */}
      {desktop && (
        <>
          <div className="absolute bottom-5 left-5 z-20 flex items-center gap-2.5">
            {runButton}
            {deployButton}
            {walletButton}
          </div>

          <div
            className="absolute bottom-5 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full bg-white/95 px-3 py-2 shadow-lg backdrop-blur"
            style={{ left: `calc((100% - ${PANEL_W}px) / 2)` }}
          >
            <button
              onClick={() => setPaletteOpen(true)}
              aria-label="Add module"
              title="Add module (Cmd/Ctrl+K)"
              className="flex h-10 items-center gap-1.5 rounded-full bg-[#1a1a1a] pl-3.5 pr-3 text-[13px] font-bold text-white transition active:scale-90"
            >
              <Plus size={15} />
              Add
              <span className="rounded-md bg-white/15 px-1.5 py-0.5 text-[10px] font-semibold text-white/70">K</span>
            </button>
            {toolbarButtons.map(({ icon: Icon, label, fn, primary }) => (
              <button
                key={label}
                onClick={fn}
                aria-label={label}
                title={label}
                className={
                  primary
                    ? "flex h-10 w-10 items-center justify-center rounded-full bg-[#1a1a1a] text-white transition active:scale-90"
                    : "flex h-9 w-9 items-center justify-center rounded-full text-gray-500 transition hover:bg-gray-100 active:scale-90"
                }
              >
                <Icon size={primary ? 18 : 16} />
              </button>
            ))}
          </div>

          <div
            className="absolute z-20 flex items-center gap-2 rounded-full bg-white/95 px-2 py-2 shadow-lg backdrop-blur"
            style={{ top: 16, right: PANEL_W + 24 }}
          >
            <button onClick={() => zoomBy(-0.1)} aria-label="Zoom out" className="flex h-8 w-8 items-center justify-center rounded-full text-gray-500 transition hover:bg-gray-100 active:scale-90">
              <Minus size={15} />
            </button>
            <span className="w-11 text-center text-[12px] font-bold text-gray-500">{Math.round(zoom * 100)}%</span>
            <button onClick={() => zoomBy(0.1)} aria-label="Zoom in" className="flex h-8 w-8 items-center justify-center rounded-full text-gray-500 transition hover:bg-gray-100 active:scale-90">
              <Plus size={15} />
            </button>
          </div>

          <div
            className="absolute bottom-3 right-3 top-3 z-20 w-[300px] rounded-[1.75rem] bg-white p-4 shadow-[0_20px_50px_-20px_rgba(30,50,38,0.35)]"
          >
            <ToolsPanel onAdd={addNode} onAIHelp={() => setSheet("ai")} />
          </div>
        </>
      )}

      {/* ---------- sheets ---------- */}
      <AddPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} onAdd={addNode} />

      <Sheet open={sheet === "node" && !!selectedNode} onClose={() => setSheet(null)}>
        {selectedNode && (
          <div>
            <div className="mb-4 flex items-center gap-3">
              <div
                className="flex h-14 w-14 items-center justify-center rounded-2xl"
                style={{ backgroundColor: SERVICES[selectedNode.service].tint }}
              >
                {SERVICES[selectedNode.service].icon}
              </div>
              <div className="min-w-0">
                <div className="text-lg font-bold text-[#1a1a1a]">{SERVICES[selectedNode.service].name}</div>
                <button
                  onClick={() => {
                    navigator.clipboard?.writeText(selectedNode.id);
                    showToast("Node ID copied");
                  }}
                  title={`Copy node ID: ${selectedNode.id}`}
                  className="mt-0.5 flex max-w-full items-center gap-1 text-[12px] text-gray-500 transition active:scale-95 hover:text-gray-700"
                >
                  <span className="font-mono">
                    {selectedNode.id.length > 20
                      ? `${selectedNode.id.slice(0, 10)}…${selectedNode.id.slice(-6)}`
                      : selectedNode.id}
                  </span>
                  <Copy size={12} className="shrink-0" />
                </button>
              </div>
            </div>

            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Action</div>
            <div className="mb-4 flex flex-wrap gap-2">
              {SERVICES[selectedNode.service].actions.map((a) => (
                <button
                  key={a}
                  onClick={() => setNodes((ns) => ns.map((n) => (n.id === selectedNode.id ? { ...n, action: a } : n)))}
                  className={`rounded-full px-3.5 py-1.5 text-[12.5px] font-medium transition ${
                    selectedNode.action === a ? "bg-[#1a1a1a] text-white" : "bg-gray-100 text-gray-600 active:bg-gray-200"
                  }`}
                >
                  {a}
                </button>
              ))}
            </div>

            {SERVICES[selectedNode.service].description && (
              <p className="mb-4 rounded-2xl bg-gray-50 px-4 py-3 text-[12px] leading-snug text-gray-600">
                {SERVICES[selectedNode.service].description}
              </p>
            )}

            {SERVICES[selectedNode.service].needsChain && (
              <>
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Chain</div>
                <div className="mb-4 flex flex-wrap gap-2">
                  {(Object.keys(CHAINS) as Chain[]).map((c) => (
                    <button
                      key={c}
                      onClick={() => setNodeChain(selectedNode.id, c)}
                      className={`rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold transition ${
                        (selectedNode.chain ?? "ethereum") === c
                          ? "bg-[#1a1a1a] text-white"
                          : "bg-gray-100 text-gray-600 active:bg-gray-200"
                      }`}
                    >
                      {CHAINS[c].name}
                    </button>
                  ))}
                </div>
                <div className="mb-4 flex items-center justify-between rounded-2xl bg-gray-50 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Wallet size={15} className="text-gray-400" />
                    <span className="text-[13px] font-medium text-[#1a1a1a]">Signer</span>
                  </div>
                  <button
                    onClick={() => (wallet ? showToast(`Using ${wallet}`) : setSheet("wallet"))}
                    className="rounded-full bg-white px-3 py-1.5 text-[12px] font-bold text-[#3f6b4f] shadow-sm transition active:scale-95"
                  >
                    {wallet ? wallet : "Connect wallet"}
                  </button>
                </div>

                {selectedNode.service === "price-feed" && (
                  <>
                    <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Pair</div>
                    <div className="mb-4 flex flex-wrap gap-2">
                      {PRICE_PAIRS.map((p) => {
                        const supported = !!getFeedAddress(selectedNode.chain ?? "ethereum", p);
                        return (
                          <button
                            key={p}
                            disabled={!supported}
                            onClick={() => setNodePair(selectedNode.id, p)}
                            className={`rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold transition ${
                              (selectedNode.pair ?? DEFAULT_PAIR) === p
                                ? "bg-[#1a1a1a] text-white"
                                : supported
                                  ? "bg-gray-100 text-gray-600 active:bg-gray-200"
                                  : "cursor-not-allowed bg-gray-50 text-gray-300"
                            }`}
                          >
                            {p}
                            {!supported && " · soon"}
                          </button>
                        );
                      })}
                    </div>
                    <div className="mb-4">
                      <LivePrice chain={selectedNode.chain ?? "ethereum"} pair={(selectedNode.pair as Pair) ?? DEFAULT_PAIR} />
                    </div>
                  </>
                )}
              </>
            )}

            <NodeFields node={selectedNode} onParam={(key, value) => setNodeParam(selectedNode.id, key, value)} resolveRef={resolveRef} />

            {(selectedNode.service === "wallet-balance" || selectedNode.service === "gas-price") && (
              <div className="mb-4">
                <LiveTrigger
                  kind={selectedNode.service === "wallet-balance" ? "balance" : "gas"}
                  chain={selectedNode.chain ?? "ethereum"}
                  address={selectedNode.params?.address}
                />
              </div>
            )}

            <RunData
              io={runIO[selectedNode.id]}
              pinned={!!pinned[selectedNode.id]}
              onTogglePin={() => togglePin(selectedNode.id)}
              source={runSources[selectedNode.id]}
              error={runErrors[selectedNode.id]}
            />

            {selectedNode.service === "contract-call" && (
              <AbiFetcher node={selectedNode} onParam={(key, value) => setNodeParam(selectedNode.id, key, value)} />
            )}

            {WRITE_SERVICES.has(selectedNode.service) && (
              <button
                onClick={() => setSheet("txpreview")}
                className="mb-4 flex w-full items-center justify-center gap-2 rounded-full bg-[#EAF2EA] py-3 text-[13.5px] font-semibold text-[#3f6b4f] transition active:scale-[0.98]"
              >
                <ShieldCheck size={15} /> Preview transaction
              </button>
            )}

            <div className="mb-5 flex items-center justify-between rounded-2xl bg-gray-50 px-4 py-3">
              <span className="text-[13.5px] font-medium text-[#1a1a1a]">Module enabled</span>
              <button
                onClick={() => setEnabled((m) => ({ ...m, [selectedNode.id]: !(m[selectedNode.id] ?? true) }))}
                className={`h-7 w-12 rounded-full p-1 transition ${(enabled[selectedNode.id] ?? true) ? "bg-[#3f6b4f]" : "bg-gray-300"}`}
              >
                <div
                  className={`h-5 w-5 rounded-full bg-white shadow transition-transform ${
                    (enabled[selectedNode.id] ?? true) ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => testNode(selectedNode.id)}
                className="flex flex-1 items-center justify-center gap-2 rounded-full bg-gray-100 py-3 text-[13.5px] font-semibold text-[#1a1a1a] transition active:scale-[0.98]"
              >
                <FlaskConical size={15} /> Test module
              </button>
              <button
                onClick={() => removeNode(selectedNode.id)}
                className="flex flex-1 items-center justify-center gap-2 rounded-full bg-[#FBE9EC] py-3 text-[13.5px] font-semibold text-[#C0435A] transition active:scale-[0.98]"
              >
                <Trash2 size={15} /> Remove
              </button>
            </div>
          </div>
        )}
      </Sheet>

      <Sheet open={sheet === "add"} onClose={() => setSheet(null)} title="Add a module">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Web3</div>
        <div className="mb-4 grid grid-cols-3 gap-3">
          {(["evm-event", "price-feed", "contract-call", "token-transfer", "ccip", "swap"] as ServiceId[]).map((sid) => (
            <button
              key={sid}
              onClick={() => addNode(sid)}
              className="flex flex-col items-center gap-2 rounded-3xl py-4 transition active:scale-95"
              style={{ backgroundColor: SERVICES[sid].tint }}
            >
              {SERVICES[sid].icon}
              <span className="text-[11.5px] font-semibold text-[#1a1a1a]">{SERVICES[sid].name}</span>
            </button>
          ))}
        </div>
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Apps & tools</div>
        <div className="grid grid-cols-3 gap-3">
          {(Object.keys(SERVICES) as ServiceId[]).filter((sid) => !SERVICES[sid].isWeb3).map((sid) => (
            <button
              key={sid}
              onClick={() => addNode(sid)}
              className="flex flex-col items-center gap-2 rounded-3xl py-4 transition active:scale-95"
              style={{ backgroundColor: SERVICES[sid].tint, border: SERVICES[sid].tint === "#FFFFFF" ? "1px solid #eee" : "none" }}
            >
              {SERVICES[sid].icon}
              <span className="text-[11.5px] font-semibold text-[#1a1a1a]">{SERVICES[sid].name}</span>
            </button>
          ))}
        </div>
      </Sheet>

      <Sheet open={sheet === "menu"} onClose={() => setSheet(null)} title="Stringz">
        <div className="mb-4 rounded-2xl bg-gray-50 px-4 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Current scenario</div>
          <div className="text-[15px] font-bold text-[#1a1a1a]">{wfName}</div>
          <div className="text-[12px] text-gray-500">{nodes.length} modules · {edges.length} connections</div>
        </div>
        {([
          { key: "canvas", label: "Canvas", desc: "Build and edit your workflow" },
          { key: "templates", label: "Templates", desc: "Ready-made automations" },
          { key: "org", label: "My Organization", desc: "Quotas, teams and members" },
          { key: "stats", label: "Statistics", desc: "Usage and performance" },
          { key: "settings", label: "Settings", desc: "Profile, wallet, plan and preferences" },
        ] as const).map((item) => (
          <button
            key={item.key}
            onClick={() => { setSheet(null); if (item.key !== "canvas") onNavigate(item.key); }}
            className="mb-2 flex w-full items-center justify-between rounded-2xl bg-gray-50 px-4 py-3.5 text-left transition active:bg-gray-100"
          >
            <div>
              <div className="text-[14.5px] font-semibold text-[#1a1a1a]">{item.label}</div>
              <div className="text-[11.5px] text-gray-500">{item.desc}</div>
            </div>
            <Sparkles size={15} className="text-gray-300" />
          </button>
        ))}
        <button
          onClick={() => { setSheet(null); onNewScenario(); }}
          className="mt-1 w-full rounded-full bg-[#1a1a1a] py-3 text-[14px] font-semibold text-white transition active:scale-[0.98]"
        >
          ＋ New scenario
        </button>
        <Link
          to="/"
          className="mt-2 block w-full rounded-full bg-gray-100 py-3 text-center text-[13px] font-semibold text-gray-500 transition active:scale-[0.98]"
        >
          ← Back to stringz.io
        </Link>
      </Sheet>

      <Sheet open={sheet === "settings"} onClose={() => setSheet(null)} title="Scenario settings">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Name</div>
        <input
          value={wfName}
          onChange={(e) => setWfName(e.target.value)}
          className="mb-4 w-full rounded-2xl bg-gray-50 px-4 py-3 text-[14.5px] font-medium text-[#1a1a1a] outline-none focus:ring-2 focus:ring-[#3f6b4f]/30"
        />
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Schedule</div>
        <div className="mb-5 flex flex-wrap gap-2">
          {["On demand", "Every 15 min", "Hourly", "Daily"].map((s) => (
            <button
              key={s}
              onClick={() => setSchedule(s)}
              className={`rounded-full px-3.5 py-1.5 text-[12.5px] font-medium transition ${
                schedule === s ? "bg-[#1a1a1a] text-white" : "bg-gray-100 text-gray-600"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <button
          onClick={() => { setSheet(null); showToast("Settings saved"); }}
          className="w-full rounded-full bg-[#1a1a1a] py-3 text-[14px] font-semibold text-white transition active:scale-[0.98]"
        >
          Save settings
        </button>
      </Sheet>

      <Sheet open={sheet === "history"} onClose={() => setSheet(null)} title="Run history">
        {RUN_HISTORY.map((r, i) => (
          <div key={i} className="mb-2 flex items-center justify-between rounded-2xl bg-gray-50 px-4 py-3">
            <div className="flex items-center gap-3">
              <span className={`h-2.5 w-2.5 rounded-full ${r.ok ? "bg-emerald-500" : "bg-rose-400"}`} />
              <div>
                <div className="text-[13.5px] font-semibold text-[#1a1a1a]">{r.name}</div>
                <div className="text-[11.5px] text-gray-500">{r.when}</div>
              </div>
            </div>
            <span className="text-[12px] font-medium text-gray-400">{r.ok ? r.dur : "Failed"}</span>
          </div>
        ))}
      </Sheet>

      <Sheet open={sheet === "txpreview" && !!selectedNode} onClose={() => setSheet(null)} title="Transaction preview">
        {selectedNode &&
          (() => {
            const p = selectedNode.params ?? {};
            const rows: [string, string][] = [
              ["Chain", CHAINS[(selectedNode.chain ?? "ethereum") as Chain].name],
              ["Action", selectedNode.action],
            ];
            if (selectedNode.service === "token-transfer") {
              rows.push(["To", p.toAddress || "-"], ["Token", p.tokenAddress || "Native (ETH)"], ["Amount", p.amount || "-"]);
            } else if (selectedNode.service === "contract-call") {
              const call = describeCall(p);
              rows.push(["Contract", p.contractAddress || "-"], ["Call", `${call.label}${call.detail}`]);
              const data = encodeCallData(p);
              rows.push(["Calldata", data === "0x" ? "incomplete config - fetch the ABI and pick a function" : data]);
            } else if (selectedNode.service === "swap") {
              rows.push(["Swap", `${p.amountIn || "?"} ${p.tokenIn || "ETH"} to ${p.tokenOut || "USDC"}`], ["Slippage", p.slippage || "-"], ["Limit price", p.limitPrice || "-"]);
            } else if (selectedNode.service === "ccip") {
              rows.push(["To chain", p.destChain || "-"], ["Recipient", p.toAddress || p.contractAddress || "-"], ["Payload", (p.amount || p.message || "-").slice(0, 40)]);
            }
            return (
              <div>
                <div className="mb-4 space-y-2">
                  {rows.map(([label, value]) => (
                    <div key={label} className="rounded-2xl bg-gray-50 px-4 py-3">
                      <div className="text-[10.5px] font-bold uppercase tracking-wider text-gray-300">{label}</div>
                      <div className="mt-0.5 break-all font-mono text-[12.5px] font-medium text-[#1a1a1a]">{value}</div>
                    </div>
                  ))}
                </div>
                <div className="rounded-2xl bg-[#EAF2EA] px-4 py-3 text-[11.5px] leading-snug text-[#3f6b4f]">
                  {selectedNode.action === "Estimate gas"
                    ? "This estimates gas for the compiled calldata without submitting anything - estimation runs read-only against the chain. Stringz never submits or holds keys."
                    : "This is exactly what the compiled CRE workflow will submit, signed by your wallet. Stringz never submits or holds keys. Live gas estimation arrives with live runs."}
                </div>
              </div>
            );
          })()}
      </Sheet>

      <FlowsSheet open={sheet === "flows"} onClose={() => setSheet(null)} onLoad={loadFlow} />

      <Sheet open={sheet === "more"} onClose={() => setSheet(null)} title="More actions">
        {[
          { label: "Duplicate scenario", fn: () => showToast("Scenario duplicated") },
          { label: "Export blueprint", fn: exportBlueprint },
          { label: "Share with team", fn: () => showToast("Invite link copied") },
          { label: "Undo last change", fn: undo },
          { label: "Delete scenario", fn: () => showToast("Move to trash? Hold to confirm") },
        ].map((a) => (
          <button
            key={a.label}
            onClick={() => { setSheet(null); a.fn(); }}
            className="mb-2 flex w-full items-center justify-between rounded-2xl bg-gray-50 px-4 py-3.5 text-[14px] font-semibold text-[#1a1a1a] transition active:bg-gray-100"
          >
            {a.label}
          </button>
        ))}
      </Sheet>

      <Sheet open={sheet === "tools"} onClose={() => setSheet(null)} title="Tools">
        <div className="h-[52dvh]">
          <ToolsPanel onAdd={addNode} onAIHelp={() => setSheet("ai")} />
        </div>
      </Sheet>

      <Sheet open={sheet === "ai"} onClose={() => setSheet(null)} title="AI Help">
        <p className="mb-4 text-[12.5px] leading-relaxed text-gray-500">
          Describe what you want to automate, or pick a suggestion — I'll draft the modules and wire them up for you.
        </p>
        <div className="mb-4 flex items-center gap-2 rounded-full bg-gray-100 px-4 py-3">
          <Sparkles size={15} className="shrink-0 text-[#3f6b4f]" />
          <input
            placeholder="e.g. summarize my emails every morning…"
            className="w-full bg-transparent text-[13px] font-medium text-[#1a1a1a] outline-none placeholder:text-gray-400"
            onKeyDown={(e) => { if (e.key === "Enter") addChain(["gmail", "chatgpt", "notion"]); }}
          />
        </div>
        {AI_SUGGESTIONS.map((s) => (
          <button
            key={s.title}
            onClick={() => addChain(s.services)}
            className="mb-2 flex w-full items-center gap-3 rounded-2xl bg-gray-50 px-4 py-3 text-left transition active:bg-gray-100"
          >
            <div className="flex -space-x-1.5">
              {s.services.map((sid) => (
                <span
                  key={sid}
                  className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white [&>svg]:h-4 [&>svg]:w-4"
                  style={{ backgroundColor: SERVICES[sid].tint }}
                >
                  {SERVICES[sid].icon}
                </span>
              ))}
            </div>
            <div>
              <div className="text-[13.5px] font-bold text-[#1a1a1a]">{s.title}</div>
              <div className="text-[11.5px] text-gray-500">{s.desc}</div>
            </div>
          </button>
        ))}
      </Sheet>

      {/* wallet connect */}
      <Sheet open={sheet === "wallet"} onClose={() => setSheet(null)} title="Connect wallet">
        <p className="mb-4 text-[12.5px] leading-relaxed text-gray-500">
          Stringz never holds your keys or funds. Your wallet signs, your account pays gas — we're just the builder.
        </p>
        <button
          onClick={connectWallet}
          className="mb-2 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#1a1a1a] px-4 py-3.5 text-[14.5px] font-bold text-white transition active:scale-[0.99]"
        >
          <Wallet size={16} /> Choose a wallet
        </button>
        <p className="mb-3 text-center text-[11px] leading-snug text-gray-400">
          MetaMask, Coinbase Wallet, Rabby and 300+ others via WalletConnect.
        </p>
        <div className="mt-3 flex items-start gap-2 rounded-2xl bg-[#F3F7F4] px-4 py-3">
          <ShieldCheck size={15} className="mt-0.5 shrink-0 text-[#3f6b4f]" />
          <p className="text-[11.5px] leading-snug text-gray-500">
            Tooling only. Execution, custody, and compliance are your responsibility — same as n8n or Zapier.
          </p>
        </div>
      </Sheet>

      {/* deploy */}
      <Sheet open={sheet === "deploy"} onClose={() => setSheet(null)} title="Deploy scenario">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Execution backend</div>
        <div className="mb-4 rounded-2xl border-2 border-[#3f6b4f] bg-[#F3F7F4] p-4">
          <div className="flex items-center justify-between">
            <div className="text-[14px] font-extrabold text-[#1a1a1a]">Chainlink CRE</div>
            <span className="rounded-full bg-[#3F6B4F] px-2 py-0.5 text-[9.5px] font-bold text-white">DEFAULT</span>
          </div>
          <div className="mt-0.5 text-[10.5px] text-gray-400">
            Run locally now · deploy to a DON after Chainlink approval
          </div>
        </div>

        <div className="mb-4 rounded-2xl bg-gray-50 p-4">
          <div className="flex items-center gap-2">
            <Terminal size={14} className="text-[#3f6b4f]" />
            <span className="text-[12px] font-bold text-[#1a1a1a]">1 · Run it now - no approval needed</span>
          </div>
          <p className="mt-1 text-[11.5px] leading-snug text-gray-500">
            Export the project, unzip it, then from the project folder. This run is real: webhooks post, on-chain
            steps sign with your key - keep the canvas Run for design-time dry runs.
          </p>
          <pre className="mt-2 overflow-x-auto rounded-xl bg-[#1a1a1a] p-3 font-mono text-[10.5px] leading-relaxed text-[#C8F7C5]">{`cp .env.example .env  # add your key + app secrets
cd ${flowSlug}-workflow && bun install
cd .. && cre workflow simulate ${flowSlug}-workflow --target staging-settings`}</pre>
          <button
            onClick={() => {
              navigator.clipboard?.writeText(
                `cp .env.example .env\ncd ${flowSlug}-workflow && bun install\ncd .. && cre workflow simulate ${flowSlug}-workflow --target staging-settings`
              );
              showToast("Commands copied");
            }}
            className="mt-2 text-[12px] font-bold text-[#3f6b4f] transition active:opacity-60"
          >
            Copy commands
          </button>
        </div>

        <div className="mb-4 rounded-2xl bg-gray-50 p-4">
          <div className="flex items-center gap-2">
            <Rocket size={14} className="text-[#3f6b4f]" />
            <span className="text-[12px] font-bold text-[#1a1a1a]">Stringz Cloud - run it without a local setup</span>
          </div>
          <p className="mt-1 text-[11.5px] leading-snug text-gray-500">
            We host the runner: simulate on our infrastructure, schedule executions and monitor from the dashboard.
          </p>
          <button
            onClick={() => setProFeature("Cloud runners")}
            className="mt-2 text-[12px] font-bold text-[#3f6b4f] transition active:opacity-60"
          >
            See Pro
          </button>
        </div>

        <div className="mb-4 flex items-start gap-2.5 rounded-2xl bg-[#FDF6EC] px-4 py-3">
          <AlertTriangle size={15} className="mt-0.5 shrink-0 text-[#b07d2b]" />
          <div>
            <p className="text-[12px] font-semibold text-[#1a1a1a]">2 · Deploy to the Chainlink DON - approval required</p>
            <p className="mt-0.5 text-[11.5px] leading-snug text-gray-500">
              DON deployment needs Chainlink review. Request access, then redeploy with{" "}
              <span className="font-mono text-[10.5px]">cre workflow deploy</span>.
            </p>
            <a
              href="https://docs.chain.link/cre/account/deploy-access"
              target="_blank"
              rel="noreferrer"
              className="mt-2 flex items-center gap-1 text-[12px] font-bold text-[#3f6b4f]"
            >
              Request CRE access <ExternalLink size={12} />
            </a>
          </div>
        </div>

        <div className="mb-5 rounded-2xl bg-gray-50 px-4 py-3">
          <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400">What this run will do</div>
          <div className="mt-2 space-y-1.5 text-[12px]">
            <div className="flex justify-between">
              <span className="text-gray-500">Free on-chain reads</span>
              <span className="font-bold text-[#1a1a1a]">{readiness.reads.length || "None"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Real webhook posts</span>
              <span className="font-bold text-[#1a1a1a]">{readiness.posts.length || "None"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Gas-spending writes</span>
              <span className={`font-bold ${readiness.writes.length ? "text-[#b07d2b]" : "text-[#1a1a1a]"}`}>
                {readiness.writes.length || "None"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">HTTP adapter calls</span>
              <span className="font-bold text-[#1a1a1a]">{readiness.adapters.length || "None"}</span>
            </div>
          </div>
          {readiness.adapters.length > 0 && (
            <p className="mt-2.5 rounded-xl bg-gray-100 px-3 py-2 text-[11px] leading-snug text-gray-600">
              Swap and CCIP steps POST to the adapter endpoint set in each node's config - that endpoint must be
              reachable from the CRE runtime for these steps to answer.
            </p>
          )}
          {readiness.writes.length > 0 && (
            <p className="mt-2.5 rounded-xl bg-[#FDF6EC] px-3 py-2 text-[11px] leading-snug text-[#7a5a22]">
              Writes sign with CRE_ETH_PRIVATE_KEY and spend {readiness.writeChains.map((c) => CHAINS[c].symbol).join(" / ")}{" "}
              on {readiness.writeChains.map((c) => CHAINS[c].name).join(", ")}. Fund the key first - or test a no-write
              flow, then raise amounts.
            </p>
          )}
          <div className="mt-3 border-t border-gray-200 pt-2.5">
            <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Your .env must provide</div>
            <ul className="mt-1.5 space-y-1 font-mono text-[11px] text-gray-600">
              <li>CRE_ETH_PRIVATE_KEY</li>
              {readiness.secrets.map((s) => (
                <li key={s}>{s}</li>
              ))}
              {readiness.secrets.length === 0 && <li className="font-sans italic">no app secrets in this flow</li>}
            </ul>
          </div>
        </div>

        <button
          onClick={() => {
            if (exportCreProject()) setSheet(null);
          }}
          className="w-full rounded-full bg-[#1a1a1a] py-3.5 text-[14px] font-semibold text-white transition active:scale-[0.98]"
        >
          Export CRE project (.zip)
        </button>
        <button
          onClick={() => {
            exportBlueprint();
            setSheet(null);
          }}
          className="mt-2 w-full rounded-full bg-gray-100 py-3 text-[13px] font-semibold text-gray-600 transition active:scale-[0.98]"
        >
          Export blueprint JSON
        </button>
        <p className="mt-2.5 text-center text-[10.5px] text-gray-400">
          Stringz is tooling only — keys, funds, gas and secrets are always yours.
        </p>
      </Sheet>

      <Toast toast={toast} />
      <ProSheet open={!!proFeature} onClose={() => setProFeature(null)} feature={proFeature ?? undefined} />
    </div>
  );
}
