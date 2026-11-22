# Tennis line calls v2: the spoken words OUT and NET (v24.9, 22/11/2026)

Roy, 22/11/2026: "in tennis, if words like NET and OUT can be found instead of my recordings, that is best".

## What the files are
`out-1..3` and `net-1..3`, each as Ogg Vorbis and MP3 (mono, 22,050 Hz, 0.42 to 0.55 s, peak about -1.5 dBFS, 4 to 7 KB a file).
Nothing is fetched at run time: the files are part of the offline tennis download.

## How they were made
Generated on a build machine with the Piper text-to-speech engine (piper-tts 1.8.0) and the voice `en_US-ljspeech-medium`
(rhasspy/piper-voices; its model card: dataset LJ Speech, licence "public domain"; one US English female speaker).
Texts and settings (noise scale 0.5 in all):

| File | Text | Length scale |
|---|---|---|
| out-1 | `Out!` | 1.2 |
| out-2 | `OUT!` | 1.2 |
| out-3 | `Out!!` | 1.2 |
| net-1 | `Net!` | 1.2 |
| net-2 | `NET!` | 1.4 |
| net-3 | `Net.` | 1.2 |

Then with FFmpeg: leading and trailing silence removed (-45 dB), 5 ms fade in, peak set to -1.5 dBFS, encoded with libvorbis (-q 4) and
libmp3lame (64 kb/s), no metadata. Piper output is not deterministic, so a new run gives slightly different takes.

## Licence
The six takes are machine-generated single words made for this project and are released under CC0 1.0 (public domain dedication).
No recording of a person is included in the files. The engine (GPL-3.0) and the voice model are build tools and are not distributed here.

## Why not the Codex pack voice (assets/tennis-callouts-v1)
That voice is built from oscillators and noise through formant filters (not speech). Measured with an offline speech recogniser
(Vosk small en-US 0.15, free vocabulary): its three OUT takes were read as "oh" and its three NET takes as "men"/"man";
the six takes here are read as "out" and "net" in both formats. This is a machine check of the word, not a listening test:
nobody has listened to these files in the build environment.
