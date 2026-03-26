#!/usr/bin/env python3
"""
capture_pusht_rollout.py

Run the pre-trained LeWM PushT model for one episode and export a compact JSON
snapshot used by the interactive rollout viewer at /research/le-wm.

Output (public/pusht_rollout.json):
  - Per-step agent + block positions, latent embedding (UMAP → 2D), thumbnail
  - Per-step CEM candidate trajectories (50 representative paths + costs)

─── Setup ────────────────────────────────────────────────────────────────────

  # 1. Clone the le-wm repo and install its dependencies
  git clone https://github.com/lucas-maes/le-wm.git
  cd le-wm
  uv venv --python=3.10
  source .venv/bin/activate
  uv pip install stable-worldmodel[train,env]
  pip install umap-learn Pillow          # additional deps for this script

  # 2. Download the PushT checkpoint from Google Drive
  #    https://drive.google.com/drive/folders/1r31os0d4-rR0mdHc7OlY_e5nh3XT4r4e
  #    File name: pusht  (the script appends _object.ckpt automatically)

  # 3. Copy this script into the le-wm directory and run it
  #    --checkpoint is the path relative to $STABLEWM_HOME, WITHOUT _object.ckpt
  cp path/to/AMI-Labs/scripts/capture_pusht_rollout.py .
  python capture_pusht_rollout.py --checkpoint pusht/lejepa

  # 4. Move the output into the AMI-Labs public folder
  cp pusht_rollout.json path/to/AMI-Labs/public/pusht_rollout.json

─── Tuning ───────────────────────────────────────────────────────────────────

  --max-steps 80          Episode length cap (PushT episodes can run long)
  --n-traj-display 50     How many CEM trajectories to store per step
                          (10 elites always included; rest sampled randomly)
  --thumbnail-size 80     JPEG thumbnail size in px (trade-off: size vs quality)
  --seed 42               Environment reset seed for reproducibility

"""

import argparse
import base64
import io
import json
import sys
from pathlib import Path

import numpy as np
import torch


# ──────────────────────────────────────────────────────────────────────────────
# Argument parsing
# ──────────────────────────────────────────────────────────────────────────────

def parse_args():
    p = argparse.ArgumentParser(description="Capture LeWM PushT rollout data for visualisation")
    p.add_argument("--checkpoint", required=True,
                   help="Path relative to $STABLEWM_HOME, without _object.ckpt suffix (e.g. pusht/lejepa)")
    p.add_argument("--output", default="pusht_rollout.json",
                   help="Output JSON path (default: pusht_rollout.json)")
    p.add_argument("--max-steps", type=int, default=80,
                   help="Max episode steps to capture (default: 80)")
    p.add_argument("--n-traj-display", type=int, default=50,
                   help="CEM trajectories to store per step (default: 50)")
    p.add_argument("--thumbnail-size", type=int, default=80,
                   help="Thumbnail JPEG size in px (default: 80)")
    p.add_argument("--seed", type=int, default=42,
                   help="Environment reset seed (default: 42)")
    # CEM hyper-parameters (should match the eval config)
    p.add_argument("--cem-samples",    type=int, default=300)
    p.add_argument("--cem-elites",     type=int, default=10)
    p.add_argument("--cem-iterations", type=int, default=5)
    p.add_argument("--cem-horizon",    type=int, default=5)
    return p.parse_args()


# ──────────────────────────────────────────────────────────────────────────────
# Environment state extraction
# ──────────────────────────────────────────────────────────────────────────────

