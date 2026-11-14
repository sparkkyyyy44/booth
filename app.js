/* Booth — a free photo booth web app for iPad (and laptop).
   Everything is stored on the device (IndexedDB). No accounts needed,
   except an optional free Cloudinary account for QR-code downloads. */
'use strict';

/* ---------------- tiny helpers ---------------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const slug = s => (s || 'event').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'event';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clone = o => JSON.parse(JSON.stringify(o));
function toast(msg, ms = 2600) {
  const t = $('#toast'); t.textContent = msg; t.style.display = 'block';
  clearTimeout(toast._t); toast._t = setTimeout(() => t.style.display = 'none', ms);
}
function todayText() {
  return new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

/* ---------------- storage (IndexedDB) ---------------- */
const DB = {
  db: null,
  open() {
    return new Promise((res, rej) => {
      const r = indexedDB.open('booth', 2);
      r.onupgradeneeded = e => {
        const d = r.result;
        if (e.oldVersion < 1) {
          d.createObjectStore('events', { keyPath: 'id' });
          const p = d.createObjectStore('photos', { keyPath: 'id' });
          p.createIndex('eventId', 'eventId');
          d.createObjectStore('kv');
        }
        if (e.oldVersion < 2) d.createObjectStore('designs', { keyPath: 'id' }); // creator's drafts
      };
      r.onsuccess = () => { this.db = r.result; res(); };
      r.onerror = () => rej(r.error);
    });
  },
  tx(store, mode, fn) {
    return new Promise((res, rej) => {
      const t = this.db.transaction(store, mode), s = t.objectStore(store);
      let out; const q = fn(s);
      if (q) q.onsuccess = () => { out = q.result; };
      t.oncomplete = () => res(out); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
    });
  },
  all(store) { return this.tx(store, 'readonly', s => s.getAll()); },
  get(store, k) { return this.tx(store, 'readonly', s => s.get(k)); },
  put(store, v, k) { return this.tx(store, 'readwrite', s => k === undefined ? s.put(v) : s.put(v, k)); },
  del(store, k) { return this.tx(store, 'readwrite', s => s.delete(k)); },
};

/* ---------------- layouts, fonts, constants ---------------- */
const LAYOUTS = {
  strip4: { label: '1×4 strip', size: '2×6 in', W: 600, H: 1800, cols: 1, rows: 4, frac: .15 },
  strip3: { label: '1×3 strip', size: '2×6 in', W: 600, H: 1800, cols: 1, rows: 3, frac: .17 },
  strip2: { label: '1×2 strip', size: '2×6 in', W: 600, H: 1800, cols: 1, rows: 2, frac: .2 },
  grid4: { label: '2×2 grid', size: '4×6 in', W: 1200, H: 1800, cols: 2, rows: 2, frac: .13 },
  single: { label: 'Single photo', size: '6×4 in', W: 1800, H: 1200, cols: 1, rows: 1, frac: .16 },
  double4: { label: '2 strips on 4×6', size: '4×6 in, cut in half', W: 600, H: 1800, cols: 1, rows: 4, frac: .15, double: true },
};
// built-in system fonts (kept so older designs still render)
const SYS_FONTS = {
  script: { label: 'Snell Roundhand', css: '"Snell Roundhand","Apple Chancery","Brush Script MT",cursive', w: 700 },
  hand: { label: 'Bradley Hand', css: '"Bradley Hand","Noteworthy","Segoe Print",cursive', w: 700 },
  serif: { label: 'Didot', css: '"Didot","Bodoni 72",Georgia,serif', w: 700 },
  sans: { label: 'Avenir Next', css: '"Avenir Next","Helvetica Neue",Arial,sans-serif', w: 600 },
  display: { label: 'Futura', css: '"Futura","Avenir Next Condensed",Impact,sans-serif', w: 800 },
  type: { label: 'American Typewriter', css: '"American Typewriter","Courier New",monospace', w: 600 },
  chalk: { label: 'Chalkduster', css: '"Chalkduster","Marker Felt",fantasy', w: 400 },
  felt: { label: 'Marker Felt', css: '"Marker Felt","Comic Sans MS",cursive', w: 700 },
};
const FONTS = SYS_FONTS; // legacy title area
const WEB_FONTS = [
  { id: 'great-vibes', name: 'Great Vibes', cat: 'Script', w: [400] },
  { id: 'dancing-script', name: 'Dancing Script', cat: 'Script', w: [400,700] },
  { id: 'pacifico', name: 'Pacifico', cat: 'Script', w: [400] },
  { id: 'satisfy', name: 'Satisfy', cat: 'Script', w: [400] },
  { id: 'sacramento', name: 'Sacramento', cat: 'Script', w: [400] },
  { id: 'allura', name: 'Allura', cat: 'Script', w: [400] },
  { id: 'alex-brush', name: 'Alex Brush', cat: 'Script', w: [400] },
  { id: 'parisienne', name: 'Parisienne', cat: 'Script', w: [400] },
  { id: 'pinyon-script', name: 'Pinyon Script', cat: 'Script', w: [400] },
  { id: 'tangerine', name: 'Tangerine', cat: 'Script', w: [400,700] },
  { id: 'kaushan-script', name: 'Kaushan Script', cat: 'Script', w: [400] },
  { id: 'yellowtail', name: 'Yellowtail', cat: 'Script', w: [400] },
  { id: 'cookie', name: 'Cookie', cat: 'Script', w: [400] },
  { id: 'lobster', name: 'Lobster', cat: 'Script', w: [400] },
  { id: 'mrs-saint-delafield', name: 'Mrs Saint Delafield', cat: 'Script', w: [400] },
  { id: 'monsieur-la-doulaise', name: 'Monsieur La Doulaise', cat: 'Script', w: [400] },
  { id: 'playfair-display', name: 'Playfair Display', cat: 'Serif', w: [400,700] },
  { id: 'dm-serif-display', name: 'DM Serif Display', cat: 'Serif', w: [400] },
  { id: 'cormorant-garamond', name: 'Cormorant Garamond', cat: 'Serif', w: [400,700] },
  { id: 'lora', name: 'Lora', cat: 'Serif', w: [400,700] },
  { id: 'cinzel', name: 'Cinzel', cat: 'Serif', w: [400,700] },
  { id: 'cinzel-decorative', name: 'Cinzel Decorative', cat: 'Serif', w: [400,700] },
  { id: 'bodoni-moda', name: 'Bodoni Moda', cat: 'Serif', w: [400,700] },
  { id: 'abril-fatface', name: 'Abril Fatface', cat: 'Serif', w: [400] },
  { id: 'yeseva-one', name: 'Yeseva One', cat: 'Serif', w: [400] },
  { id: 'italiana', name: 'Italiana', cat: 'Serif', w: [400] },
  { id: 'marcellus', name: 'Marcellus', cat: 'Serif', w: [400] },
  { id: 'fraunces', name: 'Fraunces', cat: 'Serif', w: [400,700] },
  { id: 'libre-baskerville', name: 'Libre Baskerville', cat: 'Serif', w: [400,700] },
  { id: 'montserrat', name: 'Montserrat', cat: 'Sans', w: [400,700] },
  { id: 'poppins', name: 'Poppins', cat: 'Sans', w: [400,700] },
  { id: 'raleway', name: 'Raleway', cat: 'Sans', w: [400,700] },
  { id: 'josefin-sans', name: 'Josefin Sans', cat: 'Sans', w: [400,700] },
  { id: 'quicksand', name: 'Quicksand', cat: 'Sans', w: [400,700] },
  { id: 'nunito', name: 'Nunito', cat: 'Sans', w: [400,700] },
  { id: 'league-spartan', name: 'League Spartan', cat: 'Sans', w: [400,700] },
  { id: 'space-grotesk', name: 'Space Grotesk', cat: 'Sans', w: [400,700] },
  { id: 'dm-sans', name: 'DM Sans', cat: 'Sans', w: [400,700] },
  { id: 'syne', name: 'Syne', cat: 'Sans', w: [400,700] },
  { id: 'inter', name: 'Inter', cat: 'Sans', w: [400,700] },
  { id: 'bebas-neue', name: 'Bebas Neue', cat: 'Display', w: [400] },
  { id: 'anton', name: 'Anton', cat: 'Display', w: [400] },
  { id: 'oswald', name: 'Oswald', cat: 'Display', w: [400,700] },
  { id: 'archivo-black', name: 'Archivo Black', cat: 'Display', w: [400] },
  { id: 'righteous', name: 'Righteous', cat: 'Display', w: [400] },
  { id: 'bungee', name: 'Bungee', cat: 'Display', w: [400] },
  { id: 'monoton', name: 'Monoton', cat: 'Display', w: [400] },
  { id: 'lilita-one', name: 'Lilita One', cat: 'Display', w: [400] },
  { id: 'luckiest-guy', name: 'Luckiest Guy', cat: 'Display', w: [400] },
  { id: 'bangers', name: 'Bangers', cat: 'Display', w: [400] },
  { id: 'fredoka', name: 'Fredoka', cat: 'Display', w: [400,700] },
  { id: 'chewy', name: 'Chewy', cat: 'Display', w: [400] },
  { id: 'mountains-of-christmas', name: 'Mountains of Christmas', cat: 'Display', w: [400,700] },
  { id: 'berkshire-swash', name: 'Berkshire Swash', cat: 'Display', w: [400] },
  { id: 'caveat', name: 'Caveat', cat: 'Handwritten', w: [400,700] },
  { id: 'amatic-sc', name: 'Amatic SC', cat: 'Handwritten', w: [400,700] },
  { id: 'shadows-into-light', name: 'Shadows Into Light', cat: 'Handwritten', w: [400] },
  { id: 'permanent-marker', name: 'Permanent Marker', cat: 'Handwritten', w: [400] },
  { id: 'indie-flower', name: 'Indie Flower', cat: 'Handwritten', w: [400] },
  { id: 'gloria-hallelujah', name: 'Gloria Hallelujah', cat: 'Handwritten', w: [400] },
  { id: 'homemade-apple', name: 'Homemade Apple', cat: 'Handwritten', w: [400] },
  { id: 'rock-salt', name: 'Rock Salt', cat: 'Handwritten', w: [400] },
  { id: 'patrick-hand', name: 'Patrick Hand', cat: 'Handwritten', w: [400] },
  { id: 'special-elite', name: 'Special Elite', cat: 'Handwritten', w: [400] },
  { id: 'press-start-2p', name: 'Press Start 2P', cat: 'Display', w: [400] },
];
const FONT_CATS = ['All', 'Script', 'Serif', 'Sans', 'Display', 'Handwritten'];
function fontInfo(id) {
  const f = WEB_FONTS.find(x => x.id === id);
  if (f) return { name: f.name, css: `'${f.name}', sans-serif`, normal: f.w[0], bold: f.w.includes(700) ? 700 : f.w[f.w.length - 1] };
  const s = SYS_FONTS[id] || SYS_FONTS.sans; return { name: s.label, css: s.css, normal: 400, bold: s.w };
}
function fontStr(t, px) { const f = fontInfo(t.font); return `${t.italic ? 'italic ' : ''}${t.bold ? f.bold : f.normal} ${px}px ${f.css}`; }
const loadedFonts = new Set();
async function ensureFonts(ev) {
  const need = [];
  for (const it of ev.items || []) if (it.type === 'text') { const k = fontStr(it, 40); if (!loadedFonts.has(k)) need.push(k); }
  if (!need.length || !document.fonts) return;
  await Promise.all(need.map(k => document.fonts.load(k).then(() => loadedFonts.add(k)).catch(() => { })));
}
const STICKERS = {
  Christmas: ['🎄', '🎅', '🤶', '⭐', '❄️', '☃️', '🎁', '🔔', '🦌', '🕯️', '🍪', '🧦', '🎀', '🌟', '🍬', '🛷', '🥛', '🧑‍🎄'],
  Party: ['🎉', '🎊', '🎈', '🥂', '🍾', '🎂', '🍰', '🪅', '🎆', '🎇', '✨', '🪩'],
  Love: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🤍', '💖', '💕', '💐', '🌹', '💍'],
  Fun: ['😎', '🥳', '😍', '🤩', '😂', '👑', '🕶️', '📸', '🎤', '🎶', '💯', '🔥'],
  Nature: ['🌸', '🌺', '🌻', '🌿', '🍃', '🌙', '☀️', '🌈', '🦋', '🌴', '🍂', '⛄'],
};
const PATTERNS = { none: 'None', snow: 'Snowflakes', stars: 'Stars', confetti: 'Confetti', dots: 'Dots', stripes: 'Stripes' };
const FILTERS = { none: 'Normal', bw: 'B&W', warm: 'Warm', cool: 'Cool', vintage: 'Vintage', glow: 'Bright' };
const PALETTE = ['#000000', '#545454', '#737373', '#a6a6a6', '#d9d9d9', '#ffffff', '#fff4e0',
  '#ff3131', '#ff5757', '#ff66c4', '#cb6ce6', '#8c52ff', '#5e17eb', '#3b1f8f',
  '#03989e', '#00c2cb', '#5ce1e6', '#38b6ff', '#5271ff', '#004aad', '#1b4a72',
  '#00bf63', '#7ed957', '#c1ff72', '#ffde59', '#ffbd59', '#ff914d', '#c9a227',
  '#b3122e', '#7a0b1f', '#14633f', '#0a3120', '#8a6440', '#f2c6d0', '#e8f6ff'];
