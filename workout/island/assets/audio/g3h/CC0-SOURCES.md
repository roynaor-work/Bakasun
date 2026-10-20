# G3h soccer audio — CC0 1.0 only

All four `.ogg` files are dedicated to / distributed under [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/).
No sound is loaded from a remote host during play.

| File | Author and original | Source | Processing |
|---|---|---|---|
| kick.ogg | Kenney, Impact Sounds, `impactSoft_heavy_000.ogg` | [Original pack](https://kenney.nl/assets/impact-sounds); [exact mirrored file](https://github.com/Mcamento8/open-game-sfx-index/blob/34bbe8b525b5ceff3804915ea745532af11f6055/audio/impact-sounds/impactSoft_heavy_000.ogg) | Unchanged |
| pass.ogg | Kenney, Impact Sounds, `impactSoft_medium_001.ogg` | [Original pack](https://kenney.nl/assets/impact-sounds); [exact mirrored file](https://github.com/Mcamento8/open-game-sfx-index/blob/34bbe8b525b5ceff3804915ea745532af11f6055/audio/impact-sounds/impactSoft_medium_001.ogg) | Unchanged |
| whistle.ogg | Juhani Junkala / SubspaceAudio, Essential Retro / `sfx_sound_refereewhistle.wav` | [Original CC0 collection](https://opengameart.org/content/512-sound-effects-8-bit-style); [pinned mirror](https://github.com/Mcamento8/open-game-sfx-index/tree/34bbe8b525b5ceff3804915ea745532af11f6055/audio/oga-512-retro) | Mono Vorbis, ffmpeg `-ac 1 -c:a libvorbis -q:a 3` |
| crowd.ogg | Original G3h synthesis, 28 detuned nonverbal harmonic voices, independently enveloped swells and filtered noise | `generate-crowd.py` in this folder | 6 second loop; Vorbis `-c:a libvorbis -q:a 3` |

The crowd file and its generator are expressly dedicated to the public domain under CC0 1.0. They contain no sampled voices or spoken words. Run `python3 generate-crowd.py`, then encode `/tmp/g3h-crowd.wav` using the command above.

The original sites could not be downloaded through this environment's destination policy (Kenney returned CONNECT 403). Network access to GitHub worked. The pinned mirror's [license provenance](https://github.com/Mcamento8/open-game-sfx-index/blob/34bbe8b525b5ceff3804915ea745532af11f6055/ATTRIBUTION.md) and [exact source URLs](https://github.com/Mcamento8/open-game-sfx-index/blob/34bbe8b525b5ceff3804915ea745532af11f6055/SOURCES.md) identify CC0 separately from the mirror's MIT code license. The Kenney starter kit was inspected and excluded because its repository license alone was MIT.

Primary license pages were also read on 2026-10-20: Kenney Impact Sounds explicitly lists Creative Commons CC0; the OpenGameArt collection explicitly lists CC0 and identifies SubspaceAudio as its author.
