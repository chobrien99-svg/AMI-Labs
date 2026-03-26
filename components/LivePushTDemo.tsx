"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

type Pos = [number, number];

interface PCAParams {
  mean: number[];
  components: [number[], number[]];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const ENV = 512;          // env coordinate space
const ACT_SCALE = 28;     // pixels per unit action (matches capture script)
const ORT_CDN = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.19.2/dist/";
const IMAGENET_MEAN = [0.485, 0.456, 0.406];
const IMAGENET_STD  = [0.229, 0.224, 0.225];

// ── Math helpers ──────────────────────────────────────────────────────────────

function randn(): number {
  const u = 1 - Math.random();
  const v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function clamp(x: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, x));
}

function finalPos(start: Pos, seq: Float32Array, H: number): Pos {
  let [x, y] = start;
  for (let i = 0; i < H; i++) {
    x = clamp(x + seq[i * 2] * ACT_SCALE, 0, ENV);
    y = clamp(y + seq[i * 2 + 1] * ACT_SCALE, 0, ENV);
  }
  return [x, y];
}

/** Kinematic CEM — returns best first [dx, dy] action in [-1, 1] */
function runCEM(agent: Pos, goal: Pos, N = 60, H = 5, K = 6, iters = 3): Pos {
  const D = H * 2;
  const mu  = new Float32Array(D);
  const std = new Float32Array(D).fill(1.0);

  for (let iter = 0; iter < iters; iter++) {
    const seqs: Float32Array[] = Array.from({ length: N }, () => {
      const s = new Float32Array(D);
      for (let j = 0; j < D; j++) s[j] = clamp(mu[j] + std[j] * randn(), -1, 1);
      return s;
    });

    const costs = seqs.map(s => {
      const [fx, fy] = finalPos(agent, s, H);
      return Math.hypot(fx - goal[0], fy - goal[1]);
    });

    const eliteIdx = costs
      .map((c, i) => [c, i] as [number, number])
      .sort((a, b) => a[0] - b[0])
      .slice(0, K)
      .map(([, i]) => i);

    for (let j = 0; j < D; j++) {
      const vals = eliteIdx.map(i => seqs[i][j]);
      mu[j]  = vals.reduce((s, v) => s + v, 0) / K;
      const variance = vals.reduce((s, v) => s + (v - mu[j]) ** 2, 0) / K;
      std[j] = Math.sqrt(variance) + 1e-5;
    }
  }

  return [mu[0], mu[1]];
}

/** PCA projection: Float32Array(192) → [x, y] */
function pcaProject(emb: Float32Array, pca: PCAParams): Pos {
  const centered = Array.from(emb).map((v, i) => v - pca.mean[i]);
  return [
    pca.components[0].reduce((s, w, i) => s + w * centered[i], 0),
    pca.components[1].reduce((s, w, i) => s + w * centered[i], 0),
  ];
}

/** Resize canvas to 224×224 and return ImageNet-normalised CHW Float32Array */
async function canvasToTensor(canvas: HTMLCanvasElement): Promise<Float32Array> {
  const SIZE = 224;
  let imgData: ImageData;

  if (typeof OffscreenCanvas !== "undefined") {
    const oc = new OffscreenCanvas(SIZE, SIZE);
    const octx = oc.getContext("2d") as OffscreenCanvasRenderingContext2D;
    octx.drawImage(canvas, 0, 0, SIZE, SIZE);
    imgData = octx.getImageData(0, 0, SIZE, SIZE);
  } else {
    const tmp = document.createElement("canvas");
    tmp.width = tmp.height = SIZE;
    tmp.getContext("2d")!.drawImage(canvas, 0, 0, SIZE, SIZE);
    imgData = tmp.getContext("2d")!.getImageData(0, 0, SIZE, SIZE);
  }

  const tensor = new Float32Array(3 * SIZE * SIZE);
  for (let i = 0; i < SIZE * SIZE; i++) {
    for (let c = 0; c < 3; c++) {
      tensor[c * SIZE * SIZE + i] =
        (imgData.data[i * 4 + c] / 255 - IMAGENET_MEAN[c]) / IMAGENET_STD[c];
    }
  }
  return tensor;
}

// ── Canvas drawing ────────────────────────────────────────────────────────────

