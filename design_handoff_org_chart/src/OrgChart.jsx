/* global React, ReactDOM */
const { useState, useMemo, useEffect, useRef, useCallback } = React;

// Read tweaks seed from the inline JSON block.
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "density": "standard",
  "connectorStyle": "curved",
  "dimOthers": true,
  "showAccent": true,
  "paletteMode": "department"
}/*EDITMODE-END*/;

function OrgChart() {
  const [tweaks, setTweaks] = useState(TWEAK_DEFAULTS);
  const [hover, setHover] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [query, setQuery] = useState("");
  const [tweaksOpen, setTweaksOpen] = useState(false);

  // Tweaks host protocol
  useEffect(() => {
    const handler = (e) => {
      const d = e.data || {};
      if (d.type === "__activate_edit_mode") setTweaksOpen(true);
      else if (d.type === "__deactivate_edit_mode") setTweaksOpen(false);
    };
    window.addEventListener("message", handler);
    try {
      window.parent.postMessage({ type: "__edit_mode_available" }, "*");
    } catch {}
    return () => window.removeEventListener("message", handler);
  }, []);

  function persistTweak(patch) {
    setTweaks((prev) => ({ ...prev, ...patch }));
    try {
      window.parent.postMessage(
        { type: "__edit_mode_set_keys", edits: patch },
        "*"
      );
    } catch {}
  }

  // Card dimensions by density
  const dims = useMemo(() => {
    if (tweaks.density === "compact") return { w: 236, h: 88, hGap: 26, vGap: 76 };
    if (tweaks.density === "comfy")   return { w: 320, h: 172, hGap: 36, vGap: 104 };
    return { w: 280, h: 132, hGap: 32, vGap: 92 }; // standard
  }, [tweaks.density]);

  const layout = useMemo(() => {
    const tree = window.buildTree(window.TEAM);
    return window.layoutTree(tree, {
      nodeW: dims.w,
      nodeH: dims.h,
      hGap: dims.hGap,
      vGap: dims.vGap,
    });
  }, [dims]);

  // Highlight computation
  const focusSlug = expanded || hover;
  const lineage = useMemo(() => {
    if (!focusSlug || !tweaks.dimOthers) return null;
    const anc = window.ancestorsOf(window.TEAM, focusSlug);
    const dsc = window.descendantsOf(window.TEAM, focusSlug);
    return new Set([...anc, ...dsc]);
  }, [focusSlug, tweaks.dimOthers]);

  // Search matches
  const matchedSet = useMemo(() => {
    if (!query.trim()) return null;
    const q = query.trim().toLowerCase();
    return new Set(
      window.TEAM.filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          m.role.toLowerCase().includes(q) ||
          (m.location || "").toLowerCase().includes(q)
      ).map((m) => m.slug)
    );
  }, [query]);

  // Stats
  const stats = useMemo(() => {
    const total = window.TEAM.length;
    const founders = window.TEAM.filter((m) => m.tenure === "Co-Founder").length;
    const locs = new Set(
      window.TEAM.map((m) => (m.location || "").split("/")[0].trim()).filter(
        (l) => l && l !== "—"
      )
    );
    return { total, founders, locations: locs.size };
  }, []);

  // Compute canvas size with padding
  const pad = 56;
  const canvasW = layout.width + pad * 2;
  const canvasH = layout.height + pad * 2;

  const { Connectors, PersonCard } = window;

  return (
    <>
      {/* Top gradient accent bar (site signature) */}
      <div className="accent-bar" />

      {/* Navigation */}
      <Nav />

      {/* Page header */}
      <header className="page-header">
        <div className="page-header-inner">
          <div className="ph-eyebrow">
            <span className="ph-dot" /> The Observatory · Organization
          </div>
          <h1>AMI Labs Org Chart</h1>
          <p>
            Reporting structure inferred from public announcements and LinkedIn.
            Hover a card to trace its reporting line; click to expand.
          </p>

          <div className="ph-stats">
            <div className="ph-stat">
              <div className="ph-stat-num">{stats.total}</div>
              <div className="ph-stat-label">People mapped</div>
            </div>
            <div className="ph-stat">
              <div className="ph-stat-num">{stats.founders}</div>
              <div className="ph-stat-label">Co-Founders</div>
            </div>
            <div className="ph-stat">
              <div className="ph-stat-num">{stats.locations}</div>
              <div className="ph-stat-label">Cities</div>
            </div>
            <div className="ph-stat ph-stat--update">
              <div className="ph-stat-num">Apr 2026</div>
              <div className="ph-stat-label">Last updated</div>
            </div>
          </div>
        </div>
      </header>

      {/* Controls */}
      <div className="org-controls">
        <div className="org-controls-inner">
          <div className="search-wrap">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.35-3.35" />
            </svg>
            <input
              type="search"
              placeholder="Search people, roles, or locations…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <div className="legend">
            <LegendDot color={window.PALETTE.chairman.a} label="Chairman" />
            <LegendDot color={window.PALETTE.exec.a} label="CEO" />
            <LegendDot color={window.PALETTE.ops.a} label="Operations" />
            <LegendDot color={window.PALETTE.science.a} label="Science" />
            <LegendDot color={window.PALETTE.research.a} label="Research" />
            <LegendDot color={window.PALETTE.singapore.a} label="Singapore" />
          </div>
        </div>
      </div>

      {/* Chart canvas */}
      <main className="org-main">
        <div className="org-canvas-wrap">
          <div
            className="org-canvas"
            style={{ width: canvasW, height: canvasH }}
          >
            <Connectors
              positions={layout.nodes.map((n) => ({
                ...n,
                x: n.x + pad,
                y: n.y + pad,
              }))}
              nodeW={dims.w}
              nodeH={dims.h}
              style={tweaks.connectorStyle}
              team={window.TEAM}
              focusSlug={focusSlug}
              dimOthers={tweaks.dimOthers}
            />

            {layout.nodes.map((p, i) => {
              const matched = matchedSet ? matchedSet.has(p.node.slug) : null;
              const lineageHit = lineage ? lineage.has(p.node.slug) : null;

              let highlight = null;
              if (matched === false) highlight = "dim";
              if (lineage && !lineageHit) highlight = "dim";
              if (lineage && lineageHit) highlight = "focus";
              if (matched === true && !lineage) highlight = "focus";

              return (
                <div
                  key={p.node.slug}
                  className="org-node"
                  style={{
                    left: p.x + pad,
                    top: p.y + pad,
                    animationDelay: `${80 + p.depth * 90 + (i % 4) * 25}ms`,
                  }}
                >
                  <PersonCard
                    person={p.node}
                    width={dims.w}
                    height={dims.h}
                    highlight={highlight}
                    expanded={expanded === p.node.slug}
                    density={tweaks.density}
                    showAccent={tweaks.showAccent}
                    onHover={(s) => setHover(s)}
                    onLeave={() => setHover(null)}
                    onToggle={(s) =>
                      setExpanded((cur) => (cur === s ? null : s))
                    }
                  />
                </div>
              );
            })}
          </div>
        </div>

        <p className="org-footnote">
          Reporting structure inferred from public announcements and LinkedIn ·
          AMI Labs, Advanced Machine Intelligence
        </p>
      </main>

      {/* Tweaks panel */}
      {tweaksOpen && (
        <TweaksPanel
          tweaks={tweaks}
          onChange={persistTweak}
          onClose={() => setTweaksOpen(false)}
        />
      )}
    </>
  );
}

