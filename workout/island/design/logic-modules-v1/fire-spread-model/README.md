# Fire spread model · v1.0.0

An isolated, deterministic game simulation for a multi-storey fire-and-rescue mission. Copy `src/` anywhere: the ES modules need no packages, browser, network, files, workers, WebAssembly, or existing game code. The existing Fire Rescue game remains unchanged.

**This is a game simulation, not real-world firefighting or evacuation guidance.** Material, extinguisher and oxygen values are deliberately simplified; `E` is this game's electrical-fire category.

## Run

From the repository root:

```sh
node --test workout/island/design/logic-modules-v1/fire-spread-model/tests/*.test.mjs
```

Serve the repository with any static HTTP server, then open `workout/island/design/logic-modules-v1/fire-spread-model/preview.html`. For example:

```sh
python3 -m http.server 8765
```

The small Hebrew preview imports the actual module. It has room selection, graph movement, extinguisher choice, doors, rescue, pause, difficulty, and seed controls. It pauses on tab hiding and requires an explicit resume. It uses no external assets or dependencies.

## Use

```js
import { createGame, step, getAvailableActions, getResult } from './src/index.mjs';

let state = createGame({ seed: 7, difficulty: 'easy' });
// Inspect the room's fireClass and choose a compatible agent.
const target = state.rooms.find(room => room.floor === 0 && room.fire > 0);
const agent = { A: 'water', B: 'foam', E: 'co2', F: 'wetChemical' }[target.fireClass];
let transition = step(state, { type: 'spray', roomId: target.id, agent }, 0);
state = transition.state;
// A command persists. Null continues it; wait stops a spray or rescue task.
state = step(state, null, 1 / 60).state;
const choices = getAvailableActions(state);
const result = getResult(state); // null until won/lost
```

Every reducer returns detached state and incremental events. Inputs are never mutated, even when deeply frozen. All simulation state, including RNG and sub-tick time, is JSON data. Save `state`, parse it later, validate it, and continue with the same inputs for the same result. No hidden state or ambient randomness is involved. See [API.md](API.md) for the complete contract.

## What the model does

- Rooms track finite material fuel, normalized heat, visible fire, oxygen, smoke, integrity, and temporary suppression. Concrete has zero combustible fuel; it can still become hot and smoky.
- Open doors transfer heat, smoke and oxygen. Closed doors leak a small fraction. Stairs transport hot gases upward more strongly. Fluxes read one shared pre-update snapshot before being applied.
- Ventilation replenishes oxygen and removes smoke. Combustion consumes oxygen and fuel, produces heat/smoke, and harms structure. Oxygen starvation weakens fire. A hot, fueled room can ignite or reignite when suppression expires.
- Five extinguisher types have explicit class efficacy and finite separate inventories. Water on the game's liquid, electrical or cooking-oil categories can increase fire. Weak agents consume their real supply. Cooling to a safe temperature ends the spray; exhausted supplies stop exactly at zero.
- The actor walks one open graph edge at a time, including slower stairs and escort travel. Spraying reaches the current room or one open same-floor doorway, never another floor. Entry is checked both at departure and arrival.
- Rescue requires reaching a safe room and completing a timed pickup. The person remains `escorted` until the actor physically returns to a ground-floor exit. There is no remote rescue, rescue reward refill, teleport, solver, or automatic objective completion.

## Fairness and difficulty

Generated missions always start with safe concrete landings and connected stairs. There are two rooms per floor, one initial fire per floor, and a fourth fire on hard. Rooms may spread fire normally during play. Classes and starting heat vary with the explicit seed.

| Difficulty | Floors | Initial fires | People | Clock | Growth | Resource scale |
|---|---:|---:|---:|---:|---:|---:|
| easy | 2 | 2 | 2 | 300 s | 0.70× | 1.30× |
| normal | 3 | 3 | 3 | 280 s | 1.00× | 1.15× |
| hard | 3 | 4 | 3 | 260 s | 1.25× | 1.00× |

A straightforward strategy wins: move through the landings from bottom to top; spray each fire through its open doorway with the indicated compatible agent until cooled; then visit each person, complete pickup, and walk them back to the exit. Tests allow **three seconds of thinking before every individual action**, including each movement edge. The model supplies no strategic help or automatic rescue.

The suite covers 360 winning missions (120 seeds at each difficulty, including adjacent seeds, widely spaced uint32 values and `0xffffffff`) and 120 idle missions, plus unit scenarios. An additional 480-mission sweep across widely spaced uint32 seeds, with three-second choices, won every mission; slowest finishes were 66 s easy, 127 s normal and 139 s hard. The committed test alternates 0.2/0.5-second adapter frames. These seed samples are balance evidence, not a proof over every uint32 seed or arbitrary custom building.

All losses receive one participation star. A win earns two, or three when at least 35% of the clock remains, mean integrity is at least 80%, and at least 75% of used agent was useful. Idle generated missions never rescue anyone, cannot win by waiting for burnout, and receive one star. Completing the mission requires actual useful actions, all people at an exit, no active fire, and no room hot enough to reignite.

## Integration and limits

`src/index.mjs` is the sole public entry point. Rendering, audio, persistence, input mapping, navigation planning and wall-clock measurement belong to the adapter. A real-time adapter should call `step` with elapsed seconds; all elapsed time is processed in 0.1-second ticks with a saved fractional remainder. Pausing freezes it. Large deltas up to 60 seconds are fully processed; split longer intentional advances into calls. Terminal states freeze. A hidden-tab pause should reset the adapter's wall-clock baseline, as the preview does.

This is a room graph, not CFD, a heat-transfer solver or a structural engineering model. There is no spatial plume, wall geometry, hose physics, real mass/energy calibration, external weather, player injury/air tank, power isolation or real building collapse. Rescue health is intentionally forgiving; unsafe rooms still block pickup and delayed missions can lose people. Validated custom maps can be made unwinnable with insufficient resources, unsafe routes, or aggressive hazards. Version 1 accepts at most 48 rooms, 128 links, six floors, 24 people and a 3,600-second clock. Snapshot validation is schema/invariant validation, not tamper-proof scoring.

Tests include mutation protection, serial replay, frame partitioning including 60/144 Hz and thirds of a second, strict invalid inputs, finite physical/resource bounds, smoke/oxygen, door isolation, vertical ignition, four correct/wrong agent pairs, empty resources, travel range and late hazards, real escorted rescue, pause and exact clock expiry.
