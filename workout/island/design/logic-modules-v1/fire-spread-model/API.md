# Fire spread model API 1.0.0

Public imports come from `src/index.mjs`. Runtime files remain wholly inside `src/`. There is no default export or installation step. This is a simplified game model, not real-world fire safety guidance.

## Exports

| Export | Contract |
|---|---|
| `API_VERSION` | Exact snapshot/API version string `'1.0.0'`. Other versions are rejected; there is no implicit migration. |
| `TICK_SECONDS` | Fixed physics tick, `0.1`. |
| `DIFFICULTIES` | Deeply frozen `easy`, `normal`, `hard` settings, including floors, initial fires/people, seconds, growth/resource multipliers and pickup seconds. |
| `MATERIALS` | Deeply frozen `wood`, `fabric`, `liquid`, `electrical`, `cookingOil`, `concrete` coefficients: default class/fuel, ignition heat, burn, growth, smoke. |
| `FIRE_CLASSES` | Deeply frozen `['A','B','E','F']`. `E` means electrical in this game. |
| `EXTINGUISHERS` | Deeply frozen `water`, `foam`, `co2`, `powder`, `wetChemical`; each has `capacity`, `usePerSecond`, `efficacy` by class. Supply uses game units. |
| `LIMITS` | Deeply frozen size bounds and maximum 60-second step. |
| `nextRandom(seed)` | `{ state, value }`; explicit uint32 LCG, `state = (1664525*seed + 1013904223) mod 2^32`, `value = state/2^32`. Uses 32-bit integer multiplication. Seed zero is valid. Throws `RangeError` for invalid seed. |
| `createGame(options = {})` | Independent validated JSON state. See options below. |
| `step(state, action = null, seconds = 0.1)` | `{ state, events, result }`; never mutates input. Validates state/action/delta, applies command immediately, then processes elapsed ticks. |
| `getResult(state)` | Detached terminal result or `null`. Validates input. |
| `snapshot(state)` | Validated deep JSON copy. No timestamps or hidden state. |
| `validateState(state)` | `true`, or throws `TypeError` with a path/reason. Validates complete fields, bounds, version, topology, inventory and actor/person/task consistency. |
| `getAvailableActions(state)` | Detached array of executable action shapes for this location/status. Does not select a strategy or advance time. Includes every in-stock agent in range, including weak ones. |

All state APIs reject malformed, nonfinite, cyclic, unsupported-key and inconsistent data with `TypeError`. A syntactically valid action that is currently impossible returns an `action-rejected` event instead. Invalid inputs never partially mutate anything. All returns are ordinary JSON-compatible objects/arrays, without class instances, callbacks, typed arrays or closures.

## Creation options

```js
createGame({
  seed: 7,                 // integer 0..4294967295; default 1
  difficulty: 'normal',    // easy | normal | hard; default normal
  timeLimit: 280,          // optional, 10..3600 seconds, multiples of 0.1
  inventory: { water: 40 },// optional per-agent overrides, finite 0..1000
  building: { /* below */ } // optional; otherwise seeded connected mission
});
```

Omitted inventory fields use catalog capacity × difficulty resource multiplier. Resources never refill or increase. Null is not an omitted option. Each call derives a building and ending RNG from its own seed; custom buildings do not consume generation draws. Creating another game has no effect on an existing one.

## Custom building definition

```js
const building = {
  startRoomId: 'exit',
  rooms: [
    { id: 'exit', floor: 0, material: 'concrete', exit: true },
    { id: 'hall', floor: 1, material: 'concrete' },
    { id: 'bedroom', floor: 1, material: 'wood', fire: 0.4, heat: 0.65 }
  ],
  links: [
    { id: 'stair', from: 'exit', to: 'hall', type: 'stairs', open: true },
    { id: 'door', from: 'hall', to: 'bedroom', type: 'door', open: true }
  ],
  people: [{ id: 'person', roomId: 'bedroom', health: 1 }]
};
```

All IDs are 1–48 ASCII letters, digits, `_` or `-`; IDs must be unique within each collection. Every room must be in one connected graph, ignoring closed doors for reachability. At least one exit must be on floor zero. The start room must exist and be safe (`fire <= 0.35`, `heat <= 0.78`). A custom map need not be winnable; validation does not supply fuel, routes, inventory or people automatically.

