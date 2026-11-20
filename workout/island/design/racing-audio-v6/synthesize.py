#!/usr/bin/env python3
"""Render all original racing audio locally with NumPy, SciPy, and FFmpeg."""

import argparse
from dataclasses import dataclass
import json
import math
from pathlib import Path
import shutil
import subprocess
import tempfile
from typing import Callable

import numpy as np
from scipy.interpolate import CubicSpline, PchipInterpolator
from scipy.io import wavfile


RATE = 48_000
TARGET_LUFS = -18.0
MAX_BYTES = 60_000
TAU = 2 * np.pi


@dataclass(frozen=True)
class Sound:
    name: str
    seconds: float
    loop: bool
    synth: Callable[[np.ndarray, np.random.Generator], np.ndarray]


def soft_window(time, attack, release):
    """Raised-cosine attack and release with zero slope at each end."""
    edge = np.minimum(time / attack, (time[-1] - time) / release)
    return (1 - np.cos(np.pi * np.clip(edge, 0, 1))) / 2


def shaped_noise(rng, time, low, high):
    """Use smooth spectral skirts and make the noise cyclic over the buffer."""
    frequencies = np.fft.rfftfreq(time.size, 1 / RATE)
    spectrum = np.fft.rfft(rng.standard_normal(time.size))
    highpass = np.sqrt(1 / (1 + (low / np.maximum(frequencies, 1)) ** 8))
    lowpass = np.sqrt(1 / (1 + (frequencies / high) ** 10))
    spectrum[0] = 0
    samples = np.fft.irfft(spectrum * highpass * lowpass, n=time.size)
    return samples / samples.std()


def lowpass(samples, start, stop):
    """Apply a zero-phase raised-cosine low-pass to each channel."""
    frames = samples.shape[0]
    frequency = np.fft.rfftfreq(frames, 1 / RATE)
    rolloff = np.clip((frequency - start) / (stop - start), 0, 1)
    weights = (1 + np.cos(np.pi * rolloff)) / 2
    if samples.ndim == 2:
        weights = weights[:, None]
    return np.fft.irfft(np.fft.rfft(samples, axis=0) * weights, n=frames, axis=0)


def engine(time, rpm, load, rng, *, cyclic=False):
    """Model crank, firing orders, intake, and exhaust for a four-stroke V6."""
    crank_cycles = rpm / (60 * RATE)
    if cyclic:
        # A four-stroke firing pattern spans two crank revolutions.
        turns = crank_cycles.sum()
        crank_cycles = crank_cycles + (2 * round(turns / 2) - turns) / time.size
    crank = TAU * np.concatenate(([0.0], np.cumsum(crank_cycles[:-1])))
    crank_hz = crank_cycles * RATE

    # The firing rate is three times crank speed. Half orders account for
    # small asymmetries over the complete firing cycle.
    orders = (
        (0.5, 0.09, 0.0), (1, 0.22, 1.1), (1.5, 0.12, 0.7),
        (2, 0.13, 2.2), (3, 0.55, 0.2), (4.5, 0.08, 0.9),
        (6, 0.32, 0.8), (7.5, 0.08, 2.5), (9, 0.23, 1.35),
        (10.5, 0.043, 0.9), (12, 0.16, 2.1), (15, 0.09, 2.85),
        (18, 0.055, 3.5),
    )
    harmonics = np.zeros_like(time)
    phase_jitter = 0.026 * shaped_noise(rng, time, 5, 37)
    for order, weight, angle in orders:
        high_order_load = 0.45 + 0.55 * load if order >= 4.5 else 1
        formant = 0.77 + 0.23 * np.exp(-((order * crank_hz - 740) / 460) ** 2)
        harmonics += (
            weight * high_order_load * formant
            * np.sin(order * (crank + phase_jitter) + angle)
        )
    harmonics = lowpass(harmonics, 1_450, 1_880)

    body = shaped_noise(rng, time, 36, 240)
    exhaust = shaped_noise(rng, time, 155, 820)
    intake = shaped_noise(rng, time, 490, 1_480)
    firing = 0.62 + 0.38 * (0.5 + 0.5 * np.sin(3 * crank + 1.1)) ** 2
    return (
        (0.64 + 0.36 * load) * harmonics
        + (0.072 + 0.030 * load) * body
        + (0.036 + 0.115 * load) * exhaust * firing
        + (0.018 + 0.094 * load) * intake
    )


def launch_idle(time, rng):
    cycle = TAU * time / 4
    rpm = 3_350 + 165 * np.sin(3 * cycle) + 82 * np.sin(7 * cycle + 0.6)
    rpm += 34 * shaped_noise(rng, time, 2, 13)
    load = 0.21 + 0.045 * np.sin(5 * cycle)
    motor = engine(time, rpm, load, rng, cyclic=True)
    chassis = shaped_noise(rng, time, 27, 135)
    return 0.88 * motor * (0.91 + 0.09 * np.sin(9 * cycle)) + 0.105 * chassis


