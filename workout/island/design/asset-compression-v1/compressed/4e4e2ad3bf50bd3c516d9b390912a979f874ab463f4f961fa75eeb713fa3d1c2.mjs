/** Ski v24.1 (14/11/2026, Roy: "סקי מרגיש שצריך לשפר מעט את המשחק / גם בשליטה של התנועה / וגם במה שיש במשחק / כי אחרת זה יחזור על
 * עצמו יותר מידי פעמים ויהיה משעמם"). Pure: no DOM, no three.js, so the engine, the course, the result check, the bots and the tests share it.
 *
 * Control (physics.v241, read by alpine-engine.mjs):
 *  - curveAssist: the player's line holds through a turn by itself (the same feed-forward the computer riders always had); measured
 *    v24: with the stick centred a turn at boost speed carried the board up the wall and over the lip in about 2.3 s.
 *  - grip: when a rider eases off or reverses the stick the skis bite (lateral response x grip): less sliding past the lane.
 *  - brake: the stick pulled down is a snowplough: the speed drops toward a lower target and the same stick turns more sharply.
 * Content (track.content, read by alpine-track.mjs; physics.v241 for the rules):
 *  - sections: stretches of the course with their own set piece and pace, announced on the HUD: jumps (big kickers, air rings, stars),
 *    movers (penguins or snowballs crossing half the run), ice (slippery patches), powder (deep snow, one groomed lane), stars (a reward
 *    snake with a power-up) and speed (a steep drop with pads).
 *  - pickups: stars (points and a little boost), a magnet (coins and stars fly in for a few seconds), a shield (the next fall is a bump).
 *  - hazards: snowmen (a soft fall and a burst of snow), movers.
 * Variety between stages: every league theme has its own mix (THEME_CONTENT) on top of the shared difficulty curve.
 *
 * `?alpineV241=0` gives v24 exactly: the island strips physics.v241 and every track's content (withoutV241) before the session, the
 * result check and the league see the balance, so courses, rivals, races and checks are those of v24 to the millisecond. */

export const V241_PARAM = 'alpineV241';
export const v241Enabled = (search = globalThis.location?.search || '') => new URLSearchParams(search).get(V241_PARAM) !== '0';

const stripped = new WeakMap();
/** The balance without anything v24.1 added (cached per object, so the league's per-balance caches keep working). */
export function withoutV241(balance) {
  if (!balance?.physics?.v241 && !Object.values(balance?.tracks || {}).some(t => t?.content)) return balance;
  if (stripped.has(balance)) return stripped.get(balance);
  const {v241, ...physics} = balance.physics;
  const tracks = Object.fromEntries(Object.entries(balance.tracks).map(([id, t]) => [id, t?.content ? (({content, ...rest}) => rest)(t) : t]));
  const out = {...balance, physics, tracks};
  stripped.set(balance, out);
  return out;
}
/** The balance the page should run: as given, or v24 when the URL says ?alpineV241=0. */
export const balanceForPage = (balance, search) => v241Enabled(search) ? balance : withoutV241(balance);

/** Rules defaults (config physics.v241 overrides any of them). */
export const V241_DEFAULTS = Object.freeze({
  curveAssist: .9, grip: 1.8,
  brake: Object.freeze({cut: .45, decel: 15, min: 9, deadzone: .35}),
  bigRamp: Object.freeze({width: 4.6, length: 7.5, height: 2.1, launch: 3}),
  star: Object.freeze({points: 100, tank: .05, reach: 1.15, depth: 1, height: 1.3, centre: .9}),
  ring: Object.freeze({points: 250, tank: .2, radius: 1.25}),
  magnet: Object.freeze({seconds: 8, reach: 4, depth: 2.2}),
  shield: Object.freeze({seconds: 16, loss: .12}),
  snowman: Object.freeze({radius: .72, seconds: .75, loss: .25}),
  mover: Object.freeze({seconds: .9, loss: .3}),
  ice: Object.freeze({grip: .3, steer: .75, speed: 1.04}),
  powder: Object.freeze({speed: .8, decel: 9, grip: .8}),
  speed: Object.freeze({cruise: 1.12})
});
/** physics.v241 merged over the defaults (nested blocks merge one level deep). Null when v24.1 is off. */
export function v241Rules(physics) {
  const v = physics?.v241; if (!v) return null;
  const out = {...V241_DEFAULTS};
  for (const [k, value] of Object.entries(v)) out[k] = value && typeof value === 'object' && !Array.isArray(value) && typeof V241_DEFAULTS[k] === 'object' ? {...V241_DEFAULTS[k], ...value} : value;
  return out;
}