const TEXT_STYLES = {
  h1: { s: 'Add a heading', font: 'montserrat', size: .075, bold: true, color: '#18191f' },
  h2: { s: 'Add a subheading', font: 'montserrat', size: .05, bold: true, color: '#18191f' },
  body: { s: 'Add a little bit of body text', font: 'montserrat', size: .032, bold: false, color: '#18191f' },
};
const COMBOS = [
  { s: 'Merry Christmas', font: 'great-vibes', size: .12, color: '#b3122e' },
  { s: 'SAVE THE DATE', font: 'bebas-neue', size: .1, color: '#18191f', ls: .08 },
  { s: 'Happy New Year', font: 'playfair-display', size: .075, bold: true, italic: true, color: '#b88a1b' },
  { s: 'Cheers!', font: 'pacifico', size: .1, color: '#ffffff', glow: true, glowColor: '#ff3fa4', glowSize: 1.2 },
  { s: 'Family Name', font: 'cinzel', size: .065, bold: true, color: '#1b4a72', ls: .05 },
  { s: 'Celebrate', font: 'mountains-of-christmas', size: .1, bold: true, color: '#c8102e', outline: true, outlineColor: '#ffffff', outlineW: 1 },
  { s: 'PHOTO BOOTH', font: 'monoton', size: .065, color: '#e8618c' },
  { s: 'with love', font: 'sacramento', size: .12, color: '#c2185b' },
  { s: 'PARTY TIME', font: 'luckiest-guy', size: .09, color: '#ffd166', outline: true, outlineColor: '#18191f', outlineW: 1.2 },
  { s: 'Noche Buena', font: 'josefin-sans', size: .065, upper: true, color: '#14633f', ls: .15, bold: true },
];
const SHAPES = [
  { k: 'rect', n: 'Square', svg: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" fill="#5f6370"/></svg>' },
  { k: 'round', n: 'Rounded', svg: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="5" fill="#5f6370"/></svg>' },
  { k: 'ellipse', n: 'Circle', svg: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5" fill="#5f6370"/></svg>' },
  { k: 'line', n: 'Line', svg: '<svg viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="2.4" rx="1.2" fill="#5f6370"/></svg>' },
  { k: 'star', n: 'Star', svg: '<svg viewBox="0 0 24 24"><path d="M12 3l2.7 5.8 6.3.7-4.7 4.3 1.3 6.2L12 17l-5.6 3 1.3-6.2L3 9.5l6.3-.7z" fill="#5f6370"/></svg>' },
  { k: 'heart', n: 'Heart', svg: '<svg viewBox="0 0 24 24"><path d="M12 20s-7-4.4-8.6-9C2.3 7.6 4.6 4.5 7.8 4.5c1.9 0 3.3 1 4.2 2.4.9-1.4 2.3-2.4 4.2-2.4 3.2 0 5.5 3.1 4.4 6.5C19 15.6 12 20 12 20z" fill="#5f6370"/></svg>' },
  { k: 'tri', n: 'Triangle', svg: '<svg viewBox="0 0 24 24"><path d="M12 4l9 16H3z" fill="#5f6370"/></svg>' },
  { k: 'banner', n: 'Banner', svg: '<svg viewBox="0 0 24 24"><path d="M2 7h20l-3 5 3 5H2l3-5z" fill="#5f6370"/></svg>' },
  { k: 'frame', n: 'Outline box', svg: '<svg viewBox="0 0 24 24"><rect x="4.5" y="4.5" width="15" height="15" fill="none" stroke="#5f6370" stroke-width="2.4"/></svg>' },
  { k: 'ring', n: 'Outline circle', svg: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="none" stroke="#5f6370" stroke-width="2.4"/></svg>' },
];

/* A DESIGN is made by the creator (published in library.json) or by anyone as "my own design".
   An EVENT is made from a design: a name, unlocked words and booth settings. */
const TEXT_KEYS = ['title', 'subtitle', 'showDate', 'dateText'];
const BOOTH_KEYS = ['countdown', 'autoReturn', 'mirror', 'sound', 'attractMsg'];
function newDesign(layout = 'strip4', mine = false) {
  return {
    id: (mine ? 'm-' : 'd-') + uid(), mine, name: 'Untitled design', layout, created: Date.now(), allowText: false,
    bgStyle: 'solid', c1: '#ffffff', c2: '#e9e6ef', pattern: 'none', pColor: '#000000', pAmt: .2,
    bgImage: null, overlayImage: null,
    textPos: 'bottom', textSize: 1, title: '', subtitle: '', showDate: false, dateText: '',
    font: 'sans', textColor: '#222222', titleScale: 1,
    padding: 30, gap: 18, radius: 0, borderW: 0, borderColor: '#ffffff', filter: 'none',
    items: [],
  };
}
function newTextItem(style, x = .5, y = .5) {
  return Object.assign({
    id: 'i-' + uid(), type: 'text', s: 'Your text', x, y, rot: 0, opacity: 1, font: 'montserrat', size: .06, color: '#18191f',
    bold: false, italic: false, upper: false, align: 'center', lineH: 1.2, ls: 0,
    shadow: false, shadowBlur: .25, shadowOff: .06, shadowA: .55, shadowColor: '#000000',
    outline: false, outlineColor: '#000000', outlineW: 1, glow: false, glowColor: '#ffffff', glowSize: 1, hollow: false, hollowW: 1,
    editable: false,
  }, style);
}
function migrate(d) {
  if (!d || d.items) return d;
  d.items = [];
  for (const s of d.stickers || []) d.items.push({ id: 'i-' + uid(), type: 'sticker', e: s.e, x: s.x, y: s.y, size: s.size, rot: s.rot || 0, opacity: 1 });
  for (const t of d.texts || []) d.items.push(newTextItem({ ...t, type: 'text', id: t.id || 'i-' + uid(), bold: t.bold !== false }));
  delete d.stickers; delete d.texts;
  return d;
}
function newEventFrom(d, name) {
  return {
    id: uid(), name: name || d.name, designId: d.id, snapshot: clone(d), created: Date.now(),
    text: { title: d.title, subtitle: d.subtitle, showDate: d.showDate, dateText: d.dateText }, textEdits: {},
    countdown: 3, autoReturn: 30, mirror: true, sound: true, attractMsg: 'Tap to start',
  };
}
/* the designer's latest version wins; the copy saved in the event is a fallback */
function designFor(ev) { return allDesigns().find(d => d.id === ev.designId) || migrate(ev.snapshot); }
function compose(ev) {
  const out = migrate(clone(designFor(ev)));
  if (out.allowText && ev.text) Object.assign(out, ev.text);
  for (const it of out.items) if (it.type === 'text' && it.editable && ev.textEdits && ev.textEdits[it.id] != null) it.s = ev.textEdits[it.id];
  for (const k of BOOTH_KEYS) out[k] = ev[k];
  out.id = ev.id; out.name = ev.name;
  return out;
}

/* ---------------- rendering ---------------- */
function geom(ev) {
  const L = LAYOUTS[ev.layout] || LAYOUTS.strip4;
  const { W, H, cols, rows } = L, u = Math.min(W, H) / 600;
  const pad = ev.padding * u, gap = ev.gap * u;
  const th = ev.textPos === 'none' ? 0 : H * L.frac * ev.textSize;
  const top = ev.textPos === 'top';
  const area = { x: pad, y: pad + (top ? th : 0), w: W - 2 * pad, h: H - 2 * pad - th };
  const text = top ? { x: pad, y: pad, w: W - 2 * pad, h: th } : { x: pad, y: H - pad - th, w: W - 2 * pad, h: th };
  const sw = (area.w - (cols - 1) * gap) / cols, sh = (area.h - (rows - 1) * gap) / rows;
  const slots = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++)
    slots.push({ x: area.x + c * (sw + gap), y: area.y + r * (sh + gap), w: sw, h: sh });
  return { W, H, u, slots, text, L };
}
function shotsFor(ev) { const L = LAYOUTS[ev.layout]; return L.cols * L.rows; }

function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function rr(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function drawPattern(ctx, ev, W, H, u) {
  const p = ev.pattern; if (!p || p === 'none') return;
  const R = rng(7); ctx.save(); ctx.globalAlpha = ev.pAmt; ctx.fillStyle = ctx.strokeStyle = ev.pColor;
  if (p === 'snow') {
    const n = Math.round(W * H / (90 * 90 * u * u));
    for (let i = 0; i < n; i++) {
      const x = R() * W, y = R() * H, s = (6 + R() * 16) * u;
      ctx.save(); ctx.translate(x, y); ctx.rotate(R() * Math.PI); ctx.lineWidth = Math.max(1, s / 7); ctx.lineCap = 'round';
      for (let k = 0; k < 6; k++) {
        ctx.rotate(Math.PI / 3); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, s);
        ctx.moveTo(0, s * .55); ctx.lineTo(s * .25, s * .78); ctx.moveTo(0, s * .55); ctx.lineTo(-s * .25, s * .78); ctx.stroke();
      }
      ctx.restore();
    }
  } else if (p === 'stars') {
    const n = Math.round(W * H / (110 * 110 * u * u));
    for (let i = 0; i < n; i++) {
      const x = R() * W, y = R() * H, s = (4 + R() * 12) * u;
      ctx.beginPath();
      for (let k = 0; k < 10; k++) { const a = k * Math.PI / 5 - Math.PI / 2, rad = k % 2 ? s * .45 : s; ctx.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad); }
      ctx.fill();
    }
  } else if (p === 'confetti') {
    const cols = [ev.pColor, '#ffffff', '#ff5a6e', '#7cc6fe', '#ffd166'];
    const n = Math.round(W * H / (60 * 60 * u * u));
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = cols[i % cols.length]; ctx.save(); ctx.translate(R() * W, R() * H); ctx.rotate(R() * 6.28);
      if (R() < .5) ctx.fillRect(-5 * u, -2 * u, 10 * u, 4 * u); else { ctx.beginPath(); ctx.arc(0, 0, 3 * u, 0, 6.28); ctx.fill(); }
      ctx.restore();
    }
  } else if (p === 'dots') {
    const step = 34 * u;
    for (let y = 0, row = 0; y < H + step; y += step, row++) for (let x = (row % 2) * step / 2; x < W + step; x += step) { ctx.beginPath(); ctx.arc(x, y, 5 * u, 0, 6.28); ctx.fill(); }
  } else if (p === 'stripes') {
    const step = 46 * u; ctx.lineWidth = step / 2.2;
    for (let x = -H; x < W + H; x += step) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + H, H); ctx.stroke(); }
  }
  ctx.restore();
}
function applyFilter(ctx, w, h, f) {
  if (!f || f === 'none') return;
  const img = ctx.getImageData(0, 0, w, h), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i], g = d[i + 1], b = d[i + 2];
    if (f === 'bw') { const l = (.299 * r + .587 * g + .114 * b - 128) * 1.12 + 128; r = g = b = l; }
    else if (f === 'warm') { r = r * 1.08 + 10; g = g * 1.02 + 4; b = b * .88; }
    else if (f === 'cool') { r = r * .92; g = g * 1.0; b = b * 1.08 + 10; }
    else if (f === 'vintage') {
      const sr = .393 * r + .769 * g + .189 * b, sg = .349 * r + .686 * g + .168 * b, sb = .272 * r + .534 * g + .131 * b;
      r = (r * .5 + sr * .5) * .9 + 22; g = (g * .5 + sg * .5) * .9 + 18; b = (b * .5 + sb * .5) * .85 + 14;
    } else if (f === 'glow') { r = (r - 128) * 1.06 + 142; g = (g - 128) * 1.06 + 140; b = (b - 128) * 1.06 + 138; }
    d[i] = r; d[i + 1] = g; d[i + 2] = b;
  }
  ctx.putImageData(img, 0, 0);
}
const imgCache = new Map();
function loadImg(src) {
  if (!src) return Promise.resolve(null);
  if (imgCache.has(src)) return imgCache.get(src);
  const p = new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
  imgCache.set(src, p); return p;
}
function drawCover(ctx, src, sw0, sh0, x, y, w, h) {
  const a = w / h, sa = sw0 / sh0; let sx = 0, sy = 0, sw = sw0, sh = sh0;
  if (sa > a) { sw = sh0 * a; sx = (sw0 - sw) / 2; } else { sh = sw0 / a; sy = (sh0 - sh) / 2; }
  ctx.drawImage(src, sx, sy, sw, sh, x, y, w, h);
}
function fitFont(ctx, text, fontCss, weight, size, maxW) {
  let s = size; ctx.font = `${weight} ${s}px ${fontCss}`;
  while (s > 8 && ctx.measureText(text).width > maxW) { s *= .93; ctx.font = `${weight} ${s}px ${fontCss}`; }
  return s;
}
function hexA(hex, a) { const h = (hex || '#000000').replace('#', ''); const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; }
function shapePath(ctx, k, w, h, radius) {
  ctx.beginPath();
  if (k === 'ellipse' || k === 'ring') ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
  else if (k === 'star') { for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5 - Math.PI / 2, r = i % 2 ? .42 : 1; ctx.lineTo(Math.cos(a) * w / 2 * r, Math.sin(a) * h / 2 * r + h * .05); } ctx.closePath(); }
  else if (k === 'heart') {
    const x = -w / 2, y = -h / 2;
    ctx.moveTo(0, y + h * .98);
    ctx.bezierCurveTo(x - w * .02, y + h * .62, x + w * .02, y + h * .02, x + w * .27, y + h * .02);
    ctx.bezierCurveTo(x + w * .42, y + h * .02, 0, y + h * .14, 0, y + h * .26);
    ctx.bezierCurveTo(0, y + h * .14, x + w * .58, y + h * .02, x + w * .73, y + h * .02);
    ctx.bezierCurveTo(x + w * .98, y + h * .02, x + w * 1.02, y + h * .62, 0, y + h * .98); ctx.closePath();
  }
  else if (k === 'tri') { ctx.moveTo(0, -h / 2); ctx.lineTo(w / 2, h / 2); ctx.lineTo(-w / 2, h / 2); ctx.closePath(); }
  else if (k === 'banner') { const n = w * .12; ctx.moveTo(-w / 2, -h / 2); ctx.lineTo(w / 2, -h / 2); ctx.lineTo(w / 2 - n, 0); ctx.lineTo(w / 2, h / 2); ctx.lineTo(-w / 2, h / 2); ctx.lineTo(-w / 2 + n, 0); ctx.closePath(); }
  else rr(ctx, -w / 2, -h / 2, w, h, k === 'line' ? h / 2 : (radius || 0) * Math.min(w, h) / 2);
}
/* draws one element centred at (0,0); returns its unrotated size in px */
function drawItem(ctx, it, W, H) {
  const m = Math.min(W, H);
  ctx.globalAlpha = it.opacity ?? 1;
  if (it.type === 'sticker') {
    const size = it.size * m;
    ctx.font = `${size}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(it.e, 0, size * .04);
    return { w: size * 1.15, h: size * 1.15 };
  }
  if (it.type === 'shape') {
    const w = it.w * W, h = it.h * H;
    shapePath(ctx, it.shape, w, h, it.radius);
    if (it.shape === 'frame' || it.shape === 'ring') { ctx.lineWidth = Math.max(2, (it.stroke || .03) * m); ctx.strokeStyle = it.fill; ctx.stroke(); }
    else { ctx.fillStyle = it.fill; ctx.fill(); }
    return { w, h };
  }
  // text
  const size = it.size * m, lh = size * (it.lineH || 1.2);
  let s = String(it.s ?? ''); if (it.upper) s = s.toUpperCase();
  const lines = s.split('\n');
  ctx.font = fontStr(it, size); ctx.textBaseline = 'middle';
  const hasLS = 'letterSpacing' in ctx; if (hasLS) ctx.letterSpacing = ((it.ls || 0) * size) + 'px';
  const bw = Math.max(size * .4, ...lines.map(l => ctx.measureText(l).width)), bh = Math.max(1, lines.length) * lh;
  const ax = it.align === 'left' ? -bw / 2 : it.align === 'right' ? bw / 2 : 0;
  ctx.textAlign = it.align || 'center';
  lines.forEach((l, k) => {
    const y = -bh / 2 + lh * (k + .5);
    if (it.glow) {
      ctx.save(); ctx.shadowColor = it.glowColor || '#fff'; ctx.fillStyle = it.glowColor || '#fff';
      for (const g of [.9, .5, .25]) { ctx.shadowBlur = size * g * (it.glowSize ?? 1); ctx.fillText(l, ax, y); }
      ctx.restore();
    }
    ctx.save();
    if (it.shadow) { ctx.shadowColor = hexA(it.shadowColor, it.shadowA ?? .55); ctx.shadowBlur = size * (it.shadowBlur ?? .25); ctx.shadowOffsetY = size * (it.shadowOff ?? .06); }
    if (it.outline) { ctx.lineJoin = 'round'; ctx.lineWidth = size * .12 * (it.outlineW ?? 1); ctx.strokeStyle = it.outlineColor || '#000'; ctx.strokeText(l, ax, y); ctx.shadowColor = 'transparent'; }
    if (it.hollow) { ctx.lineJoin = 'round'; ctx.lineWidth = size * .04 * (it.hollowW ?? 1); ctx.strokeStyle = it.color || '#000'; ctx.strokeText(l, ax, y); }
    else { ctx.fillStyle = it.color || '#000'; ctx.fillText(l, ax, y); }
    ctx.restore();
  });
  if (hasLS) ctx.letterSpacing = '0px';
  return { w: bw, h: bh };
}
const SKIP_KEYS = new Set(['items', 'name', 'id', 'mine', 'created', 'updated', '_draft', '_pub', '_mine', 'countdown', 'autoReturn', 'mirror', 'sound', 'attractMsg', 'snapshot', 'textEdits', 'text', 'designId', 'allowText']);
function baseKey(ev) {
  const o = {};
  for (const k in ev) if (!SKIP_KEYS.has(k)) { let v = ev[k]; if (typeof v === 'string' && v.length > 200) v = v.length + ':' + v.slice(-64); o[k] = v; }
  return JSON.stringify(o);
}
let baseCache = { key: null, c: null };
async function drawBase(ctx, ev, g, photos) {
  const { W, H, u } = g;
  if (ev.bgStyle === 'gradient') { const gr = ctx.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, ev.c1); gr.addColorStop(1, ev.c2); ctx.fillStyle = gr; }
  else ctx.fillStyle = ev.c1;
  ctx.fillRect(0, 0, W, H);
  drawPattern(ctx, ev, W, H, u);
  const bg = await loadImg(ev.bgImage);
  if (bg) drawCover(ctx, bg, bg.naturalWidth, bg.naturalHeight, 0, 0, W, H);
  // legacy title area lines (older designs only)
  if (ev.textPos !== 'none' && g.text.h > 0 && (ev.title || ev.subtitle || (ev.showDate && ev.dateText))) {
    const f = SYS_FONTS[ev.font] || SYS_FONTS.sans, t = { x: g.text.x, y: g.text.y + g.text.h * .07, w: g.text.w, h: g.text.h * .86 }, lines = [];
    const base = 62 * u * (ev.titleScale || 1) * Math.min(1.4, ev.textSize);
    if (ev.title) lines.push({ s: ev.title, size: base, w: f.w, font: f.css });
    if (ev.subtitle) lines.push({ s: ev.subtitle, size: base * .48, w: 600, font: SYS_FONTS.sans.css });
    if (ev.showDate && ev.dateText) lines.push({ s: ev.dateText, size: base * .36, w: 500, font: SYS_FONTS.sans.css });
    ctx.fillStyle = ev.textColor; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const l of lines) l.size = fitFont(ctx, l.s, l.font, l.w, l.size, t.w * .94);
    let total = lines.reduce((a, l) => a + l.size * 1.18, 0);
    const k = total > t.h ? t.h / total : 1; total *= k;
    let y = t.y + (t.h - total) / 2;
    for (const l of lines) { const s = l.size * k; ctx.font = `${l.w} ${s}px ${l.font}`; ctx.fillText(l.s, W / 2, y + s * .59); y += s * 1.18; }
  }
  g.slots.forEach((s, i) => {
    const r = ev.radius * u, b = ev.borderW * u;
    if (b > 0) { ctx.fillStyle = ev.borderColor; rr(ctx, s.x - b, s.y - b, s.w + 2 * b, s.h + 2 * b, r + b); ctx.fill(); }
    ctx.save(); rr(ctx, s.x, s.y, s.w, s.h, r); ctx.clip();
    const p = photos[i];
    if (p) {
      const tmp = document.createElement('canvas'); tmp.width = Math.round(s.w); tmp.height = Math.round(s.h);
      const tc = tmp.getContext('2d'); drawCover(tc, p, p.width, p.height, 0, 0, tmp.width, tmp.height);
      applyFilter(tc, tmp.width, tmp.height, ev.filter);
      ctx.drawImage(tmp, s.x, s.y, s.w, s.h);
    } else {
      const gr = ctx.createLinearGradient(s.x, s.y, s.x, s.y + s.h); gr.addColorStop(0, '#dcd8e4'); gr.addColorStop(1, '#b4aec2');
      ctx.fillStyle = gr; ctx.fillRect(s.x, s.y, s.w, s.h);
      ctx.fillStyle = '#ffffffd0'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `600 ${Math.min(s.h, s.w) * .14}px Inter, sans-serif`; ctx.fillText('Photo ' + (i + 1), s.x + s.w / 2, s.y + s.h / 2);
    }
    ctx.restore();
  });
  const ov = await loadImg(ev.overlayImage);
  if (ov) ctx.drawImage(ov, 0, 0, W, H);
}
/* photos: array of canvases (or none => placeholders). opts: hits (array to fill), hide (item id), preview (cache base) */
async function render(ev, photos = [], opts = {}) {
  const g = geom(ev), { W, H } = g;
  await ensureFonts(ev);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  if (opts.preview && !photos.length) {
    const key = baseKey(ev);
    if (baseCache.key !== key) {
      const b = document.createElement('canvas'); b.width = W; b.height = H;
      await drawBase(b.getContext('2d'), ev, g, []); baseCache = { key, c: b };
    }
    ctx.drawImage(baseCache.c, 0, 0);
  } else await drawBase(ctx, ev, g, photos);
  for (const it of ev.items || []) {
    ctx.save(); ctx.translate(it.x * W, it.y * H); ctx.rotate((it.rot || 0) * Math.PI / 180);
    if (opts.hide === it.id) ctx.globalAlpha = 0;
    const sz = it.id === opts.hide ? measureItem(it, W, H) : drawItem(ctx, it, W, H);
    ctx.restore();
    if (opts.hits) opts.hits.push({ id: it.id, x: it.x, y: it.y, w: sz.w / W, h: sz.h / H, rot: it.rot || 0 });
  }
  if (g.L.double) {
    const d = document.createElement('canvas'); d.width = W * 2; d.height = H;
    const dc = d.getContext('2d'); dc.drawImage(c, 0, 0); dc.drawImage(c, W, 0);
    return d;
  }
  return c;
}
const measureCtx = document.createElement('canvas').getContext('2d');
function measureItem(it, W, H) { measureCtx.save(); measureCtx.globalAlpha = 0; const r = drawItem(measureCtx, it, W, H); measureCtx.restore(); return r; }
async function thumbURL(ev, maxH = 400) {
  const c = await render(ev);
  const k = maxH / c.height, t = document.createElement('canvas');
  t.width = Math.round(c.width * k); t.height = maxH; t.getContext('2d').drawImage(c, 0, 0, t.width, t.height);
  return t.toDataURL('image/jpeg', .85);
}
function toBlob(c, q = .92) { return new Promise(r => c.toBlob(r, 'image/jpeg', q)); }

/* ---------------- app state & navigation ---------------- */
const S = {
  events: [], settings: { cam: 'user', pin: '', cloud: '', preset: '' },
  library: { designs: [] }, drafts: [], mine: [], creator: false,
  ed: null, mode: 'event', dirty: false,
};
function go(id) {
  if (id === 'creator' && !S.creator) return;
  closePop();
  $$('.screen').forEach(s => s.classList.toggle('active', s.id === id));
  if (id === 'home') renderHome();
  if (id === 'gallery') renderGallery();
  if (id === 'settings') renderSettings();
  if (id === 'creator') renderCreator();
}
$$('[data-go]').forEach(b => b.onclick = () => go(b.dataset.go));
function openModal(html) { $('#modalBox').innerHTML = html; $('#modal').classList.add('on'); return $('#modalBox'); }
function closeModal() { $('#modal').classList.remove('on'); $('#modalBox').innerHTML = ''; }
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
async function saveEvent(ev) { ev.updated = Date.now(); await DB.put('events', clone(ev)); }
async function loadEvents() { S.events = (await DB.all('events')).sort((a, b) => (b.updated || b.created) - (a.updated || a.created)); }

/* ---------------- design library ---------------- */
async function loadLibrary() {
  try {
    const r = await fetch('library.json?t=' + Date.now(), { cache: 'no-store' });
    if (r.ok) { const lib = await r.json(); if (Array.isArray(lib.designs)) { lib.designs.forEach(migrate); S.library = lib; await DB.put('kv', lib, 'library'); return; } }
  } catch (e) { /* offline: use saved copy */ }
  S.library = (await DB.get('kv', 'library')) || { designs: [] };
  S.library.designs.forEach(migrate);
}
async function loadDrafts() {
  const all = (await DB.all('designs')).sort((a, b) => a.created - b.created);
  all.forEach(migrate);
  S.drafts = all.filter(d => !d.mine);
  S.mine = all.filter(d => d.mine);
}
function allDesigns() {
  const list = S.library.designs.map(d => ({ ...d, _pub: true }));
  if (S.creator) for (const d of S.drafts) {
    const i = list.findIndex(x => x.id === d.id), item = { ...d, _draft: true };
    if (i >= 0) list[i] = item; else list.push(item);
  }
  for (const d of S.mine || []) list.push({ ...d, _mine: true });
  return list;
}

/* ---------------- HOME ---------------- */
function cardHTML(id, name, meta, actions) {
  return `<div class="card" data-id="${id}"><div class="thumb"><img alt=""></div>
    <div class="body"><div class="name">${name}</div><div class="meta">${meta}</div>
    <div class="actions">${actions}</div></div></div>`;
}
async function renderHome() {
  await loadEvents(); await loadDrafts();
  const box = $('#eventCards');
  box.innerHTML = S.events.length ? S.events.map(ev => {
    const d = designFor(ev);
    return cardHTML(ev.id, esc(ev.name), `${esc(d.name)} · ${LAYOUTS[d.layout].label}`,
      `<button class="btn sm primary" data-a="start">Start ▶</button><button class="btn sm" data-a="edit">Edit</button><button class="btn sm ghost" data-a="del">Delete</button>`);
  }).join('') : `<div class="empty" style="grid-column:1/-1">No events yet. Tap <b>＋ New event</b> to make one.</div>`;
  for (const card of $$('.card[data-id]', box)) {
    const ev = S.events.find(e => e.id === card.dataset.id);
    thumbURL(compose(ev)).then(u => $('img', card).src = u);
    card.onclick = async e => {
      const a = e.target.dataset.a; if (!a) return;
      if (a === 'start') startBooth(compose(ev));
      if (a === 'edit') openEditor('event', ev);
      if (a === 'del' && confirm(`Delete "${ev.name}"? Photos already taken stay in the Gallery.`)) { await DB.del('events', ev.id); renderHome(); }
    };
  }
  const mb = $('#myDesigns');
  mb.innerHTML = `<button class="card newcard" id="newMine"><b>＋</b>Create my own design<span style="font-size:12px;font-weight:500">Upload a frame, add text anywhere</span></button>` +
    S.mine.map(d => cardHTML(d.id, esc(d.name), LAYOUTS[d.layout].label,
      `<button class="btn sm primary" data-a="use">Use</button><button class="btn sm" data-a="edit">Edit</button><button class="btn sm ghost" data-a="dup">Copy</button><button class="btn sm ghost" data-a="del">Delete</button>`)).join('');
  $('#newMine').onclick = () => newDesignDialog(true);
  for (const card of $$('.card[data-id]', mb)) {
    const d = S.mine.find(x => x.id === card.dataset.id);
    thumbURL(d).then(u => $('img', card).src = u);
    card.onclick = async e => {
      const a = e.target.dataset.a; if (!a) return;
      if (a === 'edit') openEditor('design', d);
      if (a === 'use') { const ev = newEventFrom(clone(d), d.name); await saveEvent(ev); openEditor('event', ev); }
      if (a === 'dup') { const c = clone(d); c.id = 'm-' + uid(); c.name += ' (copy)'; c.created = Date.now(); await DB.put('designs', c); renderHome(); }
      if (a === 'del' && confirm(`Delete your design "${d.name}"? Events using it keep a saved copy.`)) { await DB.del('designs', d.id); renderHome(); }
    };
  }
}
$('#heroNew').onclick = () => newEventDialog();
async function newEventDialog() {
  const designs = allDesigns();
  if (!designs.length) {
    const box = openModal(`<h2>No designs yet</h2>
      <p class="muted">${S.creator ? 'Make a ready-made design in Creator mode, or make your own design.' : 'Make your own design first: upload a frame and add your text.'}</p>
      <div class="row" style="justify-content:flex-end;margin-top:16px"><button class="btn ghost" id="nX">Close</button><button class="btn primary" id="nMine">Create my own design</button></div>`);
    $('#nX', box).onclick = closeModal; $('#nMine', box).onclick = () => { closeModal(); newDesignDialog(true); };
    return;
  }
  let pick = designs[0].id;
  const box = openModal(`<h2>New event</h2><p class="muted" style="margin:0">Name your event and pick a design.</p>
    <label>Event name</label><input id="nName" placeholder="e.g. Cruz Family Christmas Party">
    <label>Design</label><div class="dpick" id="nPick">${designs.map(d => `
      <button data-d="${d.id}" class="${d.id === pick ? 'on' : ''}"><img alt=""><span style="font-size:13px;font-weight:600">${esc(d.name)}${d._draft ? '<span class="badge">draft</span>' : ''}${d._mine ? '<span class="badge mine">mine</span>' : ''}</span>
      <span class="muted" style="font-size:11px">${LAYOUTS[d.layout].label}</span></button>`).join('')}</div>
    <div class="row" style="justify-content:flex-end;margin-top:18px"><button class="btn ghost" id="nCancel">Cancel</button><button class="btn primary" id="nGo">Create event</button></div>`);
  for (const b of $$('#nPick button', box)) thumbURL(designs.find(d => d.id === b.dataset.d), 320).then(u => $('img', b).src = u);
  $('#nPick', box).onclick = e => { const b = e.target.closest('[data-d]'); if (!b) return; pick = b.dataset.d; $$('#nPick button').forEach(x => x.classList.toggle('on', x === b)); };
  $('#nCancel', box).onclick = closeModal;
  $('#nGo', box).onclick = async () => {
    const d = designs.find(x => x.id === pick), c = clone(d); delete c._draft; delete c._pub; delete c._mine;
    const ev = newEventFrom(c, $('#nName', box).value.trim()); await saveEvent(ev); closeModal(); openEditor('event', ev);
  };
}
function newDesignDialog(mine = false) {
  let layout = 'strip4';
  const box = openModal(`<h2>${mine ? 'Create my own design' : 'New ready-made design'}</h2>
    <label>Design name</label><input id="dName" placeholder="e.g. Red Christmas Strip">
    <label>Layout</label><div class="tiles" id="dLay" style="grid-template-columns:repeat(6,1fr)">${Object.entries(LAYOUTS).map(([k, l]) => `<button class="tile ${k === layout ? 'on' : ''}" data-k="${k}">${layoutSVG(k)}<span>${l.label}</span></button>`).join('')}</div>
    <div class="row" style="justify-content:flex-end;margin-top:18px"><button class="btn ghost" id="dX">Cancel</button><button class="btn primary" id="dGo">Create design</button></div>`);
  $('#dLay', box).onclick = e => { const t = e.target.closest('[data-k]'); if (!t) return; layout = t.dataset.k; $$('#dLay .tile').forEach(c => c.classList.toggle('on', c === t)); };
  $('#dX', box).onclick = closeModal;
  $('#dGo', box).onclick = async () => {
    const d = newDesign(layout, mine); d.name = $('#dName', box).value.trim() || (mine ? 'My design' : 'New design');
    await DB.put('designs', d); closeModal(); openEditor('design', d);
  };
}
function layoutSVG(k, h = 64) {
  const L = LAYOUTS[k], g = geom({ layout: k, padding: 30, gap: 18, textPos: 'bottom', textSize: 1 });
  const W = L.double ? L.W * 2 : L.W, sc = h / L.H, w = W * sc;
  const one = (ox) => g.slots.map(s => `<rect x="${ox + s.x * sc}" y="${s.y * sc}" width="${s.w * sc}" height="${s.h * sc}" rx="1" fill="#b9b3c9"/>`).join('');
  return `<svg viewBox="0 0 ${w} ${h}" style="height:${h}px;width:auto;max-width:100%"><rect width="${w}" height="${h}" fill="#fff" stroke="#d3d6de"/>${one(0)}${L.double ? one(L.W * sc) : ''}</svg>`;
}

/* =====================================================================
   EDITOR — Canva-style: left rail + drawer, floating toolbar, direct
   manipulation on the canvas (drag, resize, rotate, double-tap to type).
   mode 'design' = full editor, mode 'event' = change unlocked words only
   ===================================================================== */
const ICON = {
  layout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="7" height="18" rx="1.5"/><rect x="14" y="3" width="7" height="8" rx="1.5"/><rect x="14" y="13" width="7" height="8" rx="1.5"/></svg>',
  frame: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="M21 15l-5-5L5 21"/></svg>',
  text: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 6V4h14v2M12 4v16M9 20h6"/></svg>',
  elements: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><circle cx="7.5" cy="7.5" r="4"/><rect x="13" y="3.5" width="8" height="8" rx="1.5"/><path d="M12 13l4.5 8h-9z"/></svg>',
  bg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 000 18z" fill="currentColor"/></svg>',
  photos: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  words: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/></svg>',
  booth: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/></svg>',
  bold: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round"><path d="M7 4h6a4 4 0 010 8H7zM7 12h7a4 4 0 010 8H7z"/></svg>',
  italic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M10 4h8M6 20h8M14 4l-4 16"/></svg>',
  upper: '<svg viewBox="0 0 24 24"><text x="1" y="17" font-size="13" font-weight="700" font-family="Inter,sans-serif" fill="currentColor">aA</text></svg>',
  alignleft: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M4 10h10M4 14h16M4 18h10"/></svg>',
  aligncenter: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M7 10h10M4 14h16M7 18h10"/></svg>',
  alignright: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M10 10h10M4 14h16M10 18h10"/></svg>',
  spacing: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 7h12M8 12h12M8 17h12M4 5v14M2.5 7L4 5l1.5 2M2.5 17L4 19l1.5-2"/></svg>',
  opacity: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 4h4v4H4zM12 4h4v4h-4zM8 8h4v4H8zM16 8h4v4h-4zM4 12h4v4H4zM12 12h4v4h-4zM8 16h4v4H8zM16 16h4v4h-4z" fill="currentColor" stroke="none"/></svg>',
  layers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/></svg>',
  dup: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 00-1-1H5a1 1 0 00-1 1v10a1 1 0 001 1h3"/></svg>',
  del: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
  fx: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/><circle cx="12" cy="12" r="3"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/></svg>',
  unlock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 017.5-2"/></svg>',
  corner: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 20V10a6 6 0 016-6h10"/></svg>',
  rot: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M20 12a8 8 0 11-2.3-5.6M20 4v5h-5"/></svg>',
};
const DESIGN_TABS = [['layout', 'Layout'], ['frame', 'Frame'], ['text', 'Text'], ['elements', 'Elements'], ['bg', 'Background'], ['photos', 'Photos']];
const EVENT_TABS = [['words', 'Words'], ['booth', 'Booth']];
const E = { sel: null, editing: null, hist: [], hi: -1, tab: null, sub: null, scale: 1, hits: [], guides: [], fontCat: 'All', fontQ: '', colorTarget: null, uploadKey: 'bgImage' };
const isDesign = () => S.mode === 'design';
function edView() { return isDesign() ? S.ed : compose(S.ed); }
function selItem() { return E.sel ? (isDesign() ? S.ed.items : edView().items).find(i => i.id === E.sel) : null; }
function L_() { return LAYOUTS[edView().layout]; }

function openEditor(mode, obj) {
  if (mode === 'design' && !S.creator && !obj.mine) return;
  S.mode = mode; S.ed = clone(obj); if (mode === 'design') migrate(S.ed);
  S.dirty = false; Object.assign(E, { sel: null, editing: null, hist: [], hi: -1, sub: null, guides: [] });
  pushHist();
  $('#edName').value = S.ed.name;
  $('#edMode').textContent = mode === 'event' ? 'Event' : S.ed.mine ? 'My design' : 'Ready-made';
  $('#edStart').textContent = mode === 'design' ? 'Test booth ▶' : 'Start booth ▶';
  $('#rail').innerHTML = (mode === 'design' ? DESIGN_TABS : EVENT_TABS).map(([k, l]) => `<button data-tab="${k}">${ICON[k]}<span>${l}</span></button>`).join('');
  go('editor');
  openTab(mode === 'design' ? 'text' : 'words');
  renderCtx(); requestAnimationFrame(() => { fitCanvas(); redraw(); });
}

/* ---------- history ---------- */
function snap(o) { return Object.assign({}, o, { items: clone(o.items || []), text: o.text ? { ...o.text } : o.text, textEdits: o.textEdits ? { ...o.textEdits } : o.textEdits }); }
function pushHist() { E.hist = E.hist.slice(0, E.hi + 1); E.hist.push(snap(S.ed)); if (E.hist.length > 80) E.hist.shift(); E.hi = E.hist.length - 1; undoBtns(); }
function commit() { clearTimeout(E.ct); S.dirty = true; pushHist(); }
function softCommit() { clearTimeout(E.ct); E.ct = setTimeout(commit, 400); }
function undoBtns() { $('#edUndo').disabled = E.hi <= 0; $('#edRedo').disabled = E.hi >= E.hist.length - 1; $('#edUndo').style.opacity = E.hi <= 0 ? .4 : 1; $('#edRedo').style.opacity = E.hi >= E.hist.length - 1 ? .4 : 1; }
function restore(i) { E.hi = i; S.ed = snap(E.hist[i]); S.dirty = true; if (!selItem()) E.sel = null; undoBtns(); renderAll(); }
function undo() { if (E.hi > 0) restore(E.hi - 1); }
function redo() { if (E.hi < E.hist.length - 1) restore(E.hi + 1); }
$('#edUndo').onclick = undo; $('#edRedo').onclick = redo;
function renderAll() { renderDrawer(); renderCtx(); redraw(); }

/* ---------- canvas + overlay ---------- */
let drawQ = false;
function redraw() {
  if (drawQ) return; drawQ = true;
  requestAnimationFrame(async () => {
    drawQ = false;
    const o = { hits: [], hide: E.editing, preview: true };
    const c = await render(edView(), [], o);
    const pc = $('#previewCanvas');
    if (pc.width !== c.width || pc.height !== c.height) { pc.width = c.width; pc.height = c.height; fitCanvas(); }
    pc.getContext('2d').drawImage(c, 0, 0);
    E.hits = o.hits; drawOverlay();
  });
}
function fitCanvas() {
  if (!S.ed || !$('#editor').classList.contains('active')) return;
  const wrap = $('#cwrap'), L = L_(), W = L.W * (L.double ? 2 : 1), H = L.H;
  const sc = Math.max(.05, Math.min((wrap.clientWidth - 60) / W, (wrap.clientHeight - 80) / H));
  E.scale = sc; $('#cbox').style.width = W * sc + 'px'; $('#cbox').style.height = H * sc + 'px';
  $('#stageFoot').textContent = `${L.label} · ${L.size} · ${Math.round(sc * 100)}%`;
  drawOverlay(); placeInline();
}
window.addEventListener('resize', () => { fitCanvas(); closePop(); });
function hitBox(id) { return E.hits.find(h => h.id === id); }
function drawOverlay() {
  const ovl = $('#ovl'); if (!S.ed) return;
  const L = L_(), sc = E.scale, W = L.W * sc, H = L.H * sc;
  let html = '';
  const box = (h, cls, handles) => {
    const pad = 6, w = h.w * W + pad * 2, hh = h.h * H + pad * 2;
    return `<div class="selbox ${cls}" style="left:${h.x * W - w / 2}px;top:${h.y * H - hh / 2}px;width:${w}px;height:${hh}px;transform:rotate(${h.rot}deg)">${handles || ''}</div>`;
  };
  if (!isDesign()) {
    for (const it of edView().items) if (it.type === 'text' && it.editable && it.id !== E.sel) { const h = hitBox(it.id); if (h) html += box(h, 'hover', '<div class="ctag">Tap to edit</div>'); }
  }
  const it = selItem(), h = it && hitBox(it.id);
  if (h) {
    let hd = '';
    if (isDesign() && E.editing !== it.id) {
      hd = ['nw', 'ne', 'sw', 'se'].map(k => `<div class="hdl ${k}" data-h="${k}"></div>`).join('');
      if (it.type === 'shape') hd += ['n', 's', 'e', 'w'].map(k => `<div class="hdl ${k}" data-h="${k}"></div>`).join('');
      hd += `<div class="hdl rot" data-h="rot">${ICON.rot}</div>`;
    }
    html += box(h, E.editing === it.id ? 'edit' : '', hd);
  }
  for (const g of E.guides) html += g.t === 'v' ? `<div class="guide v" style="left:${g.v * W}px"></div>` : `<div class="guide h" style="top:${g.v * H}px"></div>`;
  let boxes = $('.boxes', ovl);
  if (!boxes) { boxes = document.createElement('div'); boxes.className = 'boxes'; ovl.prepend(boxes); }
  boxes.innerHTML = html; // the inline text editor is a sibling, so typing keeps focus
}
function normPt(e) {
  const r = $('#cbox').getBoundingClientRect(), L = L_();
  let x = (e.clientX - r.left) / (L.W * E.scale); const y = (e.clientY - r.top) / (L.H * E.scale);
  if (L.double && x > 1) x -= 1;
  return { x, y, px: e.clientX - r.left, py: e.clientY - r.top };
}
function hitTest(p) {
  const L = L_(), pad = 8 / E.scale;
  const allowed = isDesign() ? null : new Set(edView().items.filter(i => i.type === 'text' && i.editable).map(i => i.id));
  for (let k = E.hits.length - 1; k >= 0; k--) {
    const h = E.hits[k]; if (allowed && !allowed.has(h.id)) continue;
    const a = -h.rot * Math.PI / 180, dx = (p.x - h.x) * L.W, dy = (p.y - h.y) * L.H;
    const lx = dx * Math.cos(a) - dy * Math.sin(a), ly = dx * Math.sin(a) + dy * Math.cos(a);
    if (Math.abs(lx) <= h.w * L.W / 2 + pad && Math.abs(ly) <= h.h * L.H / 2 + pad) return h;
  }
  return null;
}
let drag = null;
$('#ovl').addEventListener('pointerdown', e => {
  if (e.target.closest('.inl')) return;
  if (E.editing) finishEdit();
  closePop();
  const p = normPt(e), it = selItem(), hd = e.target.closest('.hdl');
  if (hd && it && isDesign()) {
    const L = L_(), cx = it.x * L.W * E.scale, cy = it.y * L.H * E.scale;
    drag = { type: hd.dataset.h, it, o: clone(it), cx, cy, d0: Math.hypot(p.px - cx, p.py - cy) || 1, changed: false };
    $('#ovl').setPointerCapture(e.pointerId); return;
  }
  const h = hitTest(p);
  if (!h) { E.sel = null; renderCtx(); drawOverlay(); return; }
  const was = E.sel === h.id; E.sel = h.id; renderCtx();
  if (!isDesign()) { e.preventDefault(); setTimeout(() => startEdit(h.id), 0); return; }
  const t = selItem();
  drag = { type: 'move', it: t, x0: t.x, y0: t.y, p0: p, was, changed: false };
  $('#ovl').setPointerCapture(e.pointerId); drawOverlay();
});
$('#ovl').addEventListener('pointermove', e => {
  if (!drag) return;
  const p = normPt(e), it = drag.it, L = L_();
  if (drag.type === 'move') {
    let nx = drag.x0 + p.x - drag.p0.x, ny = drag.y0 + p.y - drag.p0.y;
    if (!drag.changed && Math.hypot((p.x - drag.p0.x) * L.W, (p.y - drag.p0.y) * L.H) * E.scale < 3) return;
    drag.changed = true; E.guides = [];
    const th = 6 / (E.scale * L.W), tv = 6 / (E.scale * L.H);
    if (Math.abs(nx - .5) < th) { nx = .5; E.guides.push({ t: 'v', v: .5 }); }
    if (Math.abs(ny - .5) < tv) { ny = .5; E.guides.push({ t: 'h', v: .5 }); }
    it.x = Math.max(-.2, Math.min(1.2, nx)); it.y = Math.max(-.2, Math.min(1.2, ny));
  } else if (drag.type === 'rot') {
    let a = Math.atan2(p.py - drag.cy, p.px - drag.cx) * 180 / Math.PI - 90;
    a = ((a + 540) % 360) - 180;
    for (const s of [-180, -90, 0, 90, 180]) if (Math.abs(a - s) < 4) a = s % 360 === -180 ? 180 : s;
    it.rot = Math.round(a); drag.changed = true;
  } else if (['nw', 'ne', 'sw', 'se'].includes(drag.type)) {
    const k = Math.max(.05, Math.hypot(p.px - drag.cx, p.py - drag.cy) / drag.d0);
    if (it.type === 'shape') { it.w = drag.o.w * k; it.h = drag.o.h * k; } else it.size = Math.max(.008, drag.o.size * k);
    drag.changed = true;
  } else { // edge handles (shapes): resize one axis in the shape's own direction
    const a = -(it.rot || 0) * Math.PI / 180, dx = p.px - drag.cx, dy = p.py - drag.cy;
    const lx = dx * Math.cos(a) - dy * Math.sin(a), ly = dx * Math.sin(a) + dy * Math.cos(a);
    if (drag.type === 'e' || drag.type === 'w') it.w = Math.max(.01, 2 * Math.abs(lx) / (L.W * E.scale));
    else it.h = Math.max(.003, 2 * Math.abs(ly) / (L.H * E.scale));
    drag.changed = true;
  }
  redraw();
});
function endDrag() {
  if (!drag) return;
  const d = drag; drag = null; E.guides = [];
  if (d.changed) { commit(); renderCtx(); }
  else if (d.type === 'move' && d.was && d.it.type === 'text') setTimeout(() => startEdit(d.it.id), 0);
  drawOverlay();
}
$('#ovl').addEventListener('pointerup', endDrag); $('#ovl').addEventListener('pointercancel', endDrag);
$('#ovl').addEventListener('dblclick', e => { const h = hitTest(normPt(e)); if (h) { const it = (isDesign() ? S.ed.items : edView().items).find(i => i.id === h.id); if (it && it.type === 'text') startEdit(h.id); } });

/* ---------- inline text editing ---------- */
function startEdit(id) {
  const it = (isDesign() ? S.ed.items : edView().items).find(i => i.id === id);
  if (!it || it.type !== 'text') return;
  if (!isDesign() && !it.editable) return;
  E.editing = id; E.sel = id;
  let el = $('#ovl .inl'); if (!el) { el = document.createElement('div'); el.className = 'inl'; el.contentEditable = 'true'; el.spellcheck = false; $('#ovl').appendChild(el); }
  el.innerText = it.s || '';
  el.onkeydown = ev => { if (ev.key === 'Escape') { ev.preventDefault(); el.blur(); } ev.stopPropagation(); };
  el.onblur = () => setTimeout(finishEdit, 0);
  placeInline(); redraw(); renderCtx();
  el.focus();
  const r = document.createRange(); r.selectNodeContents(el); const s = getSelection(); s.removeAllRanges(); s.addRange(r);
}
function placeInline() {
  const el = $('#ovl .inl'); if (!el || !E.editing) return;
  const it = (isDesign() ? S.ed.items : edView().items).find(i => i.id === E.editing); if (!it) return;
  const L = L_(), sc = E.scale, size = it.size * Math.min(L.W, L.H) * sc;
  Object.assign(el.style, {
    left: it.x * L.W * sc + 'px', top: it.y * L.H * sc + 'px', transform: `translate(-50%,-50%) rotate(${it.rot || 0}deg)`,
    font: fontStr(it, size), lineHeight: (it.lineH || 1.2) * size + 'px', color: it.hollow ? 'transparent' : it.color,
    textAlign: it.align || 'center', letterSpacing: (it.ls || 0) * size + 'px', textTransform: it.upper ? 'uppercase' : 'none',
    opacity: it.opacity ?? 1, webkitTextStroke: it.hollow ? `1px ${it.color}` : '', textShadow: it.glow ? `0 0 ${size * .3}px ${it.glowColor}` : '',
  });
}
function finishEdit() {
  const el = $('#ovl .inl'); if (!el || !E.editing) return;
  const id = E.editing, s = el.innerText.replace(/\n$/, '');
  E.editing = null; el.onblur = null; el.remove();
  if (isDesign()) { const it = S.ed.items.find(i => i.id === id); if (it && it.s !== s) { it.s = s; commit(); } }
  else { S.ed.textEdits = S.ed.textEdits || {}; if (S.ed.textEdits[id] !== s) { S.ed.textEdits[id] = s; commit(); } if (E.tab === 'words') renderDrawer(); }
  redraw(); renderCtx();
}

/* ---------- left rail + drawer ---------- */
$('#rail').addEventListener('click', e => {
  const b = e.target.closest('[data-tab]'); if (!b) return;
  if (E.tab === b.dataset.tab && !E.sub && !$('#drawer').classList.contains('closed')) closeDrawer(); else openTab(b.dataset.tab);
});
function openTab(k) { E.tab = k; E.sub = null; $('#drawer').classList.remove('closed'); $$('#rail button').forEach(b => b.classList.toggle('on', b.dataset.tab === k)); renderDrawer(); setTimeout(fitCanvas, 230); }
function openSub(k) { E.sub = k; $('#drawer').classList.remove('closed'); renderDrawer(); setTimeout(fitCanvas, 230); }
function closeDrawer() { E.tab = null; E.sub = null; $('#drawer').classList.add('closed'); $$('#rail button').forEach(b => b.classList.remove('on')); setTimeout(fitCanvas, 230); }
function sl(attr, key, label, min, max, step, val, fmt = v => v) {
  return `<label>${label}</label><div class="slider"><input type="range" ${attr}="${key}" min="${min}" max="${max}" step="${step}" value="${val}" data-fmt="${fmt === pct ? 'pct' : ''}"><output>${fmt(val)}</output></div>`;
}
const pct = v => Math.round(v * 100) + '%';
function dotBtn(target, color, label) { return `<button class="btn sm" data-act="color" data-v="${target}"><span class="dot" style="background:${color}"></span>${label}</button>`; }
function chipRow(key, map, cur) { return `<div class="chips">${Object.entries(map).map(([k, l]) => `<button class="chip ${String(k) === String(cur) ? 'on' : ''}" data-act="set" data-k="${key}" data-v="${k}">${esc(l)}</button>`).join('')}</div>`; }
function renderDrawer() {
  const box = $('#drawerIn'); if (!S.ed || $('#drawer').classList.contains('closed')) return;
  const st = $('#drawer').scrollTop;
  box.innerHTML = E.sub ? subPanel(E.sub) : tabPanel(E.tab);
  afterDrawer(); $('#drawer').scrollTop = E.sub ? 0 : st;
}
function tabPanel(k) {
  const ev = S.ed;
  if (k === 'layout') {
    return `<h3>Layout</h3><div class="hint">How many photos, and the print size.</div>
      <div class="tiles">${Object.entries(LAYOUTS).map(([k, l]) => `<button class="tile ${k === ev.layout ? 'on' : ''}" data-act="set" data-k="layout" data-v="${k}">${layoutSVG(k, 70)}<span>${l.label}</span></button>`).join('')}</div>
      <div class="dsec"><div class="lbl" style="margin-top:4px">Blank space for your text</div>${chipRow('textPos', { none: 'None', top: 'Top', bottom: 'Bottom' }, ev.textPos)}
        ${ev.textPos !== 'none' ? sl('data-k', 'textSize', 'Space size', .5, 2.2, .05, ev.textSize, pct) : ''}
        <div class="hint">Keeps an empty band so your text doesn't cover the photos.</div></div>
      <div class="dsec">${sl('data-k', 'padding', 'Outer margin', 0, 80, 1, ev.padding)}${sl('data-k', 'gap', 'Space between photos', 0, 60, 1, ev.gap)}</div>`;
  }
  if (k === 'frame') {
    const g = geom(ev);
    return `<h3>Frame image</h3><div class="hint">Upload a frame you made in Canva (or any image). Photos sit on top of it.</div>
      <div class="drop" style="margin-top:12px">${ev.bgImage ? `<img src="${ev.bgImage}">` : '<div style="font-size:30px">🖼️</div><div>No frame yet</div>'}
        <div class="row" style="justify-content:center;margin-top:10px"><button class="btn sm primary" data-act="upload" data-v="bgImage">${ev.bgImage ? 'Replace frame' : 'Upload frame'}</button>${ev.bgImage ? '<button class="btn sm danger" data-act="clear" data-v="bgImage">Remove</button>' : ''}</div></div>
      <div class="dsec"><h3 style="font-size:14px">Size for Canva</h3>
        <div class="kv"><span>Custom size</span><b>${g.W} × ${g.H} px</b></div>
        ${g.slots.map((s, i) => `<div class="kv"><span>Photo ${i + 1}</span><b>${Math.round(s.w)}×${Math.round(s.h)} at x ${Math.round(s.x)}, y ${Math.round(s.y)}</b></div>`).join('')}
        <button class="bigbtn soft" style="margin-top:10px" data-act="guide">Download Canva guide</button>
        <div class="hint">Put the guide in Canva as the background, design around the grey boxes, delete the guide, then Download → PNG.</div></div>
      <div class="dsec"><h3 style="font-size:14px">Overlay <span class="muted" style="font-weight:500">(optional)</span></h3><div class="hint">A transparent PNG that sits on top of the photos.</div>
        <div class="row" style="margin-top:8px"><button class="btn sm" data-act="upload" data-v="overlayImage">${ev.overlayImage ? 'Replace overlay' : 'Upload overlay'}</button>${ev.overlayImage ? '<button class="btn sm danger" data-act="clear" data-v="overlayImage">Remove</button>' : ''}</div></div>`;
  }
  if (k === 'text') {
    return `<button class="bigbtn" data-act="addText" data-v="h1">${ICON.text} Add a text box</button>
      <div class="lbl">Default text styles</div>
      <button class="tstyle" data-act="addText" data-v="h1" style="font:700 24px Montserrat">Add a heading</button>
      <button class="tstyle" data-act="addText" data-v="h2" style="font:700 17px Montserrat">Add a subheading</button>
      <button class="tstyle" data-act="addText" data-v="body" style="font:400 13px Montserrat">Add a little bit of body text</button>
      <div class="lbl">Font combinations</div>
      <div class="presets">${COMBOS.map((c, i) => `<button class="preset" data-act="addCombo" data-v="${i}" style="${previewCss(c, 26)}">${esc(c.s)}</button>`).join('')}</div>
      <div class="hint" style="margin-top:12px">Tip: double-tap any text on the design to type. Drag to move, pull a corner to resize, and use the round handle to rotate.</div>`;
  }
  if (k === 'elements') {
    return `<h3>Elements</h3><div class="lbl">Shapes</div><div class="shapes">${SHAPES.map(s => `<button data-act="addShape" data-v="${s.k}" title="${s.n}">${s.svg}</button>`).join('')}</div>
      ${Object.entries(STICKERS).map(([g, list]) => `<div class="lbl">${g}</div><div class="stk">${list.map(e => `<button data-act="addSticker" data-v="${e}">${e}</button>`).join('')}</div>`).join('')}`;
  }
  if (k === 'bg') {
    return `<h3>Background</h3><div class="hint">Shows behind the photos. A frame image covers it.</div>
      <div class="lbl">Style</div>${chipRow('bgStyle', { solid: 'Solid color', gradient: 'Gradient' }, ev.bgStyle)}
      <div class="row" style="margin-top:10px">${dotBtn('bg1', ev.c1, ev.bgStyle === 'gradient' ? 'Top color' : 'Color')}${ev.bgStyle === 'gradient' ? dotBtn('bg2', ev.c2, 'Bottom color') : ''}</div>
      <div class="lbl">Quick colors</div><div class="swatches">${PALETTE.map(c => `<button class="sw ${c === ev.c1 ? 'on' : ''}" data-act="bgQuick" data-v="${c}" style="background:${c}"></button>`).join('')}</div>
      <div class="lbl">Pattern</div><div class="tiles">${Object.entries(PATTERNS).map(([k, l]) => `<button class="tile ${k === ev.pattern ? 'on' : ''}" data-act="set" data-k="pattern" data-v="${k}"><canvas width="120" height="80" data-pat="${k}"></canvas>${l}</button>`).join('')}</div>
      ${ev.pattern !== 'none' ? `<div class="row" style="margin-top:10px">${dotBtn('pattern', ev.pColor, 'Pattern color')}</div>${sl('data-k', 'pAmt', 'Pattern strength', .05, 1, .05, ev.pAmt, pct)}` : ''}`;
  }
  if (k === 'photos') {
    return `<h3>Photos</h3><div class="lbl">Photo look</div>
      <div class="tiles">${Object.entries(FILTERS).map(([k, l]) => `<button class="tile ${k === ev.filter ? 'on' : ''}" data-act="set" data-k="filter" data-v="${k}"><canvas width="120" height="90" data-filter="${k}"></canvas>${l}</button>`).join('')}</div>
      <div class="dsec">${sl('data-k', 'radius', 'Rounded corners', 0, 60, 1, ev.radius)}${sl('data-k', 'borderW', 'Border', 0, 20, 1, ev.borderW)}
        <div class="row" style="margin-top:10px">${dotBtn('border', ev.borderColor, 'Border color')}</div></div>`;
  }
  if (k === 'words') {
    const v = compose(ev), d = designFor(ev), list = v.items.filter(i => i.type === 'text' && i.editable);
    const legacy = d.allowText && (d.title || d.subtitle || d.showDate);
    return `<h3>Your words</h3><div class="hint">Tap a highlighted text on the design to type, or change it here. Everything else is set by the designer.</div>
      ${list.map((t, n) => `<label>Text ${n + 1}</label><textarea rows="2" data-tx="${t.id}">${esc(t.s)}</textarea>`).join('')}
      ${legacy ? `<label>Title</label><input data-lt="title" value="${esc(v.title)}"><label>Second line</label><input data-lt="subtitle" value="${esc(v.subtitle)}">
        <label class="toggle"><input type="checkbox" data-lt="showDate" ${v.showDate ? 'checked' : ''}> Show date</label><input data-lt="dateText" value="${esc(v.dateText)}">` : ''}
      ${!list.length && !legacy ? '<div class="empty" style="margin-top:14px">The words on this design are set by its designer.</div>' : ''}
      <label>Event name (for your list)</label><input data-name="1" value="${esc(ev.name)}">`;
  }
  if (k === 'booth') {
    return `<h3>Booth settings</h3>
      <div class="lbl">Countdown before each photo</div>${chipRow('countdown', { 3: '3 sec', 5: '5 sec', 10: '10 sec' }, ev.countdown)}
      <div class="lbl">Back to start screen after</div>${chipRow('autoReturn', { 20: '20 sec', 30: '30 sec', 60: '60 sec', 0: 'Never' }, ev.autoReturn)}
      <label class="toggle"><input type="checkbox" data-k="mirror" ${ev.mirror ? 'checked' : ''}> Mirror photos (like a selfie)</label>
      <label class="toggle" style="margin-top:0"><input type="checkbox" data-k="sound" ${ev.sound ? 'checked' : ''}> Countdown beeps</label>
      <label>Start button text</label><input data-k="attractMsg" value="${esc(ev.attractMsg)}">`;
  }
  return '';
}
function previewCss(c, px) {
  const f = fontInfo(c.font), light = /^#f|^#e|^#ffd/i.test(c.color);
  let sh = [];
  if (c.glow) sh.push(`0 0 8px ${c.glowColor}`, `0 0 16px ${c.glowColor}`);
  if (c.outline) { const o = c.outlineColor; sh.push(`-1.5px -1.5px 0 ${o}`, `1.5px -1.5px 0 ${o}`, `-1.5px 1.5px 0 ${o}`, `1.5px 1.5px 0 ${o}`); }
  return `font:${c.italic ? 'italic ' : ''}${c.bold ? f.bold : f.normal} ${px}px ${f.css};color:${c.color};${c.upper ? 'text-transform:uppercase;' : ''}letter-spacing:${(c.ls || 0)}em;${sh.length ? `text-shadow:${sh.join(',')};` : ''}${light && !c.outline ? 'background:#2b2d36;' : ''}`;
}
function subPanel(k) {
  const it = selItem(), back = `<button class="back" data-act="subBack">‹</button>`;
  if (k === 'font' && it) {
    return `<h3>${back}Font</h3><input id="fontQ" placeholder="Search fonts" value="${esc(E.fontQ)}" style="margin-top:10px">
      <div class="chips" style="margin-top:10px">${FONT_CATS.map(c => `<button class="chip ${c === E.fontCat ? 'on' : ''}" data-act="fontCat" data-v="${c}">${c}</button>`).join('')}</div>
      <div class="fontlist" id="fontList">${fontListHTML(it)}</div>`;
  }
  if (k === 'color' && E.colorTarget) {
    const ct = CT[E.colorTarget], cur = ct.get(it), docs = docColors();
    return `<h3>${back}${ct.label}</h3>
      <div class="lbl">Colors in this design</div><div class="swatches">${docs.map(c => `<button class="sw ${c === cur ? 'on' : ''}" data-act="pickColor" data-v="${c}" style="background:${c}"></button>`).join('')}<button class="sw add" data-act="customColor" title="Custom color"></button></div>
      <div class="lbl">Default colors</div><div class="swatches">${PALETTE.map(c => `<button class="sw ${c === cur ? 'on' : ''}" data-act="pickColor" data-v="${c}" style="background:${c}"></button>`).join('')}</div>
      <div class="lbl">Hex code</div><div class="row" style="flex-wrap:nowrap"><span class="dot" style="background:${cur};width:38px;height:38px;border-radius:10px;flex:none"></span><input id="hexIn" value="${esc(cur)}" maxlength="7"></div>
      <button class="bigbtn soft" style="margin-top:12px" data-act="customColor">🎨 Pick any color…</button>`;
  }
  if (k === 'effects' && it && it.type === 'text') {
    const fx = [['none', 'None'], ['shadow', 'Shadow'], ['lift', 'Lift'], ['hollow', 'Hollow'], ['outline', 'Outline'], ['glow', 'Glow'], ['neon', 'Neon']];
    const on = { none: !it.shadow && !it.outline && !it.glow && !it.hollow, shadow: it.shadow && (it.shadowBlur ?? .25) < .5, lift: it.shadow && (it.shadowBlur ?? .25) >= .5, hollow: it.hollow, outline: it.outline, glow: it.glow && !it.neon, neon: it.glow && it.neon };
    const tileCss = { none: '', shadow: 'text-shadow:2px 3px 3px rgba(0,0,0,.45)', lift: 'text-shadow:0 4px 10px rgba(0,0,0,.35)', hollow: 'color:transparent;-webkit-text-stroke:1.5px #18191f', outline: 'color:#fff;-webkit-text-stroke:2px #18191f;paint-order:stroke fill', glow: 'color:#fff;text-shadow:0 0 6px #ff5cc8,0 0 12px #ff5cc8', neon: 'color:#fff;text-shadow:0 0 4px #00e5ff,0 0 10px #00e5ff,0 0 18px #00e5ff;background:#18191f' };
    let ctl = '';
    if (it.shadow) ctl += `<div class="dsec"><b>Shadow</b>${sl('data-ik', 'shadowBlur', 'Blur', 0, 1.2, .02, it.shadowBlur ?? .25, pct)}${sl('data-ik', 'shadowOff', 'Offset', 0, .3, .01, it.shadowOff ?? .06, pct)}${sl('data-ik', 'shadowA', 'Strength', .1, 1, .05, it.shadowA ?? .55, pct)}<div class="row" style="margin-top:10px">${dotBtn('shadow', it.shadowColor || '#000000', 'Shadow color')}</div></div>`;
    if (it.outline) ctl += `<div class="dsec"><b>Outline</b>${sl('data-ik', 'outlineW', 'Thickness', .2, 3, .05, it.outlineW ?? 1, pct)}<div class="row" style="margin-top:10px">${dotBtn('outline', it.outlineColor || '#000000', 'Outline color')}</div></div>`;
    if (it.hollow) ctl += `<div class="dsec"><b>Hollow</b>${sl('data-ik', 'hollowW', 'Thickness', .3, 3, .05, it.hollowW ?? 1, pct)}</div>`;
    if (it.glow) ctl += `<div class="dsec"><b>${it.neon ? 'Neon' : 'Glow'}</b>${sl('data-ik', 'glowSize', 'Size', .2, 2.5, .05, it.glowSize ?? 1, pct)}<div class="row" style="margin-top:10px">${dotBtn('glow', it.glowColor || '#ffffff', 'Glow color')}</div></div>`;
    return `<h3>${back}Effects</h3><div class="hint">Mix and match. Tap again to turn one off.</div>
      <div class="tiles">${fx.map(([k, l]) => `<button class="tile ${on[k] ? 'on' : ''}" data-act="fx" data-v="${k}"><div style="height:58px;width:100%;display:flex;align-items:center;justify-content:center;border-radius:6px;background:#f3f4f7;font:800 30px Montserrat;color:#18191f;${tileCss[k]}">Ag</div>${l}</button>`).join('')}</div>${ctl}`;
  }
  if (k === 'position' && it) {
    return `<h3>${back}Position</h3>
      <div class="lbl">Layer order</div><div class="grid2">
        <button class="btn" data-act="layer" data-v="up">Forward</button><button class="btn" data-act="layer" data-v="down">Backward</button>
        <button class="btn" data-act="layer" data-v="top">To front</button><button class="btn" data-act="layer" data-v="bottom">To back</button></div>
      <div class="lbl">Align to page</div><div class="grid2" style="grid-template-columns:1fr 1fr 1fr">
        <button class="btn sm" data-act="palign" data-v="left">Left</button><button class="btn sm" data-act="palign" data-v="hcenter">Center</button><button class="btn sm" data-act="palign" data-v="right">Right</button>
        <button class="btn sm" data-act="palign" data-v="top">Top</button><button class="btn sm" data-act="palign" data-v="vcenter">Middle</button><button class="btn sm" data-act="palign" data-v="bottom">Bottom</button></div>
      ${sl('data-ik', 'rot', 'Rotation', -180, 180, 1, it.rot || 0, v => v + '°')}`;
  }
  E.sub = null; return tabPanel(E.tab);
}
function fontListHTML(it) {
  const q = E.fontQ.trim().toLowerCase();
  const list = WEB_FONTS.filter(f => (E.fontCat === 'All' || f.cat === E.fontCat) && (!q || f.name.toLowerCase().includes(q)));
  return list.map(f => `<button class="${it && it.font === f.id ? 'on' : ''}" data-act="font" data-v="${f.id}" style="font-family:'${f.name}';font-weight:${f.w[0]}">${esc(f.name)}<small>${f.cat}</small></button>`).join('') || '<div class="muted" style="padding:12px">No fonts found</div>';
}
const SAMPLE = (() => { const c = document.createElement('canvas'); c.width = 120; c.height = 90; const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 90); g.addColorStop(0, '#8ec5ff'); g.addColorStop(1, '#f7c59f'); x.fillStyle = g; x.fillRect(0, 0, 120, 90);
  x.fillStyle = '#e8a77d'; x.beginPath(); x.arc(60, 46, 20, 0, 7); x.fill(); x.fillStyle = '#3b2a1a'; x.beginPath(); x.arc(60, 36, 21, Math.PI, 0); x.fill();
  x.fillStyle = '#c0392b'; x.fillRect(30, 70, 60, 20); return c; })();
function afterDrawer() {
  for (const c of $$('#drawerIn canvas[data-pat]')) {
    const x = c.getContext('2d'); x.fillStyle = S.ed.c1; x.fillRect(0, 0, c.width, c.height);
    drawPattern(x, { pattern: c.dataset.pat, pColor: c.dataset.pat === 'none' ? S.ed.pColor : (S.ed.pColor === S.ed.c1 ? '#888' : S.ed.pColor), pAmt: Math.max(.35, S.ed.pAmt) }, c.width, c.height, .5);
  }
  for (const c of $$('#drawerIn canvas[data-filter]')) { const x = c.getContext('2d'); x.drawImage(SAMPLE, 0, 0); applyFilter(x, c.width, c.height, c.dataset.filter); }
  const fq = $('#fontQ'); if (fq) fq.oninput = () => { E.fontQ = fq.value; $('#fontList').innerHTML = fontListHTML(selItem()); };
  const hx = $('#hexIn'); if (hx) hx.onchange = () => { let v = hx.value.trim(); if (!v.startsWith('#')) v = '#' + v; if (/^#[0-9a-f]{6}$/i.test(v)) applyColor(v, true); };
}
/* colour targets */
const CT = {
  text: { label: 'Text color', get: it => it.color, set: (it, c) => it.color = c },
  outline: { label: 'Outline color', get: it => it.outlineColor || '#000000', set: (it, c) => it.outlineColor = c },
  glow: { label: 'Glow color', get: it => it.glowColor || '#ffffff', set: (it, c) => it.glowColor = c },
  shadow: { label: 'Shadow color', get: it => it.shadowColor || '#000000', set: (it, c) => it.shadowColor = c },
  fill: { label: 'Shape color', get: it => it.fill, set: (it, c) => it.fill = c },
  bg1: { label: 'Background color', get: () => S.ed.c1, set: (_, c) => S.ed.c1 = c },
  bg2: { label: 'Gradient bottom color', get: () => S.ed.c2, set: (_, c) => S.ed.c2 = c },
  pattern: { label: 'Pattern color', get: () => S.ed.pColor, set: (_, c) => S.ed.pColor = c },
  border: { label: 'Border color', get: () => S.ed.borderColor, set: (_, c) => S.ed.borderColor = c },
};
function docColors() {
  const s = new Set([S.ed.c1, S.ed.c2, S.ed.pColor, S.ed.borderColor]);
  for (const it of S.ed.items || []) for (const k of ['color', 'fill', 'outlineColor', 'glowColor']) if (it[k]) s.add(it[k]);
  return [...s].filter(c => /^#[0-9a-f]{6}$/i.test(c)).slice(0, 13);
}
function applyColor(c, final) {
  const ct = CT[E.colorTarget]; if (!ct) return;
  ct.set(selItem(), c); redraw();
  if (final) { commit(); renderDrawer(); renderCtx(); } else softCommit();
}
$('#colorInput').addEventListener('input', e => applyColor(e.target.value, false));
$('#colorInput').addEventListener('change', e => applyColor(e.target.value, true));

/* ---------- floating context toolbar ---------- */
function renderCtx() {
  const bar = $('#ctxbar'); if (!S.ed) return;
  const it = selItem(); let h = '';
  if (!isDesign()) h = `<span class="ctx-note">${it ? '✏️ Type your words. Tap outside when done.' : 'Tap a highlighted text on the design to change the words.'}</span>`;
  else if (!it) h = `<span class="ctx-note">Tap anything on the design to edit it</span><div class="sep"></div>
      <button class="tb" data-act="openTab" data-v="text">${ICON.text}Text</button><button class="tb" data-act="openTab" data-v="elements">${ICON.elements}Elements</button>
      <button class="tb" data-act="openTab" data-v="frame">${ICON.frame}Frame</button><button class="tb" data-act="color" data-v="bg1"><span class="dot" style="background:${S.ed.c1}"></span></button>`;
  else {
    const m = Math.min(L_().W, L_().H), common = `<div class="sep"></div><button class="tb" data-act="pop" data-v="opacity" title="Transparency">${ICON.opacity}</button><button class="tb" data-act="sub" data-v="position" title="Position">${ICON.layers}Position</button><div class="sep"></div><button class="tb" data-act="dup" title="Duplicate (⌘D)">${ICON.dup}</button><button class="tb" data-act="del" title="Delete">${ICON.del}</button>`;
    if (it.type === 'text') {
      h = `<button class="tb font" data-act="sub" data-v="font" style="font-family:${fontInfo(it.font).css}"><span>${esc(fontInfo(it.font).name)}</span>▾</button>
        <div class="size"><button data-act="size" data-v="-1">−</button><input id="sizeIn" value="${Math.round(it.size * m)}" inputmode="numeric"><button data-act="size" data-v="1">+</button></div>
        <button class="tb" data-act="color" data-v="text" title="Text color"><span class="colorA">A<i style="background:${it.color}"></i></span></button>
        <div class="sep"></div>
        <button class="tb ${it.bold ? 'on' : ''}" data-act="toggle" data-v="bold" title="Bold">${ICON.bold}</button>
        <button class="tb ${it.italic ? 'on' : ''}" data-act="toggle" data-v="italic" title="Italic">${ICON.italic}</button>
        <button class="tb ${it.upper ? 'on' : ''}" data-act="toggle" data-v="upper" title="Uppercase">${ICON.upper}</button>
        <button class="tb" data-act="alignCycle" title="Alignment">${ICON['align' + (it.align || 'center')]}</button>
        <button class="tb" data-act="pop" data-v="spacing" title="Spacing">${ICON.spacing}</button>
        <div class="sep"></div><button class="tb ${it.shadow || it.outline || it.glow || it.hollow ? 'on' : ''}" data-act="sub" data-v="effects">${ICON.fx}Effects</button>
        ${!S.ed.mine ? `<button class="tb ${it.editable ? 'on' : ''}" data-act="toggle" data-v="editable" title="Let people change these words">${it.editable ? ICON.unlock : ICON.lock}${it.editable ? 'Guests can edit' : 'Locked'}</button>` : ''}` + common;
    } else if (it.type === 'sticker') {
      h = `<div class="size"><button data-act="size" data-v="-1">−</button><input id="sizeIn" value="${Math.round(it.size * m)}" inputmode="numeric"><button data-act="size" data-v="1">+</button></div>` + common;
    } else {
      h = `<button class="tb" data-act="color" data-v="fill" title="Color"><span class="dot" style="background:${it.fill}"></span></button>
        ${['rect', 'round'].includes(it.shape) ? `<button class="tb" data-act="pop" data-v="radius" title="Corner rounding">${ICON.corner}</button>` : ''}
        ${['frame', 'ring'].includes(it.shape) ? `<button class="tb" data-act="pop" data-v="stroke" title="Line thickness">${ICON.spacing}</button>` : ''}` + common;
    }
  }
  bar.innerHTML = `<div class="ctx-in">${h}</div>`;
  const si = $('#sizeIn'); if (si) si.onchange = () => { const v = parseFloat(si.value); if (v > 0) { const t = selItem(); t.size = v / Math.min(L_().W, L_().H); commit(); redraw(); } };
}

/* ---------- popover ---------- */
function openPop(anchor, html) {
  const p = $('#pop'); p.innerHTML = html; p.classList.add('on');
  const r = anchor.getBoundingClientRect(); const w = 260;
  p.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2)) + 'px'; p.style.top = (r.bottom + 8) + 'px';
}
function closePop() { $('#pop').classList.remove('on'); }
document.addEventListener('pointerdown', e => { if (!e.target.closest('#pop') && !e.target.closest('[data-act="pop"]')) closePop(); });

/* ---------- actions ---------- */
function centerOfTextSpace() {
  const g = geom(S.ed);
  return g.text.h > 0 ? { x: .5, y: (g.text.y + g.text.h / 2) / g.H } : { x: .5, y: .5 };
}
function addItem(it) { let n = 0; while (n < 8 && S.ed.items.some(o => Math.abs(o.x - it.x) < .02 && Math.abs(o.y - it.y) < .02)) { it.y = Math.min(.97, it.y + .045); n++; } S.ed.items.push(it); E.sel = it.id; commit(); renderCtx(); redraw(); }
function act(a, v, el) {
  const it = selItem(), ev = S.ed, L = L_(), m = Math.min(L.W, L.H);
  switch (a) {
    case 'set': {
      let val = v; if (['countdown', 'autoReturn'].includes(el.dataset.k)) val = +v;
      ev[el.dataset.k] = val; commit(); renderDrawer(); redraw(); if (el.dataset.k === 'layout') setTimeout(fitCanvas, 30); break;
    }
    case 'openTab': openTab(v); break;
    case 'sub': openSub(v); break;
    case 'subBack': E.sub = null; renderDrawer(); break;
    case 'upload': E.uploadKey = v; $('#imgFile').click(); break;
    case 'clear': ev[v] = null; commit(); renderDrawer(); redraw(); break;
    case 'guide': downloadGuide(); break;
    case 'addText': { const c = centerOfTextSpace(); addItem(newTextItem({ ...TEXT_STYLES[v] }, c.x, c.y)); break; }
    case 'addCombo': { const c = centerOfTextSpace(); addItem(newTextItem({ ...COMBOS[+v] }, c.x, c.y)); break; }
    case 'addSticker': addItem({ id: 'i-' + uid(), type: 'sticker', e: v, x: .5, y: .5, size: .18, rot: 0, opacity: 1 }); break;
    case 'addShape': {
      const r = L.W / L.H, base = { id: 'i-' + uid(), type: 'shape', shape: v, x: .5, y: .5, rot: 0, opacity: 1, fill: '#f4a6b8', radius: v === 'round' ? .35 : 0, stroke: .03 };
      if (v === 'line') Object.assign(base, { w: .7, h: 6 / L.H }); else if (v === 'banner') Object.assign(base, { w: .8, h: .8 * r * .28 });
      else Object.assign(base, { w: .4, h: .4 * r });
      if (['frame', 'ring'].includes(v)) base.fill = '#18191f';
      addItem(base); break;
    }
    case 'bgQuick': ev.c1 = v; commit(); renderDrawer(); redraw(); break;
    case 'color': E.colorTarget = v; openSub('color'); break;
    case 'pickColor': applyColor(v, true); break;
    case 'customColor': { const ci = $('#colorInput'); ci.value = CT[E.colorTarget].get(selItem()); ci.click(); break; }
    case 'font': if (it) { it.font = v; commit(); redraw(); renderCtx(); $('#fontList').innerHTML = fontListHTML(it); } break;
    case 'fontCat': E.fontCat = v; renderDrawer(); break;
    case 'size': if (it) { const step = it.type === 'text' ? 2 : 6; it.size = Math.max(4, Math.round(it.size * m) + step * +v) / m; commit(); redraw(); renderCtx(); } break;
    case 'toggle': if (it) { it[v] = !it[v]; commit(); redraw(); renderCtx(); if (E.sub === 'effects') renderDrawer(); } break;
    case 'alignCycle': if (it) { const o = ['left', 'center', 'right']; it.align = o[(o.indexOf(it.align || 'center') + 1) % 3]; commit(); redraw(); renderCtx(); } break;
    case 'fx': if (it) {
      if (v === 'none') Object.assign(it, { shadow: false, outline: false, glow: false, hollow: false, neon: false });
      if (v === 'shadow') { const on = it.shadow && (it.shadowBlur ?? .25) < .5; Object.assign(it, { shadow: !on, shadowBlur: .25, shadowOff: .06, shadowA: .55 }); }
      if (v === 'lift') { const on = it.shadow && (it.shadowBlur ?? .25) >= .5; Object.assign(it, { shadow: !on, shadowBlur: .7, shadowOff: .03, shadowA: .35 }); }
      if (v === 'hollow') it.hollow = !it.hollow;
      if (v === 'outline') it.outline = !it.outline;
      if (v === 'glow') { const on = it.glow && !it.neon; Object.assign(it, { glow: !on, neon: false }); if (!on && (!it.glowColor || it.glowColor === '#ffffff') && /^#f/i.test(it.color)) it.glowColor = '#ff5cc8'; }
      if (v === 'neon') { const on = it.glow && it.neon; if (on) Object.assign(it, { glow: false, neon: false }); else Object.assign(it, { glow: true, neon: true, glowColor: it.color && !/^#f/i.test(it.color) ? it.color : '#00e5ff', color: '#ffffff', glowSize: 1.2 }); }
      commit(); redraw(); renderDrawer(); renderCtx();
    } break;
    case 'layer': if (it) {
      const a = ev.items, i = a.indexOf(it); a.splice(i, 1);
      const j = v === 'up' ? Math.min(a.length, i + 1) : v === 'down' ? Math.max(0, i - 1) : v === 'top' ? a.length : 0;
      a.splice(j, 0, it); commit(); redraw(); toast(v === 'up' || v === 'top' ? 'Moved forward' : 'Moved backward', 1200);
    } break;
    case 'palign': if (it) {
      const h = hitBox(it.id) || { w: .2, h: .1 }, mx = .04, my = .02;
      if (v === 'left') it.x = h.w / 2 + mx; if (v === 'right') it.x = 1 - h.w / 2 - mx; if (v === 'hcenter') it.x = .5;
      if (v === 'top') it.y = h.h / 2 + my; if (v === 'bottom') it.y = 1 - h.h / 2 - my; if (v === 'vcenter') it.y = .5;
      commit(); redraw();
    } break;
    case 'dup': if (it) { const c = clone(it); c.id = 'i-' + uid(); c.x = Math.min(1, c.x + .04); c.y = Math.min(1, c.y + .02); addItem(c); } break;
    case 'del': if (it) { ev.items.splice(ev.items.indexOf(it), 1); E.sel = null; commit(); redraw(); renderCtx(); if (E.sub) { E.sub = null; renderDrawer(); } } break;
    case 'pop': if (it) {
      let html = '';
      if (v === 'opacity') html = sl('data-ik', 'opacity', 'Transparency', .05, 1, .01, it.opacity ?? 1, pct);
      if (v === 'spacing') html = sl('data-ik', 'ls', 'Letter spacing', -.05, .6, .01, it.ls || 0, pct) + sl('data-ik', 'lineH', 'Line spacing', .7, 2.5, .05, it.lineH || 1.2, v => (+v).toFixed(2));
      if (v === 'radius') html = sl('data-ik', 'radius', 'Corner rounding', 0, 1, .01, it.radius || 0, pct);
      if (v === 'stroke') html = sl('data-ik', 'stroke', 'Line thickness', .005, .15, .005, it.stroke || .03, pct);
      openPop(el, html);
    } break;
  }
}
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if (!el || !(el.closest('#editor') || el.closest('#pop'))) return;
  if (!isDesign() && !['set', 'openTab', 'subBack'].includes(el.dataset.act)) return;
  act(el.dataset.act, el.dataset.v, el);
});
document.addEventListener('input', e => {
  const t = e.target; if (!(t.closest('#editor') || t.closest('#pop')) || !S.ed) return;
  const out = t.nextElementSibling && t.nextElementSibling.tagName === 'OUTPUT' ? t.nextElementSibling : null;
  const fmt = v => t.dataset.fmt === 'pct' ? pct(v) : t.dataset.ik === 'rot' ? v + '°' : t.dataset.ik === 'lineH' ? (+v).toFixed(2) : v;
  if (t.dataset.k) { const v = t.type === 'checkbox' ? t.checked : t.type === 'range' ? +t.value : t.value; S.ed[t.dataset.k] = v; if (out) out.textContent = fmt(v); redraw(); softCommit(); }
  else if (t.dataset.ik) { const it = selItem(); if (!it) return; it[t.dataset.ik] = +t.value; if (out) out.textContent = fmt(+t.value); redraw(); softCommit(); }
  else if (t.dataset.tx) { S.ed.textEdits = S.ed.textEdits || {}; S.ed.textEdits[t.dataset.tx] = t.value; redraw(); softCommit(); }
  else if (t.dataset.lt) { S.ed.text = S.ed.text || {}; S.ed.text[t.dataset.lt] = t.type === 'checkbox' ? t.checked : t.value; redraw(); softCommit(); }
  else if (t.dataset.name) { S.ed.name = t.value; $('#edName').value = t.value; S.dirty = true; }
});
$('#edName').addEventListener('input', e => { if (S.ed) { S.ed.name = e.target.value; S.dirty = true; } });
document.addEventListener('keydown', e => {
  if (!$('#editor').classList.contains('active') || !S.ed) return;
  const a = document.activeElement, typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(a.tagName) || a.isContentEditable, mod = e.metaKey || e.ctrlKey;
  if (mod && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if (typing || !isDesign()) return;
  const it = selItem(); if (!it) return;
  const L = L_(), n = e.shiftKey ? 10 : 1;
  if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); act('del'); }
  else if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); act('dup'); }
  else if (e.key === 'Escape') { E.sel = null; renderCtx(); drawOverlay(); }
  else if (e.key === 'Enter' && it.type === 'text') { e.preventDefault(); startEdit(it.id); }
  else if (e.key.startsWith('Arrow')) {
    e.preventDefault();
    if (e.key === 'ArrowLeft') it.x -= n / L.W; if (e.key === 'ArrowRight') it.x += n / L.W;
    if (e.key === 'ArrowUp') it.y -= n / L.H; if (e.key === 'ArrowDown') it.y += n / L.H;
    redraw(); softCommit();
  }
});
$('#imgFile').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f || !isDesign()) return;
  const key = E.uploadKey;
  const url = await shrinkImage(f, 2400, key === 'bgImage' ? 'image/jpeg' : 'image/png');
  S.ed[key] = url; commit(); renderDrawer(); redraw();
  const g = geom(S.ed), img = await loadImg(url);
  if (img && key === 'bgImage' && Math.abs(img.naturalWidth / img.naturalHeight - g.W / g.H) > .03)
    toast(`Heads up: your image isn't ${g.W}×${g.H}, so it will be cropped to fit.`, 4500);
});
function shrinkImage(file, max, type) {
  return new Promise(res => {
    const url = URL.createObjectURL(file), i = new Image();
    i.onload = () => {
      const k = Math.min(1, max / Math.max(i.naturalWidth, i.naturalHeight));
      const c = document.createElement('canvas'); c.width = Math.round(i.naturalWidth * k); c.height = Math.round(i.naturalHeight * k);
      c.getContext('2d').drawImage(i, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      res(c.toDataURL(type, .9));
    };
    i.src = url;
  });
}
async function downloadGuide() {
  const g = geom(S.ed), c = document.createElement('canvas'); c.width = g.W; c.height = g.H;
  const ctx = c.getContext('2d'); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, g.W, g.H);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  g.slots.forEach((s, i) => {
    ctx.fillStyle = '#9a96a3'; ctx.fillRect(s.x, s.y, s.w, s.h);
    ctx.fillStyle = '#fff'; ctx.font = `700 ${Math.min(s.w, s.h) * .14}px sans-serif`;
    ctx.fillText(`PHOTO ${i + 1}`, s.x + s.w / 2, s.y + s.h / 2 - Math.min(s.w, s.h) * .08);
    ctx.font = `500 ${Math.min(s.w, s.h) * .07}px sans-serif`;
    ctx.fillText(`${Math.round(s.w)}×${Math.round(s.h)} px`, s.x + s.w / 2, s.y + s.h / 2 + Math.min(s.w, s.h) * .1);
  });
  if (g.text.h) { ctx.strokeStyle = '#c0bcc8'; ctx.setLineDash([12, 10]); ctx.lineWidth = 3; ctx.strokeRect(g.text.x, g.text.y, g.text.w, g.text.h);
    ctx.fillStyle = '#9a96a3'; ctx.font = `600 ${g.u * 24}px sans-serif`; ctx.fillText('space for text', g.W / 2, g.text.y + g.text.h / 2); }
  const blob = await toBlob(c, .95);
  shareOrDownload([new File([blob], `canva-guide-${S.ed.layout}-${g.W}x${g.H}.jpg`, { type: 'image/jpeg' })]);
}
async function saveEd() {
  if (E.editing) finishEdit();
  if (isDesign()) { S.ed.updated = Date.now(); await DB.put('designs', clone(S.ed)); await loadDrafts(); }
  else await saveEvent(S.ed);
  S.dirty = false;
}
$('#edSave').onclick = async () => { await saveEd(); toast(isDesign() && !S.ed.mine ? 'Draft saved ✓ (publish to share it)' : 'Saved ✓'); };
$('#edBack').onclick = async () => {
  if (S.dirty && confirm('Save your changes?')) await saveEd();
  go(isDesign() && !S.ed.mine ? 'creator' : 'home');
};
$('#edStart').onclick = async () => {
  await saveEd();
  if (isDesign()) { const t = newEventFrom(S.ed, 'Test: ' + S.ed.name); B.returnTo = S.ed.mine ? 'home' : 'creator'; startBooth(compose(Object.assign(t, { id: 'test' }))); }
  else startBooth(compose(S.ed));
};

