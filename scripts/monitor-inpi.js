#!/usr/bin/env node
/**
 * monitor-inpi.js
 * Monitors INPI (Institut National de la Propriété Industrielle) filings for
 * PengyouCo / AMI Labs (SIREN 994675254): Marques, Brevets, Dessins & Modèles.
 *
 * Required environment variables:
 *   INPI_USERNAME       — your data.inpi.fr email address
 *   INPI_PASSWORD       — your data.inpi.fr password
 *   GITHUB_TOKEN        — GitHub Actions token (auto-provided)
 *   GITHUB_REPOSITORY   — e.g. "chobrien99/AMI-Labs" (auto-provided)
 *
 * Auth flow (cookie-based XSRF):
 *   1. GET login page → extract XSRF-TOKEN cookie
 *   2. POST /auth/login with X-XSRF-TOKEN header + credentials
 *   3. Use returned cookies for subsequent search requests
 */

const fs = require("fs");
const path = require("path");
const https = require("https");

const SIREN = "994675254";
const STATE_FILE = path.join(__dirname, "../data/inpi.json");
const BASE = "api-gateway.inpi.fr";
const DIFFUSION = "/services/apidiffusion/api";

// ── HTTP helpers ──────────────────────────────────────────────────────────────

function request(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

/** Extract Set-Cookie values into a simple key=value map */
function parseCookies(res) {
  const map = {};
  const raw = res.headers["set-cookie"] ?? [];
  for (const line of raw) {
    const [pair] = line.split(";");
    const eq = pair.indexOf("=");
    if (eq > 0) map[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
  }
  return map;
}

function cookieHeader(map) {
  return Object.entries(map).map(([k, v]) => `${k}=${v}`).join("; ");
}

// ── Authentication ────────────────────────────────────────────────────────────

async function authenticate(username, password) {
  // Step 1: hit the login page to get the initial XSRF-TOKEN cookie
  const initRes = await request({
    hostname: BASE,
    path: "/auth/login",
    method: "GET",
    headers: { "User-Agent": "ami-inpi-monitor" },
  });
  const cookies = parseCookies(initRes);
  const xsrf = cookies["XSRF-TOKEN"];
  if (!xsrf) {
    throw new Error("Could not obtain XSRF-TOKEN from INPI login page. Status: " + initRes.status);
  }

  // Step 2: POST credentials
  const payload = JSON.stringify({ username, password, rememberMe: false });
  const loginRes = await request({
    hostname: BASE,
    path: "/auth/login",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-XSRF-TOKEN": xsrf,
      "Cookie": cookieHeader(cookies),
      "User-Agent": "ami-inpi-monitor",
      "Content-Length": Buffer.byteLength(payload),
    },
  }, payload);

  if (loginRes.status !== 200) {
    throw new Error(`INPI login failed (HTTP ${loginRes.status}): ${loginRes.body.slice(0, 200)}`);
  }

  // Merge any new cookies from the login response
  const loginCookies = { ...cookies, ...parseCookies(loginRes) };
  console.log("[inpi] Authenticated successfully.");
  return loginCookies;
}

// ── Search ────────────────────────────────────────────────────────────────────

async function search(domain, query, cookies) {
  // domain: "marques" | "brevets" | "dm"
  const payload = JSON.stringify({ query, rang: 1, nombre: 50 });
  const res = await request({
    hostname: BASE,
    path: `${DIFFUSION}/api/${domain}/search`,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "X-XSRF-TOKEN": cookies["XSRF-TOKEN"] ?? "",
      "Cookie": cookieHeader(cookies),
      "User-Agent": "ami-inpi-monitor",
      "Content-Length": Buffer.byteLength(payload),
    },
  }, payload);

  if (res.status === 204 || res.body.trim() === "") return [];
  if (res.status >= 400) {
    console.warn(`[inpi] ${domain} search returned HTTP ${res.status}: ${res.body.slice(0, 200)}`);
    return [];
  }

  try {
    const data = JSON.parse(res.body);
    // The API returns either { results: [...] } or a top-level array
    return Array.isArray(data) ? data : (data.results ?? data.items ?? data[domain] ?? []);
  } catch {
    console.warn(`[inpi] Could not parse ${domain} response: ${res.body.slice(0, 100)}`);
    return [];
  }
}

