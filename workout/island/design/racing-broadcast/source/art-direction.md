# Original podium artwork provenance

- Asset: `../assets/podium.webp`.
- Created on 2026-11-12 for this repository task with OpenAI `image_gen.imagegen`.
- Input: the original prompt below, without a reference image, stock media, real team identity, or external asset.
- Generated master: 1844×853 PNG. The master remains in the task's generated-image workspace; the repository contains the optimized final asset.
- Final: RGB WebP, 844×390, Pillow Lanczos resize, quality 86, method 6, 67,404 bytes. Its ratio closely matches the master; no meaningful artwork was cropped.
- Rights: original generated artwork; CC0-1.0 dedication to the extent any rights exist. No claim of exclusive copyright in AI output. See `../LICENSES.md`.
- Regenerating the prompt is not deterministic. The committed WebP is the authoritative final image.

## Exact generation prompt

Create an original polished background asset for a cheerful island racing game's victory broadcast. Very wide landscape composition, final target 844x390, approximately 2.164:1 aspect ratio. Stylized premium 3D animated-game illustration, crisp faceted forms, warm dusk sunlight, navy and teal stadium architecture with coral and golden accents. A low empty three-step podium across the lower center, taller middle step, lower steps to either side, with blank clean fronts and tops, no winners or characters standing on it so game avatars can be overlaid later. A richly populated grandstand of small cheerful diverse spectators behind the stage, with hands raised; individual simplified figures readable as a crowd, no detailed faces. Confetti in coral, pale gold and teal drifting mainly around the upper corners and sides. A beautiful dark navy open central backing behind the podium and a generous quiet central upper area for HTML title overlay. Stadium floodlights glowing at the far left and right. Cinematic depth, professional celebratory mood, controlled clean composition, readable at small phone sizes. No text of any kind, absolutely no letters, numbers, words, signs, logos, branding, watermarks, symbols resembling real team marks, trophies, cars, or flags. Original fictional architecture and people. Fill the entire wide image edge to edge, no border.

## Final conversion

The following illustrates the conversion, with `generated-master.png` standing for the original generated PNG:

```python
from PIL import Image
image = Image.open('generated-master.png').convert('RGB')
image.resize((844, 390), Image.Resampling.LANCZOS).save(
    'assets/podium.webp', 'WEBP', quality=86, method=6
)
```

The geometry source and all SVG shapes were authored specifically for this package. No stock asset, icon library, logo, font glyph, or existing character model was copied into the new assets.
