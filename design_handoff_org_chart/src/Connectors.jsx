/* global React */
const { useMemo, useState, useEffect, useRef } = React;

function Connectors({ positions, nodeW, nodeH, style, team, focusSlug, dimOthers }) {
  // Build parent → child list of path segments, using rounded corners.
  const bySlug = useMemo(() => {
    const m = new Map();
    positions.forEach((p) => m.set(p.node.slug, p));
    return m;
  }, [positions]);

  const links = [];
  positions.forEach((p) => {
    const parentSlug = p.node.reportsTo;
    if (!parentSlug) return;
    const parent = bySlug.get(parentSlug);
    if (!parent) return;
    links.push({ from: parent, to: p });
  });

  // Pre-compute the set of slugs on focused lineage.
  let lineage = null;
  if (focusSlug && dimOthers) {
    const anc = window.ancestorsOf(team, focusSlug);
    const dsc = window.descendantsOf(team, focusSlug);
    lineage = new Set([...anc, ...dsc]);
  }

  const maxY = positions.reduce((a, p) => Math.max(a, p.y), 0) + nodeH + 60;
  const maxX = positions.reduce((a, p) => Math.max(a, p.x), 0) + nodeW + 40;

  function pathFor(from, to) {
    const sx = from.x + nodeW / 2;
    const sy = from.y + nodeH; // bottom of parent
    const tx = to.x + nodeW / 2;
    const ty = to.y; // top of child
    const my = sy + (ty - sy) / 2;

    if (style === "orthogonal") {
      const r = 10;
      if (Math.abs(sx - tx) < 0.5) {
        return `M ${sx} ${sy} L ${tx} ${ty}`;
      }
      const dir = tx > sx ? 1 : -1;
      return [
        `M ${sx} ${sy}`,
        `L ${sx} ${my - r}`,
        `Q ${sx} ${my} ${sx + dir * r} ${my}`,
        `L ${tx - dir * r} ${my}`,
        `Q ${tx} ${my} ${tx} ${my + r}`,
        `L ${tx} ${ty}`,
      ].join(" ");
    }
    // smooth cubic
    return `M ${sx} ${sy} C ${sx} ${my}, ${tx} ${my}, ${tx} ${ty}`;
  }

  return (
    <svg
      className="org-connectors"
      width={maxX}
      height={maxY}
      viewBox={`0 0 ${maxX} ${maxY}`}
      aria-hidden
    >
      <defs>
        <filter id="orgSoft" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="0.4" />
        </filter>
      </defs>
      {links.map((l, i) => {
        const onLineage =
          lineage &&
          lineage.has(l.from.node.slug) &&
          lineage.has(l.to.node.slug);
        const dim = lineage && !onLineage;
        return (
          <path
            key={`${l.from.node.slug}-${l.to.node.slug}`}
            d={pathFor(l.from, l.to)}
            fill="none"
            className={`org-link ${dim ? "org-link--dim" : ""} ${onLineage ? "org-link--focus" : ""}`}
            style={{
              // staggered draw-in
              animationDelay: `${160 + l.to.depth * 90}ms`,
            }}
          />
        );
      })}
    </svg>
  );
}

window.Connectors = Connectors;