def start_lights(time, rng):
    # Five condensed staging ticks followed by a distinct release at lights out.
    switch = shaped_noise(rng, time, 95, 820)
    sound = np.zeros_like(time)
    times = (0.14, 0.62, 1.1, 1.58, 2.06, 2.78)
    pitches = (232, 251, 269, 289, 304, 198)
    for index, (moment, pitch) in enumerate(zip(times, pitches)):
        elapsed = np.maximum(0, time - moment)
        tap = (1 - np.exp(-elapsed / 0.014)) ** 2 * np.exp(-elapsed / 0.069)
        if index == len(times) - 1:
            phase = TAU * (pitch * elapsed - 77 * (1 - np.exp(-elapsed / 0.09)) * 0.09)
        else:
            phase = TAU * pitch * elapsed
        sound += tap * (0.66 * np.sin(phase) + 0.19 * np.sin(2 * phase + 0.6) + 0.29 * switch)
    return sound * soft_window(time, 0.04, 0.13)


def launch(time, rng):
    transition = [0.0, 0.09, 0.21, 0.53, 0.83, 1.07, 1.28, 1.55]
    rpm = PchipInterpolator(transition, [3_450, 3_800, 5_700, 8_750, 10_650, 9_130, 10_550, 10_900])(time)
    load = PchipInterpolator(transition, [0.2, 0.46, 0.92, 1, 0.92, 0.48, 0.92, 0.81])(time)
    pull = engine(time, rpm, load, rng)
    road = shaped_noise(rng, time, 180, 990)
    return (pull + 0.13 * load * road) * soft_window(time, 0.065, 0.29)


def driving_engine(time, rng, floor, ceiling, load_bias):
    fraction = CubicSpline(
        [0, 0.12, 0.31, 0.385, 0.43, 0.66, 0.82, 0.94, 1],
        [0.34, 0.49, 0.89, 0.96, 0.73, 0.88, 0.49, 0.28, 0.34],
        bc_type="periodic",
    )(time / 4.8)
    rpm = floor + (ceiling - floor) * fraction
    rpm += 18 * shaped_noise(rng, time, 4, 25)
    shift = np.exp(-((time / 4.8 - 0.421) / 0.025) ** 2)
    overrun = np.exp(-((time / 4.8 - 0.82) / 0.11) ** 2)
    load = np.clip(load_bias + 0.36 * fraction - 0.31 * shift - 0.20 * overrun, 0, 1)
    road = shaped_noise(rng, time, 95, 640)
    return engine(time, rpm, load, rng, cyclic=True) + (0.045 + 0.049 * fraction) * road


def overtake(time, rng, speed, offset, centre, direction, rpm):
    """Pass-by geometry drives pitch, level, pan and a trailing air wake."""
    along_path = speed * (time - centre)
    distance = np.hypot(offset, along_path)
    radial_speed = speed * along_path / distance
    doppler = 343 / (343 + radial_speed)
    intensity = (offset / distance) ** 0.61
    motor = engine(time, rpm * doppler, 0.55 + 0.37 * intensity, rng)
    wind_low = shaped_noise(rng, time, 95, 660)
    wind_high = shaped_noise(rng, time, 320, 1_550)
    wake_seconds = offset / speed
    wind = 0.74 * wind_low + 0.26 * wind_high
    gust = np.exp(-0.5 * ((time - centre - 0.45 * wake_seconds) / (2.0 * wake_seconds)) ** 2)
    front = soft_window(time, 0.15, 0.25)
    pass_sound = (0.83 * motor * intensity + 0.27 * gust * wind) * front
    pan = 0.77 * direction * along_path / np.hypot(2.8 * offset, along_path)
    return pass_sound[:, None] * np.sqrt(np.column_stack((1 - pan, 1 + pan)) / 2)


def track_edge(time, rng):
    cycle = TAU * time / 4
    tires = shaped_noise(rng, time, 46, 222)
    grit = shaped_noise(rng, time, 105, 495)
    proximity = 0.65 + 0.15 * np.sin(cycle) + 0.13 * np.sin(4 * cycle + 1.2)
    irregular = 0.86 + 0.09 * np.sin(19 * cycle) + 0.05 * np.sin(37 * cycle + 0.8)
    shoulder = tires * irregular + 0.38 * grit
    return (0.69 + 0.42 * proximity) * shoulder + 0.22 * shaped_noise(rng, time, 29, 115)


def pit_limiter(time, rng):
    cycle = TAU * time / 4
    limiter = (0.5 + 0.5 * np.sin(22 * cycle)) ** 2
    rpm = 4_700 + 91 * np.sin(2 * cycle) - 165 * limiter
    motor = engine(time, rpm, 0.36 - 0.19 * limiter, rng, cyclic=True)
    low_body = shaped_noise(rng, time, 36, 185)
    return (0.98 - 0.21 * limiter) * motor + 0.14 * low_body


