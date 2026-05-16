"use client";

import { useEffect, useRef, useState } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Non-Greedy Pick-and-Place: side-by-side flat vs. hierarchical planner
// ─────────────────────────────────────────────────────────────────────────────
//
// The paper's signature finding: a single-level ("flat") world-model planner
// fails on tasks that require temporarily moving AWAY from the goal — like
// picking up a cup before placing it. A hierarchical planner generates a
// subgoal (be over the cup, holding it), reaches it, then plans toward the
// final goal. This visualization runs both planners on the same scene in
// lockstep so the difference is visible.
//
// Implementation: pure canvas; phases controlled by a frame counter; replay
// loops; user can pause/restart.

type Vec = { x: number; y: number };

type SceneState = {
  gripper: Vec;
  cup: Vec;
  holding: boolean;
  placed: boolean;
};

type Phase = {
  name: "sense" | "sample" | "execute" | "outcome" | "reset";
  label: string;
  flatSub: string;
  hierSub: string;
  frames: number;
};

const PHASES: Phase[] = [
  {
    name: "sense",
    label: "Encoding observation",
    flatSub: "current state → latent z₁",
    hierSub: "current state → latent z₁",
    frames: 34,
  },
  {
    name: "sample",
    label: "Planning",
    flatSub: "sample action seqs → minimize ‖z − z_goal‖",
    hierSub: "high-level plan → first subgoal z̃₁",
    frames: 64,
  },
  {
    name: "execute",
    label: "Executing best plan",
    flatSub: "moves toward goal zone — ignores cup",
    hierSub: "moves toward subgoal: be over cup",
    frames: 110,
  },
  {
    name: "outcome",
    label: "Outcome",
    flatSub: "✗  cup never lifted — goal state not reached",
    hierSub: "✓  subgoal reached → re-plan → place cup",
    frames: 130,
  },
  {
    name: "reset",
    label: "",
    flatSub: "",
    hierSub: "",
    frames: 28,
  },
];