function drawScene(
  ctx: CanvasRenderingContext2D,
  agent: Pos,
  goal: Pos,
  W: number,
  H: number,
) {
  const sc = W / ENV;
  ctx.clearRect(0, 0, W, H);

  // Background
  ctx.fillStyle = "#e8e8e8";
  ctx.fillRect(0, 0, W, H);

  // Boundary
  ctx.strokeStyle = "#aaa";
  ctx.lineWidth = 1;
  ctx.strokeRect(1, 1, W - 2, H - 2);

  // T-block (static decorative — no physics)
  const [tx, ty] = [256 * sc, 270 * sc];
  ctx.save();
  ctx.translate(tx, ty);
  ctx.rotate(0.25);
  ctx.fillStyle = "#5b9bd5";
  // top bar
  ctx.fillRect(-28 * sc, -34 * sc, 56 * sc, 18 * sc);
  // stem
  ctx.fillRect(-9 * sc, -16 * sc, 18 * sc, 46 * sc);
  ctx.restore();

  // Goal ring
  const [gx, gy] = [goal[0] * sc, goal[1] * sc];
  ctx.beginPath();
  ctx.arc(gx, gy, 11 * sc, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255,200,0,0.95)";
  ctx.lineWidth = 2.5 * sc;
  ctx.stroke();
  ctx.fillStyle = "rgba(255,200,0,0.2)";
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(gx - 7 * sc, gy); ctx.lineTo(gx + 7 * sc, gy);
  ctx.moveTo(gx, gy - 7 * sc); ctx.lineTo(gx, gy + 7 * sc);
  ctx.strokeStyle = "rgba(220,160,0,0.9)";
  ctx.lineWidth = 1.5 * sc;
  ctx.stroke();

  // Agent circle
  const [ax, ay] = [agent[0] * sc, agent[1] * sc];
  ctx.beginPath();
  ctx.arc(ax, ay, 9 * sc, 0, Math.PI * 2);
  ctx.fillStyle = "#e03030";
  ctx.fill();
  ctx.strokeStyle = "white";
  ctx.lineWidth = 2 * sc;
  ctx.stroke();
}

// ── UMAP/PCA scatter ──────────────────────────────────────────────────────────

