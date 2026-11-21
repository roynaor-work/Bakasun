#!/usr/bin/env python3
"""Build the local tennis callout sprites and raster artwork (Python, FFmpeg, Inkscape)."""

from __future__ import annotations

from array import array
from dataclasses import dataclass
from hashlib import sha256
import json
from math import cos, exp, pi, sin, sqrt, tanh, tau
from pathlib import Path
from random import Random
import shutil
import struct
import subprocess
import sys
import tempfile
import wave


ROOT = Path(__file__).resolve().parent
ASSETS = ROOT / "assets"
RATE = 24_000
BUDGET = 40_000
GAP_MS = 96
ART_SIZE = 256
CROWD_GAIN = 0.36
# Preserve peak headroom after decoding the lossy sprites.
MASTER_GAIN = 0.75


@dataclass(frozen=True)
class Voice:
    label: str
    pitch: float
    tempo: float
    strength: float


# The tuples are independent resonances of the synthetic vocal tract in Hz.
FORMANTS = {
    "a": (800, 1330, 2560, 3500),
    "u": (320, 830, 2260, 3270),
    "n": (285, 1450, 2400, 3300),
    "e": (590, 1850, 2590, 3450),
    "o": (460, 900, 2360, 3350),
    "aw": (540, 990, 2400, 3360),
    "l": (380, 1120, 2600, 3460),
    "v": (290, 1020, 2180, 3200),
}

# The falling pitch, changing vowel placement and articulation vary by take.
CALLS = {
    "out": ("אאוט", "OUT", "aʊt", 175, [
        Voice("חדה", 208, 0.92, 1.00),
        Voice("נמוכה", 174, 1.03, 0.93),
        Voice("מודגשת", 226, 1.12, 1.14),
    ]),
    "net": ("נט", "NET", "nɛt", 158, [
        Voice("קצרה", 198, 0.91, 1.00),
        Voice("נמוכה", 161, 1.04, 0.95),
        Voice("מודגשת", 216, 1.13, 1.14),
    ]),
    "good": ("טוב", "GOOD", "tov", 151, [
        Voice("קצרה", 185, 0.92, 1.00),
        Voice("עולה", 206, 1.02, 1.02),
        Voice("נמוכה", 160, 1.14, 0.96),
    ]),
    "fault": ("פולט", "FAULT", "fɔlt", 185, [
        Voice("קצרה", 170, 0.97, 1.00),
        Voice("מודגשת", 203, 1.11, 1.10),
    ]),
}

CROWD = {
    # count, duration, vowel sweep, pitch rise: separate reactions to each call
    "out": (8, 314, "aw", "u", -0.20),
    "net": (7, 277, "o", "u", -0.24),
    "good": (11, 334, "a", "u", 0.19),
    "fault": (8, 291, "aw", "o", -0.16),
}


def frames(ms):
    return round(ms * RATE / 1000)


def smooth(value):
    value = min(1.0, max(0.0, value))
    return value * value * (3 - 2 * value)


def lerp(start, end, fraction):
    return start + (end - start) * fraction


def envelope(index, length, attack_ms, release_ms):
    return smooth(index / frames(attack_ms)) * smooth((length - index - 1) / frames(release_ms))


class Resonator:
    """Two-pole band-pass with a continuously adjustable center frequency."""

    def __init__(self, bandwidth):
        self.radius = exp(-pi * bandwidth / RATE)
        self.previous = self.older = 0.0
        self.input_previous = self.input_older = 0.0

    def sample(self, source, frequency):
        radius = self.radius
        output = ((1 - radius) * (source - self.input_older)
                  + 2 * radius * cos(tau * frequency / RATE) * self.previous
                  - radius * radius * self.older)
        self.input_older, self.input_previous = self.input_previous, source
        self.older, self.previous = self.previous, output
        return output