function NonGreedyDemo() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const [running, setRunning] = useState(true);
  const runningRef = useRef(true);
  const [stepLabel, setStepLabel] = useState("Encoding observation");

  useEffect(() => {
    runningRef.current = running;
  }, [running]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctxMaybe = canvas.getContext("2d");
    if (!ctxMaybe) return;
    const ctx: CanvasRenderingContext2D = ctxMaybe;

    const dpr = window.devicePixelRatio || 1;
    const CSS_W = 860;
    const CSS_H = 380;
    canvas.width = CSS_W * dpr;
    canvas.height = CSS_H * dpr;
    canvas.style.width = CSS_W + "px";
    canvas.style.height = CSS_H + "px";
    ctx.scale(dpr, dpr);

    const PANEL_W = CSS_W / 2;
    const PANEL_H = CSS_H;

    // Scene coords are within each panel
    const startGripper: Vec = { x: PANEL_W * 0.18, y: PANEL_H * 0.22 };
    const startCup: Vec = { x: PANEL_W * 0.28, y: PANEL_H * 0.72 };
    const targetZone: Vec = { x: PANEL_W * 0.74, y: PANEL_H * 0.72 };

    type Plan = { points: Vec[]; cost: number };

    function makeFlatCandidates(from: Vec, target: Vec, n: number): Plan[] {
      // Flat planner: candidates are perturbed paths toward the goal pose,
      // scored by final distance to target.
      return Array.from({ length: n }, () => {
        const pts: Vec[] = [{ ...from }];
        let cx = from.x;
        let cy = from.y;
        const dx = (target.x - from.x) / 6;
        const dy = (target.y - from.y) / 6;
        for (let i = 0; i < 6; i++) {
          cx += dx + (Math.random() - 0.5) * 24;
          cy += dy + (Math.random() - 0.5) * 24;
          pts.push({ x: cx, y: cy });
        }
        const last = pts[pts.length - 1];
        const cost = Math.hypot(last.x - target.x, last.y - target.y);
        return { points: pts, cost };
      });
    }

    function makeHierCandidates(from: Vec, subgoal: Vec, n: number): Plan[] {
      return Array.from({ length: n }, () => {
        const pts: Vec[] = [{ ...from }];
        let cx = from.x;
        let cy = from.y;
        const dx = (subgoal.x - from.x) / 6;
        const dy = (subgoal.y - from.y) / 6;
        for (let i = 0; i < 6; i++) {
          cx += dx + (Math.random() - 0.5) * 20;
          cy += dy + (Math.random() - 0.5) * 20;
          pts.push({ x: cx, y: cy });
        }
        const last = pts[pts.length - 1];
        const cost = Math.hypot(last.x - subgoal.x, last.y - subgoal.y);
        return { points: pts, cost };
      });
    }

    // Per-side state
    let phase = 0;
    let phaseFrame = 0;
    let flatScene: SceneState = {
      gripper: { ...startGripper },
      cup: { ...startCup },
      holding: false,
      placed: false,
    };
    let hierScene: SceneState = {
      gripper: { ...startGripper },
      cup: { ...startCup },
      holding: false,
      placed: false,
    };
    let flatPlans: Plan[] = [];
    let hierSubgoalProposals: Vec[] = [];
    let hierActiveSubgoal: Vec = { ...startCup };
    let hierPlans: Plan[] = [];

    function drawPanelBg(ox: number, label: string, sub: string) {
      // background
      ctx.fillStyle = "#F0EBE1";
      ctx.fillRect(ox, 0, PANEL_W, PANEL_H);
      // panel border
      ctx.strokeStyle = "#C8BCA8";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(ox + 1.5, 1.5, PANEL_W - 3, PANEL_H - 3);

      // header band
      ctx.fillStyle = label.includes("Flat")
        ? "rgba(170, 60, 50, 0.10)"
        : "rgba(42, 125, 107, 0.12)";
      ctx.fillRect(ox + 1.5, 1.5, PANEL_W - 3, 34);
      ctx.fillStyle = label.includes("Flat") ? "#A0382C" : "#1F6E5C";
      ctx.font = "bold 12px ui-sans-serif, system-ui, -apple-system";
      ctx.textAlign = "left";
      ctx.fillText(label, ox + 14, 22);
      ctx.fillStyle = "#7A6E5C";
      ctx.font = "10.5px ui-sans-serif, system-ui, -apple-system";
      ctx.fillText(sub, ox + 14, 31);
    }

    function drawTarget(ox: number) {
      const s = 50;
      ctx.save();
      ctx.translate(ox, 0);
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = "rgba(42,125,107,0.65)";
      ctx.fillStyle = "rgba(42,125,107,0.10)";
      ctx.lineWidth = 1.5;
      ctx.fillRect(targetZone.x - s / 2, targetZone.y - s / 2, s, s);
      ctx.strokeRect(targetZone.x - s / 2, targetZone.y - s / 2, s, s);
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(42,125,107,0.75)";
      ctx.font = "10px ui-sans-serif, system-ui, -apple-system";
      ctx.textAlign = "center";
      ctx.fillText("target", targetZone.x, targetZone.y - s / 2 - 5);

      // ghost cup at goal
      ctx.fillStyle = "rgba(184,134,11,0.18)";
      ctx.strokeStyle = "rgba(184,134,11,0.45)";
      ctx.lineWidth = 1;
      ctx.fillRect(targetZone.x - 10, targetZone.y - 10, 20, 20);
      ctx.strokeRect(targetZone.x - 10, targetZone.y - 10, 20, 20);
      ctx.restore();
    }

    function drawCup(ox: number, c: Vec) {
      ctx.save();
      ctx.translate(ox, 0);
      ctx.fillStyle = "#B8860B";
      ctx.strokeStyle = "#7A5520";
      ctx.lineWidth = 1.5;
      ctx.fillRect(c.x - 10, c.y - 10, 20, 20);
      ctx.strokeRect(c.x - 10, c.y - 10, 20, 20);
      // simple cup highlight
      ctx.fillStyle = "rgba(255,255,255,0.25)";
      ctx.fillRect(c.x - 8, c.y - 8, 5, 5);
      ctx.restore();
    }

    function drawGripper(ox: number, g: Vec, holding: boolean) {
      ctx.save();
      ctx.translate(ox, 0);
      // shadow
      ctx.fillStyle = "rgba(0,0,0,0.08)";
      ctx.beginPath();
      ctx.ellipse(g.x, g.y + 16, 13, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      // arm
      ctx.strokeStyle = "#3A3A3A";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(g.x, 0);
      ctx.lineTo(g.x, g.y - 6);
      ctx.stroke();
      // gripper head
      ctx.fillStyle = "#2A2A2A";
      ctx.strokeStyle = "#111";
      ctx.lineWidth = 1.5;
      // body
      ctx.fillRect(g.x - 11, g.y - 6, 22, 8);
      ctx.strokeRect(g.x - 11, g.y - 6, 22, 8);
      // fingers
      const sep = holding ? 6 : 9;
      ctx.fillRect(g.x - sep - 2, g.y + 2, 4, 8);
      ctx.fillRect(g.x + sep - 2, g.y + 2, 4, 8);
      ctx.strokeRect(g.x - sep - 2, g.y + 2, 4, 8);
      ctx.strokeRect(g.x + sep - 2, g.y + 2, 4, 8);
      ctx.restore();
    }

    function drawCandidates(
      ox: number,
      plans: Plan[],
      progress: number,
      style: "flat" | "hier",
    ) {
      if (!plans.length) return;
      const visible = Math.max(1, Math.floor(progress * plans.length));
      const sorted = [...plans].sort((a, b) => a.cost - b.cost);
      ctx.save();
      ctx.translate(ox, 0);
      for (let i = 0; i < visible; i++) {
        const p = plans[i];
        const rank = sorted.indexOf(p);
        const isElite = rank < 3;
        if (style === "flat") {
          ctx.strokeStyle = isElite
            ? `rgba(170,60,50,${0.45 + 0.25 * (1 - rank / 3)})`
            : "rgba(120,100,90,0.18)";
        } else {
          ctx.strokeStyle = isElite
            ? `rgba(42,125,107,${0.5 + 0.25 * (1 - rank / 3)})`
            : "rgba(120,100,90,0.18)";
        }
        ctx.lineWidth = isElite ? 1.8 : 1.1;
        ctx.beginPath();
        ctx.moveTo(p.points[0].x, p.points[0].y);
        for (let j = 1; j < p.points.length; j++) {
          ctx.lineTo(p.points[j].x, p.points[j].y);
        }
        ctx.stroke();
      }
      ctx.restore();
    }

    function drawSubgoalProposals(ox: number, proposals: Vec[], progress: number) {
      if (!proposals.length) return;
      const visible = Math.max(1, Math.floor(progress * proposals.length));
      ctx.save();
      ctx.translate(ox, 0);
      for (let i = 0; i < visible; i++) {
        const p = proposals[i];
        const isBest = i === 0;
        ctx.setLineDash(isBest ? [] : [3, 2]);
        ctx.strokeStyle = isBest
          ? "rgba(42,125,107,0.95)"
          : "rgba(42,125,107,0.30)";
        ctx.fillStyle = isBest
          ? "rgba(42,125,107,0.20)"
          : "rgba(42,125,107,0.05)";
        ctx.lineWidth = isBest ? 2 : 1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, isBest ? 16 : 11, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        if (isBest) {
          ctx.fillStyle = "#1F6E5C";
          ctx.font = "bold 9.5px ui-sans-serif, system-ui";
          ctx.textAlign = "center";
          ctx.fillText("subgoal z̃₁", p.x, p.y - 22);
        }
      }
      ctx.setLineDash([]);
      ctx.restore();
    }

    function drawOutcome(ox: number, success: boolean) {
      ctx.save();
      ctx.translate(ox, 0);
      const cx = PANEL_W / 2;
      const cy = PANEL_H - 56;
      ctx.fillStyle = success
        ? "rgba(42,125,107,0.92)"
        : "rgba(170,60,50,0.92)";
      ctx.beginPath();
      ctx.roundRect?.(cx - 78, cy - 18, 156, 36, 10);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = "bold 13px ui-sans-serif, system-ui, -apple-system";
      ctx.textAlign = "center";
      ctx.fillText(success ? "✓  Goal reached" : "✗  Failed", cx, cy + 5);
      ctx.restore();
    }

    function lerp(a: number, b: number, t: number) {
      return a + (b - a) * t;
    }

    function clamp01(t: number) {
      return Math.max(0, Math.min(1, t));
    }

    function easeInOut(t: number) {
      return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    }

    function draw() {
      const p = PHASES[phase];
      const t = clamp01(phaseFrame / p.frames);

      // FLAT panel left, HIERARCHICAL right
      const oxFlat = 0;
      const oxHier = PANEL_W;

      drawPanelBg(oxFlat, "Flat planner", p.flatSub);
      drawPanelBg(oxHier, "Hierarchical planner (HWM)", p.hierSub);

      drawTarget(oxFlat);
      drawTarget(oxHier);

      if (p.name === "sense") {
        // pulse a ring around the gripper representing encoding
        const r = 8 + Math.sin(t * Math.PI) * 14;
        for (const [ox, scene] of [
          [oxFlat, flatScene],
          [oxHier, hierScene],
        ] as [number, SceneState][]) {
          ctx.save();
          ctx.translate(ox, 0);
          ctx.strokeStyle = "rgba(148,107,45,0.45)";
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(scene.gripper.x, scene.gripper.y, r, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
      }

      if (p.name === "sample") {
        if (phaseFrame === 0) {
          flatPlans = makeFlatCandidates(
            flatScene.gripper,
            { x: targetZone.x, y: targetZone.y - 14 },
            14,
          );
          hierSubgoalProposals = [
            { x: startCup.x, y: startCup.y - 18 }, // best
            { x: PANEL_W * 0.55, y: PANEL_H * 0.4 },
            { x: PANEL_W * 0.4, y: PANEL_H * 0.55 },
            { x: PANEL_W * 0.6, y: PANEL_H * 0.6 },
          ];
          hierActiveSubgoal = hierSubgoalProposals[0];
          hierPlans = makeHierCandidates(
            hierScene.gripper,
            hierActiveSubgoal,
            14,
          );
        }
        drawCandidates(oxFlat, flatPlans, t, "flat");
        // high-level proposals first half, low-level second half
        const halfT = t * 2;
        if (halfT < 1) {
          drawSubgoalProposals(oxHier, hierSubgoalProposals, halfT);
        } else {
          drawSubgoalProposals(oxHier, hierSubgoalProposals, 1);
          drawCandidates(oxHier, hierPlans, halfT - 1, "hier");
        }
      }

      if (p.name === "execute") {
        // FLAT: gripper drifts toward target zone, never picks up cup
        const flatT = easeInOut(t);
        flatScene.gripper = {
          x: lerp(startGripper.x, targetZone.x, flatT),
          y: lerp(startGripper.y, targetZone.y - 28, flatT),
        };
        // ghosted candidate trails still visible, fading
        ctx.save();
        ctx.globalAlpha = 1 - t * 0.85;
        drawCandidates(oxFlat, flatPlans, 1, "flat");
        ctx.restore();

        // HIER: two-stage execution. First half: down to subgoal at cup.
        // Second half (after replan): subgoal switches to target with cup, lift+carry+place.
        if (t < 0.45) {
          const tt = easeInOut(t / 0.45);
          hierScene.gripper = {
            x: lerp(startGripper.x, startCup.x, tt),
            y: lerp(startGripper.y, startCup.y - 14, tt),
          };
        } else if (t < 0.55) {
          // grasp
          hierScene.gripper = { x: startCup.x, y: startCup.y - 14 };
          hierScene.holding = true;
        } else {
          const tt = easeInOut((t - 0.55) / 0.45);
          hierScene.gripper = {
            x: lerp(startCup.x, targetZone.x, tt),
            y: lerp(startCup.y - 14, targetZone.y - 14, tt),
          };
          if (hierScene.holding) {
            hierScene.cup = { x: hierScene.gripper.x, y: hierScene.gripper.y + 18 };
          }
        }

        // ghosted candidates also fade
        ctx.save();
        ctx.globalAlpha = 1 - t * 0.85;
        drawCandidates(oxHier, hierPlans, 1, "hier");
        // first subgoal stays visible until midway
        if (t < 0.55) drawSubgoalProposals(oxHier, hierSubgoalProposals, 1);
        ctx.restore();

        // After midway, show new subgoal (over target)
        if (t >= 0.55) {
          const newProposals: Vec[] = [
            { x: targetZone.x, y: targetZone.y - 14 },
          ];
          drawSubgoalProposals(oxHier, newProposals, 1);
        }
      }

      if (p.name === "outcome") {
        // FLAT: gripper sits over target zone, no cup
        // HIER: cup placed in target zone
        if (phaseFrame === 0) {
          // place the cup
          hierScene.cup = { x: targetZone.x, y: targetZone.y };
          hierScene.placed = true;
          hierScene.holding = false;
          // pull gripper slightly up
          hierScene.gripper = { x: targetZone.x, y: targetZone.y - 28 };
        }
        if (phaseFrame > 24) {
          drawOutcome(oxFlat, false);
          drawOutcome(oxHier, true);
        }
      }

      if (p.name === "reset") {
        // fade
        const a = t;
        ctx.fillStyle = `rgba(240,235,225,${a})`;
        ctx.fillRect(0, 0, CSS_W, PANEL_H);
      }

      // Always draw cup + gripper on top
      drawCup(oxFlat, flatScene.cup);
      drawCup(oxHier, hierScene.cup);
      drawGripper(oxFlat, flatScene.gripper, flatScene.holding);
      drawGripper(oxHier, hierScene.gripper, hierScene.holding);

      // Divider
      ctx.fillStyle = "#C8BCA8";
      ctx.fillRect(PANEL_W - 0.5, 0, 1, PANEL_H);

      if (runningRef.current) phaseFrame++;
      if (phaseFrame >= p.frames) {
        phaseFrame = 0;
        phase = (phase + 1) % PHASES.length;
        setStepLabel(PHASES[phase].label || PHASES[(phase + 1) % PHASES.length].label);
        if (phase === 0) {
          flatScene = {
            gripper: { ...startGripper },
            cup: { ...startCup },
            holding: false,
            placed: false,
          };
          hierScene = {
            gripper: { ...startGripper },
            cup: { ...startCup },
            holding: false,
            placed: false,
          };
          flatPlans = [];
          hierSubgoalProposals = [];
          hierPlans = [];
        }
      }

      rafRef.current = requestAnimationFrame(draw);
    }

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  return (
    <div className="hwm-demo-wrap">
      <div className="hwm-demo-canvas-row">
        <canvas ref={canvasRef} className="hwm-demo-canvas" />
      </div>
      <div className="hwm-demo-controls">
        <span className="hwm-demo-phase">Phase: <strong>{stepLabel}</strong></span>
        <button
          type="button"
          className="hwm-demo-btn"
          onClick={() => setRunning((r) => !r)}
          aria-label={running ? "Pause demo" : "Play demo"}
        >
          {running ? "❚❚ Pause" : "▶ Play"}
        </button>
      </div>
      <div className="hwm-demo-legend">
        <div className="hwm-demo-legend-col">
          <div className="hwm-demo-legend-title hwm-demo-legend-flat">Flat planner</div>
          <p>
            Optimises a single objective: <em>minimise distance from the current latent state
            to the goal latent state</em>. The greedy direction is straight to the target zone
            — so the gripper drifts there, hovers, and never lifts the cup. Cup stays put.
            Goal not reached.
          </p>
        </div>
        <div className="hwm-demo-legend-col">
          <div className="hwm-demo-legend-title hwm-demo-legend-hier">Hierarchical (HWM)</div>
          <p>
            A high-level world model first proposes a <strong>subgoal</strong> in the same
            latent space — &ldquo;be over the cup, ready to grasp.&rdquo; The low-level planner
            then optimises primitive actions to reach that subgoal. Once reached, the high level
            re-plans, this time toward the target zone with the cup in hand.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Architecture Diagram — two world models in a shared latent space
// ─────────────────────────────────────────────────────────────────────────────

function ArchitectureDiagram() {
  return (
    <div className="hwm-arch-wrap">
      <svg
        viewBox="0 0 860 410"
        className="hwm-arch-svg"
        role="img"
        aria-label="HWM architecture: encoder, shared latent space, low-level and high-level world models, action encoder"
      >
        <defs>
          <marker id="hwm-arr" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
            <polygon points="0 0, 8 3, 0 6" fill="var(--accent2)" />
          </marker>
          <marker id="hwm-arr-electric" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
            <polygon points="0 0, 8 3, 0 6" fill="var(--electric)" />
          </marker>
        </defs>

        {/* ── Shared latent space band ── */}
        <rect
          x="20"
          y="22"
          width="820"
          height="90"
          rx="10"
          fill="rgba(42,125,107,0.06)"
          stroke="var(--electric)"
          strokeWidth="1"
          strokeDasharray="4 3"
        />
        <text x="38" y="42" fontFamily="inherit" fontSize="10" fontWeight="700" fill="var(--electric)" letterSpacing="0.04em">
          SHARED LATENT SPACE
        </text>

        {/* ── Observation s_t ── */}
        <rect x="40" y="58" width="92" height="44" rx="6" fill="var(--surface)" stroke="var(--border)" strokeWidth="1.5" />
        <text x="86" y="78" textAnchor="middle" fontFamily="inherit" fontSize="11" fontWeight="600" fill="var(--text-dim)">
          observation
        </text>
        <text x="86" y="92" textAnchor="middle" fontFamily="Georgia, serif" fontStyle="italic" fontSize="11" fill="var(--text-dim)">
          s
          <tspan baselineShift="sub" fontSize="9">t</tspan>
        </text>

        {/* arrow to encoder */}
        <line x1="132" y1="80" x2="162" y2="80" stroke="var(--accent2)" strokeWidth="2" markerEnd="url(#hwm-arr)" />

        {/* Encoder E (left) */}
        <rect x="162" y="58" width="100" height="44" rx="6" fill="rgba(148,107,45,0.10)" stroke="var(--accent)" strokeWidth="1.5" />
        <text x="212" y="78" textAnchor="middle" fontFamily="inherit" fontSize="11" fontWeight="700" fill="var(--accent)">
          Encoder
        </text>
        <text x="212" y="92" textAnchor="middle" fontFamily="Georgia, serif" fontStyle="italic" fontSize="11" fill="var(--accent)">
          E
        </text>

        {/* arrow to z_t */}
        <line x1="262" y1="80" x2="294" y2="80" stroke="var(--accent2)" strokeWidth="2" markerEnd="url(#hwm-arr)" />

        {/* Latent z_t */}
        <circle cx="324" cy="80" r="24" fill="rgba(42,125,107,0.12)" stroke="var(--electric)" strokeWidth="2" />
        <text x="324" y="78" textAnchor="middle" fontFamily="Georgia, serif" fontStyle="italic" fontSize="16" fontWeight="700" fill="var(--electric)">
          z
        </text>
        <text x="334" y="88" fontFamily="inherit" fontSize="10" fill="var(--electric)">
          t
        </text>

        {/* ── Goal side: z_g, Encoder E, observation s_g ── */}
        <line x1="540" y1="80" x2="510" y2="80" stroke="var(--accent2)" strokeWidth="2" strokeDasharray="3 3" markerEnd="url(#hwm-arr)" transform="rotate(180 525 80)" />

        <circle cx="540" cy="80" r="24" fill="rgba(42,125,107,0.12)" stroke="var(--electric)" strokeWidth="2" />
        <text x="540" y="78" textAnchor="middle" fontFamily="Georgia, serif" fontStyle="italic" fontSize="16" fontWeight="700" fill="var(--electric)">
          z
        </text>
        <text x="550" y="88" fontFamily="inherit" fontSize="10" fill="var(--electric)">
          g
        </text>

        <line x1="572" y1="80" x2="600" y2="80" stroke="var(--accent2)" strokeWidth="2" markerEnd="url(#hwm-arr)" transform="rotate(180 586 80)" />

        <rect x="600" y="58" width="100" height="44" rx="6" fill="rgba(148,107,45,0.10)" stroke="var(--accent)" strokeWidth="1.5" />
        <text x="650" y="78" textAnchor="middle" fontFamily="inherit" fontSize="11" fontWeight="700" fill="var(--accent)">
          Encoder
        </text>
        <text x="650" y="92" textAnchor="middle" fontFamily="Georgia, serif" fontStyle="italic" fontSize="11" fill="var(--accent)">
          E
        </text>

        <line x1="730" y1="80" x2="700" y2="80" stroke="var(--accent2)" strokeWidth="2" markerEnd="url(#hwm-arr)" transform="rotate(180 715 80)" />

        <rect x="730" y="58" width="100" height="44" rx="6" fill="var(--surface)" stroke="var(--border)" strokeWidth="1.5" />
        <text x="780" y="78" textAnchor="middle" fontFamily="inherit" fontSize="11" fontWeight="600" fill="var(--text-dim)">
          goal obs
        </text>
        <text x="780" y="92" textAnchor="middle" fontFamily="Georgia, serif" fontStyle="italic" fontSize="11" fill="var(--text-dim)">
          s
          <tspan baselineShift="sub" fontSize="9">g</tspan>
        </text>

        {/* dotted line between z_t and z_g */}
        <line x1="348" y1="80" x2="516" y2="80" stroke="var(--electric)" strokeWidth="1" strokeDasharray="2 3" opacity="0.4" />
        <text x="432" y="74" textAnchor="middle" fontFamily="inherit" fontSize="9" fill="var(--electric)" opacity="0.7">
          same space — comparable directly
        </text>

        {/* ── Branches: down to low-level WM, up to high-level WM (but we'll put both side-by-side below latent space) ── */}
        <line x1="304" y1="104" x2="200" y2="158" stroke="var(--accent2)" strokeWidth="2" markerEnd="url(#hwm-arr)" />
        <line x1="344" y1="104" x2="448" y2="158" stroke="var(--accent2)" strokeWidth="2" markerEnd="url(#hwm-arr)" />

        {/* ── Low-level WM ── */}
        <rect x="60" y="158" width="280" height="90" rx="8" fill="rgba(148,107,45,0.08)" stroke="var(--accent)" strokeWidth="1.5" />
        <text x="200" y="184" textAnchor="middle" fontFamily="inherit" fontSize="13" fontWeight="700" fill="var(--accent)">
          Low-level World Model
        </text>
        <text x="200" y="204" textAnchor="middle" fontFamily="Georgia, serif" fontStyle="italic" fontSize="12" fill="var(--accent)">
          P
          <tspan baselineShift="super" fontSize="9">(1)</tspan>
          (z
          <tspan baselineShift="sub" fontSize="9">t+1</tspan>
          {" "}| z
          <tspan baselineShift="sub" fontSize="9">t</tspan>
          , a
          <tspan baselineShift="sub" fontSize="9">t</tspan>
          )
        </text>
        <text x="200" y="225" textAnchor="middle" fontFamily="inherit" fontSize="11" fill="var(--text-dim)">
          short horizon · primitive actions
        </text>
        <text x="200" y="240" textAnchor="middle" fontFamily="inherit" fontSize="10" fill="var(--muted)" fontStyle="italic">
          one frame ahead
        </text>

        {/* ── High-level WM ── */}
        <rect x="448" y="158" width="280" height="90" rx="8" fill="rgba(148,107,45,0.08)" stroke="var(--accent)" strokeWidth="1.5" />
        <text x="588" y="184" textAnchor="middle" fontFamily="inherit" fontSize="13" fontWeight="700" fill="var(--accent)">
          High-level World Model
        </text>
        <text x="588" y="204" textAnchor="middle" fontFamily="Georgia, serif" fontStyle="italic" fontSize="12" fill="var(--accent)">
          P
          <tspan baselineShift="super" fontSize="9">(2)</tspan>
          (z
          <tspan baselineShift="sub" fontSize="9">t+h</tspan>
          {" "}| z
          <tspan baselineShift="sub" fontSize="9">t</tspan>
          , l
          <tspan baselineShift="sub" fontSize="9">t</tspan>
          )
        </text>
        <text x="588" y="225" textAnchor="middle" fontFamily="inherit" fontSize="11" fill="var(--text-dim)">
          long horizon · macro actions
        </text>
        <text x="588" y="240" textAnchor="middle" fontFamily="inherit" fontSize="10" fill="var(--muted)" fontStyle="italic">
          many frames ahead, variable stride
        </text>

        {/* Output arrows */}
        <line x1="200" y1="248" x2="200" y2="278" stroke="var(--accent2)" strokeWidth="2" markerEnd="url(#hwm-arr)" />
        <line x1="588" y1="248" x2="588" y2="278" stroke="var(--accent2)" strokeWidth="2" markerEnd="url(#hwm-arr)" />

        {/* Predicted latents */}
        <circle cx="200" cy="298" r="20" fill="rgba(42,125,107,0.12)" stroke="var(--electric)" strokeWidth="1.5" />
        <text x="200" y="296" textAnchor="middle" fontFamily="Georgia, serif" fontStyle="italic" fontSize="13" fontWeight="700" fill="var(--electric)">
          ẑ
        </text>
        <text x="210" y="304" fontFamily="inherit" fontSize="9" fill="var(--electric)">
          t+1
        </text>

        <circle cx="588" cy="298" r="20" fill="rgba(42,125,107,0.12)" stroke="var(--electric)" strokeWidth="1.5" />
        <text x="588" y="296" textAnchor="middle" fontFamily="Georgia, serif" fontStyle="italic" fontSize="13" fontWeight="700" fill="var(--electric)">
          ẑ
        </text>
        <text x="598" y="304" fontFamily="inherit" fontSize="9" fill="var(--electric)">
          t+h
        </text>

        {/* Action inputs */}
        {/* a_t into low-level WM */}
        <rect x="105" y="346" width="190" height="40" rx="6" fill="var(--surface2)" stroke="var(--border)" strokeWidth="1.5" />
        <text x="200" y="365" textAnchor="middle" fontFamily="inherit" fontSize="11" fontWeight="600" fill="var(--text-dim)">
          primitive action
        </text>
        <text x="200" y="380" textAnchor="middle" fontFamily="Georgia, serif" fontStyle="italic" fontSize="11" fill="var(--text-dim)">
          a
          <tspan baselineShift="sub" fontSize="9">t</tspan>
        </text>
        <line x1="200" y1="346" x2="200" y2="252" stroke="var(--electric)" strokeWidth="2" strokeDasharray="4 3" markerEnd="url(#hwm-arr-electric)" />

        {/* Action encoder + macro action */}
        <rect x="493" y="346" width="190" height="40" rx="6" fill="rgba(42,125,107,0.10)" stroke="var(--electric)" strokeWidth="1.5" />
        <text x="588" y="365" textAnchor="middle" fontFamily="inherit" fontSize="11" fontWeight="700" fill="var(--electric)">
          Action Encoder
        </text>
        <text x="588" y="380" textAnchor="middle" fontFamily="Georgia, serif" fontStyle="italic" fontSize="11" fill="var(--electric)">
          A
          <tspan baselineShift="sub" fontSize="9">ψ</tspan>
          {" "}: a
          <tspan baselineShift="sub" fontSize="9">t</tspan>
          …a
          <tspan baselineShift="sub" fontSize="9">t+h−1</tspan>
          {" "}→ l
          <tspan baselineShift="sub" fontSize="9">t</tspan>
        </text>
        <line x1="588" y1="346" x2="588" y2="252" stroke="var(--electric)" strokeWidth="2" strokeDasharray="4 3" markerEnd="url(#hwm-arr-electric)" />

        {/* Side callout connecting the two predicted latents */}
        <path
          d="M 220 298 Q 394 330 568 298"
          fill="none"
          stroke="var(--electric)"
          strokeWidth="1"
          strokeDasharray="3 3"
          opacity="0.6"
        />
        <rect x="324" y="316" width="138" height="20" rx="4" fill="var(--surface)" stroke="var(--electric)" strokeDasharray="3 2" />
        <text x="393" y="330" textAnchor="middle" fontFamily="inherit" fontSize="9.5" fontWeight="600" fill="var(--electric)">
          subgoals from P
          <tspan baselineShift="super" fontSize="7">(2)</tspan>
          {" "}↦ target for P
          <tspan baselineShift="super" fontSize="7">(1)</tspan>
        </text>
      </svg>

      <div className="hwm-arch-notes">
        <div className="hwm-arch-note">
          <span className="hwm-arch-note-dot hwm-dot-electric" />
          <span>
            One <strong>shared encoder</strong> turns every image — current observation
            <em> and</em> final goal — into the same latent representation. Both world
            models live in this same space.
          </span>
        </div>
        <div className="hwm-arch-note">
          <span className="hwm-arch-note-dot hwm-dot-accent" />
          <span>
            The <strong>low-level world model</strong> P<sup>(1)</sup> predicts one frame
            ahead, conditioned on a primitive action. It&apos;s precise over short horizons
            but error accumulates after ~16 autoregressive steps.
          </span>
        </div>
        <div className="hwm-arch-note">
          <span className="hwm-arch-note-dot hwm-dot-accent" />
          <span>
            The <strong>high-level world model</strong> P<sup>(2)</sup> jumps directly to a
            latent many frames later, conditioned on a single <em>macro</em> action. It
            covers ground a flat planner can&apos;t in one shot.
          </span>
        </div>
        <div className="hwm-arch-note">
          <span className="hwm-arch-note-dot hwm-dot-electric" />
          <span>
            The <strong>action encoder</strong> A<sub>ψ</sub> compresses a chunk of primitive
            actions into one macro-action. This is what lets the high-level model abstract
            over <em>variable-length</em> sequences without picking a fixed stride.
          </span>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Planning Loop Walkthrough — 4-step stepper
// ─────────────────────────────────────────────────────────────────────────────

type LoopStep = {
  num: number;
  title: string;
  body: React.ReactNode;
  visual: React.ReactNode;
};

function LoopStepVisual1() {
  // Two observations being encoded to two latents
  return (
    <svg viewBox="0 0 480 220" className="hwm-loop-svg">
      <defs>
        <marker id="loop-a1" markerWidth="7" markerHeight="6" refX="6" refY="3" orient="auto">
          <polygon points="0 0, 7 3, 0 6" fill="var(--accent2)" />
        </marker>
      </defs>
      <rect x="20" y="40" width="100" height="60" rx="6" fill="var(--surface)" stroke="var(--border)" strokeWidth="1.5" />
      <text x="70" y="68" textAnchor="middle" fontSize="11" fontWeight="600" fill="var(--text-dim)">current</text>
      <text x="70" y="84" textAnchor="middle" fontFamily="Georgia, serif" fontStyle="italic" fontSize="12" fill="var(--text-dim)">s₁</text>

      <rect x="20" y="120" width="100" height="60" rx="6" fill="var(--surface)" stroke="var(--border)" strokeWidth="1.5" />
      <text x="70" y="148" textAnchor="middle" fontSize="11" fontWeight="600" fill="var(--text-dim)">goal</text>
      <text x="70" y="164" textAnchor="middle" fontFamily="Georgia, serif" fontStyle="italic" fontSize="12" fill="var(--text-dim)">s_g</text>

      <rect x="170" y="70" width="100" height="80" rx="6" fill="rgba(148,107,45,0.10)" stroke="var(--accent)" strokeWidth="1.5" />
      <text x="220" y="115" textAnchor="middle" fontSize="12" fontWeight="700" fill="var(--accent)">Encoder E</text>

      <line x1="120" y1="70" x2="170" y2="100" stroke="var(--accent2)" strokeWidth="2" markerEnd="url(#loop-a1)" />
      <line x1="120" y1="150" x2="170" y2="120" stroke="var(--accent2)" strokeWidth="2" markerEnd="url(#loop-a1)" />

      <circle cx="340" cy="80" r="22" fill="rgba(42,125,107,0.12)" stroke="var(--electric)" strokeWidth="2" />
      <text x="340" y="78" textAnchor="middle" fontFamily="Georgia, serif" fontStyle="italic" fontSize="16" fontWeight="700" fill="var(--electric)">z</text>
      <text x="350" y="88" fontSize="10" fill="var(--electric)">1</text>

      <circle cx="340" cy="160" r="22" fill="rgba(42,125,107,0.12)" stroke="var(--electric)" strokeWidth="2" />
      <text x="340" y="158" textAnchor="middle" fontFamily="Georgia, serif" fontStyle="italic" fontSize="16" fontWeight="700" fill="var(--electric)">z</text>
      <text x="350" y="168" fontSize="10" fill="var(--electric)">g</text>

      <line x1="270" y1="100" x2="318" y2="85" stroke="var(--accent2)" strokeWidth="2" markerEnd="url(#loop-a1)" />
      <line x1="270" y1="125" x2="318" y2="155" stroke="var(--accent2)" strokeWidth="2" markerEnd="url(#loop-a1)" />

      <text x="400" y="120" textAnchor="middle" fontSize="9.5" fill="var(--muted)" fontStyle="italic">latent space</text>
    </svg>
  );
}

function LoopStepVisual2() {
  // High-level rollout
  return (
    <svg viewBox="0 0 480 220" className="hwm-loop-svg">
      <defs>
        <marker id="loop-a2" markerWidth="7" markerHeight="6" refX="6" refY="3" orient="auto">
          <polygon points="0 0, 7 3, 0 6" fill="var(--accent2)" />
        </marker>
        <marker id="loop-a2e" markerWidth="7" markerHeight="6" refX="6" refY="3" orient="auto">
          <polygon points="0 0, 7 3, 0 6" fill="var(--electric)" />
        </marker>
      </defs>

      {[40, 145, 250, 355].map((cx, i) => (
        <g key={i}>
          <circle cx={cx} cy="110" r="20" fill="rgba(42,125,107,0.12)" stroke="var(--electric)" strokeWidth="1.5" />
          <text x={cx} y="108" textAnchor="middle" fontFamily="Georgia, serif" fontStyle="italic" fontSize="13" fontWeight="700" fill="var(--electric)">
            {i === 0 ? "z" : "z̃"}
          </text>
          <text x={cx + 10} y="118" fontSize="9" fill="var(--electric)">
            {i === 0 ? "1" : i + 1}
          </text>
        </g>
      ))}

      <circle cx="440" cy="110" r="22" fill="rgba(42,125,107,0.20)" stroke="var(--electric)" strokeWidth="2" strokeDasharray="3 2" />
      <text x="440" y="108" textAnchor="middle" fontFamily="Georgia, serif" fontStyle="italic" fontSize="14" fontWeight="700" fill="var(--electric)">z</text>
      <text x="450" y="118" fontSize="9" fill="var(--electric)">g</text>

      {[
        [60, 125],
        [165, 230],
        [270, 335],
        [375, 420],
      ].map(([x1, x2], i) => (
        <g key={i}>
          <line x1={x1} y1="110" x2={x2} y2="110" stroke="var(--accent2)" strokeWidth="2" markerEnd="url(#loop-a2)" />
          <text x={(x1 + x2) / 2} y="100" textAnchor="middle" fontSize="9.5" fontWeight="700" fill="var(--accent)">
            P
            <tspan baselineShift="super" fontSize="7">(2)</tspan>
          </text>
          <text x={(x1 + x2) / 2} y="130" textAnchor="middle" fontSize="9.5" fill="var(--electric)">
            l
            <tspan baselineShift="sub" fontSize="7">{i + 1}</tspan>
          </text>
        </g>
      ))}

      {/* Highlight first predicted latent as subgoal */}
      <circle cx="145" cy="110" r="28" fill="none" stroke="#A0382C" strokeWidth="2" strokeDasharray="4 3" />
      <text x="145" y="170" textAnchor="middle" fontSize="11" fontWeight="700" fill="#A0382C">subgoal z̃₁</text>

      <text x="240" y="50" textAnchor="middle" fontSize="11" fontWeight="600" fill="var(--text-dim)">
        High-level rollout (long jumps)
      </text>
      <text x="240" y="200" textAnchor="middle" fontSize="10" fill="var(--muted)" fontStyle="italic">
        optimise l₁:H so the final predicted latent matches z_g
      </text>
    </svg>
  );
}

function LoopStepVisual3() {
  // Low-level CEM toward subgoal
  return (
    <svg viewBox="0 0 480 220" className="hwm-loop-svg">
      <defs>
        <marker id="loop-a3" markerWidth="7" markerHeight="6" refX="6" refY="3" orient="auto">
          <polygon points="0 0, 7 3, 0 6" fill="var(--accent2)" />
        </marker>
      </defs>

      <circle cx="60" cy="110" r="22" fill="rgba(42,125,107,0.12)" stroke="var(--electric)" strokeWidth="2" />
      <text x="60" y="108" textAnchor="middle" fontFamily="Georgia, serif" fontStyle="italic" fontSize="14" fontWeight="700" fill="var(--electric)">z</text>
      <text x="70" y="118" fontSize="9" fill="var(--electric)">1</text>

      {/* primitive transitions */}
      {[110, 160, 210, 260, 310, 360].map((cx, i) => (
        <g key={i}>
          <circle cx={cx} cy="110" r="11" fill="rgba(42,125,107,0.08)" stroke="var(--electric)" strokeWidth="1" />
          <text x={cx} y="113" textAnchor="middle" fontSize="9" fill="var(--electric)">
            z
            <tspan baselineShift="sub" fontSize="6.5">{i + 2}</tspan>
          </text>
        </g>
      ))}

      {[80, 130, 180, 230, 280, 330, 380].map((cx, i) => (
        <g key={i}>
          <line x1={cx} y1="110" x2={cx + 18} y2="110" stroke="var(--accent2)" strokeWidth="1.5" markerEnd="url(#loop-a3)" />
          <text x={cx + 9} y="98" textAnchor="middle" fontSize="9" fill="var(--text-dim)">
            a
            <tspan baselineShift="sub" fontSize="7">{i + 1}</tspan>
          </text>
        </g>
      ))}

      {/* subgoal target */}
      <circle cx="420" cy="110" r="24" fill="rgba(170,60,50,0.10)" stroke="#A0382C" strokeWidth="2" strokeDasharray="4 3" />
      <text x="420" y="108" textAnchor="middle" fontSize="10" fontWeight="700" fill="#A0382C">z̃₁</text>
      <text x="420" y="148" textAnchor="middle" fontSize="9.5" fill="#A0382C">subgoal</text>

      <text x="240" y="50" textAnchor="middle" fontSize="11" fontWeight="600" fill="var(--text-dim)">
        Low-level rollout (small steps)
      </text>
      <text x="240" y="200" textAnchor="middle" fontSize="10" fill="var(--muted)" fontStyle="italic">
        optimise primitive actions a₁:h to minimise ‖z̃₁ − P⁽¹⁾(a₁:h; z₁)‖
      </text>
    </svg>
  );
}

function LoopStepVisual4() {
  // Execute first action, observe, re-plan
  return (
    <svg viewBox="0 0 480 220" className="hwm-loop-svg">
      <defs>
        <marker id="loop-a4" markerWidth="7" markerHeight="6" refX="6" refY="3" orient="auto">
          <polygon points="0 0, 7 3, 0 6" fill="var(--accent2)" />
        </marker>
      </defs>

      <circle cx="80" cy="110" r="22" fill="rgba(42,125,107,0.12)" stroke="var(--electric)" strokeWidth="2" />
      <text x="80" y="108" textAnchor="middle" fontFamily="Georgia, serif" fontStyle="italic" fontSize="14" fontWeight="700" fill="var(--electric)">z</text>
      <text x="90" y="118" fontSize="9" fill="var(--electric)">1</text>

      <line x1="105" y1="110" x2="160" y2="110" stroke="#1F6E5C" strokeWidth="3" markerEnd="url(#loop-a4)" />
      <text x="132" y="100" textAnchor="middle" fontSize="11" fontWeight="700" fill="#1F6E5C">
        a
        <tspan baselineShift="sub" fontSize="8">1</tspan>
        *
      </text>
      <text x="132" y="132" textAnchor="middle" fontSize="9" fill="var(--muted)">execute</text>

      <circle cx="190" cy="110" r="22" fill="rgba(42,125,107,0.12)" stroke="var(--electric)" strokeWidth="2" />
      <text x="190" y="108" textAnchor="middle" fontFamily="Georgia, serif" fontStyle="italic" fontSize="14" fontWeight="700" fill="var(--electric)">z</text>
      <text x="200" y="118" fontSize="9" fill="var(--electric)">2</text>

      <path
        d="M 215 110 Q 280 50 350 90"
        fill="none"
        stroke="var(--accent2)"
        strokeWidth="2"
        strokeDasharray="4 3"
        markerEnd="url(#loop-a4)"
      />
      <text x="285" y="60" textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--accent)">
        re-plan
      </text>

      <rect x="350" y="74" width="110" height="80" rx="8" fill="rgba(42,125,107,0.06)" stroke="var(--electric)" strokeWidth="1" strokeDasharray="3 2" />
      <text x="405" y="100" textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--electric)">back to step 2</text>
      <text x="405" y="118" textAnchor="middle" fontSize="9.5" fill="var(--text-dim)">new high-level plan</text>
      <text x="405" y="132" textAnchor="middle" fontSize="9.5" fill="var(--text-dim)">new subgoal</text>
      <text x="405" y="146" textAnchor="middle" fontSize="9.5" fill="var(--text-dim)">new low-level plan</text>

      <text x="240" y="200" textAnchor="middle" fontSize="10" fill="var(--muted)" fontStyle="italic">
        every step is a fresh plan — classic receding-horizon MPC
      </text>
    </svg>
  );
}

function PlanningLoopWalkthrough() {
  const [step, setStep] = useState(0);

  const steps: LoopStep[] = [
    {
      num: 1,
      title: "Encode the situation",
      body: (
        <>
          <p>
            The agent receives two images: the <strong>current observation s₁</strong> and the{" "}
            <strong>final goal s_g</strong>. The shared encoder turns both into latent
            vectors — <code>z₁</code> and <code>z_g</code> — that live in the same space.
          </p>
          <p>
            From here on, <em>everything is a latent</em>. The model never reasons about pixels
            again — too expensive, too noisy.
          </p>
        </>
      ),
      visual: <LoopStepVisual1 />,
    },
    {
      num: 2,
      title: "High-level plan: sketch a coarse path",
      body: (
        <>
          <p>
            The high-level world model rolls a candidate sequence of macro-actions{" "}
            <code>l₁…l_H</code> forward, autoregressively, and the planner searches
            (via CEM) for the sequence whose final latent lands closest to <code>z_g</code>.
          </p>
          <p>
            The trick: the <strong>first predicted latent</strong> along this winning sequence,{" "}
            <code>z̃₁</code>, becomes the next <em>subgoal</em>. It&apos;s reachable, it&apos;s on
            the way to the goal, and crucially — it&apos;s already a valid latent state.
          </p>
        </>
      ),
      visual: <LoopStepVisual2 />,
    },
    {
      num: 3,
      title: "Low-level plan: chase the subgoal",
      body: (
        <>
          <p>
            Now the low-level world model takes over. It optimises a short sequence of{" "}
            <strong>primitive actions</strong> <code>a₁…a_h</code> whose predicted endpoint
            matches the subgoal <code>z̃₁</code>.
          </p>
          <p>
            Because both world models share the same latent space, the subgoal needs no
            translation, no inverse model, no goal-conditioned policy — it&apos;s already speaking
            the right language.
          </p>
        </>
      ),
      visual: <LoopStepVisual3 />,
    },
    {
      num: 4,
      title: "Execute one action, re-plan from scratch",
      body: (
        <>
          <p>
            The agent executes only the <strong>first</strong> action of the low-level plan,
            takes a new observation, and the entire two-level planning process starts again
            from the new state.
          </p>
          <p>
            This is classic <em>receding-horizon MPC</em> — the plan is just a hypothesis
            about the immediate future, refreshed every step. Errors don&apos;t compound because
            stale predictions never get acted on.
          </p>
        </>
      ),
      visual: <LoopStepVisual4 />,
    },
  ];

  const s = steps[step];

  return (
    <div className="hwm-loop-wrap">
      <div className="hwm-loop-stepper">
        {steps.map((st, i) => (
          <button
            key={i}
            type="button"
            className={`hwm-loop-step-btn ${i === step ? "hwm-loop-step-active" : ""} ${i < step ? "hwm-loop-step-done" : ""}`}
            onClick={() => setStep(i)}
            aria-current={i === step ? "step" : undefined}
          >
            <span className="hwm-loop-step-num">{st.num}</span>
            <span className="hwm-loop-step-label">{st.title}</span>
          </button>
        ))}
      </div>

      <div className="hwm-loop-body">
        <div className="hwm-loop-visual">{s.visual}</div>
        <div className="hwm-loop-text">
          <div className="hwm-loop-text-num">Step {s.num} of {steps.length}</div>
          <h3>{s.title}</h3>
          {s.body}
        </div>
      </div>

      <div className="hwm-loop-controls">
        <button
          type="button"
          className="hwm-demo-btn"
          onClick={() => setStep((p) => Math.max(0, p - 1))}
          disabled={step === 0}
        >
          ← Previous
        </button>
        <button
          type="button"
          className="hwm-demo-btn"
          onClick={() => setStep((p) => Math.min(steps.length - 1, p + 1))}
          disabled={step === steps.length - 1}
        >
          Next →
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Macro-Action Demo — delta-pose vs learned latent action
// ─────────────────────────────────────────────────────────────────────────────

function MacroActionDemo() {
  const [mode, setMode] = useState<"delta" | "latent">("latent");

  // 16 primitive actions — a synthetic "non-greedy" trajectory: down, down, grasp, lift, lift, right, right, right, right, right, right, right, right, right, place, idle
  const primitiveActions = [
    "↓", "↓", "↓", "⤓", "↑", "↑", "→", "→", "→", "→", "→", "→", "→", "↓", "⤒", "•",
  ];

  return (
    <div className="hwm-macro-wrap">
      <div className="hwm-macro-toggle">
        <button
          type="button"
          className={`hwm-macro-mode-btn ${mode === "delta" ? "hwm-macro-mode-active" : ""}`}
          onClick={() => setMode("delta")}
        >
          ① Delta-pose only
        </button>
        <button
          type="button"
          className={`hwm-macro-mode-btn ${mode === "latent" ? "hwm-macro-mode-active" : ""}`}
          onClick={() => setMode("latent")}
        >
          ② Learned latent action
        </button>
      </div>

      <div className="hwm-macro-stage">
        <div className="hwm-macro-input">
          <div className="hwm-macro-input-label">16 primitive actions a₁ … a₁₆</div>
          <div className="hwm-macro-input-grid">
            {primitiveActions.map((sym, i) => (
              <span key={i} className="hwm-macro-prim">
                <span className="hwm-macro-prim-arrow">{sym}</span>
                <span className="hwm-macro-prim-i">a<sub>{i + 1}</sub></span>
              </span>
            ))}
          </div>
        </div>

        <div className="hwm-macro-arrow">
          <div className="hwm-macro-encoder">
            {mode === "delta" ? "Δ-pose" : "Action Encoder Aψ"}
          </div>
          <span className="hwm-macro-arrow-line">→</span>
        </div>

        <div className="hwm-macro-output">
          <div className="hwm-macro-output-label">Macro-action l_t</div>
          {mode === "delta" ? (
            <div className="hwm-macro-delta-vec">
              <div className="hwm-macro-delta-row">
                <span>Δx</span>
                <span>+0.42</span>
              </div>
              <div className="hwm-macro-delta-row">
                <span>Δy</span>
                <span>−0.03</span>
              </div>
              <div className="hwm-macro-delta-row">
                <span>Δz</span>
                <span>+0.00</span>
              </div>
              <p className="hwm-macro-output-caption">
                Just the net end-effector displacement. The grasp, the lift, the carry —
                <strong> all collapsed to one vector.</strong>
              </p>
            </div>
          ) : (
            <div className="hwm-macro-latent-vec">
              {[0.71, -0.32, 0.18, -0.55].map((v, i) => (
                <div key={i} className="hwm-macro-latent-row">
                  <span>l<sub>{i + 1}</sub></span>
                  <div className="hwm-macro-bar-track">
                    <div
                      className={`hwm-macro-bar ${v < 0 ? "hwm-macro-bar-neg" : ""}`}
                      style={{ width: `${Math.abs(v) * 100}%` }}
                    />
                  </div>
                  <span className="hwm-macro-latent-val">{v.toFixed(2)}</span>
                </div>
              ))}
              <p className="hwm-macro-output-caption">
                A learned 4-dim latent that captures the <em>structure</em> of the whole
                sequence — including the non-greedy moves a delta-pose would erase.
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="hwm-macro-metrics">
        <div className="hwm-macro-metric-title">Alignment to expert behaviour (paper, Table 4)</div>
        <table className="hwm-macro-table">
          <thead>
            <tr>
              <th>High-level action</th>
              <th>Cosine similarity ↑</th>
              <th>L₁ distance ↓</th>
            </tr>
          </thead>
          <tbody>
            <tr className={mode === "delta" ? "hwm-macro-row-active" : ""}>
              <td>Delta-pose only</td>
              <td>0.80 ± 0.02</td>
              <td>0.088 ± 0.005</td>
            </tr>
            <tr className={mode === "latent" ? "hwm-macro-row-active" : ""}>
              <td>Learned latent action</td>
              <td><strong>0.88 ± 0.03</strong></td>
              <td><strong>0.080 ± 0.002</strong></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Results Cards
// ─────────────────────────────────────────────────────────────────────────────

type ResultCardData = {
  backbone: string;
  domain: string;
  flat: number;
  hwm: number;
  caption: string;
  note: string;
};

function ResultsCards() {
  const cards: ResultCardData[] = [
    {
      backbone: "VJEPA2-AC",
      domain: "Franka Pick & Place (cup, no oracle subgoals)",
      flat: 0,
      hwm: 70,
      caption: "From a single goal image, on a real 7-DoF arm. The flat planner can't solve this without manually provided intermediate subgoals.",
      note: "also beats π₀.₅-DROID (68%) trained on ~77× more robot data",
    },
    {
      backbone: "DINO-WM",
      domain: "Push-T, 75-step horizon",
      flat: 17,
      hwm: 61,
      caption: "Fine-grained manipulation across a long horizon. Flat planners collapse as the horizon grows; HWM stays robust.",
      note: "DINO-WM baseline at the original 25-step horizon: 84% → 89% with HWM",
    },
    {
      backbone: "PLDM",
      domain: "Diverse Maze, unseen 10×10 layouts, hard (D∈[13,16])",
      flat: 44,
      hwm: 83,
      caption: "Out-of-distribution navigation. HWM more than doubles success on hard, unseen layouts — and is 4× cheaper at planning time.",
      note: "outperforms goal-conditioned and zero-shot RL baselines (HIQL, HILP)",
    },
  ];

  return (
    <div className="hwm-results-grid">
      {cards.map((c) => (
        <div key={c.backbone} className="hwm-result-card">
          <div className="hwm-result-tag">{c.backbone}</div>
          <h3 className="hwm-result-domain">{c.domain}</h3>

          <div className="hwm-result-bar-row">
            <span className="hwm-result-bar-label hwm-result-bar-label-flat">Flat planner</span>
            <div className="hwm-result-bar-track">
              <div
                className="hwm-result-bar hwm-result-bar-flat"
                style={{ width: `${Math.max(c.flat, 2)}%` }}
              />
            </div>
            <span className="hwm-result-bar-val">{c.flat}%</span>
          </div>

          <div className="hwm-result-bar-row">
            <span className="hwm-result-bar-label hwm-result-bar-label-hier">HWM</span>
            <div className="hwm-result-bar-track">
              <div
                className="hwm-result-bar hwm-result-bar-hier"
                style={{ width: `${c.hwm}%` }}
              />
            </div>
            <span className="hwm-result-bar-val">{c.hwm}%</span>
          </div>

          <div className="hwm-result-delta">+{c.hwm - c.flat} pts</div>

          <p className="hwm-result-caption">{c.caption}</p>
          <p className="hwm-result-note">{c.note}</p>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Compute–Performance Trade-off Chart
// ─────────────────────────────────────────────────────────────────────────────

function TradeoffChart({
  title,
  flatPts,
  hierPts,
  xMax,
  xLabel,
  yLabel,
}: {
  title: string;
  flatPts: { x: number; y: number }[];
  hierPts: { x: number; y: number }[];
  xMax: number;
  xLabel: string;
  yLabel: string;
}) {
  const W = 400;
  const H = 220;
  const PAD_L = 40;
  const PAD_R = 16;
  const PAD_T = 28;
  const PAD_B = 38;
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;

  const sx = (x: number) => PAD_L + (x / xMax) * plotW;
  const sy = (y: number) => PAD_T + (1 - y) * plotH;

  const pathOf = (pts: { x: number; y: number }[]) =>
    pts
      .map((p, i) => `${i === 0 ? "M" : "L"} ${sx(p.x).toFixed(1)} ${sy(p.y).toFixed(1)}`)
      .join(" ");

  return (
    <div className="hwm-chart-card">
      <div className="hwm-chart-title">{title}</div>
      <svg viewBox={`0 0 ${W} ${H}`} className="hwm-chart-svg">
        {/* axes */}
        <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={H - PAD_B} stroke="var(--border)" strokeWidth="1" />
        <line x1={PAD_L} y1={H - PAD_B} x2={W - PAD_R} y2={H - PAD_B} stroke="var(--border)" strokeWidth="1" />

        {/* y-axis ticks */}
        {[0, 0.25, 0.5, 0.75, 1].map((v) => (
          <g key={v}>
            <line x1={PAD_L - 4} y1={sy(v)} x2={PAD_L} y2={sy(v)} stroke="var(--border)" />
            <text x={PAD_L - 7} y={sy(v) + 3} textAnchor="end" fontSize="9" fill="var(--muted)">
              {(v * 100).toFixed(0)}%
            </text>
            <line x1={PAD_L} y1={sy(v)} x2={W - PAD_R} y2={sy(v)} stroke="var(--border)" strokeDasharray="2 3" opacity="0.4" />
          </g>
        ))}

        {/* x-axis ticks */}
        {[0, 0.5, 1].map((f) => {
          const x = f * xMax;
          return (
            <g key={f}>
              <line x1={sx(x)} y1={H - PAD_B} x2={sx(x)} y2={H - PAD_B + 4} stroke="var(--border)" />
              <text x={sx(x)} y={H - PAD_B + 14} textAnchor="middle" fontSize="9" fill="var(--muted)">
                {x.toFixed(0)}
              </text>
            </g>
          );
        })}

        {/* flat planner curve */}
        <path d={pathOf(flatPts)} fill="none" stroke="#A0382C" strokeWidth="2" />
        {flatPts.map((p, i) => (
          <circle key={i} cx={sx(p.x)} cy={sy(p.y)} r="3" fill="#A0382C" />
        ))}

        {/* HWM curve */}
        <path d={pathOf(hierPts)} fill="none" stroke="#1F6E5C" strokeWidth="2.5" />
        {hierPts.map((p, i) => (
          <circle key={i} cx={sx(p.x)} cy={sy(p.y)} r="3.5" fill="#1F6E5C" />
        ))}

        {/* axis labels */}
        <text x={W / 2} y={H - 4} textAnchor="middle" fontSize="10" fill="var(--text-dim)">
          {xLabel}
        </text>
        <text
          x={-H / 2}
          y={12}
          textAnchor="middle"
          fontSize="10"
          fill="var(--text-dim)"
          transform="rotate(-90)"
        >
          {yLabel}
        </text>
      </svg>
    </div>
  );
}

function ComputeTradeoff() {
  // Approximate digitised values from paper Fig. 5
  const pushtFlat = [
    { x: 60, y: 0.35 },
    { x: 110, y: 0.45 },
    { x: 180, y: 0.55 },
    { x: 250, y: 0.6 },
    { x: 320, y: 0.62 },
  ];
  const pushtHier = [
    { x: 50, y: 0.62 },
    { x: 95, y: 0.72 },
    { x: 150, y: 0.76 },
    { x: 220, y: 0.78 },
  ];
  const mazeFlat = [
    { x: 90, y: 0.3 },
    { x: 180, y: 0.5 },
    { x: 340, y: 0.7 },
    { x: 480, y: 0.78 },
    { x: 600, y: 0.85 },
  ];
  const mazeHier = [
    { x: 70, y: 0.55 },
    { x: 130, y: 0.75 },
    { x: 200, y: 0.85 },
    { x: 280, y: 0.9 },
  ];

  return (
    <div className="hwm-tradeoff-wrap">
      <div className="hwm-tradeoff-legend">
        <span className="hwm-tradeoff-legend-item">
          <span className="hwm-tradeoff-swatch hwm-tradeoff-swatch-flat" />
          Flat planner
        </span>
        <span className="hwm-tradeoff-legend-item">
          <span className="hwm-tradeoff-swatch hwm-tradeoff-swatch-hier" />
          HWM (hierarchical)
        </span>
      </div>
      <div className="hwm-tradeoff-grid">
        <TradeoffChart
          title="Push-T (d = 50)"
          flatPts={pushtFlat}
          hierPts={pushtHier}
          xMax={340}
          xLabel="Planning time (ms)"
          yLabel="Success rate"
        />
        <TradeoffChart
          title="Diverse Maze (D ∈ [9, 12])"
          flatPts={mazeFlat}
          hierPts={mazeHier}
          xMax={620}
          xLabel="Planning time (ms)"
          yLabel="Success rate"
        />
      </div>
      <p className="hwm-tradeoff-caption">
        Up-and-to-the-left is better. The HWM curve sits above and to the left of the flat
        planner on every operating point — same or better success, in <strong>3–4× less compute</strong>.
        At the flat planner&apos;s peak budget, HWM does its job in roughly a third of the time.
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function LeHWMClient() {
  return (
    <div className="lewm-page hwm-page">
      {/* ── Hero ── */}
      <div className="lewm-hero">
        <div className="lewm-hero-inner">
          <div className="lewm-hero-text">
            <span className="lewm-badge">Research · April 2026</span>
            <h1 className="lewm-title">Hierarchical Planning with Latent World Models</h1>
            <p className="lewm-subtitle">
              Stack two world models at different time-scales — and a robot that
              couldn&apos;t pick up a cup from a single goal image (<strong>0%</strong>) now
              succeeds <strong>70%</strong> of the time. No new training data. No new policy.
              Just a smarter way to <em>plan</em>.
            </p>
            <p className="lewm-authors">
              Wancong Zhang &nbsp;·&nbsp; Basile Terver &nbsp;·&nbsp; Artem Zholus
              &nbsp;·&nbsp; Soham Chitnis &nbsp;·&nbsp; Harsh Sutaria &nbsp;·&nbsp; Mido Assran
              &nbsp;·&nbsp; Randall Balestriero &nbsp;·&nbsp; Amir Bar &nbsp;·&nbsp; Adrien Bardes
              &nbsp;·&nbsp; <strong>Yann LeCun</strong> &nbsp;·&nbsp; Nicolas Ballas
            </p>
            <p className="lewm-affil">FAIR at Meta · NYU · Mila · Brown</p>
            <div className="lewm-hero-links">
              <a
                href="https://arxiv.org/abs/2604.03208"
                target="_blank"
                rel="noopener noreferrer"
                className="lewm-btn lewm-btn-primary"
              >
                arXiv Paper
              </a>
              <a
                href="https://github.com/kevinghst/HWM_PLDM"
                target="_blank"
                rel="noopener noreferrer"
                className="lewm-btn lewm-btn-secondary"
              >
                GitHub
              </a>
              <a
                href="https://kevinghst.github.io/HWM/"
                target="_blank"
                rel="noopener noreferrer"
                className="lewm-btn lewm-btn-secondary"
              >
                Project Page
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* ── Stats strip ── */}
      <div className="lewm-stats-strip">
        <div className="lewm-stats-inner">
          <div className="lewm-stat">
            <span className="lewm-stat-value">0 → 70%</span>
            <span className="lewm-stat-label">real-robot pick &amp; place</span>
            <span className="lewm-stat-vs">Franka arm, single goal image</span>
          </div>
          <div className="lewm-stat-divider" />
          <div className="lewm-stat">
            <span className="lewm-stat-value">17 → 61%</span>
            <span className="lewm-stat-label">long-horizon Push-T</span>
            <span className="lewm-stat-vs">75-step horizon, DINO-WM backbone</span>
          </div>
          <div className="lewm-stat-divider" />
          <div className="lewm-stat">
            <span className="lewm-stat-value">44 → 83%</span>
            <span className="lewm-stat-label">unseen-maze navigation</span>
            <span className="lewm-stat-vs">PLDM backbone, OOD layouts</span>
          </div>
          <div className="lewm-stat-divider" />
          <div className="lewm-stat">
            <span className="lewm-stat-value">3–4×</span>
            <span className="lewm-stat-label">less planning compute</span>
            <span className="lewm-stat-vs">vs. single-level planner</span>
          </div>
        </div>
      </div>

      <div className="lewm-body">
        {/* ── Plain-English Intro ── */}
        <section className="lewm-section">
          <div className="lewm-plain-english">
            <p className="lewm-plain-english-label">In Plain English</p>
            <p>
              A modern world-model robot &ldquo;sees&rdquo; the world and the goal, imagines a few hundred
              short action sequences, and picks the one that ends up closest to the goal.
              On simple tasks — push a thing forward, slide a drawer in a straight line —
              this works. On anything that requires <em>going the long way around</em>, it
              collapses. Pick-and-place is the cleanest example: to put a cup somewhere new,
              the gripper has to first move <strong>down to the cup</strong> — which, in the
              moment, looks like moving <em>away</em> from the goal.
            </p>
            <p>
              The paper&apos;s fix is almost embarrassingly clean. Train <strong>two</strong> latent
              world models on the same data — one that reasons step-by-step (low level), one that
              reasons in big abstract leaps (high level). Have them share the same internal
              language. Then, at inference time, let the high-level model sketch out a coarse plan
              and hand off intermediate &ldquo;subgoals&rdquo; for the low-level model to chase.
            </p>
            <p>
              No new training data. No new policy network. No reward function. It&apos;s a planning
              trick that bolts onto existing world models like V-JEPA 2, DINO-WM, and PLDM —
              and it beats vision-language-action models trained on <strong>77× more</strong>{" "}
              robot data.
            </p>
          </div>
        </section>

        {/* ── The Non-Greedy Problem ── */}
        <section className="lewm-section">
          <div className="lewm-section-header">
            <h2>The Non-Greedy Problem</h2>
            <p>
              Why a single-level planner can&apos;t pick up a cup from a single goal image — and
              what changes when you give it a hierarchy. Both panels show the same task and the
              same world model. Only the <em>planning</em> differs.
            </p>
          </div>
          <NonGreedyDemo />
          <div className="lewm-plain-english">
            <p className="lewm-plain-english-label">What you&apos;re seeing</p>
            <p>
              <strong>Left.</strong> The flat planner has one objective in its head: the goal
              state (cup at the target zone). Every candidate action sequence it samples is
              scored on how close the predicted final state lands to that goal. The straight-line
              moves get the best scores. The arm drifts to the target zone and hovers. The cup,
              which the arm never went near, is exactly where it started. Failure.
            </p>
            <p>
              <strong>Right.</strong> The hierarchical planner first asks a different question:
              &ldquo;what&apos;s a reasonable <em>intermediate</em> state on the way to the goal?&rdquo;
              Its high-level world model proposes a handful of candidate subgoals and the
              best one — &ldquo;gripper hovering over the cup&rdquo; — gets handed to the low-level
              planner as its new target. The low-level planner doesn&apos;t know or care about
              the eventual goal; it just gets to the subgoal. Once it arrives, the high level
              re-plans, this time toward the target zone with the cup attached.
            </p>
            <p>
              That&apos;s the whole idea. The same world model, the same actions, the same scene —
              but the planning is structured to make &ldquo;detours&rdquo; cheap and natural rather than
              impossible.
            </p>
          </div>
        </section>

        {/* ── Architecture: Two World Models, One Latent Space ── */}
        <section className="lewm-section">
          <div className="lewm-section-header">
            <h2>Two World Models, One Latent Space</h2>
            <p>
              HWM&apos;s structural trick: train two world models that operate at different
              time-scales but share the same encoder — and therefore the same latent
              vocabulary. Anything one model predicts is something the other model can act on.
            </p>
          </div>
          <ArchitectureDiagram />
          <div className="lewm-plain-english">
            <p className="lewm-plain-english-label">Why this is the whole game</p>
            <p>
              Hierarchical control isn&apos;t new — robotics has tried for decades to stack a
              &ldquo;manager&rdquo; on top of a &ldquo;worker.&rdquo; The classical problem is
              the handoff: the manager speaks in goals (&ldquo;move to the kitchen&rdquo;), the
              worker speaks in actions (&ldquo;rotate joint 3 by 0.04 rad&rdquo;), and you
              need a glue layer — an inverse model, a skill library, a goal-conditioned policy
              — to translate between them.
            </p>
            <p>
              HWM eliminates the glue. Both world models map into the same latent space, so a
              subgoal predicted by the high-level model is, <em>by construction</em>, a valid
              target for the low-level model. There&apos;s no translation step that can go
              wrong. The shared encoder is the entire interface.
            </p>
          </div>
        </section>

        {/* ── The Planning Loop ── */}
        <section className="lewm-section">
          <div className="lewm-section-header">
            <h2>The Planning Loop</h2>
            <p>
              What the agent actually does at every step. Step through the four stages of the
              hierarchical MPC loop.
            </p>
          </div>
          <PlanningLoopWalkthrough />
          <div className="lewm-plain-english">
            <p className="lewm-plain-english-label">In Plain English</p>
            <p>
              The whole loop runs <em>once per primitive action</em>. The agent doesn&apos;t commit
              to a long plan and march through it; it plans every step, executes one action, and
              re-plans. That&apos;s why error doesn&apos;t compound — a wrong prediction at step
              5 of a 16-step plan never gets a chance to matter, because the plan gets thrown out
              and rebuilt at step 1.
            </p>
            <p>
              The cost of all this planning is real, but the math works out. The high-level model
              covers ground in big leaps (so fewer total prediction steps), and the low-level model
              only has to handle short, easy stretches between subgoals — which it&apos;s good at.
              Total compute: <strong>3–4× less</strong> than the flat planner trying to brute-force
              a long horizon directly.
            </p>
          </div>
        </section>

        {/* ── Macro-Actions ── */}
        <section className="lewm-section">
          <div className="lewm-section-header">
            <h2>Macro-Actions: Compressing Time</h2>
            <p>
              How does the high-level model represent a multi-step move as a single action? The
              naïve answer — just store the net displacement — throws away too much. The paper
              learns a richer alternative.
            </p>
          </div>
          <MacroActionDemo />
          <div className="lewm-plain-english">
            <p className="lewm-plain-english-label">In Plain English</p>
            <p>
              Imagine summarising the move &ldquo;walk to the fridge, open it, grab milk, close
              it, walk back&rdquo; as a single tag. The simple summary — &ldquo;I ended up where I
              started&rdquo; — is technically true but useless: it erases the entire reason for
              the trip. That&apos;s what the delta-pose representation does to a pick-and-place
              sequence.
            </p>
            <p>
              The learned latent action is a richer summary — four numbers that compress the{" "}
              <em>shape</em> of the whole sequence, not just its endpoints. Empirically it
              produces high-level plans that align <strong>10% better</strong> with expert human
              behaviour on the same task.
            </p>
          </div>
        </section>

        {/* ── Results Across Three World Models ── */}
        <section className="lewm-section">
          <div className="lewm-section-header">
            <h2>Plug-and-Play: Results Across Three World Models</h2>
            <p>
              HWM is a planning <em>abstraction</em>, not an architecture. It bolts on top of
              existing latent world models without retraining them. Same backbones, same data —
              just a smarter planner.
            </p>
          </div>
          <ResultsCards />
          <div className="lewm-plain-english">
            <p className="lewm-plain-english-label">Why this generalises</p>
            <p>
              VJEPA2-AC, DINO-WM, and PLDM are three different latent world models built by
              different teams for different domains. The fact that HWM lifts results on all
              three — by 39–70 percentage points — is the evidence that this isn&apos;t a
              dataset-specific trick. It&apos;s a property of <em>how to plan</em>, not what to
              plan with.
            </p>
            <p>
              The pick-and-place result deserves a moment. It&apos;s a real robot, not a simulator.
              The goal is a single photograph of the desired final configuration. The agent has
              never seen this exact object-target pair before. <strong>It still solves the task
              70% of the time</strong> — and it beats two state-of-the-art vision-language-action
              models that were trained on roughly <strong>77 times more robotic interaction
              data</strong>.
            </p>
          </div>
        </section>

        {/* ── Compute–Performance Trade-off ── */}
        <section className="lewm-section">
          <div className="lewm-section-header">
            <h2>The Compute–Performance Trade-off</h2>
            <p>
              The hierarchical planner doesn&apos;t just succeed more often — it succeeds with
              less compute per planning step. Higher and to the left is better.
            </p>
          </div>
          <ComputeTradeoff />
          <div className="lewm-plain-english">
            <p className="lewm-plain-english-label">Why this matters in deployment</p>
            <p>
              A planning algorithm that&apos;s 30% more accurate but takes 10× longer per step
              isn&apos;t useful in a real robot — by the time the plan is ready, the world has
              moved on. HWM moves in the opposite direction: better <em>and</em> faster. That&apos;s
              what makes it a deployable abstraction rather than a research curiosity.
            </p>
          </div>
        </section>

        {/* ── The Big Picture ── */}
        <section className="lewm-section">
          <div className="lewm-section-header">
            <h2>The Big Picture</h2>
          </div>
          <div className="lewm-big-picture">
            <p>
              HWM is, structurally, a small idea: train a second world model at a longer
              time-scale, share the latent space, plan over both. But the consequences are
              outsized — because the failure mode it fixes (non-greedy tasks) is the failure mode
              that has kept latent-world-model robots from doing useful, long-horizon
              manipulation in the real world.
            </p>
            <p>
              Crucially, HWM is a <strong>planning-time</strong> intervention. It needs no new
              training data, no reward function, no task-specific fine-tuning, no policy
              network. The underlying world models — V-JEPA 2, DINO-WM, PLDM — are unchanged.
              That makes it the kind of result that other labs can adopt next week, on whatever
              latent world model they&apos;ve already built.
            </p>
            <p>
              The headline benchmark — beating vision-language-action models trained on{" "}
              <strong>77× more robotic data</strong> — is the empirical receipt for a deeper
              claim: that the bottleneck in modern robotics isn&apos;t the amount of data
              you&apos;ve scraped from the internet, but the structure of how a model uses what
              it already knows.
            </p>
          </div>
          <div className="lewm-vjepa-callout">
            <h4>Where HWM Fits in AMI&apos;s Stack</h4>
            <p>
              Read alongside the lab&apos;s other recent work, a pattern emerges.{" "}
              <strong>LeWorldModel</strong> showed how to train a latent world model cleanly
              from raw pixels — strip the engineering down to two losses.{" "}
              <strong>V-JEPA 2.1</strong> showed how to scale latent representations to dense,
              feature-rich video. <strong>HWM</strong> shows how to plan with whatever latent
              world model you have, on whatever task you point it at — without retraining
              anything.
            </p>
            <p>
              Three independent threads, one direction of travel: world models become the
              substrate, planning becomes the lever. The future isn&apos;t a single monolithic
              foundation model. It&apos;s a stack of composable pieces that any team can mix and
              extend.
            </p>
          </div>
        </section>

        {/* ── Citation ── */}
        <section className="lewm-section lewm-citation-section">
          <h2>Citation</h2>
          <pre className="lewm-citation-block">{`@article{zhang2026hwm,
  title   = {Hierarchical Planning with Latent World Models},
  author  = {Zhang, Wancong and Terver, Basile and Zholus, Artem
             and Chitnis, Soham and Sutaria, Harsh and Assran, Mido
             and Balestriero, Randall and Bar, Amir and Bardes, Adrien
             and LeCun, Yann and Ballas, Nicolas},
  journal = {arXiv:2604.03208},
  year    = {2026}
}`}</pre>
        </section>

      </div>
    </div>
  );
}