def get_pusht_state(env) -> dict:
    """
    Pull the raw simulation state out of the PushT environment.

    swm/PushT-v1 wraps a pymunk physics simulation.  We try the most common
    attribute paths and fall back gracefully if the internals differ.
    """
    u = env.unwrapped

    # ── agent (pusher) position ──
    try:
        agent_pos = list(u.agent.position)          # pymunk Body
    except AttributeError:
        try:
            agent_pos = list(u.agent_pos)
        except AttributeError:
            agent_pos = [256.0, 256.0]
            print("  [warn] could not read agent position — using centre")

    # ── T-block position and angle ──
    try:
        block_pos   = list(u.block.position)
        block_angle = float(u.block.angle)
    except AttributeError:
        try:
            block_pos   = list(u.block_pos)
            block_angle = float(u.block_angle)
        except AttributeError:
            block_pos, block_angle = [300.0, 300.0], 0.0
            print("  [warn] could not read block state — using defaults")

    # ── goal ──
    try:
        goal_pos = list(u.goal_pose[:2])
    except (AttributeError, TypeError):
        try:
            goal_pos = list(u.goal_pos)
        except AttributeError:
            goal_pos = [380.0, 180.0]
            print("  [warn] could not read goal position — using default")

    return {
        "agent_pos":   [round(float(v), 1) for v in agent_pos],
        "block_pos":   [round(float(v), 1) for v in block_pos],
        "block_angle": round(float(block_angle), 4),
        "goal_pos":    [round(float(v), 1) for v in goal_pos],
    }


def get_env_size(env) -> int:
    """Return the side length of the PushT world coordinate space (typically 512)."""
    for attr in ("env_size", "workspace_size", "size"):
        try:
            return int(getattr(env.unwrapped, attr))
        except AttributeError:
            continue
    return 512


# ──────────────────────────────────────────────────────────────────────────────
# Observation pre-processing  (mirrors utils.py in the le-wm repo)
# ──────────────────────────────────────────────────────────────────────────────

_IMAGENET_MEAN = torch.tensor([0.485, 0.456, 0.406]).view(3, 1, 1)
_IMAGENET_STD  = torch.tensor([0.229, 0.224, 0.225]).view(3, 1, 1)


def preprocess_obs(obs: np.ndarray) -> torch.Tensor:
    """
    Convert a raw H×W×3 uint8 observation to a (1, 3, 224, 224) float32
    ImageNet-normalised tensor — exactly as the ViT encoder expects.
    """
    from PIL import Image

    if obs.dtype != np.uint8:
        obs = (obs * 255).clip(0, 255).astype(np.uint8)

    img = Image.fromarray(obs).resize((224, 224), Image.BILINEAR)
    t = torch.from_numpy(np.array(img)).permute(2, 0, 1).float() / 255.0  # (3, H, W)
    t = (t - _IMAGENET_MEAN) / _IMAGENET_STD
    return t.unsqueeze(0)  # (1, 3, 224, 224)


# ──────────────────────────────────────────────────────────────────────────────
# CEM planning loop  (explicit so we can capture trajectories)
# ──────────────────────────────────────────────────────────────────────────────