class Throat:
    """A glottal pulse plus seeded aspiration through the moving formants."""

    def __init__(self, seed, size=1.0):
        self.rng = Random(seed)
        self.size = size
        self.phase = 0.24
        self.tract = [Resonator(width) for width in (115, 155, 225, 335)]
        self.previous_noise = 0.0

    def voice(self, ms, start_vowel, end_vowel, f0, end_pitch, gain, sweep_at=0.0, sweep_by=1.0,
              attack=11, release=20, placement=1.0):
        output = []
        start, end = FORMANTS[start_vowel], FORMANTS[end_vowel]
        weights = (1.28, .34, .25, .15) if start_vowel == "n" else (1.16, 1.33, .68, .27)
        length = frames(ms)
        for index in range(length):
            t = index / RATE
            progress = index / length
            morph = smooth((progress - sweep_at) / (sweep_by - sweep_at))
            accent = 1 + 0.095 * sin(pi * min(1.0, progress * 1.45))
            pitch = f0 * lerp(1, end_pitch, progress) * accent
            pitch *= 1 + 0.016 * sin(tau * 7.3 * t) + 0.007 * sin(tau * 29 * t)
            self.phase = (self.phase + tau * pitch / RATE) % tau
            # A sharp closing pulse carries harmonics high enough to excite F2/F3.
            pulse = 0.68 * sin(self.phase) + 0.29 * sin(2 * self.phase + 0.2)
            for harmonic in range(3, 19):
                pulse += sin(harmonic * self.phase + 0.08 * harmonic) * (0.7 / harmonic)
            noise = self.rng.uniform(-1, 1)
            excitation = pulse + (noise - self.previous_noise) * 0.12
            self.previous_noise = noise
            value = 0.0
            for band, low, high, weight in zip(self.tract, start, end, weights):
                frequency = lerp(low, high, morph) * self.size * placement
                value += band.sample(excitation, frequency) * weight
            output.append(value * gain * envelope(index, length, attack, release))
        return output

    def breath(self, ms, band_center, bandwidth, gain, attack, release):
        resonator = Resonator(bandwidth)
        length = frames(ms)
        output = []
        for index in range(length):
            noise = self.rng.uniform(-1, 1)
            filtered = resonator.sample(noise - 0.72 * self.previous_noise, band_center)
            self.previous_noise = noise
            output.append(filtered * gain * envelope(index, length, attack, release))
        return output


def call_wave(kind, voice, seed):
    throat = Throat(seed, 1 + (voice.pitch - 190) * 0.00105)
    tempo, strength, pitch = voice.tempo, voice.strength, voice.pitch

    def vowel(ms, start, end, pitch_scale, bend, gain, **shape):
        return throat.voice(ms * tempo, start, end, pitch * pitch_scale, bend, gain, **shape)

    def t_release(gain, ms=33):
        return throat.breath(ms * tempo, 4050, 2550, gain, 1.3, 21)

    closure = [0.0] * frames(19 * tempo)
    if kind == "out":
        spoken = vowel(235, "a", "u", 1.0, .77, 1.0, sweep_at=.26, sweep_by=.84)
        spoken += closure + t_release(.67)
    elif kind == "net":
        spoken = vowel(54, "n", "n", .84, 1.12, .50, attack=8, release=6)
        spoken += vowel(163, "e", "e", 1.06, .78, 1.0, attack=5, placement=1.04)
        spoken += closure + t_release(.68)
    elif kind == "good":
        spoken = t_release(.68, 31) + [0.0] * frames(5)
        bend = 1.05 if voice.label == "עולה" else .83
        spoken += vowel(174, "o", "o", .97, bend, 1.0, attack=7, release=11)
        voiced_v = vowel(70, "v", "v", .84, .84, .40, attack=4, release=28)
        friction = throat.breath(70 * tempo, 1780, 2300, .48, 4, 28)
        spoken += [buzz + air for buzz, air in zip(voiced_v, friction)]
    else:
        spoken = throat.breath(63 * tempo, 2470, 3350, .73, 5, 15)
        spoken += vowel(160, "aw", "aw", 1.0, .83, 1.0, attack=5, release=12)
        spoken += vowel(54, "l", "l", .82, .88, .61, attack=5, release=14)
        spoken += closure + t_release(.68)

    # Light compression and early reflections suggest a raised voice on an open court.
    spoken = [tanh(sample * 2.8 * strength) for sample in spoken]
    return room(spoken, [(13, .12), (28, .089), (43, .055)])


