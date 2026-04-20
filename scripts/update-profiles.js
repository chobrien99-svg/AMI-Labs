const fs = require("fs");
const Anthropic = require("@anthropic-ai/sdk").default;

const DATA_FILE = "./data/team.json";
const team = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
const client = new Anthropic();

// Signals that the model refused to write a biography (first-person language,
// caveats about lacking information, etc.). Real biographies are entirely third-person.
const REFUSAL_PATTERNS = [
  /\bI cannot\b/i,
  /\bI can't\b/i,
  /\bI'm (not able|unable)\b/i,
  /\bI am (not able|unable)\b/i,
  /\bI don't have\b/i,
  /\bI do not have\b/i,
  /\bI appreciate\b/i,
  /\bI'd recommend\b/i,
  /\bwithout (verified|reliable|accurate)\b/i,
  /\bfabricat/i,
  /\bmisinformation\b/i,
  /\bWould you like\b/i,
];

function looksLikeRefusal(text) {
  if (!text) return true;
  // A real biography of ~600 tokens should be several hundred chars of prose
  if (text.length < 400) return true;
  return REFUSAL_PATTERNS.some((p) => p.test(text));
}

async function generateBiography(member) {
  const hasContext = member.body && member.body.trim().length > 40;
  const prompt = [
    `Write a professional 3-4 paragraph biography for ${member.name}, who is the ${member.role} at AMI Labs (Advanced Machine Intelligence), a Paris-based AI startup co-founded with Yann LeCun.`,
    "",
    "Use only publicly verifiable facts. Include:",
    "- Their educational background",
    "- Their most significant career accomplishments before AMI Labs",
    "- Their research focus and scientific contributions (if applicable)",
    "- Their role at AMI Labs and why they are significant to the company",
    "",
    `Known background: ${member.body || "(no additional context provided)"}`,
    "",
    "Write in third person, encyclopedia style. Be factual and precise. Do not speculate or invent details.",
    "",
    "If you do not have enough verified information to write a full biography, respond with exactly the single token SKIP and nothing else. Do not write an explanation, apology, or instructions — just SKIP.",
  ].join("\n");

  const msg = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 600,
    messages: [{ role: "user", content: prompt }],
  });
  const text = msg.content[0].type === "text" ? msg.content[0].text.trim() : "";
  if (text === "SKIP" || text.startsWith("SKIP")) return null;
  if (looksLikeRefusal(text)) {
    console.warn(`  ⚠ Response for ${member.name} looks like a refusal — skipping.`);
    return null;
  }
  // Silently ignore context hint for linter
  void hasContext;
  return text;
}

(async () => {
  let updated = false;
  for (const member of team) {
    if (member.biography && member.biography.length > 100 && !looksLikeRefusal(member.biography)) {
      console.log(`Skipping ${member.name} (biography already exists)`);
      continue;
    }
    console.log(`Generating biography for ${member.name}...`);
    try {
      const bio = await generateBiography(member);
      if (bio) {
        member.biography = bio;
        updated = true;
        console.log(`Done: ${member.name}`);
      } else {
        // If the existing biography was a stored refusal, clear it.
        if (member.biography && looksLikeRefusal(member.biography)) {
          member.biography = null;
          updated = true;
          console.log(`Cleared stored refusal for ${member.name}.`);
        } else {
          console.log(`No biography written for ${member.name} (insufficient verified info).`);
        }
      }
      await new Promise((r) => setTimeout(r, 1000));
    } catch (e) {
      console.error(`Failed for ${member.name}:`, e.message);
    }
  }
  if (updated) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(team, null, 2));
    console.log("Updated team.json with new biographies.");
  } else {
    console.log("No profiles needed updating.");
  }
})();
