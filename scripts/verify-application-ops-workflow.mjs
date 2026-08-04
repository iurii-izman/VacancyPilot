import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packRoot = resolve(
  repositoryRoot,
  "docs/development/application-ops-pack",
);

function read(relativePath) {
  return readFileSync(resolve(repositoryRoot, relativePath), "utf8");
}

function requireMatch(content, pattern, source) {
  if (!pattern.test(content)) {
    throw new Error(`${source} is missing required workflow rule: ${pattern}`);
  }
}

const sessionPath =
  "docs/development/application-ops-pack/ZED_SESSION_START.md";
const session = read(sessionPath);

requireMatch(session, /# Claude \+ DeepSeek Session Contract/, sessionPath);
requireMatch(session, /only implementation branch is `main`/, sessionPath);
requireMatch(session, /HEAD[\s\S]*origin\/main/, sessionPath);
requireMatch(session, /Pull requests and feature branches[\s\S]*not part/, sessionPath);
requireMatch(session, /Do not:[\s\S]*- commit;[\s\S]*- push;/, sessionPath);

const actionableFiles = [
  sessionPath,
  "docs/development/application-ops-pack/CODEX_REVIEW_GATE.md",
  "docs/development/application-ops-pack/EPIC_MAP.md",
];

for (let epic = 3; epic <= 18; epic += 1) {
  const id = `AOPS-${String(epic).padStart(2, "0")}`;
  const relativePath = `docs/development/application-ops-pack/prompts/${id}.md`;
  const prompt = read(relativePath);
  requireMatch(prompt, /\bmain\b/, relativePath);
  requireMatch(prompt, /\bPR\b|pull request/i, relativePath);
  actionableFiles.push(relativePath);
}

for (const relativePath of actionableFiles) {
  const content = read(relativePath);
  if (content.includes("codex/application-ops-mvp")) {
    throw new Error(`${relativePath} contains the retired implementation branch`);
  }
}

const statusPath =
  "docs/development/application-ops/IMPLEMENTATION_STATUS.md";
const status = read(statusPath);
requireMatch(status, /\| AOPS-02 \|[^\n]*\| complete \|/, statusPath);
requireMatch(status, /\| AOPS-03 \|[^\n]*\| complete \|/, statusPath);
requireMatch(status, /\| AOPS-04 \|[^\n]*\| complete \|/, statusPath);
requireMatch(status, /\| AOPS-05 \|[^\n]*\| complete \|/, statusPath);
requireMatch(status, /\| AOPS-06 \|[^\n]*\| not started \|/, statusPath);

// Keep the path construction exercised so a moved pack fails loudly.
readFileSync(resolve(packRoot, "README.md"), "utf8");
