// CI dependency gate: `npm audit`, failing on any moderate-or-worse advisory that is not in
// audit-allowlist.json. An allowlisted advisory needs a reason and an `until` date; once the date
// passes it fails again, so every exception gets looked at instead of lingering.
//
// From web/: node scripts/audit.mjs [path/to/allowlist.json]
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SEVERITIES = ["info", "low", "moderate", "high", "critical"];
const FAIL_FROM = SEVERITIES.indexOf("moderate");

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const allowlistPath = resolve(process.argv[2] || resolve(root, "audit-allowlist.json"));
const allowlist = JSON.parse(readFileSync(allowlistPath, "utf8"));
const today = new Date().toISOString().slice(0, 10);

// npm exits non-zero whenever it finds anything, so the report is read from stdout either way.
// Windows needs a shell to find npm.cmd; a single command string keeps Node from warning about it.
const options = { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 };
const run = process.platform === "win32"
  ? spawnSync("npm audit --json", { ...options, shell: true })
  : spawnSync("npm", ["audit", "--json"], options);
let report;
try {
  report = JSON.parse(run.stdout);
} catch {
  console.error("npm audit did not return a JSON report:\n" + (run.stderr || run.stdout));
  process.exit(1);
}
if (report.error) {
  console.error(`npm audit failed: ${report.error.summary || JSON.stringify(report.error)}`);
  process.exit(1);
}

// Each advisory appears in the `via` list of the package it affects; the other entries only
// point at vulnerable dependencies, so collecting the objects finds every advisory once.
const advisories = new Map();
for (const vulnerability of Object.values(report.vulnerabilities || {})) {
  for (const via of vulnerability.via || []) {
    if (typeof via !== "object") continue;
    const id = String(via.url || "").split("/").pop() || String(via.source);
    const entry = advisories.get(id) || { id, title: via.title, severity: via.severity, url: via.url, packages: new Set() };
    entry.packages.add(via.name);
    advisories.set(id, entry);
  }
}

const allowed = new Map(allowlist.map((item) => [item.id, item]));
const failing = [];
for (const advisory of advisories.values()) {
  if (SEVERITIES.indexOf(advisory.severity) < FAIL_FROM) continue;
  const exception = allowed.get(advisory.id);
  if (!exception) {
    failing.push(advisory);
  } else if (!exception.until || exception.until < today) {
    failing.push({ ...advisory, expired: exception.until || "(no date)" });
  } else {
    console.log(`allowed until ${exception.until}: ${advisory.id} ${advisory.title} (${[...advisory.packages].join(", ")})`);
  }
}

for (const item of allowlist) {
  if (!advisories.has(item.id)) console.log(`no longer reported, remove it from the allowlist: ${item.id}`);
}

if (failing.length) {
  console.error(`\n${failing.length} advisory(ies) of moderate or higher severity:`);
  for (const advisory of failing) {
    const note = advisory.expired ? ` — allowlist entry expired on ${advisory.expired}, check whether a fix exists` : "";
    console.error(`  ${advisory.severity}: ${advisory.id} ${advisory.title} (${[...advisory.packages].join(", ")})${note}\n    ${advisory.url}`);
  }
  process.exit(1);
}
console.log(`npm audit: nothing of moderate or higher severity outside the allowlist (${advisories.size} advisory(ies) reported).`);
