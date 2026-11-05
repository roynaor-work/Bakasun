# Motion review 01

These are diagnostic renders of the first reduced motion bake, not the final
character approval. Every image is 390×844; `contact-sheet.webp` combines the
fourteen ordinary GLB clips. Rendering uses AnimationMixer, the local Draco
decoder and local character geometry. No animation is applied procedurally in
the renderer.

| Observation | Evidence | Next correction |
|---|---|---|
| Ski carving visibly changes the two knee bends, pelvis position and ski edges. | `01-ski/carve_left.webp`, `carve_right.webp`; source knee apex about 82°/52°, ski edge 28°. | Keep the coordinated loading. Increase diagnostic camera margin: the pole/arm is cropped at the extreme edge of this first contact sheet. |
| Snowboard toe and heel turns lean in different directions and retain rigid boot attachment. | `01-snowboard/carve_left.webp`, `carve_right.webp`; both knees about 74–75°. | Keep the board-axis-specific solution. |
| Shoulder caps open visibly in the character mesh, including ordinary glide. | Both contact sheets: a hollow upper sleeve cap is clearly visible. | Character owner must repair shoulder seam skin weights/coverage before final approval. Motion must be re-rendered on the repaired asset. |
| The snowboard grab is compact and its glove palm meets the edge. | `01-snowboard/trick_tail_grab.webp` and side view. | Retain the palm-based contact target and check it after character regeneration. |
| The ski grab reaches the rear ski section but arches the torso backward excessively. | `01-ski/trick_tail_grab-side.webp`; torso inclination about 61°. | Pitch the ski tails upward during flight and target a point attached to the actual ski, allowing a more upright torso. |
| The snowboard can be supported by the tip of a nearly vertical board during the early recovery. | `01-snowboard/fall_roll-side.webp`, `get_up-side.webp`; independent full-skin audit found body-only minimum height up to 0.41 m. | Roll snowboard falls around its longitudinal X axis; keep ski side rolls around Z. Re-check body and board contact. |
| Poles remain attached to palms and their tips clear the snow in the inspected ground poses. | Ski contact sheet and side views. | Verify again on the final weighted geometry and at phase boundaries. |

The 30 Hz channel reduction was compared to the complete sampled bake at every
sample and every midpoint. Maximum foot-vertex displacement was below 0.37 mm;
full 180°, 360° and backflip rotations retained their winding. This numerical
result does not resolve the visual shoulder defect described above.
