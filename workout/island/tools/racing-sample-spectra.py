"""racing-v24: band energy, flatness and the strongest narrow lines of audio files (ffmpeg decode -> numpy STFT), for the hiss and the brake sound.
Usage: python3 -I workout/island/tools/racing-sample-spectra.py out.json file1.ogg file2.ogg ..."""
import json, subprocess, sys
import numpy as np
def decode(path, sr=48000):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-ac', '1', '-ar', str(sr), '-f', 'f32le', '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32), sr
def analyse(path):
    x, sr = decode(path)
    n = 4096; hop = 1024; win = np.hanning(n)
    frames = [x[i:i + n] * win for i in range(0, max(1, len(x) - n), hop)]
    spec = np.array([np.abs(np.fft.rfft(f)) ** 2 for f in frames]) + 1e-20
    freqs = np.fft.rfftfreq(n, 1 / sr)
    mean = spec.mean(axis=0); tot = mean[freqs >= 60].sum()
    edges = [60, 300, 1000, 2000, 5000, 10000, sr / 2]
    bands = [float(mean[(freqs >= a) & (freqs < b)].sum() / tot) for a, b in zip(edges[:-1], edges[1:])]
    hb = (freqs >= 2000) & (freqs < 8000)
    flat = float(np.exp(np.log(mean[hb]).mean()) / mean[hb].mean())
    # narrow lines: bins at least 15 dB above the median of +-200 Hz, lasting in 60% of the frames
    db = 10 * np.log10(spec); lines = []
    k200 = int(200 / (sr / n))
    for i in range(int(900 / (sr / n)), int(6000 / (sr / n))):
        lo, hi = max(0, i - k200), min(len(freqs), i + k200)
        prom = db[:, i] - np.median(db[:, lo:hi], axis=1)
        share = float((prom > 15).mean())
        if share > .6: lines.append({'hz': round(float(freqs[i])), 'share': round(share, 2), 'promDb': round(float(np.median(prom)), 1)})
    # keep the strongest per 100 Hz
    best = {}
    for l in lines:
        k = l['hz'] // 100
        if k not in best or l['promDb'] > best[k]['promDb']: best[k] = l
    rms = float(np.sqrt((x ** 2).mean()))
    return {'file': path.split('/assets/')[-1], 'seconds': round(len(x) / sr, 2), 'rmsDb': round(20 * np.log10(rms + 1e-12), 1), 'bands': [round(b, 4) for b in bands], 'above2k': round(sum(bands[3:]), 4), 'flatness2to8k': round(flat, 3), 'lines': sorted(best.values(), key=lambda l: -l['promDb'])[:4]}
out = sys.argv[1]; res = [analyse(p) for p in sys.argv[2:]]
json.dump({'method': 'ffmpeg mono 48 kHz, Hann 4096, hop 1024, mean power; bands 60-300, 300-1k, 1-2k, 2-5k, 5-10k, 10k+ (share of energy above 60 Hz); flatness = geometric/arithmetic mean of 2-8 kHz; lines = bins 15 dB over the +-200 Hz median in 60% of frames', 'files': res}, open(out, 'w'), indent=1)
for r in res: print(json.dumps(r))
