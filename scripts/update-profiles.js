const fs = require("fs");
const Anthropic = require("@anthropic-ai/sdk").default;

const DATA_FILE = "./data/team.json";
const team = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
const client = new Anthropic();

async function generateBiography(member) {
  const prompt = [
    `Write a professional 3-4 paragraph biography for ${member.name}, who is the ${member.role} at AMI Labs (Advanced Machine Intelligence), a Paris-based AI startup co-founded with Yann LeCun.`,
    "",
    "Use only publicly verifiable facts. Include:",
    "- Their educational background",
    "- Their most significant career accomplishments before AMI Labs",
    "- Their research focus and scientific contributions (if applicable)",
    "- Their role at AMI Labs and why they are significant to the company",
    "",
    `Known background: ${member.body}`,
    "",
    "Write in third person, encyclopedia style. Be factual and precise. Do not speculate or invent details.",
  ].join("\n");

  const msg = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 600,
    messages: [{ role: "user", content: prompt }],
  });
  return msg.content[0].type === "text" ? msg.content[0].text.trim() : "";
}

(async () => {
  let updated = false;
  for (const member of team) {
    if (member.biography && member.biography.length > 100) {
      console.log(`Skipping ${member.name} (biography already exists)`);
      continue;
    }
    console.log(`Generating biography for ${member.name}...`);
    try {
      member.biography = await generateBiography(member);
      updated = true;
      console.log(`Done: ${member.name}`);
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