/* ---------------- CREATOR MODE (owner only) ---------------- */
/* ---------------- CREATOR MODE (owner only) ---------------- */
async function sha(s) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('booth:' + s));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}
async function creatorHash() { return S.library.creatorHash || (await DB.get('kv', 'creatorHash')) || null; }
$('#sCreator').onclick = async () => {
  if (S.creator) return go('creator');
  const h = await creatorHash();
  if (!h) {
    const a = prompt('Set up Creator mode — choose a passcode (only you should know it):'); if (!a) return;
    if (prompt('Type the passcode again:') !== a) { toast('Passcodes didn’t match'); return; }
    await DB.put('kv', await sha(a), 'creatorHash');
  } else {
    const a = prompt('Creator passcode:'); if (a === null) return;
    if (await sha(a) !== h) { toast('Wrong passcode'); return; }
  }
  S.creator = true; await DB.put('kv', true, 'creatorUnlocked'); go('creator');
};
$('#cLock').onclick = async () => { S.creator = false; await DB.put('kv', false, 'creatorUnlocked'); toast('Creator mode locked'); go('home'); };
$('#cPass').onclick = async () => {
  const a = prompt('New creator passcode:'); if (!a) return;
  if (prompt('Type it again:') !== a) { toast('Passcodes didn’t match'); return; }
  const h = await sha(a); await DB.put('kv', h, 'creatorHash');
  if (S.library.creatorHash) S.library.creatorHash = h; // takes effect for others after you publish
  toast('Passcode changed. Publish again so it applies everywhere.', 4000);
};
async function renderCreator() {
  await loadDrafts();
  const pub = S.library.designs.length;
  $('#cStatus').innerHTML = `Published right now: <b>${pub}</b> design${pub === 1 ? '' : 's'}${S.library.updated ? ' (last published ' + new Date(S.library.updated).toLocaleString() + ')' : ''} · Drafts on this device: <b>${S.drafts.length}</b>`;
  const box = $('#designCards');
  box.innerHTML = `<button class="card newcard" id="newDesign"><b>＋</b>New ready-made design</button>` + S.drafts.map(d =>
    cardHTML(d.id, esc(d.name) + (S.library.designs.some(x => x.id === d.id) ? '' : '<span class="badge">not published</span>'), LAYOUTS[d.layout].label,
      `<button class="btn sm primary" data-a="edit">Edit</button><button class="btn sm ghost" data-a="dup">Copy</button><button class="btn sm ghost" data-a="del">Delete</button>`)).join('');
  $('#newDesign').onclick = () => newDesignDialog(false);
  for (const card of $$('.card[data-id]', box)) {
    const d = S.drafts.find(x => x.id === card.dataset.id);
    thumbURL(d).then(u => $('img', card).src = u);
    card.onclick = async e => {
      const a = e.target.dataset.a; if (!a) return;
      if (a === 'edit') openEditor('design', d);
      if (a === 'dup') { const c = clone(d); c.id = 'd-' + uid(); c.name += ' (copy)'; c.created = Date.now(); await DB.put('designs', c); renderCreator(); }
      if (a === 'del' && confirm(`Delete draft "${d.name}"? If it's published, it disappears for everyone the next time you publish.`)) { await DB.del('designs', d.id); renderCreator(); }
    };
  }
}
$('#cPull').onclick = async () => {
  if (!S.library.designs.length) { toast('Nothing published yet'); return; }
  if (!confirm('Copy all published designs into your drafts? Drafts with the same design will be replaced.')) return;
  for (const d of S.library.designs) await DB.put('designs', clone(d));
  renderCreator(); toast('Done');
};
$('#cLoadFile').onclick = () => $('#cFile').click();
$('#cFile').onchange = async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    const lib = JSON.parse(await f.text()); if (!Array.isArray(lib.designs)) throw new Error('not a library.json file');
    for (const d of lib.designs) { delete d.mine; await DB.put('designs', migrate(d)); }
    renderCreator(); toast(`Loaded ${lib.designs.length} designs into drafts`);
  } catch (err) { alert('Could not load: ' + err.message); }
};
$('#cPublish').onclick = async () => {
  await loadDrafts();
  if (!S.drafts.length) { toast('Make a design first'); return; }
  const hasCloud = !!(S.settings.cloud && S.settings.preset);
  const box = openModal(`<h2 style="margin-top:0">Publish ${S.drafts.length} design${S.drafts.length === 1 ? '' : 's'}</h2>
    <p class="muted">This makes a file called <b>library.json</b> with all your drafts. Then:</p>
    <ol class="muted" style="line-height:1.7">
      <li>Tap <b>Make library.json</b> and choose <b>Save to Files</b>.</li>
      <li>On github.com, open your <b>booth</b> repository → <b>Add file → Upload files</b>.</li>
      <li>Upload <b>library.json</b> (it replaces the old one) → <b>Commit changes</b>.</li>
      <li>After 1–2 minutes, everyone who opens the app gets your new designs.</li></ol>
    ${hasCloud ? `<div class="row"><input type="checkbox" id="pCloud" checked style="width:24px"> <span>Include my QR settings so QR codes also work on friends' iPads (their photos upload to my free Cloudinary).</span></div>` : ''}
    <div class="row" style="justify-content:flex-end;margin-top:18px"><button class="btn ghost" id="pX">Cancel</button><button class="btn gold" id="pGo">Make library.json</button></div>`);
  $('#pX', box).onclick = closeModal;
  $('#pGo', box).onclick = async () => {
    const lib = { app: 'booth', version: 1, updated: Date.now(), creatorHash: await creatorHash(), designs: S.drafts.map(clone) };
    if (hasCloud && $('#pCloud', box)?.checked) lib.cloud = { cloud: S.settings.cloud, preset: S.settings.preset };
    const blob = new Blob([JSON.stringify(lib)], { type: 'application/json' });
    const ok = await shareOrDownload([new File([blob], 'library.json', { type: 'application/json' })]);
    if (ok) { S.library = lib; await DB.put('kv', lib, 'library'); closeModal(); renderCreator(); toast('library.json ready. Upload it to GitHub to go live.', 4500); }
  };
};

/* ---------------- sharing helpers ---------------- */
async function shareOrDownload(files) {
  try {
    if (navigator.canShare && navigator.canShare({ files })) { await navigator.share({ files }); return true; }
  } catch (err) { if (err.name === 'AbortError') return false; console.warn(err); }
  for (const f of files) downloadBlob(f, f.name);
  return true;
}
function downloadBlob(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
function photoFile(p, n) {
  const d = new Date(p.created);
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}`;
  return new File([p.blob], `${slug(p.eventName)}-${stamp}${n ? '-' + n : ''}.jpg`, { type: 'image/jpeg' });
}

/* ---------------- QR via free Cloudinary (optional) ---------------- */
// the device's own settings win; otherwise use the QR settings the creator published (if any)
function cloudCfg() {
  if (S.settings.cloud && S.settings.preset) return { cloud: S.settings.cloud.trim(), preset: S.settings.preset.trim() };
  const c = S.library.cloud; return c && c.cloud && c.preset ? c : null;
}
function cloudOn() { return !!cloudCfg(); }
function cloudURL(publicId) { return `https://res.cloudinary.com/${encodeURIComponent(cloudCfg().cloud)}/image/upload/${publicId}.jpg`; }
async function uploadPhoto(p) {
  const fd = new FormData();
  fd.append('file', p.blob, 'photo.jpg'); fd.append('upload_preset', cloudCfg().preset); fd.append('public_id', p.publicId);
  const r = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudCfg().cloud)}/image/upload`, { method: 'POST', body: fd });
  const j = await r.json(); if (!r.ok) throw new Error(j.error?.message || ('HTTP ' + r.status));
  return j;
}
let queueBusy = false;
async function processQueue() {
  if (queueBusy || !cloudOn() || !navigator.onLine) return;
  queueBusy = true;
  try {
    const pending = (await DB.all('photos')).filter(p => p.publicId && !p.uploaded);
    for (const p of pending) {
      try { const j = await uploadPhoto(p); p.uploaded = true; p.url = j.secure_url; await DB.put('photos', p); updateQrNote(p); }
      catch (err) { console.warn('upload failed', err); if (/already exists/i.test(err.message)) { p.uploaded = true; await DB.put('photos', p); } else break; }
    }
  } finally { queueBusy = false; }
}
window.addEventListener('online', processQueue);
setInterval(processQueue, 45000);
function qrDataURL(text, cell = 6) { const q = qrcode(0, 'M'); q.addData(text); q.make(); return q.createDataURL(cell, 2); }

/* ---------------- BOOTH ---------------- */
const B = { ev: null, stream: null, token: 0, photos: [], last: null, timer: null, audio: null };
function layer(id) { $$('#booth .layer').forEach(l => l.classList.toggle('on', l.id === id)); }
async function startBooth(ev) {
  B.ev = clone(ev); go('booth');
  try { await document.documentElement.requestFullscreen?.(); } catch (e) { }
  showAttract();
  await startCamera();
}
async function startCamera() {
  if (B.stream) return true;
  try {
    B.stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: S.settings.cam, width: { ideal: 1920 }, height: { ideal: 1440 } } });
    const v = $('#video'); v.srcObject = B.stream; await v.play().catch(() => { });
    return true;
  } catch (err) {
    alert('Could not open the camera: ' + err.message + '\n\nAllow camera access for this site (Safari → aA → Website Settings → Camera → Allow), and make sure the page is opened over https://.');
    return false;
  }
}
function stopCamera() { B.stream?.getTracks().forEach(t => t.stop()); B.stream = null; }
async function showAttract() {
  clearInterval(B.timer); B.token++;
  const ev = B.ev, a = $('#attract');
  const bg = ev.bgImage ? `linear-gradient(#0007,#0007),url(${ev.bgImage})` : ev.bgStyle === 'gradient' ? `linear-gradient(${ev.c1},${ev.c2})` : ev.c1;
  a.style.background = bg; a.style.backgroundSize = 'cover'; a.style.backgroundPosition = 'center';
  a.innerHTML = `<img class="sample" alt="">
    <div class="tap">${esc(ev.attractMsg || 'Tap to start')}</div>`;
  thumbURL(ev, 700).then(u => { const i = $('img.sample', a); if (i) i.src = u; });
  layer('attract');
}
$('#attract').addEventListener('click', () => runSession());
function beep(freq = 880, dur = .12) {
  if (!B.ev?.sound) return;
  try {
    B.audio = B.audio || new (window.AudioContext || window.webkitAudioContext)();
    const o = B.audio.createOscillator(), g = B.audio.createGain(); o.frequency.value = freq; o.connect(g); g.connect(B.audio.destination);
    g.gain.setValueAtTime(.25, B.audio.currentTime); g.gain.exponentialRampToValueAtTime(.001, B.audio.currentTime + dur);
    o.start(); o.stop(B.audio.currentTime + dur);
  } catch (e) { }
}
function placeGuide() {
  const v = $('#video'), box = $('#guide div'); if (!v.videoWidth) { box.style.display = 'none'; return; }
  const s0 = geom(B.ev).slots[0], a = s0.w / s0.h, vw = v.videoWidth, vh = v.videoHeight;
  let cw = vw, ch = vh; if (vw / vh > a) cw = vh * a; else ch = vw / a;
  const sc = Math.max(v.clientWidth / vw, v.clientHeight / vh);
  box.style.display = 'block'; box.style.width = cw * sc + 'px'; box.style.height = ch * sc + 'px';
}
async function runSession() {
  if (!(await startCamera())) return;
  const tok = ++B.token, ev = B.ev, n = shotsFor(ev), v = $('#video');
  beep(1, .01); // unlock audio on tap
  v.classList.toggle('mirror', ev.mirror && S.settings.cam === 'user');
  B.photos = []; $('#thumbs').innerHTML = ''; layer('live'); placeGuide();
  const cnt = $('#count');
  for (let i = 0; i < n; i++) {
    $('#shotInfo').textContent = n > 1 ? `Photo ${i + 1} of ${n}` : 'Get ready!';
    const secs = i === 0 ? ev.countdown : Math.min(ev.countdown, 3);
    for (let c = secs; c > 0; c--) {
      if (tok !== B.token) return;
      cnt.textContent = c; cnt.classList.remove('pop'); void cnt.offsetWidth; cnt.classList.add('pop');
      beep(c === 1 ? 1320 : 880); await sleep(1000);
    }
    if (tok !== B.token) return;
    cnt.textContent = '';
    const shot = document.createElement('canvas'); shot.width = v.videoWidth || 1280; shot.height = v.videoHeight || 960;
    const sc = shot.getContext('2d');
    if (ev.mirror && S.settings.cam === 'user') { sc.translate(shot.width, 0); sc.scale(-1, 1); }
    sc.drawImage(v, 0, 0, shot.width, shot.height);
    const fl = $('#flash'); fl.classList.remove('go'); void fl.offsetWidth; fl.classList.add('go'); beep(2000, .08);
    B.photos.push(shot);
    const t = document.createElement('img'); t.src = shot.toDataURL('image/jpeg', .5); $('#thumbs').appendChild(t);
    await sleep(900);
  }
  if (tok !== B.token) return;
  layer('busy');
  const out = await render(ev, B.photos);
  const blob = await toBlob(out, .92);
  const id = uid();
  const p = { id, eventId: ev.id, eventName: ev.name, created: Date.now(), blob, uploaded: false, w: out.width, h: out.height };
  if (cloudOn()) { p.publicId = `booth/${slug(ev.name)}-${id}`; p.url = cloudURL(p.publicId); }
  await DB.put('photos', p);
  navigator.storage?.persist?.();
  if (tok !== B.token) return;
  showResult(p);
  processQueue();
}
function showResult(p) {
  B.last = p;
  const img = $('#resultImg'); if (img.dataset.u) URL.revokeObjectURL(img.dataset.u);
  img.dataset.u = img.src = URL.createObjectURL(p.blob);
  const qb = $('#qrBox');
  if (p.url) { $('#qrImg').src = qrDataURL(p.url); qb.style.display = 'block'; updateQrNote(p); } else qb.style.display = 'none';
  layer('result'); startReturnTimer();
}
function updateQrNote(p) {
  if (!B.last || B.last.id !== p.id) return;
  $('#qrNote').textContent = p.uploaded ? 'Scan to download ✓' : (navigator.onLine ? 'Scan to download (uploading…)' : 'Scan & save the link — it works once the booth is back online');
}
function startReturnTimer(paused) {
  clearInterval(B.timer); const secs = B.ev.autoReturn; const out = $('#resultTimer');
  if (!secs || paused) { out.textContent = ''; return; }
  let left = secs; out.textContent = `Back to start in ${left}s`;
  B.timer = setInterval(() => { left--; out.textContent = `Back to start in ${left}s`; if (left <= 0) showAttract(); }, 1000);
}
$('#rShare').onclick = async () => { startReturnTimer(true); await shareOrDownload([photoFile(B.last)]); startReturnTimer(); };
$('#rRetake').onclick = async () => {
  clearInterval(B.timer);
  if (confirm('Retake? This photo stays in the gallery.')) runSession(); else startReturnTimer();
};
$('#rDone').onclick = () => showAttract();
$('#result').addEventListener('pointerdown', e => { if (!e.target.closest('button')) startReturnTimer(); });
// exit: PIN if set, otherwise hold 2s
(() => {
  const b = $('#exitBtn'); let t = null;
  const exit = () => {
    B.token++; clearInterval(B.timer); stopCamera(); layer('none');
    try { document.fullscreenElement && document.exitFullscreen(); } catch (e) { }
    { const to = B.returnTo || 'home'; B.returnTo = null; go(to === 'creator' && !S.creator ? 'home' : to); }
  };
  b.addEventListener('pointerdown', () => {
    if (S.settings.pin) return;
    b.style.background = '#ff5a6e'; t = setTimeout(exit, 2000);
  });
  const cancel = () => { clearTimeout(t); b.style.background = ''; };
  b.addEventListener('pointerup', cancel); b.addEventListener('pointerleave', cancel);
  b.addEventListener('click', () => {
    if (!S.settings.pin) { toast('Hold ✕ for 2 seconds to exit', 1500); return; }
    const v = prompt('Enter PIN to exit'); if (v === S.settings.pin) exit(); else if (v !== null) toast('Wrong PIN');
  });
})();
window.addEventListener('resize', () => { if ($('#live').classList.contains('on')) placeGuide(); });

