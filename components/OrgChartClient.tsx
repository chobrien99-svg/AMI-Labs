"use client";
import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import { useRouter } from "next/navigation";

type Member = {
  slug: string;
  name: string;
  role: string;
  reportsTo: string | null;
};

type TreeNode = {
  slug: string;
  name: string;
  role: string;
  children?: TreeNode[];
};

function buildTree(team: Member[]): TreeNode {
  const map = new Map<string, TreeNode>();
  team.forEach((m) => map.set(m.slug, { slug: m.slug, name: m.name, role: m.role, children: [] }));

  let root: TreeNode | null = null;
  const orphans: TreeNode[] = [];

  for (const m of team) {
    if (!m.reportsTo) {
      if (!root) {
        root = map.get(m.slug)!;
      } else {
        orphans.push(map.get(m.slug)!);
      }
    } else {
      const parent = map.get(m.reportsTo);
      if (parent) {
        parent.children = [...(parent.children || []), map.get(m.slug)!];
      } else {
        orphans.push(map.get(m.slug)!);
      }
    }
  }

  if (root && orphans.length) {
    root.children = [...(root.children || []), ...orphans];
  }

  for (const node of map.values()) {
    if (!node.children?.length) delete node.children;
  }

  return root!;
}

const AVATAR_COLORS = [
  ["#946B2D", "#B8960B"], ["#2A7D6B", "#3D9E88"], ["#3D7A4A", "#5EA06A"],
  ["#C07A3A", "#D99B5C"], ["#A85C72", "#C8849A"], ["#7B5EA7", "#9D84C4"],
  ["#4A7FA5", "#6FA3C4"], ["#5C8A5E", "#7FAE82"],
];

function getColor(name: string) {
  const i = name.charCodeAt(0) % AVATAR_COLORS.length;
  return AVATAR_COLORS[i];
}

