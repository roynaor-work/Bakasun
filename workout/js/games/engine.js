// מנוע המשחקים הקטנים: קנבס בגודל לוגי קבוע, ניקוד, טיימר, מגע/מקלדת, מסכי פתיחה וסיום.
// כל משחק הוא אובייקט { id, name, emoji, how, make(r) } כאשר make מחזיר { update(dt), draw(), tap(x,y), down, up, move, swipe(dir), key(code) }.
import { poseAt } from '../figure.js';
import { celebrate as celebrate2d } from './celebrate.js';
import { celebrate3d } from './celebrate3d.js';
// חגיגת שיא: בתלת-ממד (הדמות של Kenney, אצטדיון) כשיש WebGL, אחרת הגרסה הדו-ממדית
const celebrateGoal = (cv, opts) => { try { return celebrate3d(cv, opts); } catch (e) { console.warn('3d celebrate failed', e); return celebrate2d(cv, opts); } };
import { player as drawPlayer, crowd as drawCrowd, crowdGen } from './sprites.js';
export const W = 360, H = 560;

const PAL = { bg: '#1B1740', ink: '#F5F2FF', muted: '#9C96C4', accent: '#8B72FF', ok: '#22C55E', hot: '#FF7A3D', pink: '#FF4D8D', sky: '#38BDF8', gold: '#FFB84D', red: '#EF4444', teal: '#1FB6C9', lime: '#A3E635' };
const rnd = (a = 1, b) => b == null ? Math.random() * a : a + Math.random() * (b - a);
const rint = (a, b) => Math.floor(rnd(a, b + 1));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const shuffle = arr => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// seconds = 0: בלי הגבלת זמן, משחקים עד שנפסלים (הכלל של כל משחק). tokens(): כמה מתנות זמינות להמשך אחרי פסילה; onContinue() מחייב מתנה ומחזיר true.
// progress: מה שנשמר מהפעם הקודמת (def.make(r, progress)); onProgress(game.save()) נקרא בסיום ובפסילה כדי לשמור.
// צלילים אמיתיים (Kenney, CC0) ב-snd/kit/<שם>.ogg. דפדפן שלא מנגן OGG (ספארי ישן) נופל לצלילים המסונתזים
const KIT_FILES = { tick: 'tick.ogg', score: 'score.ogg', over: 'over.ogg', win: 'win.ogg', levelup: 'levelup.ogg', ching: 'ching.ogg', roar: 'roar.ogg', laser: 'laser.ogg', boom: 'boom.ogg', powerup: 'powerup.ogg', jump: 'jump.ogg', hit: 'hit.ogg', pop: 'pop.ogg', shield: 'shield.ogg', bounce: 'bounce.ogg', wood: 'wood.ogg', glass: 'glass.ogg', metal: 'metal.ogg', bell: 'bell.ogg', lose: 'lose.ogg', zap: 'zap.ogg', squish: 'squish.mp3' }; const KIT_SND = Object.keys(KIT_FILES);
const OGG_OK = (() => { try { return typeof Audio !== 'undefined' && !!new Audio().canPlayType('audio/ogg; codecs="vorbis"'); } catch { return false; } })();
const KIT_URL = name => new URL(`../../snd/kit/${KIT_FILES[name]}`, import.meta.url).href;
const KIT_POOL = new Map();
function playKit(name, vol = .7) { if (!KIT_SND.includes(name) || (!OGG_OK && KIT_FILES[name].endsWith('.ogg'))) return false; try { let pool = KIT_POOL.get(name); if (!pool) { pool = []; KIT_POOL.set(name, pool); } let a = pool.find(x => x.paused || x.ended); if (!a) { if (pool.length >= 4) a = pool[0]; else { a = new Audio(KIT_URL(name)); pool.push(a); } } a.volume = vol; a.currentTime = 0; a.play().catch(() => {}); return true; } catch { return false; } }
export function preloadSounds() { if (!OGG_OK) return; KIT_SND.forEach(n => { if (!KIT_POOL.has(n)) { const a = new Audio(KIT_URL(n)); a.preload = 'auto'; KIT_POOL.set(n, [a]); } }); }
const IMGS = new Map();
export function getImg(key) { if (typeof Image === 'undefined') return null; let im = IMGS.get(key); if (!im) { im = new Image(); im.src = new URL(`../../img/kit/${key}.png`, import.meta.url).href; IMGS.set(key, im); } return im; }
export function preload(keys) { keys.forEach(getImg); }
// צביעה: חבילת הרקעים של Kenney היא צלליות בהירות שמיועדות לצביעה. מציירים פעם אחת לקנבס צדדי עם source-in ושומרים במטמון לפי (תמונה, צבע)
const TINTED = new Map();
function tinted(key, color) { const im = getImg(key); if (!im || !im.complete || !im.naturalWidth) return null; const k = key + '|' + color; let cv = TINTED.get(k); if (cv) return cv; cv = document.createElement('canvas'); cv.width = im.naturalWidth; cv.height = im.naturalHeight; const x = cv.getContext('2d'); x.drawImage(im, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = color; x.fillRect(0, 0, cv.width, cv.height); TINTED.set(k, cv); return cv; }
// מוזיקת רקע: לופים CC0 מ-OpenGameArt ב-snd/music (battle, crazy, cunning, booxbep). לפי קבוצת המשחק, או def.music; המשחק יכול להחליף באמצע (r.music('crazy') בפקמן במצב כוח)
const MUSIC_URL = name => new URL(`../../snd/music/${name}.ogg`, import.meta.url).href;
const ALL_MUSIC = ['booxbep', 'battle', 'cunning', 'crazy']; let lastMusic = null; const pickMusic = () => { const opts = ALL_MUSIC.filter(m => m !== lastMusic); lastMusic = opts[Math.floor(Math.random() * opts.length)]; return lastMusic; };
export function runGame(def, { seconds = 0, host, best = 0, onEnd, sound = true, speak = null, demo = false, demoOnly = false, tokens = () => 0, onContinue = null, progress = null, onProgress = null, net = null, music = true }) {
  host.innerHTML = `
    <div class="gamewrap">
      <div class="gamehud">
        <button class="btn icon ghost" id="gexit" aria-label="יציאה">✕</button>
        <span class="gname">${def.emoji} ${def.name}</span>
        <span class="gscore" id="gscore">0</span>
        <span class="gtime" id="gtime"></span>
      </div>
      <div class="gcanvas"><canvas id="gcv" width="${W}" height="${H}"></canvas>
        <div class="goverlay" id="gover"></div>
      </div>
    </div>`;
  const cv = host.querySelector('#gcv'), ctx = cv.getContext('2d');
  const scoreEl = host.querySelector('#gscore'), timeEl = host.querySelector('#gtime'), overlay = host.querySelector('#gover');
  const unlimited = !(seconds > 0); if (unlimited) host.querySelector('#gtime').style.display = 'none'; let game = null, raf = 0, last = 0, running = false, ended = false, score = 0, timeLeft = unlimited ? 0 : seconds, elapsed = 0, pauseUntil = 0;
  // הדגמה: אצבע מדומה שמשחקת לפי תסריט (def.demo), עם כתוביות. בסוף חוזרים למסך הפתיחה או יוצאים
  let inDemo = false, demoT = 0, resumeOnPause = false; const saveProgress = () => { try { if (onProgress && game && typeof game.save === 'function') onProgress(game.save()); } catch { /* */ } }; const finger = { x: W / 2, y: H * .7, tx: W / 2, ty: H * .7, press: 0, hold: false, caption: '', swipe: null };
  let pops = [], parts = [], shakeT = 0, ac = null;
  // צלילים קצרים (WebAudio)
  const tone = (f, ms, type = 'sine', vol = .18, at = 0) => { if (!sound) return; try { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); const o = ac.createOscillator(), g = ac.createGain(); o.type = type; o.frequency.value = f; o.connect(g); g.connect(ac.destination); const t = ac.currentTime + at; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + ms / 1000); o.start(t); o.stop(t + ms / 1000 + .02); } catch { /* */ } };
  const roar = (at = 0, dur = 1.6) => { if (!sound) return; try { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); const n = Math.floor(ac.sampleRate * dur), b = ac.createBuffer(1, n, ac.sampleRate), d = b.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; const src = ac.createBufferSource(); src.buffer = b; const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 700; f.Q.value = .6; const g = ac.createGain(); src.connect(f); f.connect(g); g.connect(ac.destination); const t = ac.currentTime + at; g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(.45, t + .12); g.gain.exponentialRampToValueAtTime(.0001, t + dur); src.start(t); src.stop(t + dur + .05); for (let i = 0; i < 8; i++) tone(300 + Math.random() * 500, .3, 'sawtooth', .02, at + Math.random() * dur * .6); } catch { /* */ } };
  // פלוץ: גל נמוך שרועד ויורד. אולה: מקהלה קצרה "או-לה" (שני פורמנטים). צחוק: "חה חה חה" של השוער.
  const fart = () => { if (!sound) return; try { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); const t = ac.currentTime, dur = .55; const o = ac.createOscillator(), g = ac.createGain(), l = ac.createOscillator(), lg = ac.createGain(), f = ac.createBiquadFilter(); o.type = 'sawtooth'; o.frequency.setValueAtTime(95, t); o.frequency.exponentialRampToValueAtTime(48, t + dur); l.frequency.value = 28; lg.gain.value = 25; l.connect(lg); lg.connect(o.frequency); f.type = 'lowpass'; f.frequency.value = 600; o.connect(f); f.connect(g); g.connect(ac.destination); g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(.4, t + .04); g.gain.setValueAtTime(.35, t + dur * .6); g.gain.exponentialRampToValueAtTime(.0001, t + dur); o.start(t); l.start(t); o.stop(t + dur); l.stop(t + dur); } catch { /* */ } };
  const ole = (at = 0) => { if (!sound) return; try { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); const t = ac.currentTime + at, dur = .75; const master = ac.createGain(); master.connect(ac.destination); master.gain.setValueAtTime(.0001, t); master.gain.linearRampToValueAtTime(.8, t + .08); master.gain.setValueAtTime(.8, t + dur - .2); master.gain.exponentialRampToValueAtTime(.0001, t + dur); const f1 = ac.createBiquadFilter(), f2 = ac.createBiquadFilter(); f1.type = 'bandpass'; f2.type = 'bandpass'; f1.Q.value = 6; f2.Q.value = 6; f1.frequency.setValueAtTime(450, t); f1.frequency.setValueAtTime(450, t + .3); f1.frequency.linearRampToValueAtTime(700, t + .42); f2.frequency.setValueAtTime(900, t); f2.frequency.setValueAtTime(900, t + .3); f2.frequency.linearRampToValueAtTime(1600, t + .42); const mix = ac.createGain(); mix.gain.value = .1; mix.connect(f1); mix.connect(f2); f1.connect(master); f2.connect(master); for (let i = 0; i < 10; i++) { const o = ac.createOscillator(); o.type = 'sawtooth'; const f0 = 180 + Math.random() * 80; o.frequency.setValueAtTime(f0, t); o.frequency.setValueAtTime(f0, t + .3); o.frequency.linearRampToValueAtTime(f0 * 1.25, t + .4); o.connect(mix); o.start(t + Math.random() * .05); o.stop(t + dur); } roar(at + .3, .9); } catch { /* */ } };
  // צחוק: הקלטה מההגדרות (kidfit.laugh) אם יש, אחרת ההקלטה של רועי (snd/laugh.mp4, AAC בלי וידאו). אם הדפדפן לא מנגן, נופלים לקובץ WAV מסונתז.
  const LAUGH = new URL('../../snd/laugh.mp4', import.meta.url).href, LAUGH_FALLBACK = new URL('../../snd/laugh1.wav', import.meta.url).href;
  const laugh = () => { if (!sound) return; try { const rec = localStorage.getItem('kidfit.laugh'); const a = new Audio(rec || LAUGH); a.volume = 1; a.onerror = () => { try { new Audio(LAUGH_FALLBACK).play().catch(() => {}); } catch { /* */ } }; a.play().catch(() => {}); } catch { /* */ } };
  // "אווווו" של קהל מאוכזב: רחש יורד
  const ohh = () => { if (!sound) return; try { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); const t = ac.currentTime, dur = 1.1; const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 3; f.frequency.setValueAtTime(520, t); f.frequency.linearRampToValueAtTime(300, t + dur); const g = ac.createGain(); f.connect(g); g.connect(ac.destination); g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(.5, t + .15); g.gain.exponentialRampToValueAtTime(.0001, t + dur); for (let i = 0; i < 10; i++) { const o = ac.createOscillator(); o.type = 'sawtooth'; const f0 = 150 + Math.random() * 90; o.frequency.setValueAtTime(f0, t); o.frequency.linearRampToValueAtTime(f0 * .8, t + dur); o.connect(f); o.start(t); o.stop(t + dur); } } catch { /* */ } };
  // קורה: מכה מתכתית עמומה
  const post = () => { tone(180, 160, 'triangle', .3); tone(240, 300, 'sine', .12, .02); roar(.1, .5); };
  // קא-צ'ינג של קופה: קליק מתכתי + שני מטבעות קצרים
  const ching = () => { if (!sound) return; try { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); const t = ac.currentTime; const n = ac.createBufferSource(), nb = ac.createBuffer(1, ac.sampleRate * .05, ac.sampleRate), d = nb.getChannelData(0); for (let j = 0; j < d.length; j++) d[j] = (Math.random() * 2 - 1) * (1 - j / d.length); n.buffer = nb; const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2500; const g = ac.createGain(); g.gain.value = .35; n.connect(hp); hp.connect(g); g.connect(ac.destination); n.start(t); for (const [f, at] of [[2350, .05], [3150, .11]]) { const o = ac.createOscillator(), og = ac.createGain(); o.type = 'sine'; o.frequency.value = f; o.connect(og); og.connect(ac.destination); og.gain.setValueAtTime(.0001, t + at); og.gain.linearRampToValueAtTime(.12, t + at + .005); og.gain.exponentialRampToValueAtTime(.0001, t + at + .25); o.start(t + at); o.stop(t + at + .3); } } catch { /* */ } };
  // פקמן (רועי 29/09): "ואקה" באכילה (סוויפ מרובע מתחלף), ג'ינגל פתיחה מקורי בסגנון צ'יפטיון (לא המנגינה של נאמקו), מוות = גלישה יורדת עם ויברטו, אכילת רוח = שני טונים עולים
  const sweep = (f1, f2, ms, type = 'square', vol = .09, at = 0) => { if (!sound) return; try { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); const o = ac.createOscillator(), g = ac.createGain(); o.type = type; o.connect(g); g.connect(ac.destination); const t = ac.currentTime + at; o.frequency.setValueAtTime(f1, t); o.frequency.exponentialRampToValueAtTime(f2, t + ms / 1000); g.gain.setValueAtTime(vol, t); g.gain.setValueAtTime(vol, t + ms / 1000 - .01); g.gain.exponentialRampToValueAtTime(.001, t + ms / 1000); o.start(t); o.stop(t + ms / 1000 + .02); } catch { /* */ } };
  let wakaFlip = false; const waka = () => { wakaFlip = !wakaFlip; if (wakaFlip) sweep(520, 260, 85); else sweep(260, 520, 85); };
  const pacIntro = () => { const mel = [[523, 0], [659, .12], [784, .24], [659, .36], [880, .5], [784, .62], [1047, .76], [1319, .92]]; mel.forEach(([f, at]) => { tone(f, 110, 'square', .07, at); tone(f / 2, 110, 'triangle', .06, at); }); [[131, 0], [131, .24], [165, .5], [196, .76]].forEach(([f, at]) => tone(f, 200, 'sawtooth', .05, at)); };
  const pacDeath = () => { for (let i = 0; i < 10; i++) sweep(600 - i * 45, 520 - i * 45, 70, 'square', .08, i * .07); sweep(200, 80, 220, 'square', .08, .75); sweep(120, 60, 120, 'square', .06, 1.0); };
  const ghostEat = () => { sweep(300, 900, 140, 'square', .1); sweep(600, 1400, 120, 'square', .08, .12); };
  const SFX = { waka, pacIntro, pacDeath, ghostEat, fart, ole: () => ole(), laugh, ohh, post, ching, roar: () => roar(), goal: () => { roar(0, 1.8); tone(196, 900, 'sawtooth', .06); tone(294, 900, 'sawtooth', .05, .02); tone(392, 900, 'sawtooth', .05, .04); }, score: () => { tone(880, 90); tone(1320, 120, 'sine', .14, .08); }, hit: () => tone(220, 120, 'square', .12), over: () => { tone(300, 160, 'sawtooth', .12); tone(200, 260, 'sawtooth', .12, .15); }, win: () => { tone(660, 120); tone(880, 120, 'sine', .18, .13); tone(1100, 260, 'sine', .18, .26); }, tick: () => tone(1000, 40, 'square', .06), bounce: () => tone(500, 50, 'triangle', .1) };

  // תמונות (ספרייטים של Kenney, CC0, ב-img/kit/<חבילה>/<שם>.png): נטענות פעם אחת ונשמרות במטמון. r.img מצייר לפי מרכז (או עוגן), עם סיבוב/שיקוף/שקיפות; לפני שהתמונה נטענה לא מצייר כלום
  let FX = []; /* חלקיקי ספרייטים (r.explode/r.sparkle/r.puff), מצוירים מעל המשחק ב-drawFx */
  let musicEl = null, musicName = null, musicFade = 0; const defaultMusic = def.music || pickMusic(); /* טראק שונה בכל משחק */
  function setMusic(name, vol = .28) { if (!music || !sound || !OGG_OK) return; if (name === musicName) return; const old = musicEl; if (old) { clearInterval(musicFade); let v = old.volume; musicFade = setInterval(() => { v -= .04; if (v <= 0) { old.pause(); clearInterval(musicFade); } else old.volume = v; }, 40); } musicEl = null; musicName = name; if (!name) return; try { const a = new Audio(MUSIC_URL(name)); a.loop = true; a.volume = vol; a.play().catch(() => {}); musicEl = a; } catch { musicEl = null; } }
  function stopMusic() { if (musicEl) { try { musicEl.pause(); } catch { /* */ } } musicEl = null; musicName = null; clearInterval(musicFade); }
  const r = {
    W, H, ctx, cv, C: PAL, rnd, rint, pick, shuffle, clamp, /* cv: קנבס המשחק (לשכבת תלת-ממד מאחוריו, layer3d.js) */
    img(key, x, y, w, h, o = {}) { let im = getImg(key); if (!im || !im.complete || !im.naturalWidth) return false; if (o.tint) { im = tinted(key, o.tint) || im; } const iw = im.naturalWidth || im.width, ih = im.naturalHeight || im.height; if (h == null) h = w * ih / iw; if (w == null) w = h * iw / ih; const ax = o.ax ?? .5, ay = o.ay ?? .5; ctx.save(); ctx.translate(x, y); if (o.rot) ctx.rotate(o.rot); if (o.flip) ctx.scale(-1, 1); if (o.sx || o.sy) ctx.scale(o.sx ?? 1, o.sy ?? 1); if (o.alpha != null) ctx.globalAlpha = o.alpha; ctx.drawImage(im, -w * ax, -h * ay, w, h); ctx.restore(); return true; },
    explode(x, y, size = 60, n = 6) { for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, sp = size * (0.6 + Math.random()); FX.push({ key: i % 2 ? 'fx/flame_01' : 'fx/flame_03', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - size * .4, s: size * (0.7 + Math.random() * .6), t: 0, life: .35 + Math.random() * .25, rot: Math.random() * 6, vr: (Math.random() - .5) * 6, grow: 1.6 }); } for (let i = 0; i < 3; i++) FX.push({ key: 'fx/smoke_01', x: x + (Math.random() - .5) * size * .4, y, vx: (Math.random() - .5) * 30, vy: -20 - Math.random() * 30, s: size * .9, t: 0, life: .7 + Math.random() * .3, rot: Math.random() * 6, vr: (Math.random() - .5) * 2, grow: 1.8, alpha: .55 }); FX.push({ key: 'fx/light_01', x, y, vx: 0, vy: 0, s: size * 2.2, t: 0, life: .18, rot: 0, vr: 0, grow: 1.3, alpha: .9 }); },
    sparkle(x, y, size = 30, n = 5, key = 'fx/star_06') { for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, sp = size * (1 + Math.random() * 2); FX.push({ key, x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, s: size * (.4 + Math.random() * .5), t: 0, life: .4 + Math.random() * .3, rot: Math.random() * 6, vr: (Math.random() - .5) * 8, grow: .6 }); } },
    puff(x, y, size = 30, n = 4) { for (let i = 0; i < n; i++) FX.push({ key: 'fx/smoke_04', x: x + (Math.random() - .5) * size, y, vx: (Math.random() - .5) * 60, vy: -10 - Math.random() * 30, s: size * (.6 + Math.random() * .5), t: 0, life: .4 + Math.random() * .3, rot: Math.random() * 6, vr: (Math.random() - .5) * 3, grow: 1.7, alpha: .7 }); },
    music(name, vol) { setMusic(name === undefined ? defaultMusic : name, vol); }, get defaultMusic() { return defaultMusic; },
    imgSize(key) { const im = getImg(key); return im && im.naturalWidth ? [im.naturalWidth, im.naturalHeight] : null; },
    imgPattern(key, x, y, w, h, scale = 1, offX = 0, offY = 0) { const im = getImg(key); if (!im || !im.complete || !im.naturalWidth) return false; const pat = ctx.createPattern(im, 'repeat'); if (!pat) return false; ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip(); ctx.translate(x + offX, y + offY); ctx.scale(scale, scale); ctx.fillStyle = pat; ctx.fillRect(-offX / scale, -offY / scale, w / scale + Math.abs(offX / scale) + im.naturalWidth, h / scale + Math.abs(offY / scale) + im.naturalHeight); ctx.restore(); return true; },
    px: W / 2, py: H / 2, isDown: false, pointers: {}, // כל האצבעות שעל המסך (למשחקי שני שחקנים): id -> {x, y}
    net, // חיבור למשחק מול טלפון אחר (js/net.js): {role:'host'|'guest', send, alive, onMsg דרך r.netMsg} או null
    netMsg: null, // המשחק מציב פונקציה (t, p) => {} כדי לקבל הודעות מהטלפון השני
    get score() { return score; }, get timeLeft() { return timeLeft; }, get best() { return best; }, /* השיא הקודם: משחקים שעולים רמה רק כשנשבר שיא (באולינג) */
    addScore(n = 1) { score = Math.max(0, Math.round(score + n)); scoreEl.textContent = score; },
    setScore(n) { score = Math.max(0, Math.round(n)); scoreEl.textContent = score; },
    over(msg = 'אופס!') { if (!running) return; running = false; SFX.over(); shakeT = 0.3;
      if (inDemo) { flash(msg, 'עוד ניסיון...'); pauseUntil = performance.now() + 1100; return; }
      if (!unlimited) { flash(msg, timeLeft > 6 ? 'עוד ניסיון...' : ''); if (timeLeft > 6) pauseUntil = performance.now() + 1100; else setTimeout(end, 900); return; }
      // בלי הגבלת זמן: נפסלת. אפשר להמשיך מאותו מקום תמורת מתנה (אם יש), או לסיים
      saveProgress(); setMusic(null); const canGo = typeof game.revive === 'function' && (typeof tokens === 'function' ? tokens() : tokens) > 0;
      flash(`נפסלת! ${msg}`, `ניקוד: ${score}${canGo ? ' · יש לך מתנות, אפשר להמשיך מאותו מקום' : ''}`);
      overlay.querySelector('.gmsg').insertAdjacentHTML('beforeend', `<div class="row" style="gap:8px;justify-content:center;flex-wrap:wrap">${canGo ? '<button class="btn primary big" id="gcont" style="width:auto">להמשיך 🎁 (מתנה אחת)</button>' : ''}<button class="btn big" id="gfinish" style="width:auto">סיום</button></div>`);
      const gc = overlay.querySelector('#gcont'); if (gc) gc.onclick = () => { if (onContinue && !onContinue()) return; game.revive(); hide(); running = true; last = performance.now(); setMusic(defaultMusic); };
      overlay.querySelector('#gfinish').onclick = () => end(); },
    // שלב הושלם: הודעה קצרה וממשיכים עם אותו משחק (הרמה נשמרת). במשחק עם זמן שנגמר: סיום
    win(msg = 'כל הכבוד!', bonus = 0) { if (!running) return; running = false; SFX.win(); r.burst(W / 2, H / 2, PAL.gold, 30, 320); if (bonus) r.addScore(bonus); flash(msg, unlimited || timeLeft > 6 ? 'ממשיכים!' : ''); if (unlimited || timeLeft > 6) { pauseUntil = performance.now() + 900; resumeOnPause = true; } else setTimeout(end, 900); saveProgress(); },
    // ציור
    clear(color = PAL.bg) { ctx.fillStyle = color; ctx.fillRect(0, 0, W, H); },
    rect(x, y, w, h, color, rad = 0) { ctx.fillStyle = color; if (rad) { ctx.beginPath(); ctx.roundRect(x, y, w, h, rad); ctx.fill(); } else ctx.fillRect(x, y, w, h); },
    circle(x, y, rad, color) { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill(); },
    line(x1, y1, x2, y2, color, w = 2) { ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); },
    text(s, x, y, { size = 20, color = PAL.ink, align = 'center', bold = true, base = 'middle' } = {}) { ctx.fillStyle = color; ctx.font = `${bold ? '800' : '500'} ${size}px Rubik, Heebo, Arial, sans-serif`; ctx.textAlign = align; ctx.textBaseline = base; ctx.direction = 'rtl'; ctx.fillText(s, x, y); },
    emoji(s, x, y, size = 28) { ctx.font = `${size}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff'; ctx.fillText(s, x, y); },
    hit(ax, ay, aw, ah, bx, by, bw, bh) { return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by; },
    dist(x1, y1, x2, y2) { return Math.hypot(x2 - x1, y2 - y1); },
    // ---- אפקטים ----
    sfx(kind) { if (!sound) return; const vol = kind === 'tick' ? .35 : kind === 'laser' ? .3 : kind === 'bounce' ? .5 : .7; if (KIT_SND.includes(kind) && playKit(kind, vol)) return; (SFX[kind] || SFX.tick)(); },
    play(url, vol = 1) { if (!sound) return; try { const a = new Audio(url); a.volume = vol; a.play().catch(() => {}); } catch { /* */ } }, // הקלטה (למשל snd/eat.mp4)
    pop(text, x, y, color = PAL.gold, size = 22) { pops.push({ text, x, y, color, size, t: 0.9 }); },
    burst(x, y, color = PAL.gold, n = 14, speed = 220) { for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, v = speed * (0.4 + Math.random() * 0.6); parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, color, t: 0.5 + Math.random() * 0.3, r: 3 + Math.random() * 4 }); } },
    shake(ms = 250) { shakeT = ms / 1000; try { if (navigator.vibrate) navigator.vibrate(Math.min(200, Math.round(ms * .5))); } catch { /* */ } }, /* ריטוט באנדרואיד */
    // דמות מקלות בתוך משחק: pose במרחב 200x200 של הקטלוג (הרגליים ב-y=182), ממוקמת ב-(x,y) = מרכז הרגליים, בגודל scale
    stick(pose, x, y, scale = 0.35, { color = PAL.ink, far = PAL.muted, head = PAL.gold, width = 5, flip = false } = {}) {
      const px = ([a, b]) => [x + (flip ? -(a - 100) : (a - 100)) * scale, y + (b - 182) * scale];
      const seg = (pts, c, w) => { ctx.strokeStyle = c; ctx.lineWidth = w * scale * 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath(); pts.map(px).forEach(([a, b], i) => i ? ctx.lineTo(a, b) : ctx.moveTo(a, b)); ctx.stroke(); };
      seg([pose.neck, pose.le, pose.lh], far, width); seg([pose.hip, pose.lk, pose.lf], far, width);
      seg([pose.neck, pose.hip], color, width); seg([pose.neck, pose.re, pose.rh], color, width); seg([pose.hip, pose.rk, pose.rf], color, width);
      const [hx, hy] = px(pose.head); ctx.fillStyle = head; ctx.beginPath(); ctx.arc(hx, hy, 11 * scale, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = color; ctx.lineWidth = 2 * scale; ctx.stroke();
    },
    // פוזה מתוך רצף פריימים של תרגיל בזמן נתון
    anim(frames, ms) { return poseAt(frames, ms); },
    // דמות מלאה (חולצה, מכנסיים, פנים) מאותו שלד; kit מ-KITS ב-sprites.js
    player(pose, x, y, scale, kit, opts) { return drawPlayer(ctx, pose, x, y, scale, kit, opts); },
    crowd(fans, t, excited) { return drawCrowd(ctx, fans, t, excited); }, crowdGen,
  };
  function drawFx(dt) {
    pops.forEach(p => { p.t -= dt; p.y -= 40 * dt; ctx.globalAlpha = Math.max(0, p.t / 0.9); r.text(p.text, p.x, p.y, { size: p.size, color: p.color }); ctx.globalAlpha = 1; }); pops = pops.filter(p => p.t > 0);
    parts.forEach(p => { p.t -= dt; p.vy += 500 * dt; p.x += p.vx * dt; p.y += p.vy * dt; ctx.globalAlpha = Math.max(0, p.t / 0.6); r.circle(p.x, p.y, p.r, p.color); ctx.globalAlpha = 1; }); parts = parts.filter(p => p.t > 0);
    FX.forEach(f => { f.t += dt; f.x += f.vx * dt; f.y += f.vy * dt; f.vx *= (1 - 2 * dt); f.vy *= (1 - 2 * dt); f.rot += f.vr * dt; const k = f.t / f.life; const sz = f.s * (1 + (f.grow - 1) * k); if (!r.img(f.key, f.x, f.y, sz, sz, { rot: f.rot, alpha: Math.max(0, (f.alpha ?? 1) * (1 - k)) })) r.circle(f.x, f.y, sz * .3, `rgba(251,146,60,${Math.max(0, 1 - k)})`); }); FX = FX.filter(f => f.t < f.life);
  }

  function flash(big, small) { overlay.innerHTML = `<div class="gmsg pop"><b>${big}</b>${small ? `<span>${small}</span>` : ''}</div>`; overlay.classList.add('on'); }
  function hide() { overlay.classList.remove('on'); overlay.innerHTML = ''; }
  const fmt = s => `${Math.floor(s / 60)}:${String(Math.ceil(s) % 60).padStart(2, '0')}`;

  if (def.assets) preload(def.assets); preload(['fx/flame_01', 'fx/flame_03', 'fx/smoke_01', 'fx/smoke_04', 'fx/light_01', 'fx/star_06']); preloadSounds(); /* ספרייטים של המשחק נטענים כבר במסך הפתיחה */
  const finish = res => { disposeGame(); game = null; onEnd(res); };
  const disposeGame = () => { if (game && game.dispose) { try { game.dispose(); } catch (e) { console.warn('dispose', e); } } };
  function fresh() { disposeGame(); game = def.make(r, progress || null); running = true; try { if (localStorage.getItem('kidfit.debug')) window.__game = game; } catch {} /* מצב בדיקה: המשחק הרץ נחשף לסקריפטים */ hide(); if (!inDemo) setMusic(defaultMusic); if (net && net.route) net.route((t, p) => { if (r.netMsg && !ended) r.netMsg(t, p); }); }
  function loop(now) {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000 || 0); last = now;
    if (ended) return;
    if (!inDemo) { if (unlimited) elapsed += dt; else timeLeft -= dt; } timeEl.textContent = inDemo ? 'הדגמה' : unlimited ? fmt(elapsed) : fmt(Math.max(0, timeLeft)); timeEl.classList.toggle('low', !unlimited && timeLeft < 10);
    if (!unlimited && timeLeft <= 0) return end();
    if (!running) { if (pauseUntil && now >= pauseUntil) { pauseUntil = 0; if (resumeOnPause && game) { resumeOnPause = false; hide(); running = true; } else fresh(); } else return; }
    try {
      if (inDemo) { demoT += dt; if (demoT >= (def.demoDur || 12)) return endDemo(); def.demo(demoT, game, ctl, r); demoTick(dt); }
      game.update && game.update(dt);
      const shaking = shakeT > 0; if (shaking) { shakeT -= dt; ctx.save(); ctx.translate((Math.random() - .5) * 8, (Math.random() - .5) * 8); }
      game.draw && game.draw(); drawFx(dt);
      if (inDemo) drawFinger();
      if (shaking) ctx.restore();
    } catch (e) { console.error(def.id, e); end(); }
  }
  function end() {
    if (ended) return; ended = true; running = false; cancelAnimationFrame(raf); saveProgress(); if (net) net.close(); stopMusic();
    const newBest = score > best && score > 0;
    const stars = newBest || (best && score >= best * .9) ? 3 : best && score >= best * .5 ? 2 : 1; const starHtml = `<div class="gstars">${[1, 2, 3].map(i => `<span class="${i <= stars ? 'on' : ''}" style="animation-delay:${i * .18}s">★</span>`).join('')}</div>`;
    flash(newBest ? `שיא חדש! ${score}` : `ניקוד: ${score}`, `${best && !newBest ? `השיא שלך: ${best} · ` : ''}חזרה לאימון`); if (score > 0) overlay.querySelector('.gmsg b').insertAdjacentHTML('beforebegin', starHtml);
    if (newBest) {
      // חגיגת שער: מסתירים את ההודעה בזמן הסימולציה, ומראים אותה בסופה
      hide(); const stopFx = celebrateGoal(cv, { oldBest: best, newBest: score, sound, onText: (t, lang) => speak && speak(t, lang), onDone: () => { flash(`שיא חדש! ${score}`, 'חזרה לאימון'); overlay.querySelector('.gmsg').insertAdjacentHTML('beforeend', `<button class="btn primary big" id="gback">ממשיכים 💪</button>`); overlay.querySelector('#gback').onclick = () => finish({ score, best: Math.max(best, score) }); } });
      cv.onclick = () => { stopFx(); cv.onclick = null; flash(`שיא חדש! ${score}`, 'חזרה לאימון'); overlay.querySelector('.gmsg').insertAdjacentHTML('beforeend', `<button class="btn primary big" id="gback">ממשיכים 💪</button>`); overlay.querySelector('#gback').onclick = () => finish({ score, best: Math.max(best, score) }); };
      return;
    }
    overlay.querySelector('.gmsg').insertAdjacentHTML('beforeend', `<button class="btn primary big" id="gback">ממשיכים 💪</button>`);
    overlay.querySelector('#gback').onclick = () => finish({ score, best: Math.max(best, score) });
  }
  function start() { if (game) return; fresh(); if (!raf) { last = performance.now(); raf = requestAnimationFrame(loop); } }

  // ---- הדגמה ----
  const ctl = {
    mem: {}, get t() { return demoT; },
    say(text) { finger.caption = text; },
    moveTo(x, y) { finger.tx = x; finger.ty = y; finger.hold = true; },
    release() { if (finger.hold) { finger.hold = false; game.up && game.up(finger.x, finger.y); } },
    tap(x, y) { finger.x = finger.tx = x; finger.y = finger.ty = y; finger.press = .25; game.down && game.down(x, y); game.up && game.up(x, y); game.tap && game.tap(x, y); },
    swipe(dir, x = finger.x, y = finger.y) { const d = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] }[dir]; finger.x = x; finger.y = y; finger.swipe = { dx: d[0], dy: d[1], t: .3 }; finger.press = .3; game.swipe && game.swipe(dir, d[0] * 60, d[1] * 60); },
  };
  let wasHold = false;
  function demoTick(dt) { finger.press = Math.max(0, finger.press - dt); if (finger.swipe) { finger.swipe.t -= dt; finger.x += finger.swipe.dx * 260 * dt; finger.y += finger.swipe.dy * 260 * dt; if (finger.swipe.t <= 0) finger.swipe = null; }
    else { const k = Math.min(1, dt * 9); finger.x += (finger.tx - finger.x) * k; finger.y += (finger.ty - finger.y) * k; }
    if (finger.hold) { if (!wasHold) { game.down && game.down(finger.x, finger.y); r.isDown = true; } game.move && game.move(finger.x, finger.y); r.px = finger.x; r.py = finger.y; } else if (wasHold) r.isDown = false; wasHold = finger.hold; }
  function drawFinger() {
    // כתובית למטה
    if (finger.caption) { /* demoTop: כתוביות למעלה במשחקים שהפעולה בהם למטה; כתובית ארוכה נשברת לשתי שורות */ const lines = [finger.caption]; if (finger.caption.length > 27) { const cut = finger.caption.lastIndexOf(' ', Math.ceil(finger.caption.length / 2) + 6); if (cut > 6) { lines[0] = finger.caption.slice(0, cut); lines.push(finger.caption.slice(cut + 1)); } } const bh = 16 + lines.length * 26; const cy = def.demoTop ? 48 : H - 20 - bh; ctx.fillStyle = 'rgba(27,23,64,.82)'; const w = Math.min(W - 24, 40 + Math.max(...lines.map(l => l.length)) * 10.5); ctx.beginPath(); ctx.roundRect(W / 2 - w / 2, cy, w, bh, 14); ctx.fill(); lines.forEach((l, i) => r.text(l, W / 2, cy + 21 + i * 26, { size: 17, color: '#FDE047' })); }
    ctx.fillStyle = 'rgba(27,23,64,.7)'; ctx.beginPath(); ctx.roundRect(8, 8, 72, 26, 13); ctx.fill(); r.text('▶️ הדגמה', 44, 21, { size: 13, color: '#fff' });
    // האצבע: עיגול לחיצה ואמוג'י יד, הקצה בנקודה
    const pr = finger.press > 0 ? 22 + (1 - finger.press / .3) * 18 : 0; if (pr) { ctx.strokeStyle = `rgba(253,224,71,${finger.press * 3})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(finger.x, finger.y, pr, 0, Math.PI * 2); ctx.stroke(); }
    if (finger.hold) { ctx.fillStyle = 'rgba(253,224,71,.35)'; ctx.beginPath(); ctx.arc(finger.x, finger.y, 16, 0, Math.PI * 2); ctx.fill(); }
    ctx.save(); ctx.translate(finger.x + 14, finger.y + 30); ctx.font = '44px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.shadowColor = 'rgba(0,0,0,.4)'; ctx.shadowBlur = 8; ctx.fillText('👆', 0, 0); ctx.restore();
  }
  function startDemo() { if (!def.demo) return start(); inDemo = true; demoT = 0; ctl.mem = {}; finger.caption = ''; finger.hold = false; score = 0; scoreEl.textContent = '0'; fresh(); if (!raf) { last = performance.now(); raf = requestAnimationFrame(loop); } }
  function endDemo() { inDemo = false; running = false; ctl.release(); score = 0; scoreEl.textContent = '0'; disposeGame(); game = null; timeEl.textContent = fmt(timeLeft);
    if (demoOnly) { flash('הבנת? 👍', def.how); overlay.querySelector('.gmsg').insertAdjacentHTML('beforeend', `<div class="row" style="gap:8px;justify-content:center;flex-wrap:wrap"><button class="btn primary big" id="gagain" style="width:auto">עוד פעם ▶️</button><button class="btn big" id="gback" style="width:auto">חזרה</button></div>`); overlay.querySelector('#gagain').onclick = startDemo; overlay.querySelector('#gback').onclick = () => { ended = true; cancelAnimationFrame(raf); finish({ score: 0, best, demo: true }); }; }
    else intro(); }
  // פתיחה: איך משחקים (+ הדגמה כשיש תסריט)
  function intro() { flash(`${def.emoji} ${def.name}`, def.how); overlay.querySelector('.gmsg').insertAdjacentHTML('beforeend', `<div class="row" style="gap:8px;justify-content:center;flex-wrap:wrap"><button class="btn primary big" id="gstart" style="width:auto">יאללה! ▶️</button>${def.demo ? '<button class="btn big" id="gdemo" style="width:auto">איך משחקים? 🎬</button>' : ''}</div>`); overlay.querySelector('#gstart').onclick = start; const gd = overlay.querySelector('#gdemo'); if (gd) gd.onclick = startDemo; }
  if (demo && def.demo) startDemo(); else intro();
  host.querySelector('#gexit').onclick = () => { if (ended) return; if (inDemo) { ended = true; inDemo = false; cancelAnimationFrame(raf); return finish({ score: 0, best, demo: true }); } if (!game || confirm('לצאת מהמשחק? הניקוד עד עכשיו נשמר.')) end(); };

  // קלט: מגע/עכבר -> קואורדינטות לוגיות, זיהוי טאפ וסווייפ
  const pos = e => { const b = cv.getBoundingClientRect(); return [clamp((e.clientX - b.left) * W / b.width, 0, W), clamp((e.clientY - b.top) * H / b.height, 0, H)]; };
  let sx = 0, sy = 0, st = 0;
  const on = (name, fn) => cv.addEventListener(name, fn, { passive: false });
  on('pointerdown', e => { e.preventDefault(); if (!running || inDemo) return; cv.setPointerCapture?.(e.pointerId); { const [x, y] = pos(e); r.pointers[e.pointerId] = { x, y }; } [r.px, r.py] = pos(e); r.isDown = true; sx = r.px; sy = r.py; st = performance.now(); game.down && game.down(r.px, r.py); });
  on('pointermove', e => { if (!running || inDemo) return; if (r.pointers[e.pointerId]) { const [x, y] = pos(e); r.pointers[e.pointerId] = { x, y }; } [r.px, r.py] = pos(e); if (r.isDown) game.move && game.move(r.px, r.py); });
  on('pointercancel', e => { delete r.pointers[e.pointerId]; });
  on('pointerup', e => { delete r.pointers[e.pointerId]; if (!running || inDemo || !r.isDown) return; r.isDown = false; [r.px, r.py] = pos(e); const dx = r.px - sx, dy = r.py - sy;
    game.up && game.up(r.px, r.py);
    if (Math.hypot(dx, dy) < 18 && performance.now() - st < 400) game.tap && game.tap(r.px, r.py);
    else if (Math.hypot(dx, dy) >= 24 && game.swipe) game.swipe(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'), dx, dy); });
  on('pointercancel', () => { r.isDown = false; });
  const keys = e => { if (!running) return; const map = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
    if (map[e.key] && game.swipe) { e.preventDefault(); game.swipe(map[e.key], 0, 0); }
    if ((e.key === ' ' || e.key === 'Enter') && game.tap) { e.preventDefault(); game.tap(W / 2, H / 2); }
    game.key && game.key(e.key); };
  window.addEventListener('keydown', keys);
  return { stop() { ended = true; cancelAnimationFrame(raf); disposeGame(); game = null; window.removeEventListener('keydown', keys); if (net) net.close(); stopMusic(); }, isEnded: () => ended };
}
