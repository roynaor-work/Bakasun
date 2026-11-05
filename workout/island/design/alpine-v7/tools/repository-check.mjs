import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  repo = path.resolve(root, "../../../..");
const report = {
  command: "npm test",
  startedAt: new Date().toISOString(),
  repository: "roynaor-work/Bakasun",
  playwrightModule: process.env.ISLAND_PLAYWRIGHT || "repository default",
};
const child = spawn("npm", ["test"], {
  cwd: repo,
  env: process.env,
  stdio: ["ignore", "pipe", "pipe"],
});
let log = "";
for (const stream of [child.stdout, child.stderr])
  stream.on("data", (d) => (log += d.toString()));
const exitCode = await new Promise((resolve, reject) => {
  child.on("error", reject);
  child.on("close", resolve);
});
await fs.writeFile("/tmp/alpine-v7-repository-tests.log", log);
const plainLog = log.replace(/\x1b\[[0-9;]*m/g, "");
for (const name of [
  "tests",
  "suites",
  "pass",
  "fail",
  "cancelled",
  "skipped",
  "todo",
  "duration_ms",
]) {
  const re = new RegExp(`^(?:#|ℹ)\\s+${name}\\s+([0-9.]+)`, "m"),
    match = plainLog.match(re);
  if (match) report[name] = +match[1];
}
report.exitCode = exitCode;
report.completedAt = new Date().toISOString();
report.success = exitCode === 0 && report.fail === 0;
report.note =
  "Full raw test output remains outside the repository in /tmp; only aggregate counts are included to avoid copying unrelated fixture data.";
await fs.writeFile(
  path.join(root, "verification/repository-tests.json"),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report));
if (!report.success) process.exitCode = 1;
