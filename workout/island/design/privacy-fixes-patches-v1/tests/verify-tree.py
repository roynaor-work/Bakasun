"""Verify redactions and build the staged Pages site from the patched checkout."""
import json
from pathlib import Path
import re
import subprocess
import tempfile

BUNDLE = Path(__file__).resolve().parents[1]
PLAN = json.loads((BUNDLE / "patches/0001-private-data.json").read_text(encoding="utf-8"))


def git(*args, data=None, check=True):
    return subprocess.run(["git", *args], input=data, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=check)


def verify():
    index = set(git("ls-files", "-z").stdout.decode().rstrip("\0").split("\0"))
    for path in PLAN["remove"]:
        assert path not in index and not Path(path).exists(), path
    for path in PLAN["add"]:
        assert path in index and "receipts/<org>/private/" in Path(path).read_text(), path
    values = set()
    email = re.compile(rb"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}")
    for path in ("CLAUDE.md", "js/data/defaults.js", "supabase/bootstrap.sql", "supabase/north.sql", "north/js/config.js"):
        values.update(email.findall(git("show", f"{PLAN['base']}:{path}").stdout))
    assert values, "Expected known audited contact locations in baseline"
    patterns = b"\n".join(sorted(values)) + b"\n"
    matches = git("grep", "--cached", "-li", "-I", "-F", "-f", "-", data=patterns, check=False)
    if matches.returncode == 0:
        raise SystemExit("Known audited contact values remain at:\n" + matches.stdout.decode())
    assert matches.returncode == 1, "Could not verify indexed contents"
    for path in BUNDLE.rglob("*"):
        if path.is_file():
            contents = path.read_bytes().lower()
            assert not any(value.lower() in contents for value in values), str(path.relative_to(BUNDLE))
    with tempfile.TemporaryDirectory(prefix="privacy-pages-") as temp:
        pages = Path(temp) / "pages"
        subprocess.run(["python3", ".github/scripts/stage-pages.py", pages], check=True)
        files = {p.relative_to(pages).as_posix() for p in pages.rglob("*") if p.is_file()}
        assert {
            "index.html", "sw.js", "north/index.html", "workout/index.html",
            "workout/cam-lab/index.html", "workout/cam-lab/upload-endpoints.mjs",
            "workout/island/index.html", "workout/island/offline-sw.js",
        }.issubset(files)
        assert not any(set(path.split("/")) & {"audit", "verification", "iterations", "tests", "docs", "tools"} for path in files)
        assert not any(path.startswith("workout/voice-rec/") or path.endswith((".patch", ".tar.gz")) for path in files)
    print("Redaction locations, patch artifact values and Pages staging verified.")


if __name__ == "__main__":
    verify()
