// Dependency gate for CI, reading bun.lock through `bun audit --json`.
//   - blocks on any high or critical advisory without a valid exception;
//   - lists moderate/low advisories as warnings (they never block);
//   - an exception needs a reason and an expiry; expired ones block again;
//   - exceptions that no longer match anything are reported, so the file
//     doesn't accumulate dead entries.
// Usage: bun audit --json | node scripts/security/audit-policy.mjs [exceptions.json]
// Exit: 0 ok · 1 blocking advisories · 2 bad input. Policy: docs/SECURITY-PIPELINE.md.
import fs from "node:fs";

const BLOCKING = new Set(["critical", "high"]);
const MAX_EXCEPTION_DAYS = 90;

const advisoryId = (a) => (a.url || "").split("/").pop() || String(a.id);

/** Pure policy evaluation; `today` is an ISO date string. */
export function evaluate(audit, exceptions, today) {
  const valid = new Map();
  const problems = [];
  for (const e of exceptions) {
    const days = (Date.parse(e.expires) - Date.parse(today)) / 864e5;
    if (!e.reason || !e.expires || Number.isNaN(days)) problems.push(`exception ${e.advisory}: needs a reason and an expiry`);
    else if (days < 0) problems.push(`exception ${e.advisory} (${e.package}) expired on ${e.expires}; re-review it`);
    else if (days > MAX_EXCEPTION_DAYS) problems.push(`exception ${e.advisory}: expiry more than ${MAX_EXCEPTION_DAYS} days out`);
    else valid.set(`${e.package}|${e.advisory}`, e);
  }

  const blocking = [];
  const excepted = [];
  const warnings = [];
  const matched = new Set();
  for (const [pkg, list] of Object.entries(audit)) {
    for (const adv of [].concat(list)) {
      const id = advisoryId(adv);
      const row = { package: pkg, id, severity: adv.severity, title: adv.title, vulnerable: adv.vulnerable_versions, url: adv.url };
      if (!BLOCKING.has(adv.severity)) warnings.push(row);
      else if (valid.has(`${pkg}|${id}`)) {
        matched.add(`${pkg}|${id}`);
        excepted.push({ ...row, reason: valid.get(`${pkg}|${id}`).reason });
      } else blocking.push(row);
    }
  }
  const unused = [...valid.keys()].filter((k) => !matched.has(k));
  return { blocking, excepted, warnings, problems, unused, ok: blocking.length === 0 && problems.length === 0 };
}

function main() {
  const exceptionsFile = process.argv[2] || "security/audit-exceptions.json";
  let audit;
  try {
    const input = fs.readFileSync(0, "utf8").trim();
    audit = input ? JSON.parse(input) : {};
  } catch {
    console.error("audit-policy: expected `bun audit --json` on stdin");
    process.exit(2);
  }
  const { exceptions = [] } = JSON.parse(fs.readFileSync(exceptionsFile, "utf8"));
  const result = evaluate(audit, exceptions, new Date().toISOString().slice(0, 10));

  const line = (r) => `  ${r.severity.padEnd(8)} ${r.package}  ${r.id}  (${r.vulnerable})\n           ${r.title}\n           ${r.url}`;
  if (result.blocking.length) {
    console.log("BLOCKING — fix (upgrade out of the vulnerable range) or add a reviewed exception:");
    result.blocking.forEach((r) => console.log(line(r)));
  }
  if (result.problems.length) {
    console.log("Exception file problems:");
    result.problems.forEach((p) => console.log(`  ${p}`));
  }
  if (result.excepted.length) {
    console.log("Excepted (reviewed, still tracked):");
    result.excepted.forEach((r) => console.log(`${line(r)}\n           reason: ${r.reason}`));
  }
  if (result.unused.length) console.log(`Exceptions that match nothing any more (remove them): ${result.unused.join(", ")}`);
  console.log(`\n${result.blocking.length} blocking, ${result.excepted.length} excepted, ${result.warnings.length} moderate/low (not blocking).`);
  process.exit(result.ok ? 0 : 1);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