// ── Field extractors ──────────────────────────────────────────────────────────

function extractMarque(item) {
  return {
    id: item.numeroNational ?? item.id ?? null,
    titre: item.denomination ?? item.libelle ?? item.titre ?? null,
    dateDepot: item.dateDepot ?? null,
    statut: item.etat ?? item.statut ?? null,
    classes: (item.classes ?? []).map((c) => c.numero ?? c).filter(Boolean),
    url: item.numeroNational
      ? `https://data.inpi.fr/marques/${item.numeroNational}`
      : null,
  };
}

function extractBrevet(item) {
  return {
    id: item.numeroPublication ?? item.numeroDepot ?? item.id ?? null,
    titre: item.titreInvention ?? item.titre ?? null,
    dateDepot: item.dateDepot ?? null,
    datePublication: item.datePublication ?? null,
    statut: item.etat ?? item.statut ?? null,
    url: item.numeroPublication
      ? `https://data.inpi.fr/brevets/${item.numeroPublication}`
      : null,
  };
}

function extractDessin(item) {
  return {
    id: item.numeroDossier ?? item.id ?? null,
    titre: item.designation ?? item.titre ?? null,
    dateDepot: item.dateDepot ?? null,
    statut: item.etat ?? item.statut ?? null,
    url: item.numeroDossier
      ? `https://data.inpi.fr/dessins_modeles/${item.numeroDossier}`
      : null,
  };
}

// ── Diff & GitHub Issues ──────────────────────────────────────────────────────

function newItems(prev, next, keyFn) {
  const prevIds = new Set(prev.map(keyFn).filter(Boolean));
  return next.filter((item) => !prevIds.has(keyFn(item)));
}

async function postGitHubIssue(title, body) {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY;
  if (!token || !repo) {
    console.log("[inpi] Skipping GitHub Issue (no GITHUB_TOKEN/GITHUB_REPOSITORY)");
    return;
  }
  const payload = JSON.stringify({ title, body, labels: ["inpi-update"] });
  const res = await request({
    hostname: "api.github.com",
    path: `/repos/${repo}/issues`,
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "ami-inpi-monitor",
      "Accept": "application/vnd.github+json",
      "Content-Length": Buffer.byteLength(payload),
    },
  }, payload);

  if (res.status >= 400) {
    console.error("[inpi] GitHub Issue creation failed:", res.status, res.body.slice(0, 200));
  } else {
    const data = JSON.parse(res.body);
    console.log(`[inpi] Created GitHub Issue #${data.number}: ${title}`);
  }
}

