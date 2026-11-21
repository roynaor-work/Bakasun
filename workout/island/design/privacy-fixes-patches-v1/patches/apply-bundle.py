"""Preflight the bundle in a temporary Git index, then optionally stage its tree."""
import argparse
import json
import os
from pathlib import Path, PurePosixPath
import re
import subprocess
import tempfile

PATCHES = Path(__file__).resolve().parent
GIT_ROUTING = (
    "GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_COMMON_DIR",
    "GIT_OBJECT_DIRECTORY", "GIT_ALTERNATE_OBJECT_DIRECTORIES",
    "GIT_NAMESPACE", "GIT_PREFIX",
)


class BundleError(Exception):
    pass


def git(target, *args, env, data=None):
    result = subprocess.run(
        ["git", "-C", target, *args], input=data, stdout=subprocess.PIPE,
        stderr=subprocess.PIPE, check=False, env=env,
    )
    if result.returncode:
        raise BundleError(f"Git step failed ({args[0]}). Verify the checkout and Git version.")
    return result.stdout


def safe_path(path):
    parts = path.split("/")
    if not all(part not in ("", ".", "..") and part.casefold() != ".git" for part in parts):
        raise BundleError("Invalid path in redaction inventory.")
    if PurePosixPath(path).is_absolute() or any(ord(char) < 32 for char in path):
        raise BundleError("Invalid path in redaction inventory.")
    return path


def clean_checkout(target, base, env):
    if Path(os.fsdecode(git(target, "rev-parse", "--show-toplevel", env=env).rstrip(b"\n"))) != target:
        raise BundleError("Specify the root of a clean checkout.")
    head = git(target, "rev-parse", "HEAD", env=env).decode().strip()
    if head != base:
        raise BundleError(f"Expected baseline {base}. Use a separate checkout at that commit.")
    status = git(target, "status", "--porcelain=v1", "--untracked-files=all", "--ignored=matching", "-z", env=env)
    if status:
        raise BundleError("The checkout has working tree changes or additional files.")
    files = git(target, "ls-files", "-v", "-z", env=env)
    if any(not entry.startswith(b"H ") for entry in files.split(b"\0") if entry):
        raise BundleError("Use a full checkout with standard Git index flags.")
    for operation in ("MERGE_HEAD", "CHERRY_PICK_HEAD", "REVERT_HEAD", "rebase-merge", "rebase-apply", "sequencer"):
        path = git(target, "rev-parse", "--path-format=absolute", "--git-path", operation, env=env)
        if Path(os.fsdecode(path.rstrip(b"\n"))).exists():
            raise BundleError("Use a checkout without an active Git operation.")


def redact(target, plan, env):
    entries = {}
    for record in git(target, "ls-files", "--stage", "-z", env=env).split(b"\0"):
        if record:
            fields, path = record.split(b"\t", 1)
            entries[path.decode()] = fields.decode().split()[:2]
    changes = []
    for path, ranges in plan["edits"].items():
        path = safe_path(path)
        if path not in entries or entries[path][0] not in ("100644", "100755"):
            raise BundleError(f"Expected a tracked text file at {path}.")
        mode, blob = entries[path]
        raw = git(target, "cat-file", "blob", blob, env=env).decode("utf-8")
        cursor = 0
        chunks = []
        for start, end, replacement in ranges:
            if not cursor <= start <= end <= len(raw):
                raise BundleError(f"Invalid text range at {path}.")
            chunks.append(raw[cursor:start])
            chunks.append(replacement)
            cursor = end
        chunks.append(raw[cursor:])
        contents = "".join(chunks).encode()
        oid = git(target, "hash-object", "-w", "--stdin", data=contents, env=env).decode().strip()
        changes.append(f"{mode} {oid}\t{path}\0")
    for path in plan["remove"]:
        path = safe_path(path)
        if path not in entries or path in plan["edits"]:
            raise BundleError(f"Expected a tracked evidence file at {path}.")
        changes.append(f"0 {'0' * len(entries[path][1])}\t{path}\0")
    for path, contents in plan["add"].items():
        path = safe_path(path)
        if path in entries:
            raise BundleError(f"Expected a new reference file at {path}.")
        oid = git(target, "hash-object", "-w", "--stdin", data=contents.encode(), env=env).decode().strip()
        changes.append(f"100644 {oid}\t{path}\0")
    git(target, "update-index", "-z", "--index-info", data="".join(changes).encode(), env=env)


def patch_bundle(target, apply):
    plan = json.loads((PATCHES / "0001-private-data.json").read_text(encoding="utf-8"))
    base = plan["base"]
    if not re.fullmatch(r"[0-9a-f]{40}", base):
        raise BundleError("Invalid baseline in redaction inventory.")
    env = {key: value for key, value in os.environ.items() if key not in GIT_ROUTING}
    env["GIT_OPTIONAL_LOCKS"] = "0"
    clean_checkout(target, base, env)
    with tempfile.TemporaryDirectory(prefix="bakasun-privacy-") as folder:
        temporary = Path(folder)
        index_env = {**env, "GIT_INDEX_FILE": str(temporary / "index")}
        if not apply:
            objects = git(target, "rev-parse", "--path-format=absolute", "--git-path", "objects", env=env)
            overlay = temporary / "objects"
            (overlay / "info").mkdir(parents=True)
            (overlay / "info" / "alternates").write_bytes(objects)
            index_env["GIT_OBJECT_DIRECTORY"] = str(overlay)
        git(target, "read-tree", base, env=index_env)
        redact(target, plan, index_env)
        patches = sorted(PATCHES.glob("[0-9][0-9][0-9][0-9]-*.patch"))
        if not patches:
            raise BundleError("The text patches are missing.")
        for path in patches:
            try:
                git(target, "apply", "--cached", "--unidiff-zero", "--whitespace=error-all", str(path), env=index_env)
            except BundleError as error:
                raise BundleError(f"Patch failed validation: {path.name}") from error
        tree = git(target, "write-tree", env=index_env).decode().strip()
        count = len([p for p in git(target, "diff", "--no-renames", "--name-only", "-z", base, tree, env=index_env).split(b"\0") if p])
        if apply:
            clean_checkout(target, base, env)
            git(target, "read-tree", "-m", "-u", base, tree, env=env)
    print(f"{'Staged' if apply else 'Verified'} {count} paths at baseline {base}.")


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    mode = cli.add_mutually_exclusive_group(required=True)
    mode.add_argument("--check", action="store_true", help="validate using a temporary index and object store")
    mode.add_argument("--apply", action="store_true", help="stage the validated changes in the clean checkout")
    cli.add_argument("checkout", type=Path, help="root of the checkout at the pinned baseline")
    args = cli.parse_args()
    try:
        patch_bundle(args.checkout.resolve(), args.apply)
    except BundleError as error:
        cli.exit(1, f"{error}\n")
    except (OSError, UnicodeError, ValueError, TypeError, KeyError):
        cli.exit(1, "The checkout or the patch bundle could not be read.\n")


if __name__ == "__main__":
    main()
