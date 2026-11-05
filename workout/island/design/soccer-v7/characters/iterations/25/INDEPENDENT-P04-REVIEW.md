# Independent P04 review: baseline24 versus Catmull25

Reviewed all 16 supplied P04 images in `preflight/baseline24/` and `preflight/catmull25/`: front and three-quarter views, 390×844 and 844×390, with both PBR skin and neutral gray diffuse skin. This was a read-only image comparison; no browser, model, lighting or source was changed.

| Observation | Change in Catmull25 | Remaining gap |
|---|---|---|
| Cheek, jaw and chin | Small improvement in the continuity of the lower cheek, chin and jaw contour, most readable in the gray three-quarter portrait. | The broad temple-to-cheek plane and abrupt cheek-to-jaw transition remain visible. Front PBR views are very similar at phone size. The change does not establish an 8/10 face result. |
| Nose and mouth | Slightly softer local surface transitions. Lip silhouette and nostril shape remain recognizable. | The mouth remains a thin dark seam with a weak upper-lip contour; the nose and under-eye region still look simplified at the requested full-phone close-up. |
| Eyes and brows | Iris depth and a small highlight are visible in both versions; the subdivision does not appear to disturb eye placement. | Bright sclera, a sharp lower-lid boundary and thin stamped eyebrow arcs remain. This comparison does not demonstrate improved eye/lid anatomy. |
| Hair | No meaningful visible improvement. | Broad diagonal streaks, several conspicuous straight bright card lines, a repetitive jagged fringe and a smooth cap silhouette remain. These still read as constructed card surfaces in the portrait. |
| Neutral diffuse control | The gray views make the modest smoothing easier to see than PBR. | They also retain the large facial planes. The residual look cannot be explained solely by the color texture or normal map. |

The Catmull result is a modest improvement worth retaining if its decoded triangle and byte budgets remain acceptable. It does not justify raising the independent P04 face grade beyond approximately **7.5/10** against the requested EA FC Mobile close-up target. Hair remains approximately **6.5–7/10** in these images. These grades describe the images inspected, not an unseen roster or an assumed improvement from a higher polygon count.

The next useful change would reshape the remaining cheek/temple and mouth/lid transitions directly, while preserving the facial silhouette and atlas alignment. Hair needs more coherent strand groups and a less repetitive fringe. Further material-only changes are unlikely to remove the visible large facial planes shown by the neutral diffuse controls.

Cloth, moving shadows, transitions, floor clearance, mobile GPU performance and other identities were not established by this still-image comparison. The separate numerical controller failures remain unresolved by a facial subdivision.
