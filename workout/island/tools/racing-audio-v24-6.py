"""racing-v24.6: measures the renders of tools/racing-audio-v24-6.mjs (evidence only, nothing is listened to).
  python3 workout/island/tools/racing-audio-v24-6.py <outDir> before after
cruise   straight-line driving (speed > 25 m/s, no lift window, no drift/off-road/boost): the level of 2-8 kHz (dBFS), its share of the energy (dB under
         the total) and the spectral flatness of 2-8 kHz (white noise ~0.5+, an engine's harmonics ~0); the flatness of 150-2000 Hz and the noise floor between
         the engine's harmonics (the 20th percentile bin of 300-1500 Hz, dB per bin): "a faint noise in the air"
lift     from each lift start to 1.5 s later (the slowing down and the downshifts): the loudest 20 ms of 2-8 kHz (dBFS), the flatness of 2-8 kHz, and
         'jerks' = 10 ms frames whose 1.5-8 kHz energy jumps 9 dB or more over the previous 30 ms (pops, crackles, noise bursts, clicks)
pass     the 2.4 s after each overtake (Roy's engine-away take plays there), outside the lift windows: the same measures as cruise
pitch    in the same lift windows, 'pitch jumps' = 20 ms steps in which the strongest 60-400 Hz line moves up 4% or more (a rev blip) and comes back down
         within 0.15 s; a downshift on its own raises the line once and holds it."""
import json, sys, wave, numpy as np
out = sys.argv[1]; labels = sys.argv[2:] or ['before', 'after']
def load(label):
    with wave.open(f'{out}/{label}.wav') as w:
        sr = w.getframerate(); x = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32767
    return sr, x, json.load(open(f'{out}/{label}.json'))
def frames(x, sr, win, hop):
    n = int(sr * win); h = int(sr * hop); idx = np.arange(0, len(x) - n, h)
    return idx / sr, np.stack([x[i:i + n] * np.hanning(n) for i in idx]), np.fft.rfftfreq(n, 1 / sr)
def band(S, f, a, b): return S[:, (f >= a) & (f < b)].sum(1)
def db(v): return 10 * np.log10(np.maximum(v, 1e-20))
res = {}
for label in labels:
    sr, x, meta = load(label)
    t, F, f = frames(x, sr, .02, .01); S = np.abs(np.fft.rfft(F, axis=1)) ** 2
    norm = (np.hanning(F.shape[1]) ** 2).sum() * F.shape[1] / 2
    hi = band(S, f, 2000, 8000) / norm; tot = band(S, f, 40, 16000) / norm
    m = (f >= 2000) & (f < 8000); flat = np.exp(np.mean(np.log(S[:, m] + 1e-20), 1)) / (np.mean(S[:, m], 1) + 1e-20)
    fr = meta['frames']; ft = np.array([q['t'] for q in fr])
    def at(key):
        i = np.clip(np.searchsorted(ft, t), 0, len(fr) - 1); return np.array([fr[k][key] for k in i])
    speed, lift, drift, off, boost = at('speed'), at('lift'), at('drift'), at('off'), at('boost')
    starts = [e['t'] for e in meta['events'] if e['type'] == 'liftStart']; ends = [e['t'] for e in meta['events'] if e['type'] == 'liftEnd']
    near = np.zeros(len(t), bool); win = np.zeros(len(t), bool)
    for s in starts:
        e = next((q for q in ends if q > s), s + 3)
        near |= (t > s - .1) & (t < e + .6); win |= (t >= s - .05) & (t < s + 1.5)
    cruise = (speed > 25) & ~near & (drift == 0) & (off == 0) & (boost == 0)
    audible = tot > 1e-12
    mL = (f >= 150) & (f < 2000); flatL = np.exp(np.mean(np.log(S[:, mL] + 1e-20), 1)) / (np.mean(S[:, mL], 1) + 1e-20)
    floorL = np.percentile(S[:, (f >= 300) & (f < 1500)], 20, axis=1) / norm
    def stat(mask):
        mask = mask & audible
        if not mask.any(): return None
        return {'flat150to2k': round(float(np.median(flatL[mask])), 4), 'floor300to1500Db': round(float(db(np.median(floorL[mask]))), 1),'frames': int(mask.sum()), 'hiDbfs': round(float(db(hi[mask].mean())), 1), 'hiShareDb': round(float(db(hi[mask].sum() / tot[mask].sum())), 1),
                'hiPeakDbfs': round(float(db(hi[mask].max())), 1), 'flat2to8k': round(float(np.median(flat[mask])), 3), 'rmsDbfs': round(float(db(tot[mask].mean())), 1)}
    # jerks: 10 ms frames, 1.5-8 kHz energy 9 dB over the mean of the previous 30 ms
    t2, F2, f2 = frames(x, sr, .01, .005); S2 = np.abs(np.fft.rfft(F2, axis=1)) ** 2; e2 = db(band(S2, f2, 1500, 8000) + 1e-14)
    prev = np.convolve(10 ** (e2 / 10), np.ones(6) / 6, 'full')[:len(e2)]; prev = np.concatenate([[1e-14] * 6, prev[:-6]])
    loud = e2 > db(band(S2, f2, 40, 16000).max()) - 60
    jump = (e2 - db(prev) >= 9) & loud
    w2 = np.zeros(len(t2), bool)
    for s in starts: w2 |= (t2 >= s - .05) & (t2 < s + 1.5)
    jerks = int((jump & w2 & ~np.roll(jump, 1)).sum()); jerksAll = int((jump & ~np.roll(jump, 1)).sum())
    # pitch jumps: the strongest 60-400 Hz line in 40 ms frames every 20 ms (4096-point FFT for resolution)
    n = 4096; hop = int(sr * .02); idx = np.arange(0, len(x) - n, hop); tp = idx / sr; fp = np.fft.rfftfreq(n, 1 / sr); sel = (fp >= 60) & (fp < 400)
    line = np.array([fp[sel][np.argmax(np.abs(np.fft.rfft(x[i:i + n] * np.hanning(n)))[sel])] for i in idx])
    blips = 0
    for s in starts:
        k = np.where((tp >= s - .05) & (tp < s + 1.5))[0]
        for j in k[1:-8]:
            if line[j] >= line[j - 1] * 1.04 and line[j - 1] > 0 and np.any(line[j + 1:j + 8] <= line[j - 1] * 1.015): blips += 1
    passes = [e['t'] for e in meta['events'] if e['type'] == 'pass']; pw = np.zeros(len(t), bool)
    for s0 in passes: pw |= (t >= s0) & (t < s0 + 2.4)
    res[label] = {'passes': len(passes), 'pass': stat(pw & ~win),'flags': meta['flags'], 'engine': meta['engine'], 'lifts': len(starts), 'cruise': stat(cruise), 'lift': stat(win), 'liftJerks': jerks, 'jerksWholeRun': jerksAll, 'pitchBlips': blips, 'peak': meta['peak']}
print(json.dumps(res, indent=1))
