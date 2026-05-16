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

        {/* ── Coming Soon ── */}
        <section className="lewm-section">
          <div className="lewm-section-header">
            <h2>More sections in progress</h2>
            <p>
              The remaining sections — architecture diagram (two world models, one latent
              space), the macro-action encoder, real-robot rollout replays, Push-T and maze
              results, and a &ldquo;big picture&rdquo; on why this is a plug-in for any latent
              world model — are designed and queued. The proposal above the page outlines them.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