Room required fields: `id`, `floor` (integer 0..5), `material` (catalog key). Optional fields:

| Field | Range/default |
|---|---|
| `fireClass` | A/B/E/F; defaults to material class; may override for a custom scenario. |
| `fuel` | 0..200; defaults to material fuel. Concrete must have zero fuel. A room with zero fuel cannot start burning. |
| `fire` | 0..1; default 0. Visible fire strength, distinct from heat. |
| `heat` | 0..1; default 0.65 for burning rooms, otherwise 0.08 ambient. |
| `smoke` | 0..1; default 0. |
| `oxygen` | 0..1; default 1 (ambient fraction in game units). |
| `ventilation` | 0..1; default 0.35. Controls fresh air and smoke removal. |
| `exit` | Boolean; default false. Only floor-zero rooms may be exits. |

Links require `id`, `from`, `to`, `type` (`door` or `stairs`); `open` defaults true. Endpoints must be different existing rooms. Doors connect rooms on one floor, stairs connect adjacent floors. Duplicate endpoint pairs are rejected. Only doors can be opened/closed by a player.

People require `id`, `roomId`; optional `health` is 0.01..1, default 1. Empty people arrays are supported for focused custom scenarios, but a passive fire-only map still cannot auto-win: useful player activity is required.

## Commands and time

| Action | Semantics |
|---|---|
| `null` | Continue the current task/travel. Does not mean release or cancel. |
| `{type:'wait'}` | Stop spray or pickup and reset unfinished pickup progress. Already-started travel continues. |
| `{type:'move', roomId}` | Start travel along one incident open link to a safe adjacent room. 1.2 s through a door, 2.5 s on stairs, ×1.4 while escorting. Rechecked on arrival; if newly unsafe, stay at the origin and emit `travel-blocked`. |
| `{type:'spray', roomId, agent}` | Persistently spray current room or one open doorway on the same floor. No spraying during travel or escort. Resource is spent per tick, proportional to actual available amount. Stops at empty supply or when fire is zero, heat <=0.28 and smoke <=0.6. |
| `{type:'rescue', personId}` | Begin/persist pickup of a waiting person in the same room; requires fire <=0.12, heat <=0.65, smoke <=0.8. Pickup takes 1.5/2/2.5 s by difficulty. Losing safety interrupts and resets progress. After pickup, walk to an exit; this alone completes rescue. One escorted person at a time. |
| `{type:'door', linkId, open}` | Immediately set an incident door's open state. Cannot operate doors during travel. Closing a spray path stops that spray. |
| `{type:'pause'}` | Freeze all simulation, ongoing task/travel, RNG and sub-tick remainder. The delta supplied with this call is not advanced. |
| `{type:'resume'}` | Resume from the same state. This call's delta is processed normally. |

Commands are applied even with `seconds = 0`. Repeating the same active spray or rescue command is idempotent, including pickup progress and event count. Failed commands leave the existing task in place; elapsed time still progresses. New valid tasks replace old ones. A move to the current room is a no-op.

`seconds` must be finite, 0..60. It is accumulated without per-call integer rounding. Complete 0.1-second ticks run in full; fractional time stays in `pendingNs` (nanoseconds represented as a finite number). A tiny floating-point boundary tolerance prevents dropped ticks for thirds of a second or 60/144 Hz updates. Equal action schedules with equivalent tick time produce the same state/events; command boundaries are quantized by the next simulation tick. Split a long advance into calls; no running ticks are silently dropped. Only pause/terminal states intentionally ignore supplied elapsed time. Wall-clock catch-up belongs to the adapter.

Tick order is: increment clock; update travel and current task; compute simultaneous connection fluxes; update room combustion and RNG; harm waiting people; determine terminal outcome. Every room consumes one explicit RNG draw per tick, independent of whether it is burning.

## Snapshot shape

`state` is versioned JSON data. Consumers may inspect it, but should create/reduce/restore it through the API rather than edit it.

