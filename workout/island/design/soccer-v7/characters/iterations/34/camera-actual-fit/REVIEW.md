# Actual-vertex face framing

The rectangular width-plus-depth estimate safely contained the head but pulled the front camera back too far. Shoulder/collar contamination was ruled out: the width and depth extrema are genuine Head-weighted skin or hair vertices.

This single correction uses the selected world-space skinned vertices directly, with a reusable numeric buffer and approximately0.9 NDC safety. It avoids fitting empty bounding-box corners. The original rest-height selection, user zoom and body/cloth/pitch cameras remain unchanged.

All18 actual native32 views pass: P01/P03/P04, front/three-quarter/90°, portrait and landscape. Every rendered selected vertex stays within|NDC|≤0.90131; the closest frame margin is19.25px. Buffer positions were independently compared with Three's skinned vertex API, with maximum world error6.71nm. Front portrait heads now span633–647px, improving the earlier bust framing while keeping nose, rear skull, crown and chin visible. The portrait90° profile necessarily has more vertical room to fit the full silhouette horizontally.

I inspected P01's front before/after comparison and full profile. The front face is materially closer; the profile remains intact. Comparison images show previous rectangular fit on the left and actual-vertex fit on the right. This is a camera-only TMP proof, with production source held until the separate physical hand/body support corrections and coherent package are ready. It is not a device FPS claim or acceptance of the unresolved support failures.
