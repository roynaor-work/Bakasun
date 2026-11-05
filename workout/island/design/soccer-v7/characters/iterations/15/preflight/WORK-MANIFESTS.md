# Historical authoring manifests

These are scoped intermediate records, retained for inspection of the preflight captures. They are not runtime manifests. The authoritative final roster is `../../../asset-manifest.json`.

- `asset-manifest-preflight15-uv.json`: isolated crown-UV candidate, original rest expression.
- `asset-manifest-preflight15-face-before-isotropic.json`: accepted relaxed-face candidate with the original anisotropic hair setting; this is the state shown in the initial preflight and baseline material probe.
- `asset-manifest-preflight15-face.json`: the same two face candidates after the isotropic material fix.
- `asset-manifest-player-01.json`: raw intermediate export before Draco compression; no final byte/hash claim.
- `asset-manifest-player-02.json`: six remaining identities after compression with the accepted relaxed rest face and isotropic hair.

`hair-material-probe/` contains read-only phone captures and their explicit candidate/runtime hashes. `source/character-material-proof.json` records the material-only step with unchanged complete BIN chunks. The final complete roster and native animation packaging are verified separately.