| Field | Meaning |
|---|---|
| `apiVersion`, `seed`, `rngState` | Version, original seed, current explicit uint32 PRNG state. |
| `difficulty`, `status`, `reason` | Status is running/paused/won/lost. Reason is null until complete/timeout/person-lost/structure. |
| `tick`, `pendingNs` | Integer completed ticks; fractional carried time. `clock.elapsed === tick / 10`. |
| `clock` | `{limit, elapsed, remaining}` in seconds. |
| `rooms[]` | Definition fields, plus `initialFuel`, current `fuel`, `integrity` (0..1), `suppression` (0..15 s). Heat, fire, oxygen and smoke remain in 0..1. Fuel/integrity never increase. |
| `links[]` | `{id,from,to,type,open}`. Endpoint order is preserved. |
| `people[]` | `{id,roomId,health,status,progress}`. Status waiting/escorted/rescued/lost. Health 0..1, pickup progress seconds. Escorted room follows actor; rescued people remain at their exit. |
| `actor` | `{roomId, travel, carrying, task}`. Travel is null or `{from,to,linkId,remaining,total}`; room stays at origin until arrival. Carrying is a person ID or null. Task is a spray/rescue action or null. |
| `inventory`, `initialInventory` | Agent → finite game units. Inventory is never negative or greater than initial supply. |
| `metrics` | `agentUsed`, `agentWasted` (real units), `usefulActions` (useful spray ticks + pickups), `extinguished` (fire-to-zero transitions, including natural exhaustion), `rescued`, `wrongAgentUses` (mismatched spray commands). |
| `eventSeq` | Last emitted event ID. Event history is returned per transition, not stored in state. |

## Events

Each event is `{id,type,tick,time,...detail}`. IDs increase monotonically, `time === tick/10`, and ordering is deterministic. Zero-time commands may emit several events with the same tick. UI/audio adapters consume the returned array exactly once. Polling `getResult` or `snapshot` emits nothing.

| Type | Additional detail |
|---|---|
| `paused`, `resumed` | None. |
| `action-rejected` | `action`, `code`. |
| `door-changed` | `linkId`, `open`. |
| `travel-started` | `from`, `to`, `seconds`. |
| `arrived` | `roomId`. |
| `travel-blocked` | `roomId`, `code:'unsafe-entry'`. |
| `spray-started` | `roomId`, `agent`, `efficacy`. |
| `agent-mismatch` | `roomId`, `agent`, `fireClass`, `efficacy`; efficacy <0.4. |
| `spray-stopped` | `code` (`cooled` or `out-of-range`), `roomId` for cooled. Explicit wait/door cancellation does not also emit this event. |
| `agent-empty` | `agent`. |
| `fire-ignited` | `roomId`, `floor`, `fireClass`. |
| `fire-extinguished` | `roomId`, `cause` (`cooled` or `fuel-exhausted`). This describes the state transition, not a real-world safety declaration. |
| `rescue-started`, `rescue-interrupted`, `person-picked-up`, `person-lost` | `personId`. |
| `person-rescued` | `personId`, `roomId` (exit). |
| `game-ended` | `outcome` (won/lost), `reason`. Emitted once. |

Rejection codes: `paused`, `travelling`, `unknown-link`, `out-of-reach`, `not-a-door`, `unknown-room`, `not-adjacent`, `closed-door`, `unsafe-entry`, `carrying-person`, `out-of-range`, `empty-agent`, `unknown-person`, `person-unavailable`, `unsafe-rescue`.

## End conditions and results

Loss precedence: a lost person, then mean integrity <=0.48. Otherwise a mission wins only when every person is rescued, every fire is zero, every room is below its material ignition threshold, and `usefulActions > 0`. This completion takes precedence over clock expiry on the same final tick; otherwise remaining time zero loses. Terminal snapshots never advance, perform actions or emit additional events, though malformed call arguments are still rejected.

`getResult` and `step().result` return:

```js
{
  apiVersion: '1.0.0', outcome: 'won', reason: 'complete', stars: 3,
  elapsed: 79.2, rescued: 3, people: 3, extinguished: 3,
  structure: 0.98, agentUsed: 41.2, efficiency: 1
}
```

Result values above are illustrative game values. `structure` is mean integrity; `efficiency = 1 - agentWasted/agentUsed`, or 1 if nothing was used. Loss gives one star. Win gives two; three requires remaining time >=35% of limit, structure >=0.8, and efficiency >=0.75. No score, rescue, refill or success is granted merely because time passed.