def room(dry, reflections):
    wet = dry + [0.0] * frames(reflections[-1][0])
    for ms, gain in reflections:
        offset = frames(ms)
        reflection = 0.0
        for index, sample in enumerate(dry, offset):
            reflection += (sample - reflection) * .24
            wet[index] += gain * reflection
    return wet


def normalize(samples, peak):
    scale = peak / max(map(abs, samples))
    return [sample * scale for sample in samples]


def crowd_wave(kind, seed):
    count, ms, start, end, rise = CROWD[kind]
    rng = Random(seed)
    group = [0.0] * frames(ms)
    for index in range(count):
        delay = index * rng.uniform(7.5, 9.2)
        duration = ms - delay - rng.uniform(47, 82)
        member = Throat(seed + 13 * (index + 1), rng.uniform(.87, 1.16))
        shout = member.voice(duration, start, end, rng.uniform(112, 308), 1 + rise,
                             rng.uniform(.55, 1.0), sweep_at=.24, sweep_by=.92,
                             attack=rng.uniform(20, 49), release=rng.uniform(45, 68))
        for position, sample in enumerate(shout, frames(delay)):
            group[position] += sample / sqrt(count)
    filtered = 0.0
    for index, sample in enumerate(group):
        filtered += (sample - filtered) * .25
        group[index] = tanh(filtered * 2)
    return normalize(room(group, [(19, .20), (34, .12), (54, .08)]), .59)


def with_crowd(voice, crowd, delay_ms):
    delay = frames(delay_ms)
    mixed = voice + [0.0] * max(0, delay + len(crowd) - len(voice))
    for index, value in enumerate(crowd, delay):
        mixed[index] += value * CROWD_GAIN
    return mixed


def assemble():
    timeline = [0.0] * frames(32)  # Encoder warm-up before the first exposed interval.
    events = {}
    crowds = {kind: crowd_wave(kind, 5400 + 103 * index) for index, kind in enumerate(CALLS)}

    def append(clip_id, samples, **metadata):
        start_ms = round(len(timeline) * 1000 / RATE)
        pad = frames(start_ms) - len(timeline)
        if pad < 0:
            start_ms += 1
            pad = frames(start_ms) - len(timeline)
        timeline.extend([0.0] * pad)
        timeline.extend(samples)
        duration_ms = (len(samples) + frames(1) - 1) // frames(1)
        end_ms = start_ms + duration_ms
        timeline.extend([0.0] * (frames(end_ms + GAP_MS) - len(timeline)))
        return dict(id=clip_id, startMs=start_ms, endMs=end_ms, durationMs=duration_ms, **metadata)

    for index, (kind, (hebrew, title, ipa, delay, voices)) in enumerate(CALLS.items()):
        takes = []
        for number, voice in enumerate(voices, 1):
            dry = normalize(call_wave(kind, voice, 1701 + 17 * index + number),
                            .70 + .06 * (voice.strength - 1))
            take = with_crowd(dry, crowds[kind], delay)
            takes.append(append(f"{kind}-{number:02}", take, label=voice.label, crowdOffsetMs=delay))
        events[kind] = dict(label=hebrew, display=title, pronunciation=ipa, takes=takes)
    for kind, samples in crowds.items():
        events[kind]["crowd"] = append(f"crowd-{kind}", samples)
    return [sample * MASTER_GAIN for sample in timeline], events


def write_wave(path, timeline):
    data = array("h", (round(min(1, max(-1, value)) * 32767) for value in timeline))
    if sys.byteorder != "little":
        data.byteswap()
    with wave.open(str(path), "wb") as pcm:
        pcm.setparams((1, 2, RATE, 0, "NONE", "not compressed"))
        pcm.writeframes(data.tobytes())


def run(command):
    result = subprocess.run([str(item) for item in command], capture_output=True, text=True)
    if result.returncode:
        raise SystemExit(result.stderr or result.stdout or f"{command[0]} failed.")


