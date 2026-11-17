/** Alpine Rush quality governor: decides when sustained slow frames call for the low preset.
 * Pure and frame-rate independent so the session's render loop stays thin and the rule is testable.
 * A single hitch (shader compile, tab switch, garbage collection) is not sustained load and is
 * left out of the average; only racing frames are observed by the caller. */
export function createQualityGovernor({qualitySampleFrames = 90, slowFrameMs = 30, hitchFrameMs = slowFrameMs * 4} = {}, initial = 'high') {
  const sampleFrames = Math.max(1, Math.round(qualitySampleFrames)), slow = Math.max(1, slowFrameMs), hitch = Math.max(slow, hitchFrameMs);
  let quality = initial === 'low' ? 'low' : 'high', frames = 0, total = 0, hitches = 0, windows = 0;
  return {
    get quality() { return quality; },
    /** Feeds one frame interval in ms; returns 'low' on the frame the preset drops, otherwise null. */
    observe(ms) {
      if (quality !== 'high' || !(ms > 0)) return null;
      if (ms > hitch) { hitches++; return null; }
      frames++; total += ms;
      if (frames < sampleFrames) return null;
      const average = total / frames; frames = 0; total = 0; windows++;
      if (average > slow) { quality = 'low'; return 'low'; }
      return null;
    },
    metrics() { return {quality, frames, hitches, windows, sampleFrames, slowFrameMs: slow, hitchFrameMs: hitch}; },
  };
}
