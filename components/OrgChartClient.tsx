"use client";
import { useEffect, useRef } from "react";
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
        root = map.get(m.slug)!; // first null-reportsTo wins as root
      } else {
        orphans.push(map.get(m.slug)!); // subsequent rootless nodes queued
      }
    } else {
      const parent = map.get(m.reportsTo);
      if (parent) {
        parent.children = [...(parent.children || []), map.get(m.slug)!];
      } else {
        orphans.push(map.get(m.slug)!); // reportsTo slug not found in chart
      }
    }
  }

  // Attach orphans directly to root so they appear rather than breaking the tree
  if (root && orphans.length) {
    root.children = [...(root.children || []), ...orphans];
  }

  // Clean up empty children arrays
  for (const node of map.values()) {
    if (!node.children?.length) delete node.children;
  }

  return root!;
}

const AVATAR_COLORS = [
  ["#6c63ff", "#a78bfa"], ["#3b82f6", "#60a5fa"], ["#10b981", "#34d399"],
  ["#f59e0b", "#fbbf24"], ["#ef4444", "#f87171"], ["#8b5cf6", "#c084fc"],
  ["#ec4899", "#f472b6"], ["#14b8a6", "#2dd4bf"],
];

function getColor(name: string) {
  const i = name.charCodeAt(0) % AVATAR_COLORS.length;
  return AVATAR_COLORS[i];
}

function initials(name: string) {
  return name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

export default function OrgChartClient({ team }: { team: Member[] }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!svgRef.current) return;

    const treeData = buildTree(team);
    const root = d3.hierarchy(treeData);

    const nodeW = 180;
    const nodeH = 80;
    const vertGap = 120;
    const horizGap = 200;

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
      .style("max-height", "600px");

    // Draw links
    svg.append("g")
      .selectAll("path")
      .data(links)
      .enter()
      .append("path")
      .attr("fill", "none")
      .attr("stroke", "#2a2a3a")
      .attr("stroke-width", 1.5)
      .attr("d", (d) => {
        const sx = d.source.x ?? 0, sy = (d.source.y ?? 0) + nodeH / 2;
        const tx = d.target.x ?? 0, ty = (d.target.y ?? 0) - nodeH / 2;
        const my = (sy + ty) / 2;
        return `M${sx},${sy} C${sx},${my} ${tx},${my} ${tx},${ty}`;
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
      .on("mouseenter", function () {
        d3.select(this).select("rect").attr("stroke", "#6c63ff");
      })
      .on("mouseleave", function () {
        d3.select(this).select("rect").attr("stroke", "#2a2a3a");
      });

    nodeGroup.append("rect")
      .attr("width", nodeW)
      .attr("height", nodeH)
      .attr("rx", 10)
      .attr("fill", "#13131a")
      .attr("stroke", "#2a2a3a")
      .attr("stroke-width", 1);

    // Avatar circle
    nodeGroup.append("circle")
      .attr("cx", 30)
      .attr("cy", nodeH / 2)
      .attr("r", 18)
      .attr("fill", (d) => `url(#grad-${d.data.slug})`);

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

    // Initials text
    nodeGroup.append("text")
      .attr("x", 30)
      .attr("y", nodeH / 2 + 5)
      .attr("text-anchor", "middle")
      .attr("fill", "#fff")
      .attr("font-size", "11px")
      .attr("font-weight", "700")
      .text((d) => initials(d.data.name));

    // Name text
    nodeGroup.append("text")
      .attr("x", 55)
      .attr("y", nodeH / 2 - 8)
      .attr("fill", "#e2e2f0")
      .attr("font-size", "11px")
      .attr("font-weight", "600")
      .attr("font-family", "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif")
      .text((d) => d.data.name.length > 18 ? d.data.name.slice(0, 17) + "…" : d.data.name);

    // Role text
    nodeGroup.append("text")
      .attr("x", 55)
      .attr("y", nodeH / 2 + 8)
      .attr("fill", "#8888aa")
      .attr("font-size", "9px")
      .attr("font-family", "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif")
      .text((d) => d.data.role.length > 22 ? d.data.role.slice(0, 21) + "…" : d.data.role);

  }, [team, router]);

  return (
    <>
      <div className="page-header">
        <div className="page-header-inner">
          <h1>AMI Labs Org Chart</h1>
          <p>Click any node to view the full profile. Hierarchy based on publicly available information.</p>
        </div>
      </div>
      <main>
        <div style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "12px",
          padding: "24px",
          overflowX: "auto",
        }}>
          <svg ref={svgRef} />
        </div>
        <p style={{ color: "var(--muted)", fontSize: "0.78rem", marginTop: "12px", textAlign: "center" }}>
          Reporting structure inferred from public announcements and LinkedIn.
        </p>
      </main>
    </>
  );
}
