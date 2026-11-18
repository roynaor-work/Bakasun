# Original open-wheel formula car

`formula.glb` is a self-contained glTF 2.0 asset with original procedural geometry,
solid PBR materials, and no logos, team identifiers, brands, external textures,
or runtime compression dependencies.

| Contract | Value |
| --- | --- |
| Units | metres; glTF Y up |
| Length | 4.600 m, Z bounds −2.300 to +2.300 |
| Width | 2.054 m |
| Height | 1.108 m |
| Origin | (0, 0, 0), on the ground, centred across X and Z |
| Forward | +Z |
| Triangle count | 11,868, including all four wheels and cockpit details |
| Root | `Formula`, identity transform |
| Main body | `Body`, origin at (0, 0, 0) |
| Shared opponent colour | material named exactly `Paint 1` |

The front/rear wings, floor, exposed suspension, recessed open cockpit, steering
wheel, driver helmet with visor, roll hoop, diffuser and rear light are included.
The floor and lighting seen in `preview.png` are presentation elements only and
are excluded from the GLB.

## Wheels and recolouring

Four sibling mesh nodes below `Formula` have independent axle-centred pivots,
unit scale, and local X axles. Rotate the wheel node about local X to spin it.
L/R are the driver's left/right while facing +Z: left is +X.

| Node | Axle centre (X, Y, Z), m |
| --- | --- |
| `WheelFrontL` | (+0.850, 0.340, +1.250) |
| `WheelFrontR` | (−0.850, 0.340, +1.250) |
| `WheelRearL` | (+0.830, 0.360, −1.310) |
| `WheelRearR` | (−0.830, 0.360, −1.310) |

Change the base colour of the single material named `Paint 1` for each opponent.
Body panels, both wings and the engine fin all reference that material. Tyres,
metal, interior and helmet use separate materials. Clone the materials when
instantiating opponents that need independent colours. A Three.js example,
after loading with `GLTFLoader`:

```js
const replacements = new Map();
gltf.scene.traverse((object) => {
  if (!object.isMesh) return;
  const recolour = (material) => {
    if (material.name !== 'Paint 1') return material;
    if (!replacements.has(material)) {
      const copy = material.clone();
      copy.color.set(opponentColour);
      replacements.set(material, copy);
    }
    return replacements.get(material);
  };
  object.material = Array.isArray(object.material)
    ? object.material.map(recolour)
    : recolour(object.material);
});
```

## Build and verify

Blender 4.3+ and Python 3 are sufficient; no third-party Python packages or
downloads are required. Run these commands from this directory:

```sh
blender --background --python-exit-code 1 --python build_model.py
python3 test_model.py
```

The test reads the delivered binary GLB independently, checks its geometry,
triangle budget, bounds, named nodes, axle pivots and shared paint, then loads
that same file with Blender's glTF importer. An import failure fails the test.

To rebuild the GLB and its studio preview:

```sh
blender --background --python-exit-code 1 --python build_model.py -- --render
```

The generator writes only `formula.glb` and, with `--render`, `preview.png` beside
itself. The mesh is authored in metres and converted explicitly to glTF Y up.
The original geometry and these source files are provided under CC0-1.0.