function LatentScatter({
  refPts,
  liveXY,
}: {
  refPts: Pos[];
  liveXY: Pos | null;
}) {
  const W = 260, H = 190, PAD = 14;

  const allX = [...refPts.map(p => p[0]), ...(liveXY ? [liveXY[0]] : [])];
  const allY = [...refPts.map(p => p[1]), ...(liveXY ? [liveXY[1]] : [])];
  const xMin = Math.min(...allX, 0);
  const xMax = Math.max(...allX, 1);
  const yMin = Math.min(...allY, 0);
  const yMax = Math.max(...allY, 1);

  function toSvg(x: number, y: number) {
    return {
      cx: PAD + ((x - xMin) / (xMax - xMin || 1)) * (W - 2 * PAD),
      cy: PAD + ((y - yMin) / (yMax - yMin || 1)) * (H - 2 * PAD),
    };
  }

  const pathD = refPts
    .map((p, i) => {
      const { cx, cy } = toSvg(p[0], p[1]);
      return `${i === 0 ? "M" : "L"}${cx.toFixed(1)},${cy.toFixed(1)}`;
    })
    .join(" ");

  return (
    <div className="pusht-latent-wrap">
      <div className="pusht-panel-label">Live Latent Space (PCA)</div>
      <svg width={W} height={H} className="pusht-umap-svg">
        <path d={pathD} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
        {refPts.map((p, i) => {
          const { cx, cy } = toSvg(p[0], p[1]);
          return (
            <circle key={i} cx={cx} cy={cy} r={2.5} fill="rgba(100,180,255,0.55)" />
          );
        })}
        {liveXY && (() => {
          const { cx, cy } = toSvg(liveXY[0], liveXY[1]);
          return (
            <>
              <circle cx={cx} cy={cy} r={9} fill="rgba(255,80,80,0.2)" />
              <circle cx={cx} cy={cy} r={5.5} fill="#ff4444" stroke="white" strokeWidth="1.5" />
            </>
          );
        })()}
      </svg>
      <div className="live-scatter-legend">
        <span><span className="live-legend-dot" style={{ background: "rgba(100,180,255,0.7)" }} /> Pre-computed rollout</span>
        <span><span className="live-legend-dot" style={{ background: "#ff4444" }} /> Live encoder</span>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function LivePushTDemo() {
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const sessionRef   = useRef<unknown>(null);
  const pcaRef       = useRef<PCAParams | null>(null);
  const agentRef     = useRef<Pos>([282, 105]);
  const goalRef      = useRef<Pos>([340, 330]);
  const runningRef   = useRef(false);
  const encodingRef  = useRef(false);

  const [agent,     setAgent]     = useState<Pos>([282, 105]);
  const [goal,      setGoal]      = useState<Pos>([340, 330]);
  const [refPts,    setRefPts]    = useState<Pos[]>([]);
  const [liveXY,    setLiveXY]    = useState<Pos | null>(null);
  const [playing,   setPlaying]   = useState(false);
  const [ready,     setReady]     = useState(false);
  const [status,    setStatus]    = useState("Loading assets…");

  // ── Load assets ─────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function load() {
      // Reference trajectory + PCA in parallel
      const [rollout, pca] = await Promise.all([
        fetch("/pusht_rollout.json").then(r => r.json()),
        fetch("/lewm_pca.json").then(r => r.json()),
      ]);
      if (cancelled) return;

      setRefPts(rollout.steps.map((s: { latent_2d: Pos }) => s.latent_2d));
      pcaRef.current = pca;

      setStatus("Loading ONNX encoder (24 MB)…");

      // Load ORT from CDN
      if (!(window as { ort?: unknown }).ort) {
        await new Promise<void>((resolve, reject) => {
          const s = document.createElement("script");
          s.src = ORT_CDN + "ort.min.js";
          s.onload  = () => resolve();
          s.onerror = () => reject(new Error("Failed to load ONNX Runtime"));
          document.head.appendChild(s);
        });
      }
      if (cancelled) return;

      const ort = (window as unknown as { ort: { env: { wasm: { wasmPaths: string } }; InferenceSession: { create: (path: string, opts: unknown) => Promise<unknown> } } }).ort;
      ort.env.wasm.wasmPaths = ORT_CDN;
      sessionRef.current = await ort.InferenceSession.create("/lewm_encoder.onnx", {
        executionProviders: ["wasm"],
      });
      if (cancelled) return;

      setReady(true);
      setStatus("Click canvas to set goal, then press Play");
    }
    load().catch(e => { if (!cancelled) setStatus(`Error: ${e.message}`); });
    return () => { cancelled = true; };
  }, []);

  // ── Draw canvas whenever agent/goal change ───────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctxMaybe = canvas.getContext("2d");
    if (!ctxMaybe) return;
    const ctx: CanvasRenderingContext2D = ctxMaybe;
    drawScene(ctx, agent, goal, canvas.width, canvas.height);
  }, [agent, goal]);

  // ── Encode current canvas frame → latent XY ──────────────────────────────
  const encodeFrame = useCallback(async () => {
    if (encodingRef.current || !sessionRef.current || !pcaRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    encodingRef.current = true;
    try {
      const tensor = await canvasToTensor(canvas);
      const ort = (window as unknown as { ort: { Tensor: new (type: string, data: Float32Array, dims: number[]) => unknown } }).ort;
      const inp = new ort.Tensor("float32", tensor, [1, 1, 3, 224, 224]);
      const session = sessionRef.current as { run: (inputs: Record<string, unknown>) => Promise<{ emb: { data: Float32Array } }> };
      const out = await session.run({ pixels: inp });
      const xy = pcaProject(out.emb.data, pcaRef.current!);
      setLiveXY(xy);
    } catch (_) {
      // silent — encoding failure doesn't break the demo
    } finally {
      encodingRef.current = false;
    }
  }, []);

  // ── Single CEM step ──────────────────────────────────────────────────────
  const stepOnce = useCallback(async () => {
    const action = runCEM(agentRef.current, goalRef.current);
    const [ax, ay] = agentRef.current;
    const next: Pos = [
      clamp(ax + action[0] * ACT_SCALE, 0, ENV),
      clamp(ay + action[1] * ACT_SCALE, 0, ENV),
    ];
    agentRef.current = next;

    // Draw synchronously so encodeFrame captures the updated frame,
    // not the previous one (which the useEffect would render asynchronously).
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) drawScene(ctx, next, goalRef.current, canvas.width, canvas.height);
    }

    setAgent([...next]); // keep React state in sync for stats display
    encodeFrame(); // async — updates latent dot when ready
  }, [encodeFrame]);

  // ── Play loop ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!playing) { runningRef.current = false; return; }
    runningRef.current = true;
    let timer: ReturnType<typeof setTimeout>;
    const loop = () => {
      if (!runningRef.current) return;
      stepOnce().then(() => { timer = setTimeout(loop, 260); });
    };
    loop();
    return () => { runningRef.current = false; clearTimeout(timer); };
  }, [playing, stepOnce]);

  // ── Canvas click → set goal ──────────────────────────────────────────────
  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (ENV / rect.width);
    const y = (e.clientY - rect.top)  * (ENV / rect.height);
    const next: Pos = [clamp(x, 0, ENV), clamp(y, 0, ENV)];
    goalRef.current = next;
    setGoal([...next]);
  }, []);

  // ── Reset ────────────────────────────────────────────────────────────────
  const reset = useCallback(() => {
    setPlaying(false);
    runningRef.current = false;
    const start: Pos = [282, 105];
    agentRef.current = start;
    setAgent([...start]);
    setLiveXY(null);
  }, []);

  const dist = Math.hypot(agent[0] - goal[0], agent[1] - goal[1]);

  return (
    <div className="live-demo-wrap">
      <div className="live-demo-badge">Real-time ONNX inference — runs in your browser</div>
      <div className="live-demo-grid">

        {/* Left: canvas */}
        <div className="live-demo-canvas-col">
          <div className="pusht-panel-label">PushT environment — click to place goal</div>
          <canvas
            ref={canvasRef}
            width={420}
            height={420}
            className="pusht-canvas"
            style={{ cursor: "crosshair" }}
            onClick={handleCanvasClick}
          />
          <div className="pusht-controls" style={{ marginTop: 0 }}>
            <button className="pusht-ctrl-btn" onClick={reset} title="Reset">⏮</button>
            <button
              className="pusht-ctrl-btn pusht-play-btn"
              onClick={() => setPlaying(p => !p)}
              disabled={!ready}
            >{playing ? "⏸" : "▶"}</button>
            <button
              className="pusht-ctrl-btn"
              onClick={() => { setPlaying(false); stepOnce(); }}
              disabled={!ready || playing}
              title="Step"
            >▶</button>
            <span className="pusht-step-badge" style={{ flex: 1, textAlign: "left", paddingLeft: 4 }}>
              {status}
            </span>
          </div>
        </div>

        {/* Right: latent + stats */}
        <div className="pusht-right-panel">
          <LatentScatter refPts={refPts} liveXY={liveXY} />

          <div className="pusht-stats-box">
            <div className="pusht-stat-row">
              <span className="pusht-stat-key">Agent</span>
              <span className="pusht-stat-val">({agent[0].toFixed(0)}, {agent[1].toFixed(0)})</span>
            </div>
            <div className="pusht-stat-row">
              <span className="pusht-stat-key">Goal</span>
              <span className="pusht-stat-val">({goal[0].toFixed(0)}, {goal[1].toFixed(0)})</span>
            </div>
            <div className="pusht-stat-row">
              <span className="pusht-stat-key">Distance</span>
              <span className="pusht-stat-val">{dist.toFixed(1)} px</span>
            </div>
            {liveXY && (
              <div className="pusht-stat-row">
                <span className="pusht-stat-key">Latent (PCA)</span>
                <span className="pusht-stat-val">
                  ({liveXY[0].toFixed(2)}, {liveXY[1].toFixed(2)})
                </span>
              </div>
            )}
          </div>

          <p className="pusht-explainer-note">
            Press <strong>▶</strong> to start. The red agent moves toward your goal using
            kinematic CEM planning. After each step, the 420×420 frame is encoded by the
            LeWM ViT encoder running <em>entirely in your browser</em> via ONNX Runtime WebAssembly —
            no server call. The red dot shows where that frame lands in the 192-dim JEPA
            latent space, projected to 2D with PCA.
          </p>
        </div>
      </div>
    </div>
  );
}
