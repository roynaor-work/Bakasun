# Soccer turf, 512px (v4)

Optimized runtime copies of `../../design/soccer-v4/textures/turf-color.jpg` and `turf-normal.png` (CC0-1.0, original deterministic generation, seed 20261102; see `../../design/soccer-v4/LICENSES.md`). The design originals are not edited: `turf-normal.png` is re-encoded as JPEG (quality 90, no chroma subsampling) and the colour map as progressive JPEG (quality 86). 4 m tile, OpenGL normal convention.

Used first by `minigames/ultra-soccer-stadium.mjs`; if either file fails to load it falls back to `../soccer-realism/` (1k ambientCG pair, 835 KB).

- `turf-color-512.jpg`: 45591 bytes, sha256 `55ea6a45b3e25212c6f330db903d369c5b526ae6798c9ecc0824a2656e159dd1`
- `turf-normal-512.jpg`: 68274 bytes, sha256 `7868f92a8d68e9f0441b8bdfd6599131ff928eb78f8db671979f5c592f0381ed`
