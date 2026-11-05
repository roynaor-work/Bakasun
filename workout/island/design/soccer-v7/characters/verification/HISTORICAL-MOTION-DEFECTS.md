# Historical motion defect evidence

These are preserved failing diagnostics for native15 and motion e60a. They are not final acceptance reports.

- `historical-longpass-skate-native15.json` isolates cold authored `long_pass` with no recovery fade: both exact paused sampling and cold120Hz playback show about12.16mm of near-floor rigid boot translation.
- `historical-longpass-boot-motion.json` independently follows fixed mesh vertex indices. Seven boot vertices remain near the floor in both adjacent120Hz frames and translate about12.24mm while the Foot rotates only0.017degrees. This rules out a stationary heel/toe pivot as the explanation for that earlier recovery diagnostic.

The user requested planted-foot motion without sliding. Root authorized a genuine lift-before-backswing source correction after this isolation, followed by a new motion freeze, final native embedding, floor regeneration and independent displayed-viewer checks. A passing full-mesh floor envelope does not establish absence of skating. Exact model/runtime/motion hashes are retained in the JSON evidence.
