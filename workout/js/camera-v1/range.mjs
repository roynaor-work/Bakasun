// How far one repetition went, for the counted strength exercises. One number per frame (a joint angle or a
// height in the child's own torso lengths) runs from the starting position to the full position:
// 0 is the start, 1 is the range the exercise asks for. From it come the on-screen meter, the "a little
// further" cue for a repetition that stopped short, the "slower" cue, and the child's own range.
// Nothing here knows an age or a height in centimetres: angles do not depend on body size, heights are
// measured in the child's torso, and the accepted range is learnt from the child's first repetitions.
const shoulderHeight = f => f.clearance(f.main.shoulder?.y);
const lowestKnee = f => Math.min(...f.sides.map(side => side.kneeAngle).filter(Number.isFinite));

const LOWER = { text: 'עוד קצת למטה', say: 'עוֹד קְצָת לְמַטָּה' };
const HIGHER = { text: 'עוד קצת למעלה', say: 'עוֹד קְצָת לְמַעְלָה' };
export const RANGE_COPY = Object.freeze({
  LOWER, HIGHER,
  SLOWER: { text: 'לאט יותר', say: 'לְאַט יוֹתֵר' },
  ALMOST: { text: 'כמעט. נשלים את כל התנועה', say: 'כִּמְעַט. נַשְׁלִים אֶת כָּל הַתְּנוּעָה' },
  OWN: { text: 'מעכשיו סופרים לפי הטווח שלך', say: 'מֵעַכְשָׁו סוֹפְרִים לְפִי הַטְּוָח שֶׁלְּךָ' },
});

// value: the number followed; start and full: its nominal values at the two ends; cue: which way is "further";
// minMs: the part of a repetition away from the start (about half of it) shorter than this is rushed: under
// about a second for the whole repetition. The demonstration's own pace is three times calmer. Jumps have none.
const range = (value, start, full, cue, minMs = 520) => ({ value, start, full, cue, minMs });
export const RANGES = {
  squats: range(f => f.kneeAngle, 170, 122, LOWER),
  'squat-jumps': range(f => f.kneeAngle, 170, 122, LOWER, 0),
  lunges: range(lowestKnee, 170, 112, LOWER),
  'push-ups': range(f => f.elbowAngle, 165, 106, LOWER),
  'knee-push-ups': range(f => f.elbowAngle, 165, 106, LOWER),
  'pike-push-ups': range(f => f.elbowAngle, 165, 116, LOWER),
  'chair-dips': range(f => f.elbowAngle, 165, 112, LOWER),
  crunches: range(shoulderHeight, .2, .46, HIGHER),
  'v-ups': range(shoulderHeight, .2, .7, HIGHER),
  superman: range(shoulderHeight, .14, .32, HIGHER),
  'glute-bridge': range(f => f.clearance(f.hip.y), .16, .46, HIGHER),
  'leg-raises': range(f => Math.min(...f.sides.map(side => side.clearance)), .2, .86, HIGHER),
  'calf-raises': range(f => f.main.heelRise, .02, .17, HIGHER, 400),
};

const ENTER = .3, LEAVE = .16;
// The child's own range never drops below this share of the nominal one, so a nod is not a repetition.
export const OWN_FLOOR = .6;
const OWN_SPREAD = .22;

export class RangeMeter {
  constructor(id) {
    this.spec = RANGES[id] || null;
    this.need = 1;
    this.adapted = false;
    this.peaks = [];
    this.fast = 0;
    this.reset();
  }

  // A pause in tracking forgets the movement in progress, not what was learnt about the child.
  reset() {
    this.start = null;
    this.level = 0;
    this.trip = null;
  }

  /** @returns { meter, done } : meter is 0..1 of the child's needed range; done describes a finished movement. */
  update(f, time) {
    if (!this.spec) return { meter: null, done: null };
    const value = this.spec.value(f);
    if (!Number.isFinite(value)) return { meter: this.level / this.need, done: null };
    const { start, full } = this.spec;
    // The start is the child's own resting value, followed slowly while no movement is under way.
    const towardFull = Math.sign(full - start);
    if (this.start == null) this.start = value;
    const raw = (value - this.start) / (full - this.start || towardFull);
    if (!this.trip && raw < ENTER / 2) this.start += (value - this.start) * .08;
    // The resting value may not sit past the nominal start by more than a third of the range.
    const limit = start + (full - start) * .33;
    if ((this.start - limit) * towardFull > 0) this.start = limit;
    this.level = Math.max(0, raw);
    let done = null;
    if (!this.trip && this.level >= ENTER) this.trip = { since: time, peak: this.level };
    else if (this.trip) {
      this.trip.peak = Math.max(this.trip.peak, this.level);
      if (this.level <= LEAVE) {
        done = { peak: this.trip.peak, ms: time - this.trip.since, reached: this.trip.peak >= this.need };
        this.trip = null;
      } else if (time - this.trip.since > 9000) this.trip = null;
    }
    return { meter: Math.min(1, this.level / this.need), done };
  }

  /**
   * Called once per finished movement. Two movements in a row that went about equally far, and far enough,
   * are how this child does the exercise: from then on a movement that reaches that range counts even when
   * the step counter did not follow it. The needed range is only ever eased (down to the floor), never raised.
   * @returns true at the moment the child's own range starts to be used
   */
  learn(done) {
    if (this.adapted || done.peak < OWN_FLOOR) return false;
    this.peaks.push(done.peak);
    if (this.peaks.length > 2) this.peaks.shift();
    if (this.peaks.length < 2 || Math.abs(this.peaks[0] - this.peaks[1]) > OWN_SPREAD) return false;
    this.adapted = true;
    this.need = Math.max(OWN_FLOOR, Math.min(1, .92 * Math.min(...this.peaks)));
    return true;
  }

  /** Two rushed repetitions in a row ask for a slower pace; a calm one clears the tally. */
  rushed(done) {
    if (!this.spec.minMs) return false;
    this.fast = done.ms < this.spec.minMs ? this.fast + 1 : 0;
    if (this.fast < 2) return false;
    this.fast = 0;
    return true;
  }
}
