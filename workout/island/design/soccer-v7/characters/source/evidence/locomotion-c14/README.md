# Finite motor boundary regressions

Core revision SHA256:
`10392c2b103a4e6ea510352b0f9f2aa02e1ba043f756aed6227dee872d529a9f`.
The applied source is [locomotion-space.js](../../locomotion-space.js).

A cold native swing now hands over at its actual next heel, including seeds
less than0.08 phase before that heel. The generic new-flight minimum-duration
rule cannot skip an inherited heel and leave a full native stance unlocked.

At zero speed, captured soles above3mm start free/settling. Neutral completion
includes X/Y/Z placement and planted modes. A foot already over its neutral XZ
can descend vertically in0.30s, rather than being reported as a planted hover.
Source clip/time/contact/height and the neutral plan remain inspectable.

A standing restart chooses a grounded support side and advances its canonical
phase basis forward only. The explicit `phaseReseeds` / `lastPhaseReseed` event
records this change. The zero-speed visible body, world root and soles stay
unchanged; this is not an exemption for a moving gait phase reversal.

`state-proof.json` contains31 finite state cases and31 clone/copy checks:
18 near-heel seeds across six gaits,12 stopped-phase/support-side restarts,
and one synthetic13.342mm airborne source-foot descent. The latter foot stays
unlocked and reaches neutral before completion at0.300s. The reproducible
checker is [locomotion-seed-check.mjs](../../locomotion-seed-check.mjs).

`focused-summary.json` records six actual diagnostic sequences at both30Hz and
120Hz: run3φ0.68,run4φ0.68,run5φ0.18,run5φ0.68 rapid sprint/brake chains;
keeper-puntφ0.15→idle; and dribble→kick→run3φ0.68. All original observer,
30rad/s world-joint,25m/s root-relative,3mm anchor/drift, whole-mesh floor, C0,
provenance and fulfillment checks passed. Peak joint speed was19.404431rad/s;
minimum whole-mesh Y was1.51615mm. The synthetic13.342mm state check is separate
from the actual punt fixture's integrated route/neutral evidence.

The diagnostic runtime was847688 bytes, SHA256
`69781a64ac86eba31b897b7052a925e1a29c38ba9327a624b708891dabc31159`:
frozen14a routing plus this private core, served with actual coherent24/new7c
resources. Its runtime override intentionally leaves `complete:false`.
The59–60rad/s C13 failures were independently traced to recovery routing
suspending the physical motor during double flight and sampling native sprint
at an unrelated clock. That routing correction is required alongside this core.

This finite evidence does not certify every ordered pair, the final combined
viewer, all identities/LODs or phone performance. Final66/69,all12 curved slots
and source31 audits must bind the final shared runtime/native/data hashes.
