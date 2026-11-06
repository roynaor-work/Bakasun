# Independent isolated asset rebuild

Measured UTC: 2026-11-06T11:11:16+00:00. Node v24.19.0. Result: **PASS — all three generated runtime files are byte-for-byte identical to the frozen workspace outputs.**

The complete package was copied to `/tmp/soccer-v8-rebuild-1oyxgn2v/design/soccer-motion-v8`. Only the five existing repository authoring inputs listed below were added outside that copied package, preserving their relative paths. The copied `player.glb`, `keeper.glb` and `catalog.mjs` were deleted before the build. The build ran only inside `/tmp`; it recreated all three files from source without network access or installed npm dependencies.

Build completed with exit code 0 in 1.78 seconds. A before/after SHA-256 comparison of 25 frozen workspace source/runtime/preview files found no changes. This report is the sole new workspace file written by this check.

## Commands

```sh
scratch=/tmp/soccer-v8-rebuild-1oyxgn2v
design=/workspace/Bakasun/workout/island/design
mkdir -p "$scratch/design"
cp -a "$design/soccer-motion-v8" "$scratch/design/soccer-motion-v8"
for input in motion/soccer.json motion2/soccer/kicks-locomotion.json motion2/soccer/throws-receives.json soccer-v7/characters/models/player-01-lod1.glb soccer-v7/characters/models/goalkeeper-lod1.glb; do
  mkdir -p "$scratch/design/$(dirname "$input")"
  cp -p "$design/$input" "$scratch/design/$input"
done
rm "$scratch/design/soccer-motion-v8/runtime/player.glb" "$scratch/design/soccer-motion-v8/runtime/keeper.glb" "$scratch/design/soccer-motion-v8/runtime/catalog.mjs"
(cd "$scratch/design/soccer-motion-v8" && node source/build-assets.mjs)
for output in player.glb keeper.glb catalog.mjs; do
  cmp "$design/soccer-motion-v8/runtime/$output" "$scratch/design/soccer-motion-v8/runtime/$output"
  sha256sum "$design/soccer-motion-v8/runtime/$output" "$scratch/design/soccer-motion-v8/runtime/$output"
done
```

The commands above express the exact copy/build/byte-comparison operations executed by the Python standard-library harness; the harness also hashes inputs and checks frozen workspace files before and after.

## External authoring inputs

Paths are relative to `design/` in both the repository and isolated copy.

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| motion/soccer.json | 945,091 | `0fefbf459a03ef468801dc0c83c3e77855985dd8ae5830a9d9fde4058e66f83b` |
| motion2/soccer/kicks-locomotion.json | 1,997,908 | `19f305c46bfdc45fa3650bd84d6bb400fcc157fb3c54f485b85385427295e810` |
| motion2/soccer/throws-receives.json | 1,312,448 | `c8f055cfe23c059c89c5c8de647df41e1a961f0473a228e870e415bd0d3c4fa2` |
| soccer-v7/characters/models/player-01-lod1.glb | 944,336 | `3f2bd44f1914f4f83a7a6cdb882601e6b307dd4073a07c9edc37a5c863983d28` |
| soccer-v7/characters/models/goalkeeper-lod1.glb | 951,796 | `deccb70c477ac427692fb32987ec6a3764da5f54ef5c8c1e9af43ba29c325c3f` |

## Copied authoring code and decoding dependencies

Paths are relative to the copied package. Each file was checked against the workspace copy after the rebuild.

| File | SHA-256 |
| --- | --- |
| source/bake-held-paths.mjs | `732d2c98454fa038e63e85ccc5e7950be643ce0de6b57f199e512aa06808a24f` |
| source/build-assets.mjs | `9f3b27293f6bac1a3c765510cc906189662dd39a32c8ca850edf854188da12a0` |
| source/calibrate-contacts.mjs | `08d7c84e7f6aa8408a81c30dd3f6a7cd4b07e1a27a86576636017f622b386236` |
| source/compact-glb.mjs | `3213b716680c4de6e347cf9cc2a73b08e934be3a567628457cb41c11c404ed70` |
| source/motions.mjs | `52a8bb5895f0b2a027d394ccfeec4ba4c0cef3cd2cb15d041d359d4102c516d1` |
| source/render-review.mjs | `0a4a5194942de4fb35bd7372f6cde983f2fec184de54d8d756f25d215b406062` |
| verification/glb-reader.mjs | `d2c79262d3dc2579e887230c8fd69d7ca52289f4c29b19c672cb92cf978ba9a5` |
| runtime/vendor/three.module.js | `3e690ac7d180b0aadf0891bea39eec643e29e2d3e75c99b18689518665f69ba6` |
| runtime/vendor/GLTFLoader.js | `1f9b02acfbf219a6ebb77f09e355500449a3ba9e6a77d87e0de72c0b9315ea4e` |
| runtime/vendor/BufferGeometryUtils.js | `3a6701d824adfe05dc28c09b6c1d64aeab9a183bc3b944d85f15f596e5c6c2b3` |
| runtime/vendor/draco/draco_wasm_wrapper.js | `8bb2952d2ba7d67e1414f8df819410cb0434a666be53f671fff75f68843d76f6` |
| runtime/vendor/draco/draco_decoder.wasm | `a680d927bed9cb864ddbd63521868891af2bfbe755092761b4837487618df8ac` |

## Generated output equality

| Runtime file | Bytes | Workspace and rebuilt SHA-256 | Byte comparison |
| --- | ---: | --- | --- |
| player.glb | 821,680 | `2df9d13df44f0c6c77851a248b221ffe34f14a4f33702450ab47c07ca05818ef` | identical |
| keeper.glb | 948,984 | `4d786e2f7998f3114c71e9cd91cad0ce4d2989d30168a5343bb328727a574f42` | identical |
| catalog.mjs | 285,494 | `fed8aab642afcce852ad7678f40b1e1789a3fb3021b4db8cbb2628325993d69b` | identical |

## Copied build output

```text
Baked 445 controlled-ball samples from native hand/foot transforms
Calibrated 43 cues against actual skinned triangles
player.glb: 821,680 bytes, 14 clips; removed 449 stale accessors / 449 stale views
keeper.glb: 948,984 bytes, 11 clips; removed 449 stale accessors / 449 stale views
catalog: 25 clips, 80 legal edges
```

This check proves reproducibility of the frozen files from the listed inputs and copied tools on the recorded Node version. It does not replace the separate native geometry, contact, transition, browser or performance checks.
