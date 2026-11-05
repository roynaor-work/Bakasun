# Nongait entry investigation

These compact records preserve a failed alternative and its focused correction; they are not final package acceptance. The full reports were produced by the independent actual-geometry observer.

The rotation-only C15a update fixed a kick pelvis orientation change. Both header entries still raised the physical pelvis by72–123mm in one120Hz frame, forcing35.6–51.8rad/s knee changes against fixed foot anchors. `rotation-only-diagnostic.json` records that failure explicitly.

C15b kept the displayed pelvis height and approached the motor height at no more than1m/s before the existing reach/IK/floor passes. It retained the physical root path and foot targets. The same six cases (kick midpoint and early/late header at30/120Hz) passed all unchanged physical and fulfillment gates; their worst dense angular speed fell to13.137rad/s. See `physical-height-focused-diagnostic.json`. The cap describes the desired pre-IK pelvis path; the observer measures the final displayed skeleton and skin independently.

C15c additionally carries the pelvis approach until convergence, including the orientation fade's terminal frame, and subtracts the actual UpLeg-to-Hips height offset when calculating planted-leg reach. It exposes the desired and final displayed heights separately and preserves carry state across LOD rebuilds. Its full combined verification must be read with the final package records; focused C15b success alone is not a claim that every transition or identity passes.
