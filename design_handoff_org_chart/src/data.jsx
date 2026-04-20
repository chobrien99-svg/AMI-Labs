// Team data for AMI Labs. Derived from the repo's data/team.json.
// Only fields the chart renders are kept here.

const TEAM = [
  {
    slug: "yann-lecun",
    name: "Yann LeCun",
    role: "Executive Chairman & Co-Founder",
    location: "Paris / New York",
    reportsTo: null,
    body: "Turing Award laureate. Former Meta VP & Chief AI Scientist. Architect of JEPA — the foundation of AMI's approach. Professor at NYU.",
    tenure: "Co-Founder",
  },
  {
    slug: "alexandre-lebrun",
    name: "Alexandre LeBrun",
    role: "CEO & Co-Founder",
    location: "Paris",
    reportsTo: "yann-lecun",
    body: "Serial AI entrepreneur. Founded VirtuOz (→ Nuance/Microsoft), Wit.ai (→ Meta), Nabla. 24+ years in AI.",
    tenure: "Co-Founder",
  },
  {
    slug: "laurent-solly",
    name: "Laurent Solly",
    role: "COO & Co-Founder",
    location: "Paris",
    reportsTo: "alexandre-lebrun",
    body: "12 years at Meta as VP Europe. Built FAIR Paris into the largest AI lab outside the US. Former CEO of TF1 Publicité; ENA & Sciences Po.",
    tenure: "Co-Founder",
  },
  {
    slug: "saining-xie",
    name: "Saining Xie",
    role: "Chief Science Officer & Co-Founder",
    location: "New York",
    reportsTo: "alexandre-lebrun",
    body: "Visual representation learning specialist. Former Google DeepMind & Meta FAIR. Assistant Professor at NYU Courant.",
    tenure: "Co-Founder",
  },
  {
    slug: "pascale-fung",
    name: "Pascale Fung",
    role: "CRIO & Co-Founder",
    location: "Paris",
    reportsTo: "alexandre-lebrun",
    body: "Pioneer in human-centered AI. Former Meta FAIR Senior Director. Chair Professor at HKUST. Fellow of IEEE, ISCA, ACL, AAAI.",
    tenure: "Co-Founder",
  },
  {
    slug: "min-lin",
    name: "Min Lin",
    role: "Head of AMI Singapore",
    location: "Singapore",
    reportsTo: "alexandre-lebrun",
    body: "Former Principal Research Scientist at Sea. Postdoc at Mila. Lead author of the 'Network In Network' paper.",
    tenure: "",
  },
  {
    slug: "sean-nguyen",
    name: "Sean Nguyen",
    role: "Director of Operations",
    location: "New York",
    reportsTo: "laurent-solly",
    body: "Founding team, Office of Yann LeCun. Former Executive Administrative Partner at Meta AI supporting LeCun & Léon Bottou.",
    tenure: "Founding team",
  },
  {
    slug: "michael-rabbat",
    name: "Michael Rabbat",
    role: "VP of World Models & Co-Founder",
    location: "Montreal",
    reportsTo: "saining-xie",
    body: "Expert in world models & self-supervised learning. Former Director of FAIR Montreal. Professor at McGill for 11+ years.",
    tenure: "Co-Founder",
  },
  {
    slug: "li-jing",
    name: "Li Jing",
    role: "Head of Pretraining",
    location: "New York",
    reportsTo: "saining-xie",
    body: "Former OpenAI researcher. Postdoc at Meta FAIR NY. Co-founder of Lightelligence. PhD in Physics from MIT.",
    tenure: "",
  },
  {
    slug: "xingyi-zhou",
    name: "Xingyi Zhou",
    role: "Scientist",
    location: "New York",
    reportsTo: "saining-xie",
    body: "Former Meta & Google Research Scientist. PhD from UT Austin. Lead contributor to CenterPoint 3D detection framework.",
    tenure: "",
  },
  {
    slug: "sanghyun-woo",
    name: "Sanghyun Woo",
    role: "Member of Technical Staff",
    location: "New York",
    reportsTo: "saining-xie",
    body: "Former Google DeepMind Senior Research Scientist (Seattle). NYU Faculty Fellow. PhD from KAIST.",
    tenure: "",
  },
  {
    slug: "delong-chen",
    name: "Delong Chen",
    role: "Founding Team Member",
    location: "Paris",
    reportsTo: "saining-xie",
    body: "Working on VL-JEPA and vision-language world modeling. Former Visiting Researcher at Meta Paris. PhD at HKUST.",
    tenure: "Founding team",
  },
  {
    slug: "david-fan",
    name: "David Fan",
    role: "Researcher",
    location: "—",
    reportsTo: "saining-xie",
    body: "Research scientist on the AMI Labs team.",
    tenure: "",
  },
  {
    slug: "xinyi-wan",
    name: "Xinyi Wan",
    role: "Researcher",
    location: "—",
    reportsTo: "saining-xie",
    body: "Research scientist on the AMI Labs team.",
    tenure: "",
  },
  {
    slug: "jihan-yang",
    name: "Jihan Yang",
    role: "Researcher",
    location: "—",
    reportsTo: "saining-xie",
    body: "Research scientist on the AMI Labs team.",
    tenure: "",
  },
  {
    slug: "brian-li",
    name: "Brian Li",
    role: "Member of Technical Staff",
    location: "Singapore",
    reportsTo: "min-lin",
    body: "Former Staff Research Scientist at ByteDance (Seed Multimodal). Co-author of LLaVA-NeXT, LLaVA-OneVision, LLaVA-Video.",
    tenure: "",
  },
];