/* ---------------- GALLERY ---------------- */
let galURLs = [];
async function galItems() {
  const all = (await DB.all('photos')).sort((a, b) => b.created - a.created);
  const f = $('#galFilter').value;
  return f && f !== 'all' ? all.filter(p => p.eventId === f) : all;
}
async function renderGallery() {
  const all = await DB.all('photos'); await loadEvents();
  const sel = $('#galFilter'), cur = sel.value || 'all';
  const names = new Map(); all.forEach(p => names.set(p.eventId, p.eventName));
  sel.innerHTML = `<option value="all">All events</option>` + [...names].map(([id, n]) => `<option value="${id}" ${id === cur ? 'selected' : ''}>${esc(n)}</option>`).join('');
  const items = await galItems();
  galURLs.forEach(u => URL.revokeObjectURL(u)); galURLs = [];
  $('#galCount').textContent = `${items.length} photo${items.length === 1 ? '' : 's'}` + (cloudOn() ? ` · ${items.filter(p => p.publicId && !p.uploaded).length} waiting to upload` : '');
  $('#galGrid').innerHTML = items.map(p => { const u = URL.createObjectURL(p.blob); galURLs.push(u); return `<div class="it" data-id="${p.id}"><img src="${u}" loading="lazy">${p.publicId ? `<span class="dot2">${p.uploaded ? '☁️ ✓' : '⏳'}</span>` : ''}</div>`; }).join('')
    || '<div class="empty" style="grid-column:1/-1">No photos yet. Start a booth from the home screen.</div>';
}
$('#galFilter').onchange = renderGallery;
$('#galGrid').onclick = async e => {
  const it = e.target.closest('.it'); if (!it) return;
  const p = await DB.get('photos', it.dataset.id); const u = URL.createObjectURL(p.blob);
  const box = openModal(`<img class="big" src="${u}">
    <div class="muted" style="text-align:center;margin-bottom:12px">${esc(p.eventName)} · ${new Date(p.created).toLocaleString()}</div>
    ${p.url ? `<div style="text-align:center;margin-bottom:12px"><img src="${qrDataURL(p.url, 5)}" style="background:#fff;padding:8px;border-radius:10px"><div class="muted" style="font-size:12px">${p.uploaded ? 'Uploaded ✓' : 'Not uploaded yet'}</div></div>` : ''}
    <div class="row" style="justify-content:center">
      <button class="btn primary" id="gShare">Share / Save</button>
      <button class="btn danger" id="gDel">Delete</button>
      <button class="btn ghost" id="gClose">Close</button></div>`);
  $('#gShare', box).onclick = () => shareOrDownload([photoFile(p)]);
  $('#gDel', box).onclick = async () => { if (confirm('Delete this photo from the iPad?')) { await DB.del('photos', p.id); closeModal(); renderGallery(); } };
  $('#gClose', box).onclick = closeModal;
};
$('#galShareAll').onclick = async () => {
  const items = await galItems(); if (!items.length) return;
  const files = items.map((p, i) => photoFile(p, i + 1));
  if (!(navigator.canShare && navigator.canShare({ files: files.slice(0, 1) }))) { toast('Sharing isn’t supported here — use Download all (ZIP)'); return; }
  const size = 20, batches = [];
  for (let i = 0; i < files.length; i += size) batches.push(files.slice(i, i + size));
  const box = openModal(`<h3 style="margin-top:0">Save / share ${files.length} photos</h3>
    <p class="muted">Tap each batch, then choose <b>Save ${Math.min(size, files.length)} Images</b> (to Photos) or AirDrop.</p>
    <div class="row">${batches.map((b, i) => `<button class="btn" data-b="${i}">Photos ${i * size + 1}–${i * size + b.length}</button>`).join('')}</div>
    <div class="row" style="justify-content:flex-end;margin-top:16px"><button class="btn ghost" id="bClose">Close</button></div>`);
  box.onclick = async e => {
    if (e.target.id === 'bClose') return closeModal();
    const i = e.target.dataset.b; if (i === undefined) return;
    try { await navigator.share({ files: batches[i] }); e.target.textContent += ' ✓'; } catch (err) { if (err.name !== 'AbortError') toast('Share failed: ' + err.message); }
  };
};
$('#galZip').onclick = async () => {
  const items = await galItems(); if (!items.length) return;
  toast('Building ZIP…');
  const files = await Promise.all(items.map(async (p, i) => ({ name: photoFile(p, i + 1).name, data: new Uint8Array(await p.blob.arrayBuffer()) })));
  const f = $('#galFilter'); const nm = f.value === 'all' ? 'booth-photos' : slug(f.selectedOptions[0].textContent);
  downloadBlob(makeZip(files), `${nm}.zip`);
};
$('#galUpload').onclick = async () => {
  if (!cloudOn()) { toast('Set up QR downloads in Settings first'); return; }
  if (!navigator.onLine) { toast('No internet right now'); return; }
  toast('Uploading…'); await processQueue(); renderGallery(); toast('Upload finished');
};
$('#galDelAll').onclick = async () => {
  const items = await galItems(); if (!items.length) return;
  if (!confirm(`Delete ${items.length} photos from this iPad? Save them first!`)) return;
  if (!confirm('Are you sure? This cannot be undone.')) return;
  for (const p of items) await DB.del('photos', p.id);
  renderGallery();
};

