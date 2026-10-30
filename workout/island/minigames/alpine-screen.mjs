/** Attach the authored opening illustration without replacing live labels,
 * buttons, focus order, saved preferences, or session-owned event listeners. */
export function enhanceAlpineOpening({intro, doc = intro?.ownerDocument} = {}) {
  if (!intro || !doc || intro.classList.contains('alpine-screen-opening')) return intro;
  const copy = doc.createElement('div'); copy.className = 'alpine-screen-copy'; copy.dir = 'rtl';
  const meta = doc.createElement('div'); meta.className = 'alpine-screen-meta';
  for (const child of [...intro.children]) {
    if (child.matches('.alpine-track-card,.alpine-best,.alpine-themes')) meta.append(child);
    else copy.append(child);
  }
  copy.append(meta);
  const art = doc.createElement('figure'); art.className = 'alpine-screen-art'; art.setAttribute('aria-hidden', 'true');
  const image = doc.createElement('img'); image.src = new URL('../design/screens/intro/alpine.svg', import.meta.url).href;
  image.alt = ''; image.width = image.height = 512; image.decoding = 'async'; image.draggable = false;
  art.append(image); intro.classList.add('alpine-screen-opening'); intro.dir = 'rtl'; intro.append(copy, art);
  return intro;
}