def pit_ambience(time, rng):
    cycle = TAU * time / 4
    ventilation = shaped_noise(rng, time, 50, 210)
    open_air = shaped_noise(rng, time, 93, 535)
    distance = 0.83 + 0.11 * np.sin(cycle - 1.2) + 0.06 * np.sin(3 * cycle)
    return 0.57 * ventilation + 0.39 * distance * open_air


def brake(time, rng):
    load = soft_window(time, 0.17, 0.48) * np.exp(-0.89 * time)
    contact = shaped_noise(rng, time, 58, 290)
    friction = shaped_noise(rng, time, 145, 920)
    wheel = shaped_noise(rng, time, 380, 1_300)
    rotation = TAU * (23 * time - 4.4 * time ** 2)
    return load * (0.57 * contact + (0.32 + 0.08 * np.cos(rotation)) * friction + 0.12 * wheel)


def tire_scrub(time, rng):
    envelope = soft_window(time, 0.19, 0.44)
    lower = shaped_noise(rng, time, 290, 780)
    upper = shaped_noise(rng, time, 515, 1_340)
    weight = 0.37 + 0.21 * np.exp(-((time - 0.41) / 0.21) ** 2)
    pitch = 435 + 288 * np.exp(-((time - 0.42) / 0.31) ** 2) - 105 * time
    chirp = np.sin(TAU * np.cumsum(pitch) / RATE)
    return envelope * (0.57 * lower + weight * upper + 0.14 * chirp)


SOUNDS = (
    Sound("launch-idle", 4.0, True, launch_idle),
    Sound("start-lights", 3.15, False, start_lights),
    Sound("launch", 1.55, False, launch),
    Sound("engine-low", 4.8, True, lambda t, r: driving_engine(t, r, 3_800, 7_400, 0.31)),
    Sound("engine-medium", 4.8, True, lambda t, r: driving_engine(t, r, 5_700, 10_300, 0.53)),
    Sound("engine-high", 4.8, True, lambda t, r: driving_engine(t, r, 7_600, 12_400, 0.68)),
    Sound("overtake-near", 1.10, False, lambda t, r: overtake(t, r, 61, 3.2, 0.46, 1, 10_250)),
    Sound("overtake-wide", 1.30, False, lambda t, r: overtake(t, r, 46, 5.9, 0.54, -1, 8_750)),
    Sound("overtake-fast", 0.95, False, lambda t, r: overtake(t, r, 77, 3.8, 0.38, -1, 11_400)),
    Sound("track-edge", 4.0, True, track_edge),
    Sound("pit-limiter", 4.0, True, pit_limiter),
    Sound("pit-ambience", 4.0, True, pit_ambience),
    Sound("brake", 1.45, False, brake),
    Sound("tire-scrub", 1.30, False, tire_scrub),
)


def ffmpeg(*args):
    return subprocess.run(
        ["ffmpeg", "-hide_banner", "-nostdin", "-nostats", *map(str, args)],
        check=True, capture_output=True,
    )


def loudness(path):
    result = ffmpeg("-i", path, "-af", "loudnorm=I=-18:TP=-1:LRA=11:print_format=json", "-f", "null", "-")
    report = result.stderr[result.stderr.rfind(b"{"):result.stderr.rfind(b"}") + 1]
    measures = json.loads(report)
    return float(measures["input_i"]), float(measures["input_tp"])


def level(samples, gain_db, seam_taper=None):
    scaled = samples * 10 ** (gain_db / 20)
    # Compress only peaks nearing full scale. This leaves ordinary samples intact.
    body = np.clip(scaled, -0.70, 0.70)
    excess = scaled - body
    mastered = body + 0.15 * np.tanh(excess / 0.15)
    if seam_taper:
        # Give both transform codecs compatible boundary conditions at the
        # wrap. The ramps sit in a single continuous millisecond-scale dip.
        width, hold = seam_taper
        samples_at_edge = round(width * RATE / 1_000)
        samples_at_floor = round(hold * RATE / 1_000)
        edge = np.arange(samples_at_edge)
        ramp = (edge - samples_at_floor) / (samples_at_edge - samples_at_floor)
        taper = (1 - np.cos(np.pi * np.clip(ramp, 0, 1))) / 2
        mastered[:samples_at_edge] *= taper
        mastered[-samples_at_edge:] *= taper[::-1]
    return lowpass(mastered, 1_280, 1_680).astype(np.float32)