function LegendDot({ color, label }) {
  return (
    <span className="legend-dot">
      <span className="legend-swatch" style={{ background: color }} />
      {label}
    </span>
  );
}

function Nav() {
  const links = [
    "News",
    "Explainers",
    "Timeline",
    "Investors",
    "Team",
    "Org Chart",
    "Activity",
    "Docs",
  ];
  return (
    <nav className="nav">
      <div className="nav-inner">
        <a href="#" className="nav-logo">
          <span className="nav-logo-dot" />
          AMI Labs
        </a>
        <div className="nav-links">
          {links.map((l) => (
            <a
              key={l}
              className={`nav-link${l === "Org Chart" ? " active" : ""}`}
              href="#"
              onClick={(e) => e.preventDefault()}
            >
              {l}
            </a>
          ))}
        </div>
        <div className="nav-right">
          <span className="nav-powered">
            Powered by <a href="#">The French Tech Journal</a>
          </span>
          <button className="nav-signin" disabled>
            Sign In
          </button>
        </div>
      </div>
    </nav>
  );
}

function TweaksPanel({ tweaks, onChange, onClose }) {
  return (
    <aside className="tweaks">
      <div className="tweaks-head">
        <strong>Tweaks</strong>
        <button className="tweaks-close" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>

      <div className="tweaks-row">
        <label>Card density</label>
        <div className="tweaks-seg">
          {["compact", "standard", "comfy"].map((d) => (
            <button
              key={d}
              className={tweaks.density === d ? "on" : ""}
              onClick={() => onChange({ density: d })}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      <div className="tweaks-row">
        <label>Connector style</label>
        <div className="tweaks-seg">
          {["curved", "orthogonal"].map((c) => (
            <button
              key={c}
              className={tweaks.connectorStyle === c ? "on" : ""}
              onClick={() => onChange({ connectorStyle: c })}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="tweaks-row">
        <label>Dim off-path on hover</label>
        <button
          className={`tweaks-toggle ${tweaks.dimOthers ? "on" : ""}`}
          onClick={() => onChange({ dimOthers: !tweaks.dimOthers })}
        >
          <span />
        </button>
      </div>

      <div className="tweaks-row">
        <label>Team accent bar</label>
        <button
          className={`tweaks-toggle ${tweaks.showAccent ? "on" : ""}`}
          onClick={() => onChange({ showAccent: !tweaks.showAccent })}
        >
          <span />
        </button>
      </div>
    </aside>
  );
}

window.OrgChart = OrgChart;
