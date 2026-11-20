import json
import re
import subprocess
import sys
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path

root = Path(sys.argv[1])
island = "workout/island/"
catalog = island + "data/strings.he.json"
control_paths = [island + f"design/controls/{game}.json" for game in ("alpine", "hoops", "soccer")]
strict_json = {catalog, island + "offline-manifest.json", island + "minigames/boar-island/source.json"}
additions = {"equipment.nameRank", "equipment.buyShort", "equipment.ownedShort"}
marker = re.compile(r"{([A-Za-z][A-Za-z0-9_.-]*)}")
exclamation = re.compile(r"[!！﹗❗❕‼⁉]")
arabic = re.compile(r"[\u0600-\u06ff\u0750-\u077f\u0870-\u089f\u08a0-\u08ff\ufb50-\ufdff\ufe70-\ufeff\U00010ec0-\U00010eff\U0001ee00-\U0001eeff]")


def unique(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f"duplicate JSON key {key!r}")
        result[key] = value
    return result


def invalid_constant(value):
    raise ValueError(f"invalid JSON constant {value}")


def parse(text, source, *, check_duplicates=True):
    try:
        return json.loads(text, object_pairs_hook=unique if check_duplicates else None,
                          parse_constant=invalid_constant)
    except ValueError as error:
        raise AssertionError(f"{source}: {error}") from error


def git(*arguments):
    return subprocess.check_output(["git", "-C", str(root), *arguments], encoding="utf-8")


def check_text(value, source):
    assert not arabic.search(value), f"Arabic script in {source}: {value!r}"
    assert not exclamation.search(value), f"exclamation in {source}: {value!r}"


def walk(value, source):
    if isinstance(value, str):
        check_text(value, source)
    elif isinstance(value, dict):
        for key, child in value.items():
            walk(child, f"{source}.{key}")
    elif isinstance(value, list):
        for index, child in enumerate(value):
            walk(child, f"{source}[{index}]")


def json_shape(value):
    if isinstance(value, dict):
        return {key: json_shape(child) for key, child in value.items()}
    if isinstance(value, list):
        return [json_shape(child) for child in value]
    return type(value)


class VisibleHTML(HTMLParser):
    def __init__(self, source):
        super().__init__(convert_charrefs=True)
        self.source = source
        self.ignored = None

    def check(self, value):
        check_text(value, f"{self.source}:{self.getpos()[0]}")

    def handle_starttag(self, tag, attrs):
        if tag in {"script", "style"}:
            self.ignored = tag
        attrs = dict(attrs)
        for key in ("title", "alt", "aria-label", "aria-description", "placeholder"):
            if attrs.get(key):
                self.check(attrs[key])
        if tag == "meta" and (attrs.get("name") == "description" or
                              attrs.get("property") in {"og:title", "og:description"}):
            if attrs.get("content"):
                self.check(attrs["content"])

    def handle_endtag(self, tag):
        if tag == self.ignored:
            self.ignored = None

    def handle_data(self, data):
        if not self.ignored:
            self.check(data)


before = parse(git("show", f"HEAD:{catalog}"), "baseline catalog")
after = parse((root / catalog).read_text(encoding="utf-8"), catalog)
assert after.keys() == before.keys() | additions, (
    f"missing: {before.keys()-after.keys()}, extra: {after.keys()-before.keys()-additions}"
)
for key, value in after.items():
    assert isinstance(value, str) and value.strip(), f"missing string for {key}"
    if key in before:
        assert Counter(marker.findall(value)) == Counter(marker.findall(before[key])), (
            f"changed placeholders for {key}: {value!r}"
        )

for path in control_paths:
    baseline = parse(git("show", f"HEAD:{path}"), f"baseline {path}")
    current = parse((root / path).read_text(encoding="utf-8"), path)
    assert json_shape(current) == json_shape(baseline), f"changed keys or types in {path}"
    walk(current, path)

excluded = {"assets", "design", "vendor", "tools", "tests", "notes", "verification"}
scanned = Counter()
for file in git("ls-files", "-z", island).split("\0"):
    if not file or excluded.intersection(Path(file).relative_to(island).parts[:-1]):
        continue
    path = root / file
    suffix = path.suffix
    if suffix in {".json", ".webmanifest"}:
        walk(parse(path.read_text(encoding="utf-8"), file,
                   check_duplicates=file in strict_json), file)
    elif suffix == ".html":
        VisibleHTML(file).feed(path.read_text(encoding="utf-8"))
    elif suffix == ".css":
        for literal in re.finditer(r"""\bcontent\s*:\s*(['"])(.*?)\1""", path.read_text(encoding="utf-8")):
            check_text(literal[2], file)
    else:
        continue
    scanned[suffix] += 1

print(f"{len(before)} existing catalog keys preserved, {len(additions)} added, "
      f"{sum(scanned.values()) + len(control_paths)} JSON/HTML/CSS files checked.")