/* minimal ZIP writer (no compression — JPEGs are already compressed) */
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(d) { let c = 0xFFFFFFFF; for (let i = 0; i < d.length; i++) c = CRC[(c ^ d[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function makeZip(files) {
  const enc = new TextEncoder(), parts = [], central = []; let off = 0;
  const now = new Date(), dt = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)), dd = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate());
  for (const f of files) {
    const name = enc.encode(f.name), crc = crc32(f.data), sz = f.data.length;
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0, true); h.setUint16(8, 0, true);
    h.setUint16(10, dt, true); h.setUint16(12, dd, true); h.setUint32(14, crc, true); h.setUint32(18, sz, true); h.setUint32(22, sz, true);
    h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
    parts.push(h, name, f.data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0, true); c.setUint16(10, 0, true);
    c.setUint16(12, dt, true); c.setUint16(14, dd, true); c.setUint32(16, crc, true); c.setUint32(20, sz, true); c.setUint32(24, sz, true);
    c.setUint16(28, name.length, true); c.setUint32(42, off, true);
    central.push(c, name); off += 30 + name.length + sz;
  }
  const csize = central.reduce((a, p) => a + p.byteLength, 0);
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
  e.setUint32(12, csize, true); e.setUint32(16, off, true);
  return new Blob([...parts, ...central, e], { type: 'application/zip' });
}

