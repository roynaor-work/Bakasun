# Actual24 C13 controller failure

The actual bundled24/native7c package completed all 66 transition cases at 30Hz on player 01 near. All runtime/data/model/source provenance checks passed. **The physical acceptance gates failed**, so this is historical failure evidence, not final approval or roster coverage.

The report records a 60.477rad/s leg jump during run4→sprint→brake, a mesh minimum of −3.099mm, braking sole drift 3.482mm, and 5–28mm unlocked near-ground drift at turn→run handoffs. Missing heel records near phase 1 and a punt→idle neutral stance with one sole 13.342mm above the floor also prevent fulfillment. Immediate command-time C0 and active plant anchors pass; those narrower facts do not establish acceptable advancing transitions.

The controller must be corrected and recaptured before the all 16 matrix, pitch traversal and quiet CPU profile. The strict gates remain 30rad/s, 25m/s and 3mm support/drift. The full report is preserved byte-for-byte, with its SHA in `controller-c13-summary.json`. No runtime, motion or model file was changed by this review.