function initials(name: string) {
  return name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

type TooltipState = {
  name: string;
  role: string;
  slug: string;
  x: number;
  y: number;
} | null;

export default function OrgChartClient({ team }: { team: Member[] }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [tooltip, setTooltip] = useState<TooltipState>(null);

  useEffect(() => {
    if (!svgRef.current) return;

    const treeData = buildTree(team);
    const root = d3.hierarchy(treeData);

    const nodeW = 216;  // 180 × 1.2
    const nodeH = 96;   // 80 × 1.2
    const vertGap = 144;
    const horizGap = 240;

    const treeLayout = d3.tree<TreeNode>()
      .nodeSize([horizGap, vertGap + nodeH]);

    treeLayout(root);

    const nodes = root.descendants();
    const links = root.links();

    const xs = nodes.map((n) => n.x ?? 0);
    const ys = nodes.map((n) => n.y ?? 0);
    const minX = Math.min(...xs) - nodeW / 2 - 20;
    const maxX = Math.max(...xs) + nodeW / 2 + 20;
    const minY = Math.min(...ys) - nodeH / 2 - 20;
    const maxY = Math.max(...ys) + nodeH / 2 + 40;

    const width = maxX - minX;
    const height = maxY - minY;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();
    svg.attr("viewBox", `${minX} ${minY} ${width} ${height}`)
      .attr("width", "100%")
      .attr("height", height)
      .style("max-height", "720px");

    // Draw links
    svg.append("g")
      .selectAll("path")
      .data(links)
      .enter()
      .append("path")
      .attr("fill", "none")
      .style("stroke", "var(--border)")
      .attr("stroke-width", 1.5)
      .attr("d", (d) => {
        const sx = d.source.x ?? 0, sy = (d.source.y ?? 0) + nodeH / 2;
        const tx = d.target.x ?? 0, ty = (d.target.y ?? 0) - nodeH / 2;
        const my = (sy + ty) / 2;
        return `M${sx},${sy} C${sx},${my} ${tx},${my} ${tx},${ty}`;
      });

    // Define gradients
    const defs = svg.append("defs");
    nodes.forEach((d) => {
      const [a, b] = getColor(d.data.name);
      const grad = defs.append("linearGradient")
        .attr("id", `grad-${d.data.slug}`)
        .attr("x1", "0%").attr("y1", "0%")
        .attr("x2", "100%").attr("y2", "100%");
      grad.append("stop").attr("offset", "0%").attr("stop-color", a);
      grad.append("stop").attr("offset", "100%").attr("stop-color", b);
    });

    // Draw nodes
    const nodeGroup = svg.append("g")
      .selectAll("g")
      .data(nodes)
      .enter()
      .append("g")
      .attr("transform", (d) => `translate(${(d.x ?? 0) - nodeW / 2},${(d.y ?? 0) - nodeH / 2})`)
      .style("cursor", "pointer")
      .on("click", (_, d) => router.push(`/team/${d.data.slug}`))
      .on("mouseenter", function (event: MouseEvent, d) {
        d3.select(this).select("rect").style("stroke", "var(--accent)");
        setTooltip({
          name: d.data.name,
          role: d.data.role,
          slug: d.data.slug,
          x: event.clientX,
          y: event.clientY,
        });
      })
      .on("mouseleave", function () {
        d3.select(this).select("rect").style("stroke", "var(--border)");
        setTooltip(null);
      });

    nodeGroup.append("rect")
      .attr("width", nodeW)
      .attr("height", nodeH)
      .attr("rx", 12)
      .style("fill", "var(--surface)")
      .style("stroke", "var(--border)")
      .attr("stroke-width", 1);

    // Avatar circle
    nodeGroup.append("circle")
      .attr("cx", 36)
      .attr("cy", nodeH / 2)
      .attr("r", 22)
      .attr("fill", (d) => `url(#grad-${d.data.slug})`);

    // Initials text
    nodeGroup.append("text")
      .attr("x", 36)
      .attr("y", nodeH / 2 + 5)
      .attr("text-anchor", "middle")
      .attr("fill", "#fff")
      .attr("font-size", "13px")
      .attr("font-weight", "700")
      .text((d) => initials(d.data.name));

    // Name text
    nodeGroup.append("text")
      .attr("x", 68)
      .attr("y", nodeH / 2 - 10)
      .style("fill", "var(--text)")
      .attr("font-size", "13px")
      .attr("font-weight", "600")
      .attr("font-family", "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif")
      .text((d) => d.data.name.length > 20 ? d.data.name.slice(0, 19) + "…" : d.data.name);

    // Role text
    nodeGroup.append("text")
      .attr("x", 68)
      .attr("y", nodeH / 2 + 10)
      .style("fill", "var(--muted)")
      .attr("font-size", "11px")
      .attr("font-family", "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif")
      .text((d) => d.data.role.length > 26 ? d.data.role.slice(0, 25) + "…" : d.data.role);

  }, [team, router]);

  // Clamp tooltip so it doesn't overflow viewport
  const TOOLTIP_W = 300;
  const TOOLTIP_H = 110;
  const tooltipStyle = tooltip ? {
    left: Math.min(tooltip.x + 18, (typeof window !== "undefined" ? window.innerWidth : 1200) - TOOLTIP_W - 8),
    top: Math.min(tooltip.y - 20, (typeof window !== "undefined" ? window.innerHeight : 800) - TOOLTIP_H - 8),
  } : null;

  const tooltipColors = tooltip ? getColor(tooltip.name) : ["#946B2D", "#B8960B"];

  return (
    <>
      <div className="page-header">
        <div className="page-header-inner">
          <h1>AMI Labs Org Chart</h1>
          <p>Click any node to view the full profile. Hierarchy based on publicly available information.</p>
        </div>
      </div>
      <main>
        <div
          ref={containerRef}
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "12px",
            padding: "24px",
            overflowX: "auto",
          }}
        >
          <svg ref={svgRef} />
        </div>
        <p style={{ color: "var(--muted)", fontSize: "0.78rem", marginTop: "12px", textAlign: "center" }}>
          Reporting structure inferred from public announcements and LinkedIn.
        </p>
      </main>

      {tooltip && tooltipStyle && (
        <div
          style={{
            position: "fixed",
            left: tooltipStyle.left,
            top: tooltipStyle.top,
            width: TOOLTIP_W,
            zIndex: 1000,
            pointerEvents: "none",
            background: "var(--bg)",
            border: "1px solid var(--accent)",
            borderRadius: "14px",
            padding: "16px 20px",
            boxShadow: "0 8px 32px rgba(148, 107, 45, 0.15), 0 2px 8px rgba(0,0,0,0.08)",
            display: "flex",
            alignItems: "center",
            gap: "16px",
            animation: "orgTooltipIn 0.12s ease-out",
          }}
        >
          {/* Large avatar */}
          <div style={{
            flexShrink: 0,
            width: 52,
            height: 52,
            borderRadius: "50%",
            background: `linear-gradient(135deg, ${tooltipColors[0]}, ${tooltipColors[1]})`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "18px",
            fontWeight: 700,
            color: "#fff",
            letterSpacing: "0.02em",
          }}>
            {initials(tooltip.name)}
          </div>

          {/* Text */}
          <div style={{ minWidth: 0 }}>
            <div style={{
              color: "var(--text)",
              fontSize: "15px",
              fontWeight: 700,
              lineHeight: 1.3,
              marginBottom: "4px",
            }}>
              {tooltip.name}
            </div>
            <div style={{
              color: "var(--muted)",
              fontSize: "12px",
              lineHeight: 1.4,
              marginBottom: "8px",
            }}>
              {tooltip.role}
            </div>
            <div style={{
              color: "var(--accent)",
              fontSize: "11px",
              fontWeight: 500,
            }}>
              Click to view profile →
            </div>
          </div>

          <style>{`
            @keyframes orgTooltipIn {
              from { opacity: 0; transform: translateY(4px) scale(0.97); }
              to   { opacity: 1; transform: translateY(0) scale(1); }
            }
          `}</style>
        </div>
      )}
    </>
  );
}
