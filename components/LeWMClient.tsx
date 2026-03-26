"use client";

import { useEffect, useRef } from "react";
import PushTViewer from "@/components/PushTViewer";
import LivePushTDemo from "@/components/LivePushTDemo";

// ─────────────────────────────────────────────────────────────────────────────
// Architecture Diagram (SVG)
// ─────────────────────────────────────────────────────────────────────────────

function ArchitectureDiagram() {
  return (
    <div className="lewm-diagram-wrap">
      <svg viewBox="0 0 860 270" className="lewm-arch-svg" role="img" aria-label="LeWM architecture diagram">
        <defs>
          <marker id="lewm-arr" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
            <polygon points="0 0, 8 3, 0 6" fill="var(--accent2)" />
          </marker>
          <marker id="lewm-arr2" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
            <polygon points="0 0, 8 3, 0 6" fill="var(--electric)" />
          </marker>
          <filter id="lewm-glow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* ── Node: Raw Pixels ── */}
        <rect x="8" y="58" width="118" height="70" rx="8" fill="var(--surface)" stroke="var(--border)" strokeWidth="1.5" />
        <text x="67" y="88" textAnchor="middle" fontFamily="inherit" fontSize="11" fontWeight="600" fill="var(--text-dim)">Raw Pixels</text>
        <text x="67" y="106" textAnchor="middle" fontFamily="inherit" fontSize="10" fill="var(--muted)">224 × 224 × 3</text>

        {/* ── Arrow 1 ── */}
        <line x1="126" y1="93" x2="158" y2="93" stroke="var(--accent2)" strokeWidth="2" markerEnd="url(#lewm-arr)" className="lewm-flow-line" strokeDasharray="24 8" />

        {/* ── Node: ViT Encoder ── */}
        <rect x="158" y="44" width="148" height="98" rx="8" fill="rgba(148,107,45,0.09)" stroke="var(--accent)" strokeWidth="1.5" />
        <text x="232" y="80" textAnchor="middle" fontFamily="inherit" fontSize="11" fontWeight="700" fill="var(--accent)">ViT Encoder</text>
        <text x="232" y="97" textAnchor="middle" fontFamily="inherit" fontSize="10" fill="var(--accent)">ViT-Tiny · 14×14 patches</text>
        <text x="232" y="113" textAnchor="middle" fontFamily="inherit" fontSize="10" fill="var(--accent)">→ 192-dim class token</text>
        <text x="232" y="128" textAnchor="middle" fontFamily="inherit" fontSize="9" fill="rgba(148,107,45,0.6)">end-to-end trainable</text>

        {/* ── Arrow 2 ── */}
        <line x1="306" y1="93" x2="338" y2="93" stroke="var(--accent2)" strokeWidth="2" markerEnd="url(#lewm-arr)" className="lewm-flow-line" strokeDasharray="24 8" />

        {/* ── Node: Latent z_t (circle) ── */}
        <circle cx="386" cy="93" r="47" fill="rgba(42,125,107,0.11)" stroke="var(--electric)" strokeWidth="2" className="lewm-latent-pulse" filter="url(#lewm-glow)" />
        <text x="386" y="87" textAnchor="middle" fontFamily="Georgia, serif" fontSize="17" fontWeight="700" fontStyle="italic" fill="var(--electric)">z</text>
        <text x="397" y="98" fontFamily="inherit" fontSize="10" fill="var(--electric)">t</text>
        <text x="386" y="112" textAnchor="middle" fontFamily="inherit" fontSize="9" fill="var(--electric)">192-dim latent</text>

        {/* ── SIGReg loss callout ── */}
        <rect x="332" y="158" width="108" height="36" rx="6" fill="rgba(42,125,107,0.10)" stroke="var(--electric)" strokeWidth="1" strokeDasharray="4 3" />
        <text x="386" y="173" textAnchor="middle" fontFamily="inherit" fontSize="10" fontWeight="700" fill="var(--electric)">① SIGReg Loss</text>
        <text x="386" y="186" textAnchor="middle" fontFamily="inherit" fontSize="9" fill="var(--electric)">Gaussian regulariser</text>
        <line x1="386" y1="158" x2="386" y2="140" stroke="var(--electric)" strokeWidth="1.5" strokeDasharray="3 2" markerEnd="url(#lewm-arr2)" />

        {/* ── Arrow 3 ── */}
        <line x1="433" y1="93" x2="463" y2="93" stroke="var(--accent2)" strokeWidth="2" markerEnd="url(#lewm-arr)" className="lewm-flow-line" strokeDasharray="24 8" />

        {/* ── Node: AR Predictor ── */}
        <rect x="463" y="38" width="172" height="110" rx="8" fill="rgba(148,107,45,0.09)" stroke="var(--accent)" strokeWidth="1.5" />
        <text x="549" y="72" textAnchor="middle" fontFamily="inherit" fontSize="11" fontWeight="700" fill="var(--accent)">AR Predictor</text>
        <text x="549" y="89" textAnchor="middle" fontFamily="inherit" fontSize="10" fill="var(--accent)">6 transformer layers</text>
        <text x="549" y="105" textAnchor="middle" fontFamily="inherit" fontSize="10" fill="var(--accent)">16 heads · AdaLN-zero</text>
        <text x="549" y="121" textAnchor="middle" fontFamily="inherit" fontSize="10" fill="var(--accent)">2048 MLP dim</text>
        <text x="549" y="136" textAnchor="middle" fontFamily="inherit" fontSize="9" fill="rgba(148,107,45,0.6)">conditioned on actions</text>

        {/* ── Arrow 4 ── */}
        <line x1="635" y1="93" x2="665" y2="93" stroke="var(--accent2)" strokeWidth="2" markerEnd="url(#lewm-arr)" className="lewm-flow-line" strokeDasharray="24 8" />

        {/* ── Node: Predicted ẑ ── */}
        <rect x="665" y="58" width="180" height="70" rx="8" fill="var(--surface)" stroke="var(--border)" strokeWidth="1.5" />
        <text x="735" y="86" textAnchor="middle" fontFamily="Georgia, serif" fontSize="15" fontWeight="600" fontStyle="italic" fill="var(--text-dim)">ẑ</text>
        <text x="748" y="86" fontFamily="inherit" fontSize="10" fill="var(--text-dim)">t+k</text>
        <text x="755" y="104" textAnchor="middle" fontFamily="inherit" fontSize="10" fill="var(--muted)">predicted embedding</text>

        {/* ── MSE loss callout ── */}
        <rect x="676" y="148" width="128" height="36" rx="6" fill="rgba(184,134,11,0.10)" stroke="var(--accent2)" strokeWidth="1" strokeDasharray="4 3" />
        <text x="740" y="163" textAnchor="middle" fontFamily="inherit" fontSize="10" fontWeight="700" fill="var(--accent2)">② MSE Loss</text>
        <text x="740" y="176" textAnchor="middle" fontFamily="inherit" fontSize="9" fill="var(--accent2)">predict next latent</text>
        <line x1="740" y1="148" x2="740" y2="128" stroke="var(--accent2)" strokeWidth="1.5" strokeDasharray="3 2" markerEnd="url(#lewm-arr)" />

        {/* ── Action Embedder (bottom) ── */}
        <rect x="463" y="210" width="172" height="50" rx="8" fill="var(--surface2)" stroke="var(--border)" strokeWidth="1.5" />
        <text x="549" y="231" textAnchor="middle" fontFamily="inherit" fontSize="11" fontWeight="600" fill="var(--text-dim)">Action Embedder</text>
        <text x="549" y="248" textAnchor="middle" fontFamily="inherit" fontSize="10" fill="var(--muted)">1D conv + MLP · actions a₁…aₜ</text>

        {/* ── Arrow: Embedder → AR Predictor ── */}
        <line x1="549" y1="210" x2="549" y2="148" stroke="var(--electric)" strokeWidth="2" markerEnd="url(#lewm-arr2)" className="lewm-flow-line-dim" strokeDasharray="20 6" />
      </svg>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CEM Planning Canvas Animation
// ─────────────────────────────────────────────────────────────────────────────

type Trajectory = { points: { x: number; y: number }[]; cost: number };

function CEMVisualization() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctxMaybe = canvas.getContext("2d");
    if (!ctxMaybe) return;
    const ctx: CanvasRenderingContext2D = ctxMaybe;

    const W = canvas.width;
    const H = canvas.height;

    // Scene constants
    const AGENT_START = { x: W * 0.28, y: H * 0.65 };
    const GOAL = { x: W * 0.72, y: H * 0.30 };
    const BLOCK = { x: W * 0.58, y: H * 0.55, size: 26 };
    const N_TRAJS = 24;

    // Phase timing (frames)
    const PHASES = [
      { name: "init",       label: "Encoding state…",           sub: "current observation → latent z_t", frames: 38 },
      { name: "sampling",   label: "① Sampling",                sub: "drawing 24 candidate action seqs", frames: 72 },
      { name: "evaluating", label: "② Evaluating costs",        sub: "latent rollout → distance to goal", frames: 48 },
      { name: "selecting",  label: "③ Selecting top-k",         sub: "refit Gaussian over best trajs",   frames: 36 },
      { name: "executing",  label: "④ Executing best action",   sub: "agent moves, replanning next step", frames: 68 },
      { name: "reset",      label: "",                           sub: "",                                  frames: 24 },
    ];

    let phase = 0;
    let phaseFrame = 0;
    let trajs: Trajectory[] = [];
    let bestTraj: Trajectory | null = null;
    let agentPos = { ...AGENT_START };

    function makeTrajs(): Trajectory[] {
      return Array.from({ length: N_TRAJS }, () => {
        let cx = agentPos.x, cy = agentPos.y;
        const pts = [{ x: cx, y: cy }];
        for (let i = 0; i < 9; i++) {
          cx += (Math.random() - 0.45) * 55;
          cy += (Math.random() - 0.52) * 55;
          cx = Math.max(16, Math.min(W - 16, cx));
          cy = Math.max(16, Math.min(H - 16, cy));
          pts.push({ x: cx, y: cy });
        }
        const last = pts[pts.length - 1];
        const cost = Math.hypot(last.x - GOAL.x, last.y - GOAL.y);
        return { points: pts, cost };
      });
    }

    function drawRoom() {
      ctx.fillStyle = "#F0EBE1";
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = "#C8BCA8";
      ctx.lineWidth = 2;
      ctx.strokeRect(3, 3, W - 6, H - 6);
    }

    function drawGoal() {
      const gs = 54;
      ctx.save();
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = "rgba(42,125,107,0.55)";
      ctx.fillStyle = "rgba(42,125,107,0.12)";
      ctx.lineWidth = 1.5;
      ctx.fillRect(GOAL.x - gs / 2, GOAL.y - gs / 2, gs, gs);
      ctx.strokeRect(GOAL.x - gs / 2, GOAL.y - gs / 2, gs, gs);
      ctx.restore();
      ctx.fillStyle = "rgba(42,125,107,0.7)";
      ctx.font = "10px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("goal", GOAL.x, GOAL.y - gs / 2 - 5);
    }

    function drawBlock() {
      const s = BLOCK.size;
      ctx.fillStyle = "#9B8E7A";
      ctx.strokeStyle = "#7A6E5C";
      ctx.lineWidth = 1;
      // vertical bar
      ctx.fillRect(BLOCK.x - 7, BLOCK.y - s / 2, 14, s);
      ctx.strokeRect(BLOCK.x - 7, BLOCK.y - s / 2, 14, s);
      // horizontal bar (T-top)
      ctx.fillRect(BLOCK.x - s * 0.75, BLOCK.y - s / 2, s * 1.5, 12);
      ctx.strokeRect(BLOCK.x - s * 0.75, BLOCK.y - s / 2, s * 1.5, 12);
    }

    function drawAgent(x: number, y: number) {
      const grad = ctx.createRadialGradient(x, y, 2, x, y, 15);
      grad.addColorStop(0, "rgba(184,134,11,0.35)");
      grad.addColorStop(1, "rgba(184,134,11,0)");
      ctx.beginPath(); ctx.arc(x, y, 15, 0, Math.PI * 2);
      ctx.fillStyle = grad; ctx.fill();
      ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2);
      ctx.fillStyle = "#B8860B"; ctx.fill();
      ctx.strokeStyle = "#7A5520"; ctx.lineWidth = 2; ctx.stroke();
    }

    function drawTrajs(mode: "sampling" | "evaluating" | "selecting", progress: number) {
      const sorted = [...trajs].sort((a, b) => a.cost - b.cost);
      const maxC = Math.max(...trajs.map(t => t.cost));
      const minC = Math.min(...trajs.map(t => t.cost));

      trajs.forEach((traj, i) => {
        if (mode === "sampling" && i >= Math.floor(progress * N_TRAJS)) return;
        const norm = (traj.cost - minC) / (maxC - minC + 1);
        const rank = sorted.indexOf(traj);

        let color: string;
        let lw = 1.3;

        if (mode === "sampling") {
          color = "rgba(110,100,85,0.28)";
        } else if (mode === "evaluating") {
          const r = Math.round(160 * norm + 60 * (1 - norm));
          const g = Math.round(55 * norm + 140 * (1 - norm));
          color = `rgba(${r},${g},55,${0.35 + 0.25 * (1 - norm)})`;
        } else {
          // selecting
          if (rank < 5) {
            const t = (5 - rank) / 5;
            color = `rgba(184,134,11,${0.45 + 0.45 * t})`;
            lw = rank === 0 ? 2.5 : 1.8;
          } else {
            color = "rgba(110,100,85,0.07)";
          }
        }

        ctx.beginPath();
        ctx.moveTo(traj.points[0].x, traj.points[0].y);
        for (let j = 1; j < traj.points.length; j++) ctx.lineTo(traj.points[j].x, traj.points[j].y);
        ctx.strokeStyle = color;
        ctx.lineWidth = lw;
        ctx.stroke();
      });
    }

    function drawBestPath(progress: number) {
      if (!bestTraj) return;
      const pts = bestTraj.points;
      const end = Math.max(1, Math.floor(progress * (pts.length - 1)));
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i <= end; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.strokeStyle = "rgba(184,134,11,0.95)";
      ctx.lineWidth = 2.8;
      ctx.setLineDash([]);
      ctx.stroke();
    }

    function drawLabel(text: string, sub: string) {
      if (!text) return;
      const pad = 10, tw = 196, th = 46;
      const bx = 8, by = H - th - 8;
      ctx.fillStyle = "rgba(247,243,236,0.94)";
      ctx.strokeStyle = "#D5CEBD";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect?.(bx, by, tw, th, 6);
      ctx.fill(); ctx.stroke();

      ctx.fillStyle = "#946B2D";
      ctx.font = "bold 11px sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(text, bx + pad, by + 20);

      ctx.fillStyle = "#8C8474";
      ctx.font = "9.5px sans-serif";
      ctx.fillText(sub, bx + pad, by + 35);
    }

    function draw() {
      const p = PHASES[phase];
      const progress = phaseFrame / p.frames;

      ctx.clearRect(0, 0, W, H);
      drawRoom();
      drawGoal();
      drawBlock();

      if (p.name === "init") {
        drawAgent(agentPos.x, agentPos.y);
      } else if (p.name === "sampling") {
        if (phaseFrame === 0) trajs = makeTrajs();
        drawTrajs("sampling", progress);
        drawAgent(agentPos.x, agentPos.y);
      } else if (p.name === "evaluating") {
        drawTrajs("evaluating", 1);
        drawAgent(agentPos.x, agentPos.y);
      } else if (p.name === "selecting") {
        if (phaseFrame === 0) bestTraj = [...trajs].sort((a, b) => a.cost - b.cost)[0];
        drawTrajs("selecting", 1);
        drawAgent(agentPos.x, agentPos.y);
      } else if (p.name === "executing") {
        drawTrajs("selecting", 1);
        drawBestPath(progress);
        if (bestTraj) {
          const idx = Math.min(Math.floor(progress * (bestTraj.points.length - 1)), bestTraj.points.length - 1);
          agentPos = { ...bestTraj.points[idx] };
        }
        drawAgent(agentPos.x, agentPos.y);
      } else if (p.name === "reset") {
        ctx.fillStyle = `rgba(240,235,225,${progress})`;
        ctx.fillRect(0, 0, W, H);
        drawAgent(agentPos.x, agentPos.y);
      }

      drawLabel(p.label, p.sub);

      phaseFrame++;
      if (phaseFrame >= p.frames) {
        phaseFrame = 0;
        phase = (phase + 1) % PHASES.length;
        if (phase === 0) { agentPos = { ...AGENT_START }; trajs = []; bestTraj = null; }
      }

      rafRef.current = requestAnimationFrame(draw);
    }

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  return (
    <div className="lewm-cem-wrap">
      <div className="lewm-cem-canvas-col">
        <canvas ref={canvasRef} width={420} height={360} className="lewm-cem-canvas" />
        <p className="lewm-cem-caption">PushT-style environment — agent (amber) plans to reach the goal (green)</p>
      </div>
      <div className="lewm-cem-steps">
        <div className="lewm-cem-step">
          <span className="lewm-cem-step-num">①</span>
          <div>
            <strong>Sample</strong>
            <p>Draw 300 candidate action sequences from a Gaussian distribution.</p>
          </div>
        </div>
        <div className="lewm-cem-step">
          <span className="lewm-cem-step-num">②</span>
          <div>
            <strong>Roll out in latent space</strong>
            <p>AR Predictor autoregressively predicts future latent states for each candidate — no pixel decoding needed.</p>
          </div>
        </div>
        <div className="lewm-cem-step">
          <span className="lewm-cem-step-num">③</span>
          <div>
            <strong>Evaluate &amp; refit</strong>
            <p>Score each trajectory by its final latent distance to the goal. Keep the top-k and refit the Gaussian.</p>
          </div>
        </div>
        <div className="lewm-cem-step">
          <span className="lewm-cem-step-num">④</span>
          <div>
            <strong>Execute &amp; replan</strong>
            <p>Execute the first action of the best sequence, observe the new state, and replan from scratch.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Export
// ─────────────────────────────────────────────────────────────────────────────

export default function LeWMClient() {
  return (
    <div className="lewm-page">

      {/* ── Hero ── */}
      <div className="lewm-hero">
        <div className="lewm-hero-inner">
          <div className="lewm-hero-text">
            <span className="lewm-badge">Research · March 2025</span>
            <h1 className="lewm-title">LeWorldModel</h1>
            <p className="lewm-subtitle">
              The first Joint Embedding Predictive Architecture (JEPA) that trains stably
              end-to-end from raw pixels — using only <strong>two loss terms</strong>.
            </p>
            <p className="lewm-authors">
              Lucas Maes &nbsp;·&nbsp; Quentin Le Lidec &nbsp;·&nbsp; Damien Scieur
              &nbsp;·&nbsp; <strong>Yann LeCun</strong> &nbsp;·&nbsp; Randall Balestriero
            </p>
            <p className="lewm-affil">Mila · NYU · Meta FAIR</p>
            <div className="lewm-hero-links">
              <a href="https://arxiv.org/abs/2603.19312" target="_blank" rel="noopener noreferrer" className="lewm-btn lewm-btn-primary">arXiv Paper</a>
              <a href="https://github.com/lucas-maes/le-wm" target="_blank" rel="noopener noreferrer" className="lewm-btn lewm-btn-secondary">GitHub</a>
              <a href="https://le-wm.github.io/" target="_blank" rel="noopener noreferrer" className="lewm-btn lewm-btn-secondary">Project Page</a>
            </div>
          </div>
          <div className="lewm-hero-gif">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/lewm-demo.gif"
              alt="LeWM planning demo across TwoRoom, PushT, Cube and Reacher environments"
              className="lewm-gif"
            />
            <p className="lewm-gif-caption">Live planning demos across all four evaluation environments</p>
          </div>
        </div>
      </div>

      {/* ── Stats strip ── */}
      <div className="lewm-stats-strip">
        <div className="lewm-stats-inner">
          <div className="lewm-stat">
            <span className="lewm-stat-value">2</span>
            <span className="lewm-stat-label">loss terms</span>
            <span className="lewm-stat-vs">vs. up to 6 in prior work</span>
          </div>
          <div className="lewm-stat-divider" />
          <div className="lewm-stat">
            <span className="lewm-stat-value">48×</span>
            <span className="lewm-stat-label">faster planning</span>
            <span className="lewm-stat-vs">vs. foundation-model baselines</span>
          </div>
          <div className="lewm-stat-divider" />
          <div className="lewm-stat">
            <span className="lewm-stat-value">~15M</span>
            <span className="lewm-stat-label">parameters</span>
            <span className="lewm-stat-vs">trains on a single GPU in hours</span>
          </div>
          <div className="lewm-stat-divider" />
          <div className="lewm-stat">
            <span className="lewm-stat-value">4</span>
            <span className="lewm-stat-label">environments</span>
            <span className="lewm-stat-vs">2D nav, 2D &amp; 3D manipulation</span>
          </div>
        </div>
      </div>

      <div className="lewm-body">

        {/* ── Plain-English Intro ── */}
        <section className="lewm-section">
          <div className="lewm-plain-english">
            <p className="lewm-plain-english-label">In Plain English</p>
            <p>Think of world models like a flight simulator for AI. Instead of learning from text the way ChatGPT does, a world model tries to build an internal mental picture of how things work — objects move, gravity pulls, a ball bounces off a wall. The idea is that an AI with this kind of understanding could plan ahead, anticipate consequences, and eventually interact with the physical world in ways that today&apos;s chatbots simply can&apos;t.</p>
            <p>The problem? The leading approach — JEPA (Joint Embedding Predictive Architecture) — has a nasty habit of collapsing during training. Imagine trying to teach someone to draw, but every time they pick up the pencil, they just scribble a single dot and say &ldquo;done.&rdquo; That&apos;s essentially what happens: the model finds a shortcut where it maps every situation to the same meaningless representation. Loss goes to zero. The model learns nothing.</p>
            <p>To prevent this, researchers piled on fixes — freezing parts of the model, adding extra training objectives, pre-training components separately. It worked, sort of, but the result was fragile, expensive, and hard to reproduce.</p>
            <p><strong>LeWorldModel takes a different approach: instead of adding more complexity, it strips the problem down to its mathematical core.</strong> The result is a system that trains stably from raw pixels using just two simple objectives — and runs on a single GPU in a few hours.</p>
          </div>
        </section>

        {/* ── The Problem ── */}
        <section className="lewm-section">
          <div className="lewm-section-header">
            <h2>The Problem with Prior World Models</h2>
          </div>
          <div className="lewm-problem-grid">
            <div className="lewm-problem-card lewm-problem-bad">
              <div className="lewm-problem-card-label">Prior approaches</div>
              <ul>
                <li>Required frozen, pre-trained ViT encoders (e.g. ImageNet-pretrained) for training stability</li>
                <li>Up to <strong>6 separate loss terms</strong> with complex hyperparameter tuning</li>
                <li>Slow inference — large foundation models make planning expensive</li>
                <li>Could not be trained end-to-end from pixels</li>
              </ul>
            </div>
            <div className="lewm-problem-card lewm-problem-good">
              <div className="lewm-problem-card-label">LeWM solution</div>
              <ul>
                <li>Trains the encoder from scratch, <strong>end-to-end from raw pixels</strong></li>
                <li>Stable training with just <strong>2 losses</strong>: prediction + SIGReg</li>
                <li>Compact ~15M param model — <strong>48× faster planning</strong></li>
                <li>Competitive performance with a fraction of the compute</li>
              </ul>
            </div>
          </div>
        </section>

        {/* ── Architecture ── */}
        <section className="lewm-section">
          <div className="lewm-section-header">
            <h2>Architecture</h2>
            <p>LeWM follows the JEPA paradigm: predict in <em>latent space</em>, not pixel space. This avoids wasting model capacity on unpredictable pixel-level details like lighting and texture.</p>
          </div>
          <ArchitectureDiagram />
          <div className="lewm-arch-notes">
            <div className="lewm-arch-note">
              <span className="lewm-arch-note-dot lewm-dot-accent" />
              <span>The <strong>ViT Encoder</strong> maps 224×224 frames to 192-dim embeddings using 14×14 patches. Uniquely, it is trained end-to-end — no frozen weights.</span>
            </div>
            <div className="lewm-arch-note">
              <span className="lewm-arch-note-dot lewm-dot-electric" />
              <span>The <strong>latent z_t</strong> is the bottleneck where the model learns a compact world representation. The SIGReg loss keeps this space well-structured.</span>
            </div>
            <div className="lewm-arch-note">
              <span className="lewm-arch-note-dot lewm-dot-accent" />
              <span>The <strong>AR Predictor</strong> autoregressively predicts future latents given history and actions, using AdaLN-zero conditioning (the same technique as in DiT).</span>
            </div>
          </div>
          <div className="lewm-plain-english">
            <p className="lewm-plain-english-label">Why the Architecture Matters Beyond the Lab</p>
            <p><strong>Previous world models had a dependency problem.</strong> They relied on massive pre-trained vision models just to get started — like needing a fully equipped kitchen before you can boil an egg. That made them expensive, hard to customize, and nearly impossible for smaller teams to work with.</p>
            <p><strong>LeWorldModel trains everything from scratch.</strong> The encoder that processes visual information and the predictor that imagines what happens next all learn together, end-to-end, from raw pixels. No pre-trained components required. This is a meaningful step toward world models that could be tailored to specific industries — factory floors, surgical robotics, autonomous vehicles — without needing a giant foundation model as a starting point.</p>
            <p><strong>It&apos;s also small and fast.</strong> At roughly 15 million parameters, it&apos;s a fraction of the size of most modern AI models. It trains in hours on a single GPU and plans 48× faster than comparable systems. A robot that needs minutes to decide its next move is useless. One that can plan in milliseconds is a product.</p>
          </div>
        </section>

        {/* ── Two Losses ── */}
        <section className="lewm-section">
          <div className="lewm-section-header">
            <h2>Two Loss Terms — That&apos;s It</h2>
            <p>The key innovation is training stability through a novel regulariser, eliminating the need for complex multi-term objectives.</p>
          </div>
          <div className="lewm-losses-grid">
            <div className="lewm-loss-card lewm-loss-electric">
              <div className="lewm-loss-num">①</div>
              <h3>SIGReg</h3>
              <p className="lewm-loss-full">Sketch Isotropic Gaussian Regulariser</p>
              <p>Enforces that the latent embedding distribution is Gaussian-shaped, preventing <strong>representational collapse</strong> — the main failure mode of end-to-end JEPA training.</p>
              <p>Uses random projections and Fourier analysis to efficiently measure distributional properties without needing a discriminator or contrastive pairs.</p>
              <div className="lewm-loss-formula">
                <code>ℒ<sub>SIGReg</sub> = 𝔼[‖proj(z) − 𝒩(0,1)‖]</code>
              </div>
            </div>
            <div className="lewm-loss-card lewm-loss-accent">
              <div className="lewm-loss-num">②</div>
              <h3>Next-Embedding Prediction</h3>
              <p className="lewm-loss-full">MSE loss in latent space</p>
              <p>The predictor is trained to minimise the mean-squared error between its <strong>predicted future latent</strong> ẑ<sub>t+k</sub> and the encoder&apos;s actual embedding of the future frame z<sub>t+k</sub>.</p>
              <p>By predicting in latent space rather than pixel space, the model focuses on learning the <em>dynamics</em> of the world, not irrelevant visual details.</p>
              <div className="lewm-loss-formula">
                <code>ℒ<sub>pred</sub> = ‖ẑ<sub>t+k</sub> − z<sub>t+k</sub>‖²</code>
              </div>
            </div>
          </div>
          <div className="lewm-loss-total">
            <span>Total objective: </span>
            <code>ℒ = ℒ<sub>pred</sub> + 0.09 · ℒ<sub>SIGReg</sub></code>
          </div>
          <div className="lewm-plain-english">
            <p className="lewm-plain-english-label">In Plain English</p>
            <p>Previous systems needed up to six different training objectives, each requiring careful tuning. LeWorldModel gets away with just two: one that teaches the model to predict what happens next, and one (SIGReg) that prevents collapse by mathematically forcing the model&apos;s internal representations to stay spread out and meaningful.</p>
            <p>Think of SIGReg as a rule that says: &ldquo;every situation must look different on the inside&rdquo; — which prevents the model from taking shortcuts and mapping everything to the same boring answer.</p>
          </div>
        </section>

        {/* ── CEM Planning ── */}
        <section className="lewm-section">
          <div className="lewm-section-header">
            <h2>Planning with the Cross-Entropy Method</h2>
            <p>At inference time, LeWM uses model-predictive planning: sample candidate action sequences, roll them out in latent space, and pick the best one — all 48× faster than foundation-model-based alternatives.</p>
          </div>
          <CEMVisualization />
          <div className="lewm-plain-english">
            <p className="lewm-plain-english-label">In Plain English</p>
            <p>Once the model has learned how the world works, it uses that knowledge to make decisions by imagining 300 different possible action sequences, mentally simulating what would happen for each one, keeping the best options, and repeating — all without ever touching the real environment.</p>
            <p>It&apos;s the same basic logic you use when you mentally rehearse different routes to work and pick the fastest one. The key difference from prior approaches: because LeWorldModel&apos;s internal world is so compact, this mental rehearsal runs <strong>48× faster</strong>.</p>
          </div>
        </section>

        {/* ── Interactive Rollout Viewer ── */}
        <section className="lewm-section">
          <div className="lewm-section-header">
            <h2>Live Planning Viewer — PushT</h2>
            <p>Pre-computed rollout from the trained LeWM checkpoint. Step through 80 frames of CEM planning: coloured lines are candidate action trajectories (teal = low cost, red = high cost), the highlighted path is the elite set the model selected. The UMAP plot tracks the agent&apos;s position in learned latent space.</p>
          </div>
          <PushTViewer />
          <div className="lewm-plain-english">
            <p className="lewm-plain-english-label">Reading the Viewer</p>
            <p>Each colored line is a possible future the model imagined. <strong>Teal lines</strong> are plans the model liked (low cost — they get close to the goal). <strong>Red lines</strong> are plans it rejected (high cost — they go the wrong way). The highlighted path is the winner.</p>
            <p>The UMAP plot on the right is a window into the model&apos;s &ldquo;mind&rdquo; — it shows how the model internally represents the agent&apos;s position, compressed from 192 dimensions down to a 2D map you can see.</p>
          </div>
        </section>

        {/* ── Live Browser Demo ── */}
        <section className="lewm-section">
          <div className="lewm-section-header">
            <h2>Try It Live — Browser Inference</h2>
            <p>
              The trained encoder runs fully in your browser via ONNX Runtime Web.
              Click the canvas to set a goal, press Play, and watch the kinematic
              CEM planner move the agent toward it — all 100% client-side, zero server calls.
              The scatter plot shows where the encoder maps the current observation
              relative to the pre-computed reference trajectory.
            </p>
          </div>
          <div className="live-demo-badge-row">
            <span className="live-demo-badge">⚡ ONNX Runtime Web</span>
            <span className="live-demo-badge">⚡ No server — pure browser</span>
            <span className="live-demo-badge">⚡ 24 MB encoder · PCA projection</span>
          </div>
          <LivePushTDemo />
          <div className="lewm-plain-english">
            <p className="lewm-plain-english-label">What&apos;s Actually Happening</p>
            <p>When you click the canvas and set a goal, every single frame the model performs a full cycle of intelligent planning — <em>entirely inside your browser, with no server involved.</em></p>
            <p><strong>1. It &ldquo;sees&rdquo; the current scene</strong> — processing raw pixels through its vision encoder, compressing a 224×224 image down to a single 192-number summary of &ldquo;what the world looks like right now.&rdquo;</p>
            <p><strong>2. It imagines 300 possible futures</strong> — mentally simulating different action sequences entirely in its compressed internal world, not in pixel-space (which would be slow and expensive).</p>
            <p><strong>3. It picks the best plan and acts</strong> — scores each imagined future by how close it gets to your goal, takes the first step of the winning plan, then replans from scratch.</p>
            <p><strong>4. The scatter plot shows the model&apos;s &ldquo;mental map&rdquo;</strong> — projecting the model&apos;s 192-dimensional internal state down to 2D so you can see it.</p>
            <p>This is a tiny model — about 15 million parameters, small enough to run in a web browser. And yet it&apos;s performing the core loop of autonomous decision-making: perceive, imagine, plan, act, repeat. That loop is the foundation of everything from warehouse robots to self-driving cars to surgical assistants. <strong>Each time you click and set a new goal,</strong> you&apos;re testing whether the model has genuinely learned the physics of this little world — not memorized a fixed path, but understood the underlying rules well enough to plan a new route on the fly.</p>
          </div>
        </section>

        {/* ── Environments ── */}
        <section className="lewm-section">
          <div className="lewm-section-header">
            <h2>Evaluation Environments</h2>
            <p>Tested across four tasks of increasing complexity — 50 episodes each, 5-step planning horizon, 300 CEM samples.</p>
          </div>
          <div className="lewm-env-grid">
            {[
              { name: "TwoRoom", tag: "2D Navigation", desc: "Agent navigates between two rooms through a narrow doorway. Tests long-horizon planning and spatial reasoning.", color: "lewm-env-blue" },
              { name: "PushT", tag: "2D Manipulation", desc: "Push a T-shaped block to a target position and orientation. A classic robotic manipulation benchmark.", color: "lewm-env-green" },
              { name: "Cube", tag: "3D Manipulation", desc: "Manipulate a cube to a goal pose via OGBench's cube_single task. Tests 3D spatial understanding.", color: "lewm-env-amber" },
              { name: "Reacher", tag: "3D Control", desc: "Continuous control via DeepMind Control Suite Reacher. Tests fine-grained motor control from pixels.", color: "lewm-env-teal" },
            ].map(env => (
              <div key={env.name} className={`lewm-env-card ${env.color}`}>
                <div className="lewm-env-tag">{env.tag}</div>
                <h3 className="lewm-env-name">{env.name}</h3>
                <p className="lewm-env-desc">{env.desc}</p>
              </div>
            ))}
          </div>
          <div className="lewm-plain-english">
            <p className="lewm-plain-english-label">In Plain English</p>
            <p>The team tested LeWorldModel across four tasks that get progressively harder: navigating between rooms, pushing an object to a target, manipulating a 3D cube, and controlling a robotic arm. These are standard benchmarks in the field — the AI equivalent of standardized tests.</p>
            <p>LeWorldModel holds its own against much larger systems on simpler tasks, though bigger pre-trained models still perform better in visually complex 3D settings. The point isn&apos;t that it&apos;s the best at everything — it&apos;s that it&apos;s <strong>competitive while being dramatically simpler and faster</strong>.</p>
          </div>
        </section>

        {/* ── The Big Picture ── */}
        <section className="lewm-section">
          <div className="lewm-section-header">
            <h2>The Big Picture</h2>
          </div>
          <div className="lewm-big-picture">
            <p>LeWorldModel is not a breakthrough in what world models <em>can do</em>. It&apos;s a breakthrough in how <em>simply</em> they can be built.</p>
            <p>For years, the world model approach to AI — building systems that understand and simulate physical reality rather than just predicting text — has been stuck behind an engineering wall. The systems were too fragile, too complex, and too expensive to train reliably. LeWorldModel doesn&apos;t demolish that wall, but it shows a much simpler path through it.</p>
            <p>By replacing a tangled web of training tricks with a clean mathematical solution, it demonstrates that a fully end-to-end JEPA world model can be trained from raw pixels, on a single GPU, in a few hours. That&apos;s significant not because of the benchmarks (which are solid but not record-breaking), but because it <strong>changes the economics and accessibility of this entire line of research</strong>.</p>
            <p>If this recipe scales — and that&apos;s still a big &ldquo;if&rdquo; — it could mean that building a world model stops being something only a handful of well-funded labs can attempt, and starts being something any AI team can experiment with. In a field defined by the mantra &ldquo;bigger models, more compute,&rdquo; LeWorldModel quietly suggests that sometimes, the answer is a better equation.</p>
          </div>
          <div className="lewm-vjepa-callout">
            <h4>Two Paths, One Vision — LeWorldModel &amp; V-JEPA 2.1</h4>
            <p>LeWorldModel isn&apos;t happening in isolation. LeCun&apos;s broader research program is pursuing two parallel tracks: <strong>LeWorldModel</strong> asks how simple world models can be made while keeping them functional — strip away the complexity, find the minimal recipe. <strong>V-JEPA 2.1</strong> asks how rich and expressive world model representations can become — more supervision, finer details, scaled across images and video.</p>
            <p>These aren&apos;t competing approaches. One is compressing the engine to its essence. The other is expanding the fuel supply. For AMI, having both threads advancing simultaneously means the research isn&apos;t betting on a single path — it&apos;s building a toolkit.</p>
          </div>
        </section>

        {/* ── Citation ── */}
        <section className="lewm-section lewm-citation-section">
          <h2>Citation</h2>
          <pre className="lewm-citation-block">{`@article{maes2026lewm,
  title   = {LeWorldModel: End-to-End JEPA World Model from Pixels},
  author  = {Maes, Lucas and Le Lidec, Quentin and Scieur, Damien
             and LeCun, Yann and Balestriero, Randall},
  journal = {arXiv:2603.19312},
  year    = {2026}
}`}</pre>
        </section>

      </div>
    </div>
  );
}