def run_cem(model, obs_tensor: torch.Tensor, env_state: dict,
            env_size: int, args) -> dict:
    """
    Run a single CEM planning step and return:
      best_action   — (action_dim,) numpy array to pass to env.step()
      best_cost     — scalar float
      trajectories  — list of dicts with keys: path, cost, is_elite, is_best
                       (spatial paths are approximate: action deltas integrated
                        from the current agent position in world coordinates)

    We re-implement the CEM loop explicitly (rather than using the solver's
    .plan() method) so we can capture the final-iteration candidate set.
    """
    H  = args.cem_horizon
    N  = args.cem_samples
    K  = args.cem_elites
    action_dim = 2  # PushT uses 2D delta actions

    mu  = np.zeros((H, action_dim), dtype=np.float32)
    std = np.ones( (H, action_dim), dtype=np.float32)

    for iteration in range(args.cem_iterations):
        # ── sample ──
        eps         = np.random.randn(N, H, action_dim).astype(np.float32)
        action_seqs = np.clip(mu[None] + std[None] * eps, -1.0, 1.0)   # (N, H, A)

        # ── evaluate in latent space ──
        action_t = torch.from_numpy(action_seqs)
        with torch.no_grad():
            costs = model.jepa.get_cost(obs_tensor, action_t)  # (N,)
        costs_np = costs.cpu().numpy()

        # ── refit distribution from elite set ──
        elite_idx = np.argsort(costs_np)[:K]
        mu  = action_seqs[elite_idx].mean(axis=0)
        std = action_seqs[elite_idx].std(axis=0) + 1e-5

    # ── build trajectory records from the final sample set ──
    best_idx    = elite_idx[0]
    best_action = action_seqs[best_idx, 0]   # first action in the best sequence
    best_cost   = float(costs_np[best_idx])

    # Select which trajectories to store:
    #   • all K elites
    #   • a random sample from the rest to reach n_traj_display total
    non_elite   = [i for i in range(N) if i not in set(elite_idx.tolist())]
    n_extra     = max(0, args.n_traj_display - K)
    rng         = np.random.default_rng(0)
    extra_idx   = rng.choice(non_elite, size=min(n_extra, len(non_elite)), replace=False)
    display_idx = list(elite_idx) + list(extra_idx)

    ax, ay   = env_state["agent_pos"]
    trajectories = []
    for i in display_idx:
        path = integrate_actions(
            start=(ax, ay),
            actions=action_seqs[i],     # (H, 2) in [-1, 1]
            env_size=env_size,
        )
        trajectories.append({
            "path":     path,
            "cost":     round(float(costs_np[i]), 3),
            "is_elite": bool(i in set(elite_idx.tolist())),
            "is_best":  bool(i == best_idx),
        })

    return {
        "best_action": best_action.tolist(),
        "best_cost":   round(best_cost, 3),
        "trajectories": trajectories,
    }


def integrate_actions(start: tuple, actions: np.ndarray,
                      env_size: float = 512.0, step_scale: float = 28.0) -> list:
    """
    Convert a sequence of normalised delta actions to a list of [x, y] waypoints.

    PushT actions are displacements in world space.  step_scale converts the
    normalised [-1, 1] range to approximate pixel units — 28 px/unit matches
    the default PushT workspace reasonably well; adjust if trajectories look
    too short or too long compared to the rendered frame.
    """
    x, y = float(start[0]), float(start[1])
    path = [[round(x, 1), round(y, 1)]]
    for dx, dy in actions:
        x = float(np.clip(x + dx * step_scale, 0.0, env_size))
        y = float(np.clip(y + dy * step_scale, 0.0, env_size))
        path.append([round(x, 1), round(y, 1)])
    return path


# ──────────────────────────────────────────────────────────────────────────────
# Thumbnail encoding
# ──────────────────────────────────────────────────────────────────────────────

def encode_thumbnail(frame_rgb: np.ndarray, size: int) -> str:
    """Resize frame to size×size and return a base64-encoded JPEG data URI."""
    from PIL import Image
    img = Image.fromarray(frame_rgb).resize((size, size), Image.BILINEAR)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=72)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()


# ──────────────────────────────────────────────────────────────────────────────
# Latent dimensionality reduction
# ──────────────────────────────────────────────────────────────────────────────

def project_latents(latents: list) -> list:
    """
    Project N×192 latent vectors to N×2 for the embedding trajectory panel.

    Uses UMAP if available (better topology preservation), otherwise falls back
    to PCA (always available via numpy).  Both outputs are normalised to [0, 1].
    """
    X = np.array(latents, dtype=np.float32)

    try:
        import umap
        print("  Projecting latents with UMAP…")
        reducer = umap.UMAP(
            n_components=2,
            n_neighbors=min(15, len(X) - 1),
            min_dist=0.1,
            random_state=42,
            verbose=False,
        )
        X2 = reducer.fit_transform(X)
    except ImportError:
        print("  umap-learn not found — using PCA fallback")
        print("  (install with: pip install umap-learn)")
        X_c = X - X.mean(axis=0)
        _, _, Vt = np.linalg.svd(X_c, full_matrices=False)
        X2 = X_c @ Vt[:2].T

    # Normalise to [0, 1] for consistent canvas rendering
    X2 = X2 - X2.min(axis=0)
    X2 = X2 / (X2.max(axis=0) + 1e-9)
    return [[round(float(a), 4), round(float(b), 4)] for a, b in X2]


