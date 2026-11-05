# Independent iteration31 visual review

Reviewed the paired portrait front and three-quarter phone images for the P02/P04 `lids-baseline`/`lids05` controls and P03/P04 `wisps-baseline`/`wisps31` controls. These are static isolated comparisons; the combined32 roster remains a separate review.

| Change | Independent observation | Grade implication |
|---|---|---|
| Additional lid closure .05 | A small, safe reduction in the exposed white band; the upper lid looks a little more relaxed. No obvious new iris clipping or lost eye placement in these portrait views. | Useful small refinement. The simplified lids, broad facial planes and thin mouth/brow treatment remain; face estimate approximately7.5/10, without rounding to8. |
| Sparse crown wisps | Very small silhouette variation, with no obvious new large floating clumps in these views. The difference is subtle at the captured phone size. | Does not remove the smooth cap, prominent lock contours or repeated pointed fringe. P03/P04 hair remains approximately7/10. |

The near-view refinements are reasonable to retain if the remaining views and budgets pass. This is not an independent approval of far scalp coverage, which needs its own fix and captures. Cloth, moving shadows and the final combined roster were not established by these isolated face images.

## Validated P04 hair material cause control

The separate `preflight/hair-material-causes/` experiment rendered12 frames: baseline, Hair normal-map off and constant Hair RGB, with matching pose/camera/light in both phone orientations. The frozen86 runtime and isolated29 GLB hashes are recorded in `capture.json`. Original alpha bytes, original texture RGBA and protected Skin/Cloth/Eye map, Source and image identities all passed their guards. The first capture attempt is retained under `attempt01-unverified/`; it is not the validated evidence.

Turning off the Hair normal map retains the long visible lock shapes. Replacing Hair RGB removes much of the fine color fiber pattern but leaves dark card/edge contours and makes the orange cap more obvious. Neither control is a convincing export improvement. Keep the original maps and normal strength; the remaining macro appearance needs groom/edge work rather than this material ablation. These are cause controls, not proposed replacement textures or a performance measurement.