def entry(path):
    content = path.read_bytes()
    return dict(file=f"assets/{path.name}", bytes=len(content), sha256=sha256(content).hexdigest())


def encode(ffmpeg, pcm, target, encoder):
    run([ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-i", pcm, "-map_metadata", "-1",
         "-fflags", "+bitexact", "-flags:a", "+bitexact", *encoder, target])


def build():
    ffmpeg = shutil.which("ffmpeg")
    inkscape = shutil.which("inkscape")
    if not ffmpeg or not inkscape:
        raise SystemExit("Required build tools: FFmpeg (libopus, libmp3lame) and Inkscape.")
    timeline, events = assemble()
    with tempfile.TemporaryDirectory(prefix="tennis-callouts-") as temp:
        scratch = Path(temp)
        pcm = scratch / "callouts.wav"
        write_wave(pcm, timeline)
        ogg = scratch / "callouts.ogg"
        mp3 = scratch / "callouts.mp3"
        encode(ffmpeg, pcm, ogg, ["-c:a", "libopus", "-application", "audio",
                                  "-b:a", "17k", "-vbr", "constrained"])
        encode(ffmpeg, pcm, mp3, ["-c:a", "libmp3lame", "-b:a", "16k", "-ar", "24000"])
        total = ogg.stat().st_size + mp3.stat().st_size
        if total > BUDGET:
            raise SystemExit(f"Audio budget exceeded: {total:,} > {BUDGET:,} bytes.")

        def art(name):
            svg = ASSETS / f"{name}.svg"
            png = scratch / f"{name}.png"
            run([inkscape, svg, f"--export-filename={png}", "--export-area-page",
                 f"--export-width={ART_SIZE}", f"--export-height={ART_SIZE}"])
            width, height = struct.unpack(">II", png.read_bytes()[16:24])
            if (width, height) != (ART_SIZE, ART_SIZE):
                raise SystemExit(f"Unexpected size for {png.name}: {width}×{height}")
            return dict(svg=entry(svg), png=entry(png))

        styles = {
            "club": dict(label="מועדון", textAnchor=[.586, .492], labelColors={"out": "#411c18", "net": "#102e2b"}),
            "score": dict(label="לוח תוצאות", textAnchor=[.586, .492], labelColors={"out": "#ffe5de", "net": "#d4ffed"}),
        }
        for style, design in styles.items():
            design["signs"] = {kind: art(f"{kind}-{style}") for kind in ("out", "net")}
        flash = art("line-flash")
        for path in scratch.iterdir():
            if path.suffix in {".ogg", ".mp3", ".png"}:
                shutil.copyfile(path, ASSETS / path.name)

    manifest = {
        "id": "tennis-callouts-v1",
        "version": 1,
        "license": "CC0-1.0",
        "audio": {
            "pcmSampleRateHz": RATE,
            "channels": 1,
            "spriteDurationMs": round(len(timeline) * 1000 / RATE),
            "gapMs": GAP_MS,
            "maxBytes": BUDGET,
            "totalBytes": total,
            "formats": {
                "ogg": dict(mime="audio/ogg; codecs=opus", sampleRateHz=48_000,
                            **entry(ASSETS / ogg.name)),
                "mp3": dict(mime="audio/mpeg", sampleRateHz=RATE, **entry(ASSETS / mp3.name)),
            },
            "events": events,
        },
        "visuals": {
            "textureSize": [ART_SIZE, ART_SIZE],
            "styles": styles,
            "lineFlash": dict(center=[.5, .5], durationMs=340, **flash),
        },
        "preview": {"width": 844, "height": 390},
    }
    data = json.dumps(manifest, ensure_ascii=False, indent=2)
    (ROOT / "manifest.json").write_text(data + "\n", encoding="utf-8")
    # Classic local script for the two file:// previews, which need no fetch.
    (ASSETS / "manifest.js").write_text(
        "// Generated by synthesize.py.\nwindow.tennisCallouts = " + data + ";\n", encoding="utf-8"
    )
    print(f"Audio: {total:,}/{BUDGET:,} bytes. Built 5 PNGs and the manifest.")


if __name__ == "__main__":
    build()