function formatItems(items, labelFn) {
  return items.map(labelFn).join("\n");
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const username = process.env.INPI_USERNAME;
  const password = process.env.INPI_PASSWORD;
  if (!username || !password) {
    console.error("[inpi] INPI_USERNAME and INPI_PASSWORD must be set. Exiting.");
    process.exit(1);
  }

  // Load previous state
  let prev = { marques: [], brevets: [], dessinsModeles: [] };
  try {
    prev = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {
    console.log("[inpi] No existing state file, starting fresh.");
  }

  // Authenticate
  let cookies;
  try {
    cookies = await authenticate(username, password);
  } catch (err) {
    console.error("[inpi] Authentication failed:", err.message);
    process.exit(1);
  }

  // Search by SIREN for all three domains
  // The INPI query DSL: [SIREN=994675254] searches the deposant SIREN field
  const sirenQuery = `[SIREN=${SIREN}]`;

  console.log("[inpi] Searching marques...");
  const rawMarques = await search("marques", sirenQuery, cookies);
  const marques = rawMarques.map(extractMarque);

  console.log("[inpi] Searching brevets...");
  const rawBrevets = await search("brevets", sirenQuery, cookies);
  const brevets = rawBrevets.map(extractBrevet);

  console.log("[inpi] Searching dessins & modèles...");
  const rawDM = await search("dm", sirenQuery, cookies);
  const dessinsModeles = rawDM.map(extractDessin);

  console.log(`[inpi] Found: ${marques.length} marques, ${brevets.length} brevets, ${dessinsModeles.length} dessins & modèles`);

  // Detect new items
  const newMarques = newItems(prev.marques ?? [], marques, (m) => m.id);
  const newBrevets = newItems(prev.brevets ?? [], brevets, (b) => b.id);
  const newDM = newItems(prev.dessinsModeles ?? [], dessinsModeles, (d) => d.id);

  const issues = [];

  if (newMarques.length > 0) {
    const lines = formatItems(newMarques, (m) =>
      `- **${m.titre ?? m.id}** (n° ${m.id ?? "?"})` +
      (m.dateDepot ? ` — déposée le ${m.dateDepot}` : "") +
      (m.statut ? ` — ${m.statut}` : "") +
      (m.classes.length ? ` — classes ${m.classes.join(", ")}` : "") +
      (m.url ? `\n  [Voir sur Data INPI](${m.url})` : "")
    );
    issues.push({
      title: `[AMI/PengyouCo] Nouvelle${newMarques.length > 1 ? "s" : ""} marque${newMarques.length > 1 ? "s" : ""} INPI`,
      body: `### Nouvelle${newMarques.length > 1 ? "s" : ""} marque${newMarques.length > 1 ? "s" : ""} déposée${newMarques.length > 1 ? "s" : ""}\n\n${lines}\n\n[Rechercher sur Data INPI](https://data.inpi.fr/marques?search=%5BSIREN%3D${SIREN}%5D)`,
    });
  }

  if (newBrevets.length > 0) {
    const lines = formatItems(newBrevets, (b) =>
      `- **${b.titre ?? b.id}** (n° ${b.id ?? "?"})` +
      (b.dateDepot ? ` — déposé le ${b.dateDepot}` : "") +
      (b.datePublication ? `, publié le ${b.datePublication}` : "") +
      (b.statut ? ` — ${b.statut}` : "") +
      (b.url ? `\n  [Voir sur Data INPI](${b.url})` : "")
    );
    issues.push({
      title: `[AMI/PengyouCo] Nouveau${newBrevets.length > 1 ? "x" : ""} brevet${newBrevets.length > 1 ? "s" : ""} INPI`,
      body: `### Nouveau${newBrevets.length > 1 ? "x" : ""} brevet${newBrevets.length > 1 ? "s" : ""} déposé${newBrevets.length > 1 ? "s" : ""}\n\n${lines}\n\n[Rechercher sur Data INPI](https://data.inpi.fr/brevets?search=%5BSIREN%3D${SIREN}%5D)`,
    });
  }

  if (newDM.length > 0) {
    const lines = formatItems(newDM, (d) =>
      `- **${d.titre ?? d.id}** (n° ${d.id ?? "?"})` +
      (d.dateDepot ? ` — déposé le ${d.dateDepot}` : "") +
      (d.statut ? ` — ${d.statut}` : "") +
      (d.url ? `\n  [Voir sur Data INPI](${d.url})` : "")
    );
    issues.push({
      title: `[AMI/PengyouCo] Nouveau${newDM.length > 1 ? "x" : ""} dessin${newDM.length > 1 ? "s" : ""} & modèle${newDM.length > 1 ? "s" : ""} INPI`,
      body: `### Nouveau${newDM.length > 1 ? "x" : ""} dessin${newDM.length > 1 ? "s" : ""} & modèle${newDM.length > 1 ? "s" : ""} déposé${newDM.length > 1 ? "s" : ""}\n\n${lines}\n\n[Rechercher sur Data INPI](https://data.inpi.fr/dessins_modeles?search=%5BSIREN%3D${SIREN}%5D)`,
    });
  }

  for (const issue of issues) {
    await postGitHubIssue(issue.title, issue.body);
  }

  if (issues.length === 0) {
    console.log("[inpi] No new filings detected.");
  } else {
    console.log(`[inpi] ${issues.length} new filing type(s) detected and reported.`);
  }

  // Save updated state
  const next = {
    lastChecked: new Date().toISOString(),
    siren: SIREN,
    marques,
    brevets,
    dessinsModeles,
  };
  fs.writeFileSync(STATE_FILE, JSON.stringify(next, null, 2) + "\n");
  console.log("[inpi] State saved to " + STATE_FILE);
}

main().catch((err) => {
  console.error("[inpi] Unexpected error:", err);
  process.exit(1);
});