// Assign a stable palette color per person based on department / reports-to chain.
// Palette comes from the Observatory theme: brass/amber, teal, green, sienna, rose, slate, walnut.
const PALETTE = {
  chairman:   { a: "#B8860B", b: "#946B2D", ink: "#6B4E1F" }, // brass — Yann
  exec:       { a: "#C07A3A", b: "#9E5F28", ink: "#7A4618" }, // sienna — CEO
  ops:        { a: "#A85C72", b: "#87445A", ink: "#6B3347" }, // rose — ops
  science:    { a: "#2A7D6B", b: "#1F5E50", ink: "#17453B" }, // teal — science
  research:   { a: "#3D7A4A", b: "#2B5A36", ink: "#1F4427" }, // forest — researchers under science
  singapore:  { a: "#4A7FA5", b: "#345E7C", ink: "#26455C" }, // slate — singapore
  fallback:   { a: "#8C8474", b: "#6B6355", ink: "#4A3F30" },
};

// Hand-curated palette assignment by slug (small team, clearer intent than hashing).
const PERSON_COLOR = {
  "yann-lecun":       PALETTE.chairman,
  "alexandre-lebrun": PALETTE.exec,
  "laurent-solly":    PALETTE.ops,
  "sean-nguyen":      PALETTE.ops,
  "saining-xie":      PALETTE.science,
  "pascale-fung":     PALETTE.science,
  "min-lin":          PALETTE.singapore,
  "brian-li":         PALETTE.singapore,
  "michael-rabbat":   PALETTE.research,
  "li-jing":          PALETTE.research,
  "xingyi-zhou":      PALETTE.research,
  "sanghyun-woo":     PALETTE.research,
  "delong-chen":      PALETTE.research,
  "david-fan":        PALETTE.research,
  "xinyi-wan":        PALETTE.research,
  "jihan-yang":       PALETTE.research,
};