/** Hebrew names shown on the HUD (no exclamation marks: the island's rule for game screens). */
export const SECTION_NAMES = Object.freeze({jumps: 'קטע קפיצות', movers: 'מפריעים בדרך', ice: 'קרח חלק', powder: 'שלג עמוק', stars: 'גשם כוכבים', speed: 'ירידה תלולה'});
export const SECTION_HINTS = Object.freeze({jumps: 'עולים על הרמפות ועושים טריק', movers: 'מחכים לרגע ועוברים בצד הפנוי', ice: 'מחליקים, מתחילים לפנות מוקדם', powder: 'נשארים במסלול הדרוך', stars: 'אוספים כמה שיותר', speed: 'מהירות גבוהה, מחזיקים חזק'});
export const PICKUP_NAMES = Object.freeze({star: 'כוכב', magnet: 'מגנט', shield: 'מגן', ring: 'טבעת'});
export const SECTION_KINDS = Object.freeze(Object.keys(SECTION_NAMES));
export const PICKUP_TYPES = Object.freeze(['star', 'magnet', 'shield', 'ring']);
export const HAZARD_TYPES = Object.freeze(['snowman', 'mover']);
export const PATCH_TYPES = Object.freeze(['ice', 'powder']);
export const V241_TYPES = Object.freeze([...PICKUP_TYPES, ...HAZARD_TYPES, ...PATCH_TYPES, 'section']);

/** Lateral position of a mover (penguin, snowball, boulder) at race time t (s): a sine sweep around o.x, the same for every rider. */
export function moverX(o, t) { return o.x + o.amp * Math.sin(2 * Math.PI * t / o.period + o.phase); }

/** League theme mixes: section weights, which mover crosses, snowmen in rock rows, how many power-ups, stars between rows. */
export const THEME_CONTENT = Object.freeze({
  pine: Object.freeze({kinds: {jumps: 1.2, stars: 1.2, movers: 1, powder: .6, speed: .7, ice: 0}, mover: 'snowball', snowmen: .12, magnet: 1, shield: 1, stars: .35}),
  ice: Object.freeze({kinds: {ice: 1.6, movers: 1.2, stars: .8, jumps: .5, speed: .6, powder: 0}, mover: 'penguin', snowmen: 0, magnet: 1, shield: 1, stars: .3}),
  lava: Object.freeze({kinds: {jumps: 1.5, speed: 1.1, movers: 1, stars: .7, powder: .5, ice: 0}, mover: 'boulder', snowmen: 0, magnet: 1, shield: 2, stars: .3}),
  aurora: Object.freeze({kinds: {stars: 1.5, ice: 1, movers: 1, jumps: .8, speed: .6, powder: .4}, mover: 'penguin', snowmen: 0, magnet: 2, shield: 1, stars: .45}),
  village: Object.freeze({kinds: {jumps: 1.4, movers: 1, stars: 1, speed: .8, powder: .5, ice: .4}, mover: 'snowball', snowmen: .3, magnet: 1, shield: 1, stars: .35}),
  peak: Object.freeze({kinds: {powder: 1.5, jumps: 1.2, speed: 1, movers: .9, stars: .7, ice: .5}, mover: 'snowball', snowmen: 0, magnet: 1, shield: 2, stars: .3})
});
/** The content block of league stage n (d = difficulty 0..1): two sections early, three later, four on a boss course; movers sweep wider
 * and faster with the difficulty, the opening stretch keeps calm. */
export function leagueContent(theme, d, boss) {
  const t = THEME_CONTENT[theme] || THEME_CONTENT.pine, lerp = (a, b) => Math.round((a + (b - a) * d) * 100) / 100;
  return {sections: {count: boss ? [4, 4] : d < .3 ? [2, 2] : [3, 3], kinds: {...t.kinds}, length: [70, 105]},
    mover: t.mover, moverAmp: [lerp(2.2, 2.8), lerp(2.6, 3.2)], moverPeriod: [lerp(3.6, 2.7), lerp(4.4, 3.4)],
    snowmen: t.snowmen, powerups: {magnet: t.magnet, shield: t.shield}, stars: t.stars};
}