def encode(source, target, stereo, vorbis_quality):
    if target.suffix == ".mp3":
        # A normal seekable file and a Xing/LAME tag preserve priming and trim.
        bitrate = "128k" if stereo else "96k"
        ffmpeg("-loglevel", "error", "-y", "-i", source, "-map_metadata", "-1",
               "-c:a", "libmp3lame", "-b:a", bitrate, "-write_xing", 1, target)
        return
    for quality in range(vorbis_quality, 0, -1):
        ffmpeg("-loglevel", "error", "-y", "-i", source, "-map_metadata", "-1",
               "-c:a", "libvorbis", "-q:a", quality, "-fflags", "+bitexact",
               "-page_duration", 200_000, target)
        if target.stat().st_size <= MAX_BYTES:
            return


def clean_loop(path, frames):
    decoded = ffmpeg("-v", "error", "-i", path, "-c:a", "pcm_f32le", "-f", "f32le", "-").stdout
    samples = np.frombuffer(decoded, dtype="<f4").reshape(-1, 1)
    if len(samples) != frames:
        return False
    step = float(samples[0, 0] - samples[-1, 0])
    slope_left = float(samples[-1, 0] - samples[-2, 0])
    slope_right = float(samples[1, 0] - samples[0, 0])
    residual = max(abs(step - slope_left), abs(slope_right - step))

    # Judge the join against nearby natural motion and an absolute impulse floor.
    windows = (samples[:RATE // 10], samples[-RATE // 10:])
    slopes = np.concatenate([np.diff(window, axis=0) for window in windows])
    curves = np.concatenate([np.diff(window, n=2, axis=0) for window in windows])
    slope_limit = 1.5 * max(float(np.quantile(np.abs(slopes), 0.999)), 1e-4)
    curve_limit = 2.0 * max(float(np.quantile(np.abs(curves), 0.999)), 1e-4)
    return abs(step) <= slope_limit and residual <= min(curve_limit, 10 ** (-57 / 20))


def master_encoding(sound, samples, initial, source, target):
    # The Vorbis transform sizes and quantization make joins respond differently
    # to short tapers. Try a few equivalent edge shapes when the decoded wrap
    # departs from the surrounding waveform motion.
    recipes = [(None, 4)]
    if sound.loop:
        recipes = [((5, 1.7), 4), ((3, 0.6), 4), ((3, 0.6), 6), ((5, 1.7), 6),
                   ((3, 0.6), 8), ((7, 3.2), 8), ((7, 3.2), 10)]
    for taper, quality in recipes:
        gain = TARGET_LUFS - initial
        for _ in range(5):
            wavfile.write(source, RATE, level(samples, gain, taper))
            encode(source, target, samples.ndim == 2, quality)
            integrated, true_peak = loudness(target)
            if abs(integrated - TARGET_LUFS) <= 0.06:
                break
            gain += TARGET_LUFS - integrated
        size = target.stat().st_size
        if size > MAX_BYTES or abs(integrated - TARGET_LUFS) > 0.12 or true_peak > -1:
            raise ValueError(f"{target.name}: {size} bytes, {integrated:.2f} LUFS, {true_peak:.2f} dBTP")
        if not sound.loop or clean_loop(target, samples.shape[0]):
            return size, integrated, true_peak
    raise ValueError(f"{target.name}: no clean decoded loop join")


def render(sound, output, temp):
    frames = round(sound.seconds * RATE)
    time = np.arange(frames) / RATE
    seed = int.from_bytes(sound.name.encode(), "little")
    samples = sound.synth(time, np.random.default_rng(seed))
    samples = samples - samples.mean(axis=0) if sound.loop else samples
    source = temp / "source.wav"
    samples = samples * (0.65 / np.max(np.abs(samples)))
    wavfile.write(source, RATE, level(samples, 0, (5, 1.7) if sound.loop else None))
    initial, _ = loudness(source)
    if not math.isfinite(initial):
        raise ValueError(f"{sound.name}: invalid source loudness {initial}")
    targets = [temp / f"{sound.name}.{extension}" for extension in ("ogg", "mp3")]
    measurements = [master_encoding(sound, samples, initial, source, target) for target in targets]
    for target, (size, integrated, true_peak) in zip(targets, measurements):
        shutil.move(target, output / target.name)
        print(f"{target.name:22} {size:6d} bytes  {integrated:6.2f} LUFS  {true_peak:6.2f} dBTP")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, default=Path(__file__).resolve().parent / "assets")
    parser.add_argument("--sound", action="append", choices=[sound.name for sound in SOUNDS],
                        help="Render only the given ID. Can be repeated.")
    args = parser.parse_args()
    if not shutil.which("ffmpeg"):
        parser.error("FFmpeg with libvorbis and libmp3lame is required")
    args.output_dir.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as directory:
        for sound in SOUNDS:
            if args.sound is None or sound.name in args.sound:
                render(sound, args.output_dir, Path(directory))


if __name__ == "__main__":
    main()
