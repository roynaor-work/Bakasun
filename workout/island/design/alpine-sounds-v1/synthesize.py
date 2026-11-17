#!/usr/bin/env python3
"""Original Alpine SFX. Python 3.10+, NumPy, FFmpeg (libvorbis/libmp3lame).

Run without arguments to rebuild; --check verifies delivered files without writes.
All persistent output stays beside this script. Intermediates use TemporaryDirectory.
No recordings, downloaded samples, network access, or pre-existing game audio.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
import re
import subprocess
import tempfile

import numpy as np

ROOT = Path(__file__).resolve().parent
SR = 44100
TARGET = -18.0
MAX_BYTES = 40000  # Decimal KB, also satisfies 40 KiB.
TOLERANCE = 0.15
SEED = 20261117
SPECS = [
    ("star-pickup", "איסוף כוכב", .48, "star", "שני נצנוצי זכוכית עולים, בהירים וקצרים.", -3, 65),
    ("magnet-pickup", "איסוף כוח — מגנט", .80, "power", "משיכת FM עולה עם רטט מגנטי וסיום זוהר.", -2, 180),
    ("shield-on", "מגן נדלק", .80, "shieldOn", "מעטפת צליל מתרחבת עם אקורד יציב.", -2, 180),
    ("shield-break", "מגן נשבר", .72, "shieldBreak", "התפרקות מעטפת לשלושה שברי זכוכית יורדים.", -1, 180),
    ("section-bell", "כניסה לקטע חדש", .68, "section", "פעמון אלפיני קצר עם צלילים עיליים לא הרמוניים.", -2, 500),
    ("brake-scrape-loop", "שפשוף בלימה — לולאה", 1.60, "brake", "חיכוך גרגירי בשלג, רשרוש רחב ורטט מגלשיים.", -9, 0),
    ("landing", "נחיתה", .48, "land", "דחיסת שלג רכה ונמוכה עם התזת אבקה.", -2, 100),
    ("snowball-hit", "פגיעה בכדור שלג", .52, "snowballHit", "פוף של שלג דחוס המתפורר לאבקה.", -2, 120),
    ("ice-collision", "התנגשות בקרח", .76, "iceHit", "מכה קשיחה, סדק גבישי ותהודה נמוכה.", -1, 180),
    ("star-rain", "גשם כוכבים", 1.84, "starRain", "מטר מדורג של נצנוצים בסולם פנטטוני.", -4, 900),
]


def run(*args: str) -> subprocess.CompletedProcess:
    return subprocess.run(args, check=True, capture_output=True)


def timebase(seconds: float) -> np.ndarray:
    return np.arange(round(seconds * SR), dtype=np.float64) / SR


def envelope(t: np.ndarray, attack: float, decay: float) -> np.ndarray:
    return (1 - np.exp(-t / attack)) ** 2 * np.exp(-t / decay)


def noise(n: int, rng: np.random.Generator, low: float, high: float) -> np.ndarray:
    """Band-limited, circular noise; DC and Nyquist bins are explicitly zero."""
    freq = np.fft.rfftfreq(n, 1 / SR)
    shape = (1 - np.exp(-(freq / low) ** 4)) * np.exp(-(freq / high) ** 6)
    shape[0] = shape[-1] = 0
    result = np.fft.irfft(np.fft.rfft(rng.standard_normal(n)) * shape, n=n)
    return result / max(np.std(result), 1e-12)


def add_bell(out: np.ndarray, start: float, frequency: float, level: float,
             decay: float = .12, metallic: bool = False) -> None:
    offset = round(start * SR)
    t = np.arange(len(out) - offset) / SR
    ratios = (1, 2.71, 4.07) if metallic else (1, 2, 3.01)
    partials = sum(a * np.sin(2 * np.pi * frequency * r * t)
                   * np.exp(-t / (decay / (1 + i * .65)))
                   for i, (r, a) in enumerate(zip(ratios, (1, .23, .08))))
    out[offset:] += level * partials * (1 - np.exp(-t / .0035)) ** 2


def render(index: int) -> np.ndarray:
    name, _, seconds, *_ = SPECS[index]
    rng = np.random.default_rng(SEED + index)
    t = timebase(seconds)
    out = np.zeros_like(t)
    if name == "star-pickup":
        add_bell(out, .018, 1567.98, .72, .080)
        add_bell(out, .100, 2349.32, .58, .085)
    elif name == "magnet-pickup":
        f = 260 + 1050 * np.minimum(t / .43, 1) ** .8
        phase = 2 * np.pi * np.cumsum(f) / SR
        out = np.sin(phase + 1.8 * np.exp(-t / .23) * np.sin(phase * 1.5))
        out *= envelope(t, .018, .19) * (.85 + .15 * np.cos(2 * np.pi * 24 * t))
        add_bell(out, .34, 1567.98, .22, .11)
    elif name == "shield-on":
        phase = 2 * np.pi * (220 * t + 190 * .09 * (1 - np.exp(-t / .09)))
        out = .45 * np.sin(phase + .9 * np.sin(phase * 2)) * envelope(t, .018, .20)
        for f in (587.33, 880, 1174.66):
            add_bell(out, .10, f, .19, .15)
        out += .045 * noise(len(t), rng, 1100, 4700) * envelope(t, .04, .13)
    elif name == "shield-break":
        out = .19 * noise(len(t), rng, 1500, 6500) * envelope(t, .004, .055)
        for start, f in ((.018, 2093), (.070, 1479.98), (.130, 987.77)):
            add_bell(out, start, f, .27, .082, True)
        out += .22 * np.sin(2 * np.pi * (180 * t + 70 * .07 * (1 - np.exp(-t / .07)))) * envelope(t, .008, .075)
    elif name == "section-bell":
        add_bell(out, .018, 1046.50, .85, .14, True)
        add_bell(out, .024, 523.25, .12, .11)
    elif name == "brake-scrape-loop":
        body = noise(len(t), rng, 340, 4300)
        grit = noise(len(t), rng, 2200, 6800)
        slow = .84 + .10 * np.cos(2 * np.pi * 3 * t / seconds) + .06 * np.sin(2 * np.pi * 7 * t / seconds)
        grains = .78 + .22 * np.cos(2 * np.pi * 79 * t / seconds) ** 2
        out = .30 * body * slow + .085 * grit * grains
        out += .035 * np.sin(2 * np.pi * 308 * t / seconds) * slow
    elif name == "landing":
        phase = 2 * np.pi * (65 * t + 80 * .032 * (1 - np.exp(-t / .032)))
        out = .76 * np.sin(phase) * envelope(t, .005, .065)
        out += .22 * noise(len(t), rng, 160, 2500) * envelope(t, .005, .048)
        out += .065 * noise(len(t), rng, 1800, 5200) * envelope(t, .014, .055)
    elif name == "snowball-hit":
        out = .42 * noise(len(t), rng, 260, 2200) * envelope(t, .005, .042)
        out += .27 * np.sin(2 * np.pi * 135 * t) * envelope(t, .004, .043)
        out += .10 * noise(len(t), rng, 1100, 5500) * envelope(t, .017, .070)
    elif name == "ice-collision":
        out = .25 * noise(len(t), rng, 1400, 7600) * envelope(t, .003, .036)
        out += .52 * np.sin(2 * np.pi * (85 * t + 120 * .025 * (1 - np.exp(-t / .025)))) * envelope(t, .004, .065)
        for start, f in ((.008, 739.99), (.040, 1975.53), (.080, 2793.83)):
            add_bell(out, start, f, .21, .095, True)
    elif name == "star-rain":
        notes = [1567.98, 1318.51, 1174.66, 987.77, 880, 783.99]
        for i in range(17):
            start = .018 + i * .082 + rng.uniform(0, .015)
            f = notes[i % len(notes)] * (2 if i % 4 == 0 else 1)
            add_bell(out, start, f, .23 + .10 * rng.random(), .085)
        out += .018 * noise(len(t), rng, 2100, 6500) * envelope(t, .18, .38)
    else:
        raise ValueError(name)

    # Bounded soft compression keeps impact crest factors comfortable at -18 LUFS.
    drive = 2.4 if name in ("landing", "snowball-hit", "ice-collision") else 1.45
    out = np.tanh(out * drive)
    # Remove DC before applying smooth boundary windows. A 6 ms guard at each
    # one-shot edge also absorbs lossy-codec pre/post ringing.
    out -= np.mean(out)
    if name == "brake-scrape-loop":
        # 8 ms cosine shoulders: no silent padding, no encoder-edge click.
        count = round(.008 * SR)
        ramp = np.sin(np.linspace(0, np.pi / 2, count)) ** 2
        out[:count] *= ramp
        out[-count:] *= ramp[::-1]
    else:
        guard, fade = round(.006 * SR), round(.025 * SR)
        out[:guard] = out[-guard:] = 0
        ramp = np.sin(np.linspace(0, np.pi / 2, fade)) ** 2
        out[guard:guard + fade] *= ramp
        out[-guard - fade:-guard] *= ramp[::-1]
    return out / max(np.max(np.abs(out)), 1e-12) * .65


def measure(path: Path) -> dict:
    result = run("ffmpeg", "-hide_banner", "-nostats", "-i", str(path), "-af",
                 "loudnorm=I=-18:TP=-1:LRA=11:print_format=json", "-f", "null", "-")
    match = re.search(r'\{\s*"input_i".*?\}', result.stderr.decode(), re.S)
    if not match:
        raise RuntimeError(f"No loudness measurement: {path}")
    raw = json.loads(match.group())
    values = {"integrated_lufs": float(raw["input_i"]), "true_peak_dbtp": float(raw["input_tp"])}
    if not all(math.isfinite(v) for v in values.values()):
        raise ValueError(f"Non-finite loudness: {path}")
    return values


def decode(path: Path) -> np.ndarray:
    result = run("ffmpeg", "-v", "error", "-i", str(path), "-f", "f32le", "-acodec", "pcm_f32le", "-ar", str(SR), "-ac", "1", "-")
    return np.frombuffer(result.stdout, dtype="<f4")


def db(value: float) -> float:
    return round(20 * math.log10(max(float(value), 1e-12)), 2)


def metadata(path: Path, loop: bool) -> dict:
    probe = json.loads(run("ffprobe", "-v", "error", "-show_streams", "-of", "json", str(path)).stdout)
    stream = probe["streams"][0]
    pcm = decode(path)
    # Vorbis may expose a sub-frame tail depending on decoder. Browser-specific
    # decoded lengths are checked separately; durations below are actual FFmpeg PCM.
    edges = np.concatenate((pcm[:44], pcm[-44:]))
    result = {
        "file": path.name,
        "mime": "audio/ogg" if path.suffix == ".ogg" else "audio/mpeg",
        "codec": stream["codec_name"],
        "bytes": path.stat().st_size,
        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        "sample_rate_hz": int(stream["sample_rate"]),
        "channels": int(stream["channels"]),
        "decoded_samples": len(pcm),
        "decoded_duration_seconds": round(len(pcm) / SR, 6),
        **measure(path),
        "edge_1ms_peak_dbfs": db(np.max(np.abs(edges))),
        "boundary_step_dbfs": db(abs(float(pcm[0]) - float(pcm[-1]))),
        "dc_offset": round(float(np.mean(pcm)), 8),
    }
    validate(result, pcm, loop)
    return result


def validate(info: dict, pcm: np.ndarray, loop: bool) -> None:
    assert 0 < info["bytes"] <= MAX_BYTES, info
    assert abs(info["integrated_lufs"] - TARGET) <= TOLERANCE, info
    assert info["true_peak_dbtp"] <= -1.0, info
    assert info["channels"] == 1 and info["sample_rate_hz"] == SR, info
    assert len(pcm) > .4 * SR and np.all(np.isfinite(pcm)), info
    assert np.max(np.abs(pcm)) < 1, info
    assert info["edge_1ms_peak_dbfs"] <= (-40 if loop else -55), info
    assert info["boundary_step_dbfs"] <= -55, info
    assert abs(info["dc_offset"]) < .005, info


def build() -> None:
    sounds = []
    with tempfile.TemporaryDirectory(prefix="alpine-sounds-") as temp:
        raw = Path(temp) / "source.f32"
        for index, (name, label, seconds, cue, description, gain, cooldown) in enumerate(SPECS):
            pcm = render(index)
            pcm.astype("<f4").tofile(raw)
            # Measure source through a temporary WAV, then iterate on the actual
            # encoded output. Independent gains compensate each codec's changes.
            wav = Path(temp) / "source.wav"
            run("ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(SR), "-ac", "1", "-i", str(raw), str(wav))
            initial_gain = TARGET - measure(wav)["integrated_lufs"]
            formats = {}
            for extension, encoder in (("ogg", ("-c:a", "libvorbis", "-q:a", "4")),
                                       ("mp3", ("-c:a", "libmp3lame", "-b:a", "96k", "-write_xing", "1"))):
                path = ROOT / f"{name}.{extension}"
                gain_db = initial_gain
                for attempt in range(5):
                    run("ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(SR), "-ac", "1", "-i", str(raw),
                        "-af", f"volume={gain_db:.6f}dB", "-map_metadata", "-1", *encoder,
                        "-fflags", "+bitexact", str(path))
                    measured = measure(path)
                    error = TARGET - measured["integrated_lufs"]
                    if abs(error) <= .06:
                        break
                    gain_db += error
                formats[extension] = metadata(path, name == "brake-scrape-loop")
                print(f"{path.name}: {formats[extension]['bytes']} B, {measured['integrated_lufs']:.2f} LUFS", flush=True)
            sounds.append({
                "id": name, "label_he": label, "description_he": description,
                "suggested_cue": cue, "duration_seconds": seconds,
                "loop": name == "brake-scrape-loop",
                "loop_start_seconds": 0 if name == "brake-scrape-loop" else None,
                "loop_end_seconds": seconds if name == "brake-scrape-loop" else None,
                "recommended_gain_db": gain, "cooldown_ms": cooldown,
                "formats": formats,
            })
    manifest = {
        "schema_version": 1, "pack": "alpine-sounds-v1", "license": "CC0-1.0",
        "original_synthesis": True, "seed": SEED, "sample_rate_hz": SR, "channels": 1,
        "target_integrated_lufs": TARGET, "loudness_tolerance_lu": TOLERANCE,
        "max_file_bytes": MAX_BYTES, "true_peak_ceiling_dbtp": -1,
        "measurement": "FFmpeg loudnorm input_i/input_tp (BS.1770 / EBU R128), decoded delivery files; no dual-mono compensation",
        "loop_playback": "Decode to AudioBuffer; loop range [0, 1.6) seconds; 20 ms gain ramps on start/stop. Do not use an HTMLAudio ended handler for looping.",
        "recommended_gain_note": "Optional runtime mixing gains only; delivered files themselves measure -18 LUFS.",
        "toolchain": {
            "numpy": np.__version__,
            "ffmpeg": run("ffmpeg", "-version").stdout.decode().splitlines()[0],
        },
        "sounds": sounds,
    }
    (ROOT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    listen = ROOT / "listen.html"
    if listen.exists():
        html = listen.read_text(encoding="utf-8")
        embedded = json.dumps(manifest, ensure_ascii=False).replace("<", "\\u003c")
        html, count = re.subn(r'(?<=<script id="pack" type="application/json">).*?(?=</script>)',
                              lambda _: embedded, html, flags=re.S)
        assert count == 1, "Missing embedded manifest in listen.html"
        listen.write_text(html, encoding="utf-8")


def check() -> None:
    manifest = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
    assert len(manifest["sounds"]) == 10
    assert [s["id"] for s in manifest["sounds"]] == [s[0] for s in SPECS]
    expected_files = set()
    for sound in manifest["sounds"]:
        assert set(sound["formats"]) == {"ogg", "mp3"}
        for fmt, recorded in sound["formats"].items():
            assert recorded["file"] == f"{sound['id']}.{fmt}"
            path = ROOT / recorded["file"]
            expected_files.add(path.name)
            actual = metadata(path, sound["loop"])
            assert actual == recorded, (path.name, actual, recorded)
            # Vorbis one-shot tail accounting varies by up to a codec frame
            # between FFmpeg and browsers. The actual loop must be sample exact.
            tolerance = 1 / SR if sound["loop"] else .03
            assert abs(actual["decoded_duration_seconds"] - sound["duration_seconds"]) < tolerance
            print(f"PASS {path.name}", flush=True)
    actual_files = {p.name for p in ROOT.iterdir() if p.suffix in (".ogg", ".mp3")}
    assert actual_files == expected_files
    assert sum(s["loop"] for s in manifest["sounds"]) == 1
    embedded = re.search(r'<script id="pack" type="application/json">(.*?)</script>',
                         (ROOT / "listen.html").read_text(encoding="utf-8"), re.S)
    assert embedded and json.loads(embedded.group(1)) == manifest
    print("PASS 10 sounds / 20 encoded files; hashes, loudness, size, peaks, edges, duration, mono, sample rate.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="read-only verification of delivery files and manifest")
    args = parser.parse_args()
    check() if args.check else build()