function initials(name) {
  return name
    .replace(/[^A-Za-z\s-]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

// Build hierarchy tree. Orphans are pinned under the root.
function buildTree(team) {
  const map = new Map();
  team.forEach((m) => map.set(m.slug, { ...m, children: [] }));
  let root = null;
  const orphans = [];
  for (const m of team) {
    const node = map.get(m.slug);
    if (!m.reportsTo) {
      if (!root) root = node;
      else orphans.push(node);
    } else {
      const parent = map.get(m.reportsTo);
      if (parent) parent.children.push(node);
      else orphans.push(node);
    }
  }
  if (root && orphans.length) root.children.push(...orphans);
  return root;
}

// Tidy tree layout (Reingold–Tilford, simplified: post-order contouring).
// Returns flat list of { node, x, y, depth }, plus width/height.
function layoutTree(root, { nodeW, nodeH, hGap, vGap }) {
  const out = [];
  // First pass: assign preliminary x by post-order, tracking subtree extents.
  let cursor = 0;
  function walk(n, depth) {
    if (!n.children || n.children.length === 0) {
      n.__x = cursor;
      cursor += nodeW + hGap;
    } else {
      n.children.forEach((c) => walk(c, depth + 1));
      const first = n.children[0].__x;
      const last = n.children[n.children.length - 1].__x;
      n.__x = (first + last) / 2;
    }
    out.push({ node: n, depth });
  }
  walk(root, 0);

  // Resolve subtree overlaps: for each parent's children pair, if subtrees overlap,
  // shift the right subtree (and everything rightward at same/deeper depths) by the diff.
  // (Simple approach — good enough for this ~16-person tree.)
  function shiftSubtree(n, delta) {
    n.__x += delta;
    (n.children || []).forEach((c) => shiftSubtree(c, delta));
  }
  function contours(n) {
    // Returns { left: [...by depth], right: [...by depth] } relative to n.__x=0 (absolute here)
    const left = [];
    const right = [];
    function rec(m, d) {
      if (left[d] === undefined || m.__x < left[d]) left[d] = m.__x;
      if (right[d] === undefined || m.__x > right[d]) right[d] = m.__x;
      (m.children || []).forEach((c) => rec(c, d + 1));
    }
    rec(n, 0);
    return { left, right };
  }
  function resolve(n) {
    if (!n.children || n.children.length < 2) {
      (n.children || []).forEach(resolve);
      return;
    }
    for (let i = 1; i < n.children.length; i++) {
      const left = n.children[i - 1];
      const right = n.children[i];
      const lc = contours(left).right;
      const rc = contours(right).left;
      let maxOverlap = 0;
      const depthCount = Math.min(lc.length, rc.length);
      for (let d = 0; d < depthCount; d++) {
        const need = lc[d] + nodeW + hGap;
        const gap = rc[d] - need; // positive = room
        if (gap < 0 && -gap > maxOverlap) maxOverlap = -gap;
      }
      if (maxOverlap > 0) shiftSubtree(right, maxOverlap);
    }
    // Re-center parent over children
    const first = n.children[0].__x;
    const last = n.children[n.children.length - 1].__x;
    n.__x = (first + last) / 2;
    n.children.forEach(resolve);
  }
  resolve(root);

  // Compute final coords
  const all = [];
  function collect(n, depth) {
    all.push({ node: n, x: n.__x, y: depth * (nodeH + vGap), depth });
    (n.children || []).forEach((c) => collect(c, depth + 1));
  }
  collect(root, 0);

  // Normalize so minX = 0
  const minX = Math.min(...all.map((p) => p.x));
  all.forEach((p) => (p.x -= minX));

  const maxX = Math.max(...all.map((p) => p.x)) + nodeW;
  const maxY = Math.max(...all.map((p) => p.y)) + nodeH;
  return { nodes: all, width: maxX, height: maxY };
}

// Ancestor set for a given slug (including itself).
function ancestorsOf(team, slug) {
  const map = new Map(team.map((m) => [m.slug, m]));
  const out = new Set();
  let cur = map.get(slug);
  while (cur) {
    out.add(cur.slug);
    cur = cur.reportsTo ? map.get(cur.reportsTo) : null;
  }
  return out;
}

// Descendant set for a slug.
function descendantsOf(team, slug) {
  const kidsByParent = new Map();
  team.forEach((m) => {
    if (!m.reportsTo) return;
    if (!kidsByParent.has(m.reportsTo)) kidsByParent.set(m.reportsTo, []);
    kidsByParent.get(m.reportsTo).push(m.slug);
  });
  const out = new Set([slug]);
  const stack = [slug];
  while (stack.length) {
    const cur = stack.pop();
    const kids = kidsByParent.get(cur) || [];
    kids.forEach((k) => {
      if (!out.has(k)) {
        out.add(k);
        stack.push(k);
      }
    });
  }
  return out;
}

Object.assign(window, {
  TEAM,
  PALETTE,
  PERSON_COLOR,
  initials,
  buildTree,
  layoutTree,
  ancestorsOf,
  descendantsOf,
});
