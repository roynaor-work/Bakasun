const full = new Intl.NumberFormat('he-IL', { maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat('he-IL', { notation: 'compact', maximumFractionDigits: 1 });
const huge = new Intl.NumberFormat('he-IL', { notation: 'compact', maximumFractionDigits: 0 });

/** A concise HUD value with an exact accessible label. No game data is stored. */
export function presentScore(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError('Score must be a non-negative safe integer');
  const formatter = value < 10_000 ? full : value < 1e12 ? compact : huge;
  return {
    text: formatter.format(value).replace(/[\u200e\u200f\u061c]/g, ''),
    label: `${full.format(value)} נקודות`,
  };
}
