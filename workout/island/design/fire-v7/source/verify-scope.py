"""Read-only Git scope audit; writes evidence inside the new asset folder."""
from datetime import datetime, timezone
from pathlib import Path
import json
import subprocess

ROOT = Path(__file__).resolve().parent.parent
REPO = ROOT.parents[3]
PREFIX = "workout/island/design/fire-v7/"
BASE = "5d1fca7d11c6f4ed3a7e1cf8b92517fa63d0c275"
BRANCH = "codex/fire-v7-20261105"


def git(*args):
    return subprocess.check_output(["git", *args], cwd=REPO).decode()


report = {"generatedAt": datetime.now(timezone.utc).isoformat(),
          "allowedPrefix": PREFIX, "baseCommit": BASE,
          "branch": git("branch", "--show-current").strip(),
          "trackedChangesSinceBase": [], "untrackedFiles": [], "errors": []}
if report["branch"] != BRANCH:
    report["errors"].append("Unexpected delivery branch")
if git("ls-tree", "-r", "--name-only", BASE, "--", PREFIX).strip():
    report["errors"].append("The requested folder already existed at the base")
for line in git("diff", "--name-status", "--no-renames", BASE, "--").splitlines():
    status, filename = line.split("\t", 1)
    report["trackedChangesSinceBase"].append({"status": status, "file": filename})
    if status != "A" or not filename.startswith(PREFIX):
        report["errors"].append("Existing or out-of-scope file changed: " + filename)
report["untrackedFiles"] = [p for p in git("ls-files", "--others", "--exclude-standard", "-z").split("\0") if p]
for filename in report["untrackedFiles"]:
    if not filename.startswith(PREFIX):
        report["errors"].append("Out-of-scope untracked file: " + filename)
for p in ROOT.rglob("*"):
    if p.is_symlink():
        report["errors"].append("Unexpected symlink: " + str(p.relative_to(ROOT)))
# The repository ignores CSV globally. This new asset inventory is explicitly
# intended for delivery and must be force-added by its exact path at staging.
report["explicitlyIncludedIgnoredFile"] = PREFIX + "WEIGHTS.csv"
report["existingFilesModified"] = False if not report["errors"] else None
report["passed"] = not report["errors"]
(ROOT / "verification" / "repository-scope.json").write_text(
    json.dumps(report, indent=2, ensure_ascii=False) + "\n")
print(json.dumps({"passed": report["passed"], "branch": report["branch"],
                  "trackedChanges": len(report["trackedChangesSinceBase"]),
                  "untrackedFiles": len(report["untrackedFiles"]),
                  "errors": report["errors"]}))
raise SystemExit(0 if report["passed"] else 1)