# ──────────────────────────────────────────────────────────────────────────────
# Main
# ──────────────────────────────────────────────────────────────────────────────

def main():
    args = parse_args()

    ckpt_path = Path(args.checkpoint)

    # ── 1. Load model ──────────────────────────────────────────────────────────
    # AutoCostModel takes the path relative to $STABLEWM_HOME (default ~/.stable-wm/)
    # WITHOUT the _object.ckpt suffix — e.g. "pusht/lewm"
    print(f"Loading model from $STABLEWM_HOME/{ckpt_path} …")
    import stable_worldmodel as swm
    model = swm.policy.AutoCostModel(str(ckpt_path))
    model.eval()
    print("  Model loaded ✓")

    # ── 2. Create environment ──────────────────────────────────────────────────
    print("Creating swm/PushT-v1 environment…")
    import gymnasium as gym
    import swm  # noqa: F401  — registers swm/* environments
    env = gym.make("swm/PushT-v1", render_mode="rgb_array")
    env_size = get_env_size(env)
    print(f"  env_size = {env_size} ✓")

    # ── 3. Run episode ─────────────────────────────────────────────────────────
    print(f"\nRunning episode (max {args.max_steps} steps, seed {args.seed})…")
    obs, _ = env.reset(seed=args.seed)

    steps   = []
    latents = []

    for step_idx in range(args.max_steps):

        frame_rgb  = env.render()
        env_state  = get_pusht_state(env)
        obs_tensor = preprocess_obs(obs if isinstance(obs, np.ndarray) else obs["pixels"])

        # ── encode to latent ──
        with torch.no_grad():
            latent_vec = model.jepa.encode(obs_tensor).squeeze(0).cpu().numpy()
        latents.append(latent_vec.tolist())

        # ── CEM planning ──
        cem = run_cem(model, obs_tensor, env_state, env_size, args)

        # ── package step record ──
        steps.append({
            "step":       step_idx,
            **env_state,
            "cem_best_cost":   cem["best_cost"],
            "trajectories":    cem["trajectories"],
            "thumbnail":       encode_thumbnail(frame_rgb, args.thumbnail_size),
        })

        print(
            f"  step {step_idx:3d}  "
            f"agent=({env_state['agent_pos'][0]:.0f},{env_state['agent_pos'][1]:.0f})  "
            f"cost={cem['best_cost']:.2f}"
        )

        obs, _, terminated, truncated, _ = env.step(cem["best_action"])
        if terminated or truncated:
            print(f"  Episode ended at step {step_idx} ✓")
            break

    env.close()

    # ── 4. Project latents to 2D ──────────────────────────────────────────────
    print("\nDimensionality reduction…")
    latents_2d = project_latents(latents)
    for s, xy in zip(steps, latents_2d):
        s["latent_2d"] = xy

    # ── 5. Write output ────────────────────────────────────────────────────────
    output = {
        "env":           "PushT",
        "env_size":      env_size,
        "n_steps":       len(steps),
        "cem_samples":   args.cem_samples,
        "cem_horizon":   args.cem_horizon,
        "steps":         steps,
    }

    out_path = Path(args.output)
    with open(out_path, "w") as f:
        json.dump(output, f, separators=(",", ":"))

    size_kb = out_path.stat().st_size / 1024
    print(f"\nSaved → {out_path}  ({size_kb:.0f} KB, {len(steps)} steps)")
    print("\nNext step:")
    print(f"  cp {out_path} <AMI-Labs>/public/pusht_rollout.json")
    print("  Then run the site build — the viewer will pick it up automatically.")


if __name__ == "__main__":
    main()
