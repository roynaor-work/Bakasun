import { VOICE_LINES, VOICE_BY_ID, VOICE_VERSION, splitVoiceText } from './voice-lines.js?v=20261010-camera-1';

// טהור: מחסור בהקלטה מחזיר רק את החלק החסר ל-TTS, בלי להקריא שוב את המשפט כולו.
export function chooseVoice(text, buffers, lang = 'he-IL') {
  const parts = splitVoiceText(text, lang);
  const selected = parts.map(p => ({ ...p, tts: VOICE_BY_ID[p.id]?.tts || p.text, buffer: p.id && buffers.get(p.id), kind: p.id && buffers.get(p.id) ? 'recording' : 'speech' }));
  if (selected.length && selected.every(p => p.kind === 'speech')) return [{ kind: 'speech', text: String(text), tts: selected.map(p => p.tts || p.text).join(' ') }];
  return selected;
}

// חיתוך שקט בקצוות בלבד; הפסקות טבעיות בתוך משפט נשארות.
export function trimVoiceBuffer(buffer, context) {
  const threshold = 0.008, padding = Math.round(buffer.sampleRate * 0.008);
  let first = buffer.length, last = -1;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < data.length; i++) if (Math.abs(data[i]) > threshold) { first = Math.min(first, i); last = Math.max(last, i); }
  }
  if (last < first) throw new Error('לא נשמע קול בהקלטה');
  first = Math.max(0, first - padding); last = Math.min(buffer.length, last + padding + 1);
  const trimmed = context.createBuffer(buffer.numberOfChannels, last - first, buffer.sampleRate);
  for (let c = 0; c < buffer.numberOfChannels; c++) trimmed.getChannelData(c).set(buffer.getChannelData(c).subarray(first, last));
  return trimmed;
}

export function createVoicePlayer({ context, fetchFile, speakFallback, cancelFallback, now = () => Date.now() }) {
  const buffers = new Map(), pendingLoads = new Map(), settledLoads = new Set(), sources = new Set();
  let generation = 0, active = false, queue = [], lastSpokeAt = -Infinity;
  const load = id => {
    if (pendingLoads.has(id)) return pendingLoads.get(id);
    const promise = (async () => {
      try {
        const ctx = context(); if (!ctx) return;
        const url = new URL(`../snd/voice/${VOICE_BY_ID[id].file}?v=${VOICE_VERSION}`, import.meta.url);
        const response = await fetchFile(url); if (!response.ok) return;
        const buffer = await ctx.decodeAudioData(await response.arrayBuffer());
        buffers.set(id, trimVoiceBuffer(buffer, ctx));
      } catch { /* חסר, לא זמין ברשת או פגום: הקול הקיים ממשיך לעבוד */ }
      finally { settledLoads.add(id); }
    })();
    pendingLoads.set(id, promise); return promise;
  };
  async function preload() {
    let index = 0;
    // קודם ספירה ומשפטים קצרים, כדי שיהיו מוכנים כבר בתחילת האימון.
    const priority = line => /^number-|^time-|^(start|finished|encourage)$/.test(line.id) ? 0 : line.id.startsWith('exercise-') ? 2 : 1;
    const ordered = [...VOICE_LINES].sort((a, b) => priority(a) - priority(b));
    await Promise.all(Array.from({ length: 8 }, async () => {
      while (index < ordered.length) await load(ordered[index++].id);
    }));
  }
  function stop() {
    generation++; active = false; queue = [];
    for (const source of sources) { try { source.stop(); } catch { /* כבר הסתיים */ } }
    sources.clear(); cancelFallback();
  }
  function run(job) {
    active = true;
    const token = generation;
    const needed = splitVoiceText(job.text, job.lang).map(p => p.id).filter(id => id && !settledLoads.has(id));
    if (needed.length) {
      // גם אמירה מוקדמת משתמשת בקובץ שקיים: משלימים את הכנת כל המשפט לפני תחילתו.
      void Promise.all(needed.map(load)).then(() => { if (token === generation) run(job); });
      return;
    }
    const plan = chooseVoice(job.text, buffers, job.lang);
    let index = 0;
    const done = () => {
      if (token !== generation) return;
      lastSpokeAt = now(); active = false;
      job.onDone?.();
      const nextJob = queue.shift(); if (nextJob) run(nextJob);
    };
    const next = () => {
      if (token !== generation) return;
      if (index >= plan.length) { done(); return; }
      const kind = plan[index].kind, group = [];
      while (index < plan.length && plan[index].kind === kind) group.push(plan[index++]);
      const text = group.map(p => p.tts || p.text).join(' ');
      const fallback = () => {
        if (token !== generation) return;
        lastSpokeAt = now();
        if (!speakFallback(text, job, next)) next();
      };
      if (kind === 'speech') { fallback(); return; }
      const ctx = context(); if (!ctx) { fallback(); return; }
      const schedule = () => {
        if (token !== generation) return;
        if (ctx.state === 'suspended' || ctx.state === 'closed') { fallback(); return; }
        const scheduled = [];
        try {
          // כל החלקים מוכנים לפני הניגון; משתמשים בשעון האודיו ולא ב-onended לכל חלק.
          let at = ctx.currentTime + 0.008;
          for (const p of group) {
            const source = ctx.createBufferSource(); source.buffer = p.buffer; source.connect(ctx.destination);
            sources.add(source); scheduled.push(source);
            source.onended = () => { sources.delete(source); if (source === scheduled.at(-1)) next(); };
            source.start(at); at += p.buffer.duration;
          }
          lastSpokeAt = now();
        } catch {
          for (const source of scheduled) { source.onended = null; sources.delete(source); try { source.stop(); } catch { /* */ } }
          fallback();
        }
      };
      if (ctx.state === 'suspended') { try { ctx.resume().then(schedule, fallback); } catch { fallback(); } }
      else schedule();
    };
    next();
  }
  return {
    preload, load, buffers,
    stop,
    play(text, options = {}) {
      if (!String(text).trim()) return false;
      const job = { lang: 'he-IL', ...options, text };
      if (!job.quick) stop();
      else if (active && queue.length) stop(); // לכל היותר אמירה פעילה ועוד אחת שמחכה
      if (active) queue.push(job); else run(job);
      return true;
    },
    spokeRecently: (ms = 900) => active || now() - lastSpokeAt < ms,
  };
}
