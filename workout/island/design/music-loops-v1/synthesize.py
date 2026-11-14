#!/usr/bin/env python3
"""Original, deterministic additive synthesis. No samples, MIDI, fonts or downloads.

Build: python3 synthesize.py
Audit shipped files: python3 synthesize.py --verify-only
Requires Python 3.11+, NumPy, SciPy, FFmpeg (libvorbis/libmp3lame), ffprobe.
All persistent output stays beside this script. Temporary PCM is not committed.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import subprocess
import tempfile
from pathlib import Path

import numpy as np
from scipy.io import wavfile
from scipy.signal import welch

ROOT = Path(__file__).resolve().parent
SR = 32000
TARGET = -18.0
MAX_BYTES = 600_000  # decimal KB, deliberately stricter than 600 KiB
MAJOR = (0, 2, 4, 5, 7, 9, 11)
PENT = (0, 2, 4, 7, 9)

# Each eight-bar phrase has a separately authored contour and rhythmic fingerprint.
# Notes are relative to a major pentatonic scale, rather than a borrowed tune.
GAMES = [
    dict(id="soccer", name="כדורגל", title="מסירות בשמש", bpm=112, root=60,
         lead="wood", chord="pluck", bass="round", groove="hand",
         progression=[0, 3, 4, 0, 5, 3, 4, 4],
         motif=[2, 4, 1, 3, 2, 0, 4, 3, 5, 2, 4, 1, 3, 0, 2, 1],
         rhythm=[0, 1.5, 2.5], description="מרימבה חמימה, בס קופצני ותופי יד"),
    dict(id="hoops", name="כדורסל", title="קפיצה לפרקט", bpm=108, root=63,
         lead="tine", chord="keys", bass="round", groove="bounce",
         progression=[0, 5, 3, 4, 0, 3, 1, 4],
         motif=[1, 3, 4, 2, 5, 3, 0, 2, 4, 1, 3, 5, 2, 0, 3, 1],
         rhythm=[0.5, 1.75, 3], description="קלידים עגולים, סווינג קל ובס גמיש"),
    dict(id="tennis", name="טניס", title="הלוך וחבוט", bpm=116, root=62,
         lead="pluck", chord="wood", bass="round", groove="rally",
         progression=[0, 4, 3, 0, 1, 3, 0, 4],
         motif=[4, 1, 3, 0, 2, 5, 3, 1, 4, 2, 0, 3, 5, 1, 2, 4],
         rhythm=[0, 1.25, 2.75], description="פריטות קצרות ודיאלוג צלילים כמו חילופי חבטות"),
    dict(id="racing", name="מרוצים", title="סיבוב כתום", bpm=128, root=57,
         lead="softsynth", chord="keys", bass="pulse", groove="drive",
         progression=[0, 3, 5, 4, 0, 5, 3, 4],
         motif=[0, 3, 1, 4, 2, 5, 4, 1, 3, 5, 2, 0, 4, 2, 1, 3],
         rhythm=[0, 0.75, 2.5], description="סינתיסייזר רך, ארפג׳יו ופעימה יציבה"),
    dict(id="alpine", name="סקי", title="גלישה בענן", bpm=104, root=65, vorbis_quality=6,
         lead="air", chord="pad", bass="round", groove="glide",
         progression=[0, 3, 0, 4, 5, 3, 1, 4],
         motif=[5, 2, 4, 1, 3, 0, 2, 4, 3, 5, 1, 2, 4, 0, 3, 1],
         rhythm=[0.25, 1.5, 3], description="פעמונים נמוכים, כרית צליל אוורירית ותנועה גולשת"),
    dict(id="aliens", name="חלליות", title="כוכב סוכר", bpm=120, root=64,
         lead="tine", chord="softsynth", bass="pulse", groove="orbit",
         progression=[0, 5, 1, 4, 3, 0, 5, 4],
         motif=[3, 0, 4, 2, 5, 1, 4, 0, 2, 5, 3, 1, 0, 4, 2, 3],
         rhythm=[0, 1.5, 3.25], description="צלילי חלל עגולים וארפג׳יו נוצץ בעדינות"),
    dict(id="naval", name="ספינות", title="מפרש של חיוך", bpm=100, root=55,
         lead="reed", chord="pluck", bass="round", groove="sail",
         progression=[0, 4, 0, 3, 5, 1, 4, 4],
         motif=[2, 0, 3, 1, 4, 2, 5, 3, 1, 4, 0, 2, 3, 5, 1, 0],
         rhythm=[0, 4/3, 8/3], description="קנה רך, פריטות ותיפוף מתנדנד בשלישיות"),
    dict(id="fire", name="כיבוי אש", title="צוות של גיבורים", bpm=120, root=58,
         lead="wood", chord="reed", bass="round", groove="team",
         progression=[0, 3, 1, 4, 5, 0, 3, 4],
         motif=[1, 4, 2, 0, 3, 5, 1, 2, 4, 0, 5, 3, 2, 4, 1, 0],
         rhythm=[0, 1, 2.75], description="כלי הקשה מעץ, אקורדים חמימים ודחיפה מעודדת"),
    dict(id="police", name="תפוס את הפושע", title="צעד שובב", bpm=124, root=62,
         lead="reed", chord="pluck", bass="round", groove="sneak",
         progression=[0, 1, 3, 4, 5, 3, 0, 4],
         motif=[0, 2, 5, 1, 3, 4, 2, 0, 5, 3, 1, 4, 2, 5, 0, 1],
         rhythm=[0.25, 1.75, 3], description="פיציקטו שובב, קנה נמוך ומקצב מרדף ידידותי"),
    dict(id="boar", name="חזירים", title="מסיבת חוטמים", bpm=106, root=53,
         lead="wood", chord="reed", bass="reed", groove="hop",
         progression=[0, 3, 4, 1, 0, 5, 3, 4],
         motif=[3, 1, 0, 4, 2, 3, 5, 0, 1, 4, 3, 2, 0, 5, 2, 1],
         rhythm=[0, 1.67, 2.67], description="כלי עץ נמוכים, בס מצחיק וקפיצות קלות"),
]


def run(args: list[str], **kwargs) -> subprocess.CompletedProcess:
    return subprocess.run(args, check=True, capture_output=True, **kwargs)


def db(value: float) -> float:
    return float(20 * np.log10(max(float(value), 1e-15)))


def degree(root: int, index: int) -> int:
    return root + MAJOR[index % 7] + 12 * (index // 7)


def pent(root: int, index: int) -> int:
    return root + PENT[index % 5] + 12 * (index // 5)


def tone(midi: int, seconds: float, voice: str, velocity=1.0) -> np.ndarray:
    """Finite analytic voice with smooth attack/release; partials stop at 3.2 kHz."""
    n = max(2, round(seconds * SR))
    t = np.arange(n, dtype=np.float64) / SR
    freq = 440 * 2 ** ((midi - 69) / 12)
    partials = {
        "wood": [(1, 1), (2, .24), (3, .10)],
        "pluck": [(1, 1), (2, .34), (3, .13), (4, .035)],
        "tine": [(1, 1), (2, .13), (3, .06)],
        "keys": [(1, 1), (2, .22), (3, .07)],
        "reed": [(1, 1), (2, .16), (3, .24), (5, .035)],
        "air": [(1, 1), (2, .08), (3, .025)],
        "pad": [(1, 1), (2, .12), (3, .045)],
        "round": [(1, 1), (2, .20), (3, .055)],
        "pulse": [(1, 1), (2, .22), (3, .12), (4, .035)],
        "softsynth": [(1, 1), (2, .28), (3, .10), (4, .04)],
    }[voice]
    y = np.zeros(n)
    for harmonic, amplitude in partials:
        if freq * harmonic >= 3200:
            continue
        decay = np.exp(-t * (1.1 + harmonic * .28)) if voice != "pad" else 1
        y += amplitude * np.sin(2 * np.pi * freq * harmonic * t) * decay
    attack = .035 if voice in ("pad", "air") else .008
    release = min(seconds * .28, .18 if voice == "pad" else .09)
    envelope = np.minimum(t / attack, 1) ** 2
    envelope *= np.sin(np.minimum((seconds - t) / release, 1) * np.pi / 2) ** 2
    if voice in ("wood", "pluck", "tine"):
        envelope *= np.exp(-t * (4.5 if voice == "wood" else 2.4))
    return y * envelope * velocity


def drum(kind: str, rng: np.random.Generator) -> np.ndarray:
    seconds = dict(kick=.25, snare=.16, hat=.075, hand=.14, tom=.22)[kind]
    t = np.arange(round(seconds * SR)) / SR
    if kind == "kick":
        phase = 2 * np.pi * (57*t + 55 * .025 * (1 - np.exp(-t/.025)))
        y = np.sin(phase) * np.exp(-t * 21)
    elif kind in ("hand", "tom"):
        f = 235 if kind == "hand" else 142
        y = (np.sin(2*np.pi*f*t) + .28*np.sin(2*np.pi*f*1.51*t)) * np.exp(-t*29)
    else:
        noise = rng.normal(0, 1, len(t))
        f = np.fft.rfftfreq(len(t), 1/SR)
        # Soft shakers, never hiss/whistles. No noise energy above 3.6 kHz.
        spectral = np.exp(-((f - (1750 if kind == "hat" else 1000))/850)**4)
        spectral[f >= 3600] = 0
        y = np.fft.irfft(np.fft.rfft(noise) * spectral, n=len(t))
        y *= np.exp(-t * (65 if kind == "hat" else 32))
        if kind == "snare":
            y += .36 * np.sin(2*np.pi*185*t) * np.exp(-t*31)
    y *= np.minimum(t/.004, 1)**2
    y *= np.sin(np.minimum((seconds-t)/.018, 1)*np.pi/2)**2
    return y


def add(y: np.ndarray, sound: np.ndarray, at: float, gain: float, circular=True):
    start = round(at * SR)
    if circular:
        start %= len(y)
        count = min(len(sound), len(y)-start)
        y[start:start+count] += gain * sound[:count]
        if count < len(sound):
            y[:len(sound)-count] += gain * sound[count:]
    elif start < len(y):
        count = min(len(sound), len(y)-start)
        y[start:start+count] += gain * sound[:count]


def bandlimit(y: np.ndarray) -> np.ndarray:
    """Circular, zero-phase lowpass: 3.1 kHz passband, zero from 3.9 kHz."""
    f = np.fft.rfftfreq(len(y), 1/SR)
    roll = np.clip((f-3100)/800, 0, 1)
    mask = .5 + .5*np.cos(np.pi*roll)
    mask[f >= 3900] = 0
    result = np.fft.irfft(np.fft.rfft(y) * mask, n=len(y))
    return result - result.mean()


def phrase(game: dict, intensity: int) -> tuple[np.ndarray, int]:
    beat = 60 / game["bpm"]
    # Use a common rounded 8-bar length. Segment endpoints are exact samples.
    n = round(32 * beat * SR)
    y = np.zeros(n)
    # Identical seeded foundational parts make each region's boundary compatible.
    rng = np.random.default_rng(23017 + sum(map(ord, game["id"])))
    drums = {k: drum(k, rng) for k in ("kick", "snare", "hat", "hand", "tom")}
    root = game["root"]
    groove = game["groove"]
    for bar in range(8):
        chord_index = game["progression"][bar]
        chord = [degree(root, chord_index+i) for i in (0, 2, 4)]
        # Close voicing keeps accompaniment below the melody.
        chord = [note-12 if note > root+7 else note for note in chord]
        for note in chord:
            add(y, tone(note, beat*4.3, "pad"), bar*4*beat, .024)
        stabs = (0, 2.5) if groove in ("bounce", "sneak", "hop") else (.5, 2.5)
        for at in stabs:
            for note in chord:
                add(y, tone(note, beat*.9, game["chord"]), (bar*4+at)*beat, .036)
        bass_note = degree(root-24, chord_index)
        if bass_note < 40:
            bass_note += 12
        for at, note in ((0, bass_note), (2, bass_note+7), (3.25, bass_note)):
            add(y, tone(note, beat*.78, game["bass"]), (bar*4+at)*beat, .145)
        # An eight-bar call/response, with pauses and a low answer on even bars.
        for j, at in enumerate(game["rhythm"]):
            idx = (bar*2+j) % len(game["motif"])
            note = pent(root+12, game["motif"][idx])
            if bar % 2:
                note -= 12
            length = beat * (.52 if j < 2 else .88)
            add(y, tone(note, length, game["lead"]), (bar*4+at)*beat, .112 if j<2 else .09)
        kick_beats = (0, 2) if groove not in ("drive", "orbit", "team") else (0, 1, 2, 3)
        for at in kick_beats:
            add(y, drums["kick"], (bar*4+at)*beat, .20)
        for at in (1, 3):
            kind = "hand" if groove in ("hand", "sail", "rally", "hop") else "snare"
            add(y, drums[kind], (bar*4+at)*beat, .125)
        for at in (0.5, 2.5):
            add(y, drums["hat"], (bar*4+at)*beat, .078)
        # The last bar and first beat are identical across all intensities.
        # This leaves matching tails at 8-bar boundaries without a silent seam.
        if bar == 7:
            continue
        extra = (1.5, 3.5) if intensity >= 1 else ()
        if intensity == 2:
            extra += (.75, 1.75, 2.25, 2.75, 3.75)
        for j, at in enumerate(extra):
            if bar == 0 and at < 1:
                continue
            if groove == "sail":
                at = round(at*3)/3
            elif groove in ("bounce", "hop"):
                at += .075 if at % 1 >= .4 else 0
            add(y, drums["hat"], (bar*4+at)*beat, .075 if intensity == 1 else .10)
            if intensity == 2 and j % 2 == 0:
                note = chord[j % 3] + 12
                add(y, tone(note, beat*.28, game["chord"]), (bar*4+at)*beat, .052)
        if intensity >= 1:
            add(y, drums["hand"], (bar*4+2.75)*beat, .10)
        if intensity == 2:
            add(y, drums["tom"], (bar*4+3.25)*beat, .10)
    # A short circular room adds space without spilling across the loop.
    y = y + .10*np.roll(y, round(beat*.75*SR)) + .055*np.roll(y, round(beat*1.5*SR))
    return y, n


def compose(game: dict, victory: bool) -> np.ndarray:
    if not victory:
        parts = [phrase(game, level)[0] for level in (0, 1, 2, 1)]
        # Smooth 12 ms cosine guards make boundaries robust to lossy transform
        # ringing, including MP3's different block context at interior regions.
        # No padding/silent frames: the curve only touches zero at the boundary.
        guard = round(.012*SR)
        ramp = np.sin(np.linspace(0, np.pi/2, guard))**2
        for part in parts:
            part[:guard] *= ramp
            part[-guard:] *= ramp[::-1]
        # Warm soft saturation controls transients before a strictly bandlimited master.
        return bandlimit(np.tanh(np.concatenate(parts) * 1.25))
    y = np.zeros(6 * SR)
    root = game["root"]
    # Six-second resolved ending; a one-shot, intentionally not an endless jingle.
    # Each game's melody comes from its own new contour, followed by a tonic cadence.
    notes = [pent(root+12, game["motif"][i]) for i in (1, 4, 7, 9)]
    notes += [root+19, root+16, root+24]
    for i, (at, note) in enumerate(zip((0, .32, .68, 1.08, 1.52, 1.9, 2.4), notes)):
        add(y, tone(note, .55 if i<6 else 2.6, game["lead"]), at, .17, False)
    for at, chord in ((0, (0, 4, 7)), (1.2, (5, 9, 12)), (2.4, (0, 4, 7, 12))):
        for interval in chord:
            add(y, tone(root+interval, 2.9, game["chord"]), at, .062, False)
        add(y, tone(root-12, .7, game["bass"]), at, .17, False)
    rng = np.random.default_rng(9100 + root)
    for at in (0, .68, 1.52, 2.4):
        add(y, drum("hand", rng), at, .13, False)
    # Room delays use zero-fill, never circular wrapping for a one-shot.
    for delay, gain in ((.15, .10), (.31, .045)):
        shift = round(delay*SR)
        y[shift:] += gain*y[:-shift].copy()
    y *= np.minimum(np.arange(len(y))/(SR*.012), 1)
    y *= np.clip((len(y)-1-np.arange(len(y)))/(SR*.45), 0, 1)**2
    return bandlimit(np.tanh(y*1.25))


def loudness(path: Path) -> dict:
    output = run(["ffmpeg", "-hide_banner", "-nostdin", "-i", str(path),
                  "-af", "loudnorm=I=-18:TP=-1.5:LRA=11:print_format=json",
                  "-f", "null", "-"]).stderr.decode()
    match = re.search(r'\{\s*"input_i".*?\}', output, re.S)
    if not match:
        raise RuntimeError(f"No loudness measurement: {path.name}")
    data = json.loads(match.group())
    return {"integrated_lufs": float(data["input_i"]),
            "true_peak_dbtp": float(data["input_tp"]),
            "loudness_range_lu": float(data["input_lra"])}


def decode(path: Path) -> np.ndarray:
    raw = run(["ffmpeg", "-v", "error", "-nostdin", "-i", str(path),
               "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"]).stdout
    return np.frombuffer(raw, dtype="<f4").astype(np.float64)


def seam(y: np.ndarray, start: int, end: int) -> dict:
    window = round(.03*SR)
    neighborhood = np.concatenate((y[end-window:end], y[start:start+window]))
    step = abs(y[start]-y[end-1])
    # The ordinary waveform slope is the appropriate comparison, not silence.
    reference = max(float(np.percentile(np.abs(np.diff(neighborhood)), 99)), .0005)
    rms_a = np.sqrt(np.mean(y[end-round(.15*SR):end]**2))
    rms_b = np.sqrt(np.mean(y[start:start+round(.15*SR)]**2))
    return {"step_dbfs": round(db(step), 2),
            "step_to_local_p99": round(float(step/reference), 4),
            "rms_before_dbfs": round(db(rms_a), 2),
            "rms_after_dbfs": round(db(rms_b), 2)}


def audit(path: Path, frames: int, regions: list[dict]) -> dict:
    y = decode(path)
    probe = json.loads(run(["ffprobe", "-v", "error", "-show_streams",
                           "-show_format", "-of", "json", str(path)]).stdout)
    stream = probe["streams"][0]
    f, power = welch(y, fs=SR, nperseg=8192)
    hf = float(power[f >= 4000].sum()/max(power.sum(), 1e-30))
    hf_db = 10*math.log10(max(hf, 1e-30))
    # Strongest high-frequency sinusoidal component, calibrated in dBFS.
    tonal_peak = db(np.sqrt(2*power[f >= 4000].max()*(SR/8192)))
    checks = {"bytes": path.stat().st_size, "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
              "decoded_frames": len(y), "decoded_duration_seconds": len(y)/SR,
              "container_duration_seconds": float(probe["format"]["duration"]),
              "sample_rate_hz": int(stream["sample_rate"]), "channels": stream["channels"],
              "codec": stream["codec_name"], "sample_peak_dbfs": round(db(np.abs(y).max()), 2),
              "energy_above_4khz_db": round(hf_db, 2),
              "strongest_tone_above_4khz_dbfs": round(tonal_peak, 2), **loudness(path)}
    if regions:
        checks["loop_seams"] = [{"id": region["id"], **seam(y, region["start_frame"], region["end_frame"])}
                                for region in regions]
    else:
        checks["opening_5ms_peak_dbfs"] = round(db(np.abs(y[:160]).max()), 2)
        checks["ending_50ms_peak_dbfs"] = round(db(np.abs(y[-1600:]).max()), 2)
    errors = []
    if checks["bytes"] > MAX_BYTES:
        errors.append("file over 600000 bytes")
    if abs(len(y)-frames) > 1:
        errors.append(f"gapless decoded length: {len(y)} != {frames}")
    if abs(checks["integrated_lufs"]-TARGET) > .15:
        errors.append("loudness outside -18 +/- 0.15 LUFS")
    if checks["true_peak_dbtp"] > -1.5:
        errors.append("true peak above -1.5 dBTP")
    if hf_db > -45 or tonal_peak > -60:
        errors.append("high-frequency limit")
    if checks["sample_rate_hz"] != SR or checks["channels"] != 1:
        errors.append("unexpected audio layout")
    for result in checks.get("loop_seams", []):
        if result["step_dbfs"] > -35 or result["step_to_local_p99"] > 1.5:
            errors.append(f"discontinuous seam: {result['id']}")
        if min(result["rms_before_dbfs"], result["rms_after_dbfs"]) < -45:
            errors.append(f"silent seam: {result['id']}")
    if not regions and checks["ending_50ms_peak_dbfs"] > -65:
        errors.append("victory tail has not settled")
    checks["errors"] = errors
    return checks


def track_metadata(game: dict, victory: bool) -> dict:
    segment_frames = round(32*60/game["bpm"]*SR)
    frames = 6*SR if victory else segment_frames*4
    regions = []
    if not victory:
        for i, level in enumerate(("low", "medium", "high", "medium-return")):
            start, end = i*segment_frames, (i+1)*segment_frames
            regions.append(dict(id=level, start_bar=i*8, bars=8,
                                start_frame=start, end_frame=end,
                                start_seconds=start/SR, end_seconds=end/SR))
    return dict(id=f"{game['id']}-{'victory' if victory else 'gameplay'}",
                game_id=game["id"], game_name=game["name"],
                name=f"{game['title']} · {'ניצחון' if victory else 'משחק'}",
                kind="victory" if victory else "gameplay", bpm=game["bpm"],
                time_signature="4/4", bars=None if victory else 32,
                duration_seconds=frames/SR, frames=frames,
                loop=dict(enabled=not victory, start_frame=0, end_frame=frames,
                          start_seconds=0, end_seconds=frames/SR),
                intensity_regions=regions, description=game["description"], files={})


def encode(y: np.ndarray, source: Path, out: Path, fmt: str, vorbis_quality=4):
    wavfile.write(source, SR, y.astype(np.float32))
    gain = TARGET-loudness(source)["integrated_lufs"]
    for attempt in range(8):
        options = (["-c:a", "libmp3lame", "-b:a", "56k", "-cutoff", "3800", "-write_xing", "1"]
                   if fmt == "mp3" else ["-c:a", "libvorbis", "-q:a", str(vorbis_quality)])
        run(["ffmpeg", "-v", "error", "-nostdin", "-y", "-i", str(source),
             "-map_metadata", "-1", "-af", f"volume={gain:.8f}dB", "-ar", str(SR),
             "-ac", "1", *options, "-fflags", "+bitexact", str(out)])
        measured = loudness(out)
        correction = TARGET-measured["integrated_lufs"]
        if abs(correction) <= .06:
            break
        # Damping avoids bouncing between different lossy quantizer decisions.
        gain += correction*.75


def build(selected: str | None):
    target = ROOT / "manifest.json"
    existing = json.loads(target.read_text()) if selected and target.exists() else None
    tracks = []
    with tempfile.TemporaryDirectory(prefix="music-loops-v1-") as tmp:
        source = Path(tmp)/"master.wav"
        for game in GAMES:
            if selected and game["id"] != selected:
                continue
            for victory in (False, True):
                track = track_metadata(game, victory)
                print(f"Synthesize {track['id']} ({track['duration_seconds']:.3f}s)", flush=True)
                y = compose(game, victory)
                assert len(y) == track["frames"]
                for fmt in ("ogg", "mp3"):
                    filename = f"{track['id']}.{fmt}"
                    # The airy ski voice needs extra Vorbis precision at region seams.
                    encode(y, source, ROOT/filename, fmt, game.get("vorbis_quality", 4))
                    track["files"][fmt] = dict(path=filename)
                tracks.append(track)
    if existing:
        tracks = [t for t in existing["tracks"] if t["game_id"] != selected] + tracks
        order = {game["id"]: i for i, game in enumerate(GAMES)}
        tracks.sort(key=lambda t: (order[t["game_id"]], t["kind"] == "victory"))
    manifest = dict(schema_version=1, package="music-loops-v1", license="CC0-1.0",
                    sample_rate_hz=SR, channels=1, loudness_target_lufs=TARGET,
                    max_file_bytes=MAX_BYTES, music_source="Original procedural additive synthesis; no samples or quoted melodies",
                    playback=dict(preferred_format="ogg", fallback_format="mp3", master_gain=.55,
                                  bar_transition_crossfade_seconds=.02,
                                  intensity="low / medium / high; density changes at constant BPM",
                                  timing="Use frame counts; encoder delay/padding is removed by gapless decoding",
                                  victory="6-second one-shot with a resolved ending; do not repeat"), tracks=tracks)
    target.write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+"\n")


def verify(complete=True):
    manifest_path = ROOT/"manifest.json"
    manifest = json.loads(manifest_path.read_text())
    evidence = dict(schema_version=1, package="music-loops-v1", passed=False,
                    measurement="Decoded delivery files; FFmpeg loudnorm/BS.1770, SciPy Welch",
                    tolerances=dict(loudness_lu=.15, max_true_peak_dbtp=-1.5,
                                    max_bytes=MAX_BYTES, max_high_band_energy_db=-45,
                                    max_high_tone_dbfs=-60, max_seam_step_dbfs=-35,
                                    max_seam_step_to_local_p99=1.5), tracks=[])
    errors = []
    expected_ids = {f"{game['id']}-{kind}" for game in GAMES for kind in ("gameplay", "victory")}
    if complete and ({t["id"] for t in manifest["tracks"]} != expected_ids or len(manifest["tracks"]) != 20):
        errors.append("Expected exactly 2 tracks for each of 10 games")
    for track in manifest["tracks"]:
        expected = track_metadata(next(g for g in GAMES if g["id"] == track["game_id"]), track["kind"] == "victory")
        for key in ("frames", "duration_seconds", "bpm", "bars", "loop", "intensity_regions"):
            if track[key] != expected[key]:
                errors.append(f"{track['id']}: invalid {key}")
        if track["kind"] == "gameplay" and not 60 <= track["duration_seconds"] <= 90:
            errors.append(f"{track['id']}: gameplay outside 60-90 seconds")
        if set(track["files"]) != {"ogg", "mp3"}:
            errors.append(f"{track['id']}: expected both formats")
        regions = ([dict(id="full", start_frame=0, end_frame=track["frames"])] + track["intensity_regions"]
                   if track["loop"]["enabled"] else [])
        record = dict(id=track["id"], files={})
        for fmt, file in track["files"].items():
            stats = audit(ROOT/file["path"], track["frames"], regions)
            record["files"][fmt] = stats
            errors.extend(f"{file['path']}: {error}" for error in stats["errors"])
            file.update({k: stats[k] for k in ("bytes", "sha256", "integrated_lufs", "true_peak_dbtp", "decoded_frames")})
            game = next(g for g in GAMES if g["id"] == track["game_id"])
            file["encoding"] = ({"codec": "vorbis", "quality": game.get("vorbis_quality", 4)}
                                if fmt == "ogg" else {"codec": "mp3", "bitrate_kbps": 56, "gapless_tag": "Xing/LAME"})
            print(f"  {file['path']}: {stats['bytes']} B, {stats['integrated_lufs']:.2f} LUFS, "
                  f"HF {stats['energy_above_4khz_db']:.1f} dB; {stats['errors'] or 'PASS'}", flush=True)
        evidence["tracks"].append(record)
    # The 600 KB contract applies to every committed deliverable, not only audio.
    for path in ROOT.rglob("*"):
        if path.is_file() and path.stat().st_size > MAX_BYTES:
            errors.append(f"{path.relative_to(ROOT)} over 600000 bytes")
    evidence["errors"] = errors
    evidence["passed"] = not errors
    (ROOT/"validation.json").write_text(json.dumps(evidence, ensure_ascii=False, indent=2)+"\n")
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+"\n")
    if errors:
        raise SystemExit("\n".join(errors))
    print("All audio delivery checks passed.", flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--verify-only", action="store_true")
    parser.add_argument("--game", choices=[g["id"] for g in GAMES], help="Rebuild only one game (development)")
    args = parser.parse_args()
    if not args.verify_only:
        build(args.game)
    verify(complete=not args.game)


if __name__ == "__main__":
    main()
