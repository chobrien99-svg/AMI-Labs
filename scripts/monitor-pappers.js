#!/usr/bin/env node
/**
 * monitor-pappers.js
 * Fetches administrative data for PengyouCo (SIREN 994675254) from the Pappers API,
 * compares against the last known state, and creates GitHub Issues for any changes.
 *
 * Required environment variables:
 *   PAPPERS_API_KEY     — your Pappers API token
 *   GITHUB_TOKEN        — GitHub Actions token (auto-provided)
 *   GITHUB_REPOSITORY   — e.g. "chobrien99/AMI-Labs" (auto-provided)
 */

const fs = require("fs");
const path = require("path");
const https = require("https");

const SIREN = "994675254";
const STATE_FILE = path.join(__dirname, "../data/pappers.json");

// ── helpers ─────────────────────────────────────────────────────────────────

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        if (res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}: ${body.slice(0, 200)}`));
        } else {
          try {
            resolve(JSON.parse(body));
          } catch {
            reject(new Error("Invalid JSON: " + body.slice(0, 200)));
          }
        }
      });
    }).on("error", reject);
  });
}

function postGitHubIssue(title, body) {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY;
  if (!token || !repo) {
    console.log("[pappers] Skipping GitHub Issue (no GITHUB_TOKEN/GITHUB_REPOSITORY)");
    return Promise.resolve();
  }
  const payload = JSON.stringify({ title, body, labels: ["pappers-update"] });
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "api.github.com",
      path: `/repos/${repo}/issues`,
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
        "User-Agent": "ami-pappers-monitor",
        "Accept": "application/vnd.github+json",
        "Content-Length": Buffer.byteLength(payload),
      },
    };
    const req = https.request(options, (res) => {
      let b = "";
      res.on("data", (c) => (b += c));
      res.on("end", () => {
        if (res.statusCode >= 400) {
          console.error("[pappers] GitHub Issue creation failed:", res.statusCode, b.slice(0, 200));
        } else {
          const data = JSON.parse(b);
          console.log("[pappers] Created GitHub Issue #" + data.number + ": " + title);
        }
        resolve();
      });
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

// ── field extractors ─────────────────────────────────────────────────────────

function extractDirigeants(data) {
  const reps = data.representants ?? [];
  return reps.map((r) => ({
    nom: [r.prenom, r.nom].filter(Boolean).join(" ") || r.denomination || "",
    qualite: r.qualite ?? "",
    dateNomination: r.date_prise_de_poste ?? null,
  }));
}

function extractCapital(data) {
  return data.capital ?? null;
}

function extractFormeJuridique(data) {
  return data.forme_juridique ?? null;
}

function extractAdresse(data) {
  const s = data.siege;
  if (!s) return null;
  return [s.adresse_ligne_1, s.code_postal, s.ville].filter(Boolean).join(", ");
}

function extractPublications(data) {
  const raw = data.publications_bodacc ?? [];
  return raw.slice(0, 30).map((p) => ({
    id: p.id ?? p.numero_annonce ?? null,
    type: p.type ?? null,
    date: p.date ?? null,
    description: p.descriptif ?? p.titre ?? null,
  }));
}

function extractActes(data) {
  const raw = data.actes ?? [];
  return raw.slice(0, 30).map((a) => ({
    id: a.id ?? null,
    date: a.date ?? null,
    type: a.type ?? a.intitule ?? null,
    description: a.descriptif ?? null,
  }));
}

// ── diff helpers ─────────────────────────────────────────────────────────────

function diffDirigeants(prev, next) {
  const prevMap = Object.fromEntries(prev.map((d) => [d.nom + "|" + d.qualite, d]));
  const nextMap = Object.fromEntries(next.map((d) => [d.nom + "|" + d.qualite, d]));
  const added = next.filter((d) => !prevMap[d.nom + "|" + d.qualite]);
  const removed = prev.filter((d) => !nextMap[d.nom + "|" + d.qualite]);
  return { added, removed };
}

function newItems(prev, next, keyFn) {
  const prevIds = new Set(prev.map(keyFn));
  return next.filter((item) => !prevIds.has(keyFn(item)));
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  const apiKey = process.env.PAPPERS_API_KEY;
  if (!apiKey) {
    console.error("[pappers] PAPPERS_API_KEY is not set. Exiting.");
    process.exit(1);
  }

  // Load previous state
  let prev = {};
  try {
    prev = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {
    console.log("[pappers] No existing state file, starting fresh.");
  }

  // Fetch from Pappers API
  const url =
    `https://api.pappers.fr/v2/entreprise` +
    `?api_token=${encodeURIComponent(apiKey)}` +
    `&siren=${SIREN}` +
    `&publications_bodacc_brutes=true` +
    `&actes=true` +
    `&representants=true`;

  console.log("[pappers] Fetching data for SIREN " + SIREN + "...");
  let data;
  try {
    data = await get(url);
  } catch (err) {
    console.error("[pappers] Fetch failed:", err.message);
    process.exit(1);
  }

  const next = {
    lastChecked: new Date().toISOString(),
    siren: SIREN,
    denomination: data.nom_entreprise ?? data.denomination ?? null,
    dirigeants: extractDirigeants(data),
    capital: extractCapital(data),
    formeJuridique: extractFormeJuridique(data),
    adresse: extractAdresse(data),
    publications: extractPublications(data),
    actes: extractActes(data),
  };

  const issues = [];

  // 1. Officer / dirigeant changes
  if (prev.dirigeants) {
    const { added, removed } = diffDirigeants(prev.dirigeants, next.dirigeants);
    if (added.length > 0) {
      const lines = added.map((d) => `- **${d.nom}** — ${d.qualite}${d.dateNomination ? ` (nommé le ${d.dateNomination})` : ""}`).join("\n");
      issues.push({
        title: `[PengyouCo] Nouveau dirigeant${added.length > 1 ? "s" : ""} détecté${added.length > 1 ? "s" : ""}`,
        body: `### Nouveau${added.length > 1 ? "x" : ""} représentant${added.length > 1 ? "s" : ""}\n\n${lines}\n\n[Voir sur Pappers](https://www.pappers.fr/entreprise/pengyouco-${SIREN})`,
      });
    }
    if (removed.length > 0) {
      const lines = removed.map((d) => `- **${d.nom}** — ${d.qualite}`).join("\n");
      issues.push({
        title: `[PengyouCo] Départ de dirigeant${removed.length > 1 ? "s" : ""} détecté${removed.length > 1 ? "s" : ""}`,
        body: `### Représentant${removed.length > 1 ? "s" : ""} retiré${removed.length > 1 ? "s" : ""}\n\n${lines}\n\n[Voir sur Pappers](https://www.pappers.fr/entreprise/pengyouco-${SIREN})`,
      });
    }
  }

  // 2. Capital change
  if (prev.capital !== undefined && prev.capital !== null && prev.capital !== next.capital) {
    issues.push({
      title: `[PengyouCo] Modification du capital social`,
      body: `Le capital social a changé.\n\n- **Avant :** ${prev.capital}\n- **Après :** ${next.capital}\n\n[Voir sur Pappers](https://www.pappers.fr/entreprise/pengyouco-${SIREN})`,
    });
  }

  // 3. Forme juridique change
  if (prev.formeJuridique && prev.formeJuridique !== next.formeJuridique) {
    issues.push({
      title: `[PengyouCo] Modification de la forme juridique`,
      body: `La forme juridique a changé.\n\n- **Avant :** ${prev.formeJuridique}\n- **Après :** ${next.formeJuridique}\n\n[Voir sur Pappers](https://www.pappers.fr/entreprise/pengyouco-${SIREN})`,
    });
  }

  // 4. New BODACC publications
  if (prev.publications) {
    const newPubs = newItems(prev.publications, next.publications, (p) => p.id ?? p.date + "|" + p.type);
    if (newPubs.length > 0) {
      const lines = newPubs.map((p) =>
        `- **${p.date ?? "?"}** — ${p.type ?? "Publication"}${p.description ? ": " + p.description : ""}`
      ).join("\n");
      issues.push({
        title: `[PengyouCo] Nouvelle${newPubs.length > 1 ? "s" : ""} publication${newPubs.length > 1 ? "s" : ""} BODACC`,
        body: `### Publication${newPubs.length > 1 ? "s" : ""} BODACC récente${newPubs.length > 1 ? "s" : ""}\n\n${lines}\n\n[Voir sur Pappers](https://www.pappers.fr/entreprise/pengyouco-${SIREN})`,
      });
    }
  }

  // 5. New actes
  if (prev.actes) {
    const newActes = newItems(prev.actes, next.actes, (a) => a.id ?? a.date + "|" + a.type);
    if (newActes.length > 0) {
      const lines = newActes.map((a) =>
        `- **${a.date ?? "?"}** — ${a.type ?? "Acte"}${a.description ? ": " + a.description : ""}`
      ).join("\n");
      issues.push({
        title: `[PengyouCo] Nouvel${newActes.length > 1 ? "s" : ""} acte${newActes.length > 1 ? "s" : ""} enregistré${newActes.length > 1 ? "s" : ""}`,
        body: `### Acte${newActes.length > 1 ? "s" : ""} récent${newActes.length > 1 ? "s" : ""}\n\n${lines}\n\n[Voir sur Pappers](https://www.pappers.fr/entreprise/pengyouco-${SIREN})`,
      });
    }
  }

  // Create GitHub Issues for each change found
  for (const issue of issues) {
    await postGitHubIssue(issue.title, issue.body);
  }

  if (issues.length === 0) {
    console.log("[pappers] No changes detected.");
  } else {
    console.log(`[pappers] ${issues.length} change(s) detected and reported.`);
  }

  // Save updated state
  fs.writeFileSync(STATE_FILE, JSON.stringify(next, null, 2) + "\n");
  console.log("[pappers] State saved to " + STATE_FILE);
}

main().catch((err) => {
  console.error("[pappers] Unexpected error:", err);
  process.exit(1);
});
