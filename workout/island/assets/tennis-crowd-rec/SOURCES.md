# Tennis crowd (cheer, cheer-medium, cheer-short)

Recorded by Roy (his own recording, no third-party licence). Cut from `טניס צלילים.m4a` uploaded 18/11/2026: the happy crowd, clip 7 in the
listening page (27.97 s to 31.99 s of the file, 4.16 s with its fades).

| File | From the clip | Use (config `minigames.tennis.audio.samples`) |
|---|---|---|
| `cheer.ogg` | all of it, 4.16 s | `matchCheer`, `applauseLarge` |
| `cheer-medium.ogg` | 0.4 s to 3.2 s, faded | `applauseMedium`, `applause` |
| `cheer-short.ogg` | 0.7 s to 2.2 s, faded | `applauseShort` |

Mono Ogg Vorbis 44.1 kHz (quality 2), +5.5 dB with a limiter at -1 dBFS so the level matches the samples it replaces (about -18 LUFS).
`?tennisCrowdRec=0` plays the synthesised applause and cheer of v24.6 instead (`audio.samplesSynth`).
