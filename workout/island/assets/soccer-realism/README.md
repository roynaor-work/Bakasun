# Soccer turf PBR material

`turf-albedo-1k.jpg` and `turf-normal-gl-1k.jpg` are derived from **Grass 005** by ambientCG, retrieved on 2026-10-27.

- Asset: https://ambientcg.com/view?id=Grass005
- Official download: https://ambientcg.com/get?file=Grass005_1K-JPG.zip
- License: **Creative Commons CC0 1.0 Universal** (public domain dedication).
- Official license statement: https://docs.ambientcg.com/license/
- Legal terms: https://creativecommons.org/publicdomain/zero/1.0/

CC0 permits modification and redistribution, including bundling these maps in a commercial game. Attribution is optional; source information is retained here for provenance. The material is not an EA asset.

The publisher describes this material as **Procedural with Bitmap Elements**, tagged Clean, Green, Lawn and Short. It is a detailed PBR grass material; it must not be described as a pure photogrammetry scan. Existing `../textures/coastal-grass.jpg` was inspected but is a dry, sparse ground scan, unsuitable as the clean sports turf. It was not duplicated or modified.

## Files and processing

| File | Dimensions | Bytes | Source | Processing |
| --- | --- | ---: | --- | --- |
| turf-albedo-1k.jpg | 1024 × 1024 | 356,383 | Grass005_1K-JPG_Color.jpg | JPEG recompression quality 88; dimensions and color content preserved |
| turf-normal-gl-1k.jpg | 1024 × 1024 | 478,627 | Grass005_1K-JPG_NormalGL.jpg | JPEG recompression quality 92; dimensions and channel orientation preserved |

Combined runtime payload: **835,010 bytes**, below 1,000,000 bytes. Only these two texture maps are bundled; the source archive, previews and unused maps are excluded. Recompression uses Windows System.Drawing JPEG encoding. SHA-256 hashes and original download hashes are in `provenance.json`.

## Integration

- Load the albedo with `SRGBColorSpace` and the OpenGL normal with `NoColorSpace`.
- Repeat both maps with identical UVs; a roughly 1–2 metre patch is a sensible starting point for fine turf. Adjust to the actual view.
- Use a modest normal strength (start around 0.2–0.35), matte roughness and zero metalness.
- Add mowing stripes through the pitch material, independently of the repeated detail, so stripes retain their world scale.
- These maps require no runtime requests outside the game folder.
