# Racing crash FX v1

Original, unbranded CC0 assets for the island racing rollover effects. The pack
does not change the game. All GLBs are glTF 2.0 with ordinary float attributes
and unsigned-short triangle indices: no Draco, Meshopt, external buffers, or
decoder setup. The tire image is embedded, so each GLB loads in one request.

| File | Contents | Triangles |
| --- | --- | ---: |
| `sparks-atlas.png` | 256×256 RGBA, 4×4 orange/yellow spark burst | — |
| `smoke-dust-atlas.png` | 256×256 RGBA, 4×4 soft light-gray cloud | — |
| `body-fragments.glb` | Six independently extractable meshes, one white paint material | 192 total |
| `formula-tire.glb` | Single hollow, rounded slick formula tire, smooth normals | 120 |
| `formula-tire-128.png` | 128×128 rubber texture; identical image embedded in tire GLB | — |

## Fragments and coordinates

| Mesh / node name | Shape | Triangles |
| --- | --- | ---: |
| `broken_front_wing` | Jagged two-element wing with an upright endplate | 48 |
| `half_sidepod` | Contoured sidepod section with a torn trailing edge | 44 |
| `mirror` | Small housing and narrow stalk | 32 |
| `nose_fragment` | Tapered nose section with a broken tip | 32 |
| `body_panel_a` | Broad, irregular thin panel | 20 |
| `body_panel_b` | Narrow, bent thin panel | 16 |

Meters, +Y up, +Z forward, +X across the car. Every mesh is centered on its own
bounding box, with identity node transforms. The six fragment nodes deliberately
overlap at the origin: extract or clone each named mesh into separate physics
objects, rather than adding the whole GLB scene as an assembled car. Dimensions
and exact counts are recorded in `manifest.json`. Scale to the game's car if
needed. The tire axle is +X; outer radius is 0.355 m and width 0.38 m. It is a
tire casing with an open bead, without a wheel hub or manufacturer markings.

The shared `car_paint_tint` material is texture-free, opaque, white, and single
sided; all fragments have closed surfaces and baked flat normals. Clone the
material once per car, set `material.color` to that car's color, and share that
clone among its fragments. Do not recolor the source material across car pools.

## Atlas playback contract

Both PNGs use **straight (unpremultiplied) alpha**, 16 frames, each 64×64 pixels.
Frame 0 is the top-left cell; advance left-to-right, then top-to-bottom. Three
pixels on every cell edge are fully transparent. Clouds expand and dissipate;
sparks spread with short glowing trails and fade. Hide the particle after the
last frame; these are one-shot sequences, not seamless loops.

Suggested Three.js settings for a camera-facing quad:

- `transparent: true`, `depthWrite: false`, `depthTest: true`, white tint,
  `premultipliedAlpha: false`, and `texture.colorSpace = THREE.SRGBColorSpace`.
- Sparks: `THREE.AdditiveBlending`, about 40 fps (0.4 seconds).
- Smoke/dust: `THREE.NormalBlending`, about 20 fps (0.8 seconds).
- Set `texture.minFilter` and `texture.magFilter` to `THREE.LinearFilter`,
  `generateMipmaps = false`, and wrapping to `THREE.ClampToEdgeWrapping`.
  Disabling mipmaps avoids distant frames bleeding across the atlas.

With an ordinary PNG `TextureLoader` texture (`flipY = true`), set
`repeat = (0.25, 0.25)` and `offset = ((frame % 4) / 4,
(3 - floor(frame / 4)) / 4)`. A shader or instanced batch should instead apply
that per-particle UV transform, leaving the shared texture offset unchanged.
If `flipY = false`, invert that vertical convention for the chosen quad UVs.
Modulate particle opacity/scale for lifetime, and tint the neutral cloud for
the road surface if needed.

## Rebuild and verify

From the repository root, using Python 3 standard library only:

```sh
python3 workout/island/design/racing-crash-fx/generate.py
node --test tests/racing-crash-fx-assets.test.mjs
```

`generate.py` fixes its random seed, writes the five binary assets, and rebuilds
the manifest with dimensions, triangle counts, byte sizes and SHA-256 hashes.
The test decodes PNG pixels, checks every frame and gutter, parses the GLB
buffers and indices, checks geometry/material/texture integrity, and enforces
the 60-per-fragment / 120-per-tire limits independently of manifest claims.

For an interactive asset inspection, serve the repository root with
`python3 -m http.server 8765` and open
`http://localhost:8765/workout/island/design/racing-crash-fx/preview.html`.
The preview uses the repository's existing Three.js and GLTFLoader, without
network dependencies. The atlas strips are composited over a dark background;
the underlying PNGs remain transparent.

License and provenance: [LICENSE.txt](LICENSE.txt). No external art sources.