/* ---------------- SETTINGS ---------------- */
async function renderSettings() {
  const s = S.settings;
  $('#sCam').value = s.cam; $('#sPin').value = s.pin; $('#sCloud').value = s.cloud; $('#sPreset').value = s.preset; $('#sTestOut').textContent = '';
  try {
    const est = await navigator.storage.estimate(); const persisted = await navigator.storage.persisted?.();
    $('#sStorage').textContent = `Using ${(est.usage / 1048576).toFixed(1)} MB of ~${(est.quota / 1073741824).toFixed(1)} GB available.` + (persisted ? ' Storage is protected ✓' : '');
  } catch (e) { $('#sStorage').textContent = ''; }
}
function readSettings() {
  return { cam: $('#sCam').value, pin: $('#sPin').value.trim(), cloud: $('#sCloud').value.trim(), preset: $('#sPreset').value.trim() };
}
$('#sSave').onclick = async () => { S.settings = readSettings(); await DB.put('kv', S.settings, 'settings'); toast('Settings saved ✓'); processQueue(); };
$('#sTest').onclick = async () => {
  const out = $('#sTestOut'); S.settings = readSettings();
  if (!cloudOn()) { out.textContent = 'Fill in both fields first.'; return; }
  out.textContent = 'Testing…';
  try {
    const c = document.createElement('canvas'); c.width = 200; c.height = 120; const x = c.getContext('2d');
    x.fillStyle = '#ff5a6e'; x.fillRect(0, 0, 200, 120); x.fillStyle = '#fff'; x.font = '700 28px sans-serif'; x.fillText('Booth test', 22, 70);
    const pid = 'booth/test-' + uid();
    const j = await uploadPhoto({ blob: await toBlob(c), publicId: pid });
    const ok = j.secure_url.replace(/\/v\d+\//, '/') === cloudURL(pid);
    out.innerHTML = ok ? '✅ Works! QR codes will work, even for photos taken offline.' :
      `⚠️ Upload worked, but the link format is different (${esc(j.secure_url)}). In your upload preset, leave “Folder” empty and turn off “Use filename”.`;
    await DB.put('kv', S.settings, 'settings');
  } catch (err) { out.textContent = '❌ ' + err.message; }
};


/* ---------------- start ---------------- */
(async () => {
  await DB.open();
  const s = await DB.get('kv', 'settings'); if (s) Object.assign(S.settings, s);
  await loadLibrary(); await loadDrafts();
  S.creator = !!(await DB.get('kv', 'creatorUnlocked'));
  renderHome();
  processQueue();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => { });
})();
