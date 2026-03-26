"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ── Types ────────────────────────────────────────────────────────────────────

interface Trajectory {
  path: [number, number][];
  cost: number;
  is_elite: boolean;
  is_best: boolean;
}

interface Step {
  step: number;
  agent_pos: [number, number];
  goal_pos: [number, number];
  cem_best_cost: number;
  trajectories: Trajectory[];
  thumbnail: string;         // base64 JPEG
  latent_2d: [number, number];
}

interface RolloutData {
  env: string;
  env_size: number;
  n_steps: number;
  cem_samples: number;
  cem_horizon: number;
  steps: Step[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function lerpN(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

/** Map a cost value to an rgba string. Low cost → teal, high cost → red. */
function costColor(cost: number, maxCost: number, alpha: number): string {
  const t = Math.min(cost / (maxCost || 1), 1);
  const r = Math.round(lerpN(56, 239, t));
  const g = Math.round(lerpN(189, 68, t));
  const b = Math.round(lerpN(167, 68, t));
  return `rgba(${r},${g},${b},${alpha})`;
}

// ── Environment Canvas ────────────────────────────────────────────────────────

function EnvCanvas({
  data,
  stepIdx,
}: {
  data: RolloutData;
  stepIdx: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgCache = useRef<Map<number, HTMLImageElement>>(new Map());

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctxMaybe = canvas.getContext("2d");
    if (!ctxMaybe) return;
    const ctx: CanvasRenderingContext2D = ctxMaybe;

    const W = canvas.width;
    const H = canvas.height;
    const scale = W / data.env_size;
    const step = data.steps[stepIdx];
    const maxCost = Math.max(...data.steps.map((s) => s.cem_best_cost));

    function drawOverlay(bg?: HTMLImageElement) {
      ctx.clearRect(0, 0, W, H);

      // Background
      if (bg) {
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(bg, 0, 0, W, H);
        // slight darkening so overlays pop
        ctx.fillStyle = "rgba(0,0,0,0.25)";
        ctx.fillRect(0, 0, W, H);
      } else {
        ctx.fillStyle = "#0f1117";
        ctx.fillRect(0, 0, W, H);
      }

      // CEM candidate trajectories
      for (const traj of step.trajectories) {
        if (traj.path.length < 2) continue;
        const alpha = traj.is_best ? 0.95 : traj.is_elite ? 0.6 : 0.18;
        ctx.beginPath();
        ctx.moveTo(traj.path[0][0] * scale, traj.path[0][1] * scale);
        for (let i = 1; i < traj.path.length; i++) {
          ctx.lineTo(traj.path[i][0] * scale, traj.path[i][1] * scale);
        }
        ctx.strokeStyle = costColor(traj.cost, maxCost, alpha);
        ctx.lineWidth = traj.is_best ? 2.5 : traj.is_elite ? 1.5 : 1;
        ctx.stroke();

        // endpoint dot for elites
        if (traj.is_elite) {
          const last = traj.path[traj.path.length - 1];
          ctx.beginPath();
          ctx.arc(last[0] * scale, last[1] * scale, traj.is_best ? 5 : 3, 0, Math.PI * 2);
          ctx.fillStyle = costColor(traj.cost, maxCost, 0.9);
          ctx.fill();
        }
      }

      // Historical agent path
      if (stepIdx > 0) {
        ctx.beginPath();
        const [ax0, ay0] = data.steps[0].agent_pos;
        ctx.moveTo(ax0 * scale, ay0 * scale);
        for (let i = 1; i <= stepIdx; i++) {
          const [ax, ay] = data.steps[i].agent_pos;
          ctx.lineTo(ax * scale, ay * scale);
        }
        ctx.strokeStyle = "rgba(100,200,255,0.55)";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Goal marker
      const [gx, gy] = step.goal_pos;
      ctx.beginPath();
      ctx.arc(gx * scale, gy * scale, 9, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255,215,0,0.9)";
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.fillStyle = "rgba(255,215,0,0.18)";
      ctx.fill();
      // cross-hair
      ctx.beginPath();
      ctx.moveTo((gx - 5) * scale, gy * scale);
      ctx.lineTo((gx + 5) * scale, gy * scale);
      ctx.moveTo(gx * scale, (gy - 5) * scale);
      ctx.lineTo(gx * scale, (gy + 5) * scale);
      ctx.strokeStyle = "rgba(255,215,0,0.85)";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Agent circle
      const [ax, ay] = step.agent_pos;
      ctx.beginPath();
      ctx.arc(ax * scale, ay * scale, 7, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(100,200,255,0.95)";
      ctx.fill();
      ctx.strokeStyle = "white";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    const cached = imgCache.current.get(stepIdx);
    if (cached) {
      drawOverlay(cached);
    } else {
      // Draw without bg immediately, then update when image loads
      drawOverlay();
      const img = new Image();
      img.onload = () => {
        imgCache.current.set(stepIdx, img);
        drawOverlay(img);
      };
      img.src = "data:image/jpeg;base64," + step.thumbnail;
    }
  }, [data, stepIdx]);

  return <canvas ref={canvasRef} width={420} height={420} className="pusht-canvas" />;
}

// ── UMAP Latent Plot ──────────────────────────────────────────────────────────

function LatentPlot({
  data,
  stepIdx,
}: {
  data: RolloutData;
  stepIdx: number;
}) {
  const W = 280;
  const H = 200;
  const PAD = 18;

  const xs = data.steps.map((s) => s.latent_2d[0]);
  const ys = data.steps.map((s) => s.latent_2d[1]);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMin = Math.min(...ys);
  const yMax = Math.max(...ys);

  function toSvg(x: number, y: number) {
    return {
      cx: PAD + ((x - xMin) / (xMax - xMin || 1)) * (W - 2 * PAD),
      cy: PAD + ((y - yMin) / (yMax - yMin || 1)) * (H - 2 * PAD),
    };
  }

  const pathD = data.steps
    .map((s, i) => {
      const { cx, cy } = toSvg(s.latent_2d[0], s.latent_2d[1]);
      return `${i === 0 ? "M" : "L"}${cx.toFixed(1)},${cy.toFixed(1)}`;
    })
    .join(" ");

  return (
    <div className="pusht-latent-wrap">
      <div className="pusht-panel-label">Latent Space (UMAP projection)</div>
      <svg width={W} height={H} className="pusht-umap-svg">
        {/* trajectory line */}
        <path d={pathD} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />

        {/* dots */}
        {data.steps.map((s, i) => {
          const { cx, cy } = toSvg(s.latent_2d[0], s.latent_2d[1]);
          const t = i / Math.max(data.steps.length - 1, 1);
          // blue → purple gradient by step
          const r = Math.round(lerpN(79, 180, t));
          const g = Math.round(lerpN(139, 80, t));
          const b = Math.round(lerpN(255, 255, t));
          const isCurrent = i === stepIdx;
          return (
            <circle
              key={i}
              cx={cx}
              cy={cy}
              r={isCurrent ? 6 : 3}
              fill={isCurrent ? "white" : `rgb(${r},${g},${b})`}
              opacity={isCurrent ? 1 : i <= stepIdx ? 0.85 : 0.3}
              stroke={isCurrent ? "var(--accent2)" : "none"}
              strokeWidth={isCurrent ? 2 : 0}
            />
          );
        })}
      </svg>
      <div className="pusht-umap-legend">
        <span className="pusht-umap-start">t=0</span>
        <span className="pusht-umap-end">t={data.n_steps - 1}</span>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function PushTViewer() {
  const [data, setData] = useState<RolloutData | null>(null);
  const [stepIdx, setStepIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetch("/pusht_rollout.json")
      .then((r) => r.json())
      .then(setData)
      .catch(() => setError("Could not load pusht_rollout.json — make sure it is in public/."));
  }, []);

  const advance = useCallback(() => {
    if (!data) return;
    setStepIdx((prev) => {
      if (prev >= data.n_steps - 1) {
        setPlaying(false);
        return prev;
      }
      return prev + 1;
    });
  }, [data]);

  useEffect(() => {
    if (playing) {
      intervalRef.current = setInterval(advance, 280);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [playing, advance]);

  if (error) return <div className="pusht-error">{error}</div>;
  if (!data) return <div className="pusht-loading">Loading rollout…</div>;

  const step = data.steps[stepIdx];

  return (
    <div className="pusht-viewer">
      <div className="pusht-viewer-grid">

        {/* Left — environment */}
        <div className="pusht-env-panel">
          <div className="pusht-panel-label">CEM Planning — PushT Environment</div>
          <EnvCanvas data={data} stepIdx={stepIdx} />
          <div className="pusht-legend">
            <span className="pusht-legend-item">
              <span className="pusht-dot" style={{ background: "rgba(100,200,255,0.9)" }} /> Agent
            </span>
            <span className="pusht-legend-item">
              <span className="pusht-dot" style={{ border: "2px solid rgba(255,215,0,0.9)", background: "transparent" }} /> Goal
            </span>
            <span className="pusht-legend-item">
              <span className="pusht-dot" style={{ background: "rgba(56,189,167,0.8)" }} /> Elite traj.
            </span>
            <span className="pusht-legend-item">
              <span className="pusht-dot" style={{ background: "rgba(239,68,68,0.5)" }} /> High-cost traj.
            </span>
          </div>
        </div>

        {/* Right — UMAP + stats */}
        <div className="pusht-right-panel">
          <LatentPlot data={data} stepIdx={stepIdx} />

          <div className="pusht-stats-box">
            <div className="pusht-stat-row">
              <span className="pusht-stat-key">Step</span>
              <span className="pusht-stat-val">{step.step} / {data.n_steps - 1}</span>
            </div>
            <div className="pusht-stat-row">
              <span className="pusht-stat-key">CEM cost</span>
              <span className="pusht-stat-val">{step.cem_best_cost.toFixed(1)} px</span>
            </div>
            <div className="pusht-stat-row">
              <span className="pusht-stat-key">Agent</span>
              <span className="pusht-stat-val">
                ({step.agent_pos[0].toFixed(0)}, {step.agent_pos[1].toFixed(0)})
              </span>
            </div>
            <div className="pusht-stat-row">
              <span className="pusht-stat-key">Goal</span>
              <span className="pusht-stat-val">
                ({step.goal_pos[0].toFixed(0)}, {step.goal_pos[1].toFixed(0)})
              </span>
            </div>
            <div className="pusht-stat-row">
              <span className="pusht-stat-key">CEM samples</span>
              <span className="pusht-stat-val">{data.cem_samples}</span>
            </div>
            <div className="pusht-stat-row">
              <span className="pusht-stat-key">Horizon</span>
              <span className="pusht-stat-val">{data.cem_horizon} steps</span>
            </div>
          </div>

          <p className="pusht-explainer-note">
            Each frame: LeWM encodes the observation to a 192-dim latent,
            samples {data.cem_samples} action sequences, evaluates them in latent space,
            and executes the best. The UMAP plot shows the learned latent trajectory.
          </p>
        </div>
      </div>

      {/* Playback controls */}
      <div className="pusht-controls">
        <button
          className="pusht-ctrl-btn"
          onClick={() => { setPlaying(false); setStepIdx(0); }}
          title="Reset"
        >⏮</button>
        <button
          className="pusht-ctrl-btn"
          onClick={() => { setPlaying(false); setStepIdx((i) => Math.max(0, i - 1)); }}
          title="Step back"
        >◀</button>
        <button
          className="pusht-ctrl-btn pusht-play-btn"
          onClick={() => setPlaying((p) => !p)}
          title={playing ? "Pause" : "Play"}
        >{playing ? "⏸" : "▶"}</button>
        <button
          className="pusht-ctrl-btn"
          onClick={() => { setPlaying(false); setStepIdx((i) => Math.min(data.n_steps - 1, i + 1)); }}
          title="Step forward"
        >▶</button>
        <input
          type="range"
          min={0}
          max={data.n_steps - 1}
          value={stepIdx}
          onChange={(e) => { setPlaying(false); setStepIdx(Number(e.target.value)); }}
          className="pusht-slider"
        />
        <span className="pusht-step-badge">t = {stepIdx}</span>
      </div>
    </div>
  );
}
