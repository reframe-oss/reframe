// Guards against PR automation that merges or pushes on its own. A human
// maintainer performs every merge (CLAUDE.md, "PR Automation").
//
// Fails when:
//   1. any workflow runs a merge: `gh pr merge`, the REST merge endpoint,
//      GraphQL mergePullRequest / enablePullRequestAutoMerge, merge_method;
//   2. a job using anthropics/claude-code-action can write repository
//      contents (`contents: write`, `write-all`), which merging and pushing need;
//   3. such a job can write to pull requests but doesn't skip drafts
//      (`github.event.pull_request.draft == false` in its `if`);
//   4. a Claude prompt or CLAUDE.md tells the agent to merge, squash-merge,
//      enable auto-merge, or push to a PR branch, without a negation
//      ("never", "do not", …) on the same line;
//   5. anything applies labels automatically: a workflow that adds or sets
//      labels (addLabels, setLabels, `gh … --add-label`, or a non-empty
//      `labels:` when creating an issue), or a Dependabot entry whose
//      `labels` isn't the empty list. Maintainers label by hand.
//
// Usage: node scripts/ci/check-pr-automation.mjs   (exit 0 ok, 1 problems)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MERGE_COMMANDS = [
  /\bgh\s+pr\s+merge\b/i,
  /\/pulls\/[^\s/]+\/merge\b/i,
  /\bmergePullRequest\b/,
  /\benablePullRequestAutoMerge\b/,
  /\bmerge_method\b/,
  /\bgh\s+pr\s+ready\b/i,
];

// Affirmative instructions that would make an agent merge or push.
const MERGE_INSTRUCTION =
  /\b(squash[- ]?merge|rebase[- ]?merge|auto[- ]?merge|merge (it|the pr|the pull request|this pr|this pull request|prs|pull requests)|git push)\b/i;
const NEGATION = /\b(never|not|don't|do not|no|must not|cannot|can't)\b/i;

// Ways a workflow could apply labels.
const LABEL_WRITES = [
  /\baddLabels\b/,
  /\bsetLabels\b/,
  /--add-label\b/,
  /\/issues\/[^\s/]+\/labels\b/,
  // A non-empty labels list or string inside a create call, e.g. issues.create({ labels: ['x'] }).
  /^\s*labels:\s*(\[\s*['"]|['"][^'"]+['"])/,
];

/** Splits a workflow's text into { name, text } blocks per job (2-space keys under `jobs:`). */
export function jobsOf(workflowText) {
  const lines = workflowText.split("\n");
  const start = lines.findIndex((l) => /^jobs:\s*$/.test(l));
  if (start < 0) return [];
  const jobs = [];
  let current = null;
  for (const line of lines.slice(start + 1)) {
    if (/^\S/.test(line) && line.trim()) break;
    const m = line.match(/^ {2}([A-Za-z0-9_-]+):\s*$/);
    if (m) {
      current = { name: m[1], lines: [] };
      jobs.push(current);
    } else if (current) {
      current.lines.push(line);
    }
  }
  return jobs.map((j) => ({ name: j.name, text: j.lines.join("\n") }));
}

/** Lines that tell an agent to merge or push, ignoring negated ones. */
export function affirmativeMergeLines(text) {
  return text
    .split("\n")
    .map((line, i) => ({ line: line.trim(), n: i + 1 }))
    .filter(({ line }) => MERGE_INSTRUCTION.test(line) && !NEGATION.test(line));
}

export function checkWorkflow(file, text) {
  const problems = [];
  text.split("\n").forEach((line, i) => {
    if (line.trim().startsWith("#")) return;
    for (const re of MERGE_COMMANDS) if (re.test(line)) problems.push(`${file}:${i + 1}: runs a merge operation (${re})`);
  });
  if (/^permissions:\s*write-all/m.test(text)) problems.push(`${file}: workflow-level permissions: write-all`);
  text.split("\n").forEach((line, i) => {
    if (line.trim().startsWith("#") || line.trim().startsWith("//")) return;
    for (const re of LABEL_WRITES) if (re.test(line)) problems.push(`${file}:${i + 1}: applies labels automatically (${re})`);
  });

  for (const job of jobsOf(text)) {
    if (!/anthropics\/claude-code-action/.test(job.text)) continue;
    const where = `${file} › ${job.name}`;
    if (/^\s+contents:\s*write\b/m.test(job.text) || /permissions:\s*write-all/.test(job.text)) {
      problems.push(`${where}: Claude job can write repository contents`);
    }
    const prWrite = /^\s+pull-requests:\s*write\b/m.test(job.text);
    const prTriggered = /pull_request/.test(job.text) || /^\s+if:[\s\S]*?pull_request/m.test(job.text);
    if (prWrite && prTriggered && !/github\.event\.pull_request\.draft\s*==\s*false/.test(job.text)) {
      problems.push(`${where}: can write to pull requests but doesn't skip drafts`);
    }
    for (const { line, n } of affirmativeMergeLines(job.text)) {
      problems.push(`${where} (job line ${n}): instruction to merge or push: "${line.slice(0, 100)}"`);
    }
  }
  return problems;
}

export function checkInstructions(file, text) {
  return affirmativeMergeLines(text).map(({ line, n }) => `${file}:${n}: instruction to merge or push: "${line.slice(0, 100)}"`);
}

/** Dependabot applies a default "dependencies" label unless `labels` is the empty list. */
export function checkDependabot(file, text) {
  const entries = text.split(/^\s*-\s+package-ecosystem:/m).slice(1);
  return entries.flatMap((entry, i) =>
    /^\s*labels:\s*\[\s*\]\s*$/m.test(entry) ? [] : [`${file}: update entry ${i + 1} doesn't set labels: [] (Dependabot would label its PRs)`]
  );
}

export function checkRepository(root) {
  const problems = [];
  const dir = path.join(root, ".github/workflows");
  for (const name of fs.readdirSync(dir).filter((f) => /\.ya?ml$/.test(f) && !/ \d+\.ya?ml$/.test(f))) {
    problems.push(...checkWorkflow(`.github/workflows/${name}`, fs.readFileSync(path.join(dir, name), "utf8")));
  }
  const dependabot = path.join(root, ".github/dependabot.yml");
  if (fs.existsSync(dependabot)) problems.push(...checkDependabot(".github/dependabot.yml", fs.readFileSync(dependabot, "utf8")));
  for (const name of ["CLAUDE.md", ".github/CLAUDE.md"]) {
    const p = path.join(root, name);
    if (fs.existsSync(p)) problems.push(...checkInstructions(name, fs.readFileSync(p, "utf8")));
  }
  return problems;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const problems = checkRepository(root);
  if (problems.length) {
    console.error("PR automation safety check failed:\n" + problems.map((p) => `  - ${p}`).join("\n"));
    process.exit(1);
  }
  console.log("PR automation safety check passed: nothing merges, pushes or labels on its own.");
}
