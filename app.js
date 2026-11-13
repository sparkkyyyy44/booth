/* Booth — a free photo booth web app for iPad.
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

/* ---------------- layouts, fonts, themes ---------------- */
const LAYOUTS = {
  strip4: { label: '1×4 strip', size: '2×6 in', W: 600, H: 1800, cols: 1, rows: 4, frac: .15 },
  strip3: { label: '1×3 strip', size: '2×6 in', W: 600, H: 1800, cols: 1, rows: 3, frac: .17 },
  strip2: { label: '1×2 strip', size: '2×6 in', W: 600, H: 1800, cols: 1, rows: 2, frac: .2 },
  grid4: { label: '2×2 grid', size: '4×6 in', W: 1200, H: 1800, cols: 2, rows: 2, frac: .13 },
  single: { label: 'Single photo', size: '6×4 in', W: 1800, H: 1200, cols: 1, rows: 1, frac: .16 },
  double4: { label: '2 strips on 4×6', size: '4×6 in, cut in half', W: 600, H: 1800, cols: 1, rows: 4, frac: .15, double: true },
};
const FONTS = {
  script: { label: 'Elegant script', css: '"Snell Roundhand","Apple Chancery","Brush Script MT",cursive', w: 700 },
  hand: { label: 'Handwritten', css: '"Bradley Hand","Noteworthy","Segoe Print",cursive', w: 700 },
  serif: { label: 'Classic serif', css: '"Didot","Bodoni 72",Georgia,serif', w: 700 },
  sans: { label: 'Modern', css: '"Avenir Next","Helvetica Neue",Arial,sans-serif', w: 600 },
  display: { label: 'Bold', css: '"Futura","Avenir Next Condensed",Impact,sans-serif', w: 800 },
  type: { label: 'Typewriter', css: '"American Typewriter","Courier New",monospace', w: 600 },
  chalk: { label: 'Chalk', css: '"Chalkduster","Marker Felt",fantasy', w: 400 },
  felt: { label: 'Playful', css: '"Marker Felt","Comic Sans MS",cursive', w: 700 },
};
const STICKERS = ['🎄', '🎅', '⭐', '❄️', '☃️', '🎁', '🔔', '🦌', '🕯️', '🍪', '🧦', '🎀', '✨', '🎉', '🎈', '🥂', '❤️', '💛', '🌟', '🎂', '📸', '😎', '👑', '💐'];
const PATTERNS = { none: 'None', snow: 'Snowflakes', stars: 'Stars', confetti: 'Confetti', dots: 'Dots', stripes: 'Candy stripes' };
const FILTERS = { none: 'Normal', bw: 'B&W', warm: 'Warm', cool: 'Cool', vintage: 'Vintage', glow: 'Bright' };

/* A DESIGN is made only by the creator (owner) and published in library.json.
   An EVENT is what anyone makes from a design: a name, the text lines (only if the
   design allows it) and booth settings. Events never change the design itself. */
const TEXT_KEYS = ['title', 'subtitle', 'showDate', 'dateText'];
const BOOTH_KEYS = ['countdown', 'autoReturn', 'mirror', 'sound', 'attractMsg'];
function newDesign(layout = 'strip4', mine = false) {
  return {
    id: (mine ? 'm-' : 'd-') + uid(), mine, name: 'New design', layout, created: Date.now(), allowText: true,
    bgStyle: 'solid', c1: '#ffffff', c2: '#e9e6ef', pattern: 'none', pColor: '#000000', pAmt: .2,
    bgImage: null, overlayImage: null,
    textPos: 'bottom', title: 'Event title', subtitle: '', showDate: true, dateText: todayText(),
    font: 'sans', textColor: '#222222', titleScale: 1, textSize: 1,
    padding: 30, gap: 18, radius: 0, borderW: 0, borderColor: '#ffffff', filter: 'none',
    stickers: [], texts: [],
  };
}
function newEventFrom(d, name) {
  return {
    id: uid(), name: name || d.name, designId: d.id, snapshot: clone(d), created: Date.now(),
    text: { title: d.title, subtitle: d.subtitle, showDate: d.showDate, dateText: d.dateText },
    countdown: 3, autoReturn: 30, mirror: true, sound: true, attractMsg: 'Tap to start', textEdits: {},
  };
}
/* the creator's latest design wins; the copy saved in the event is a fallback */
function designFor(ev) { return allDesigns().find(d => d.id === ev.designId) || ev.snapshot; }
function compose(ev) {
  const d = designFor(ev), out = clone(d);
  if (d.allowText && ev.text) Object.assign(out, ev.text);
  // free text boxes the creator marked as editable can be re-worded per event
  for (const t of out.texts || []) if (t.editable && ev.textEdits && ev.textEdits[t.id] != null) t.s = ev.textEdits[t.id];
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
/* photos: array of canvases (or null => placeholder). opts.selected: sticker index to outline */
async function render(ev, photos = [], opts = {}) {
  const g = geom(ev), { W, H, u } = g;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  // background
  if (ev.bgStyle === 'gradient') { const gr = ctx.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, ev.c1); gr.addColorStop(1, ev.c2); ctx.fillStyle = gr; }
  else ctx.fillStyle = ev.c1;
  ctx.fillRect(0, 0, W, H);
  drawPattern(ctx, ev, W, H, u);
  const bg = await loadImg(ev.bgImage);
  if (bg) drawCover(ctx, bg, bg.naturalWidth, bg.naturalHeight, 0, 0, W, H);
  // text
  if (ev.textPos !== 'none' && g.text.h > 0) {
    const f = FONTS[ev.font] || FONTS.sans, t = { x: g.text.x, y: g.text.y + g.text.h * .07, w: g.text.w, h: g.text.h * .86 }, lines = [];
    const base = 62 * u * ev.titleScale * Math.min(1.4, ev.textSize);
    if (ev.title) lines.push({ s: ev.title, size: base, w: f.w, font: f.css });
    if (ev.subtitle) lines.push({ s: ev.subtitle, size: base * .48, w: 600, font: FONTS.sans.css });
    if (ev.showDate && ev.dateText) lines.push({ s: ev.dateText, size: base * .36, w: 500, font: FONTS.sans.css });
    ctx.fillStyle = ev.textColor; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const l of lines) l.size = fitFont(ctx, l.s, l.font, l.w, l.size, t.w * .94);
    let total = lines.reduce((a, l) => a + l.size * 1.18, 0);
    const k = total > t.h ? t.h / total : 1; total *= k;
    let y = t.y + (t.h - total) / 2;
    for (const l of lines) { const s = l.size * k; ctx.font = `${l.w} ${s}px ${l.font}`; ctx.fillText(l.s, W / 2, y + s * .59); y += s * 1.18; }
  }
  // photos
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
      const gr = ctx.createLinearGradient(s.x, s.y, s.x, s.y + s.h); gr.addColorStop(0, '#d9d4e3'); gr.addColorStop(1, '#a8a1b8');
      ctx.fillStyle = gr; ctx.fillRect(s.x, s.y, s.w, s.h);
      ctx.fillStyle = '#ffffffcc'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `600 ${Math.min(s.h, s.w) * .16}px ${FONTS.sans.css}`; ctx.fillText('Photo ' + (i + 1), s.x + s.w / 2, s.y + s.h / 2);
    }
    ctx.restore();
  });
  // overlay (transparent PNG on top)
  const ov = await loadImg(ev.overlayImage);
  if (ov) ctx.drawImage(ov, 0, 0, W, H);
  // stickers
  ev.stickers.forEach((st, i) => {
    const size = st.size * Math.min(W, H);
    ctx.save(); ctx.translate(st.x * W, st.y * H); ctx.rotate((st.rot || 0) * Math.PI / 180);
    ctx.font = `${size}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(st.e, 0, 0);
    if (opts.selected === i) { ctx.strokeStyle = '#ff5a6e'; ctx.lineWidth = 4 * u; ctx.setLineDash([10 * u, 8 * u]); ctx.strokeRect(-size * .6, -size * .6, size * 1.2, size * 1.2); }
    ctx.restore();
  });
  // free text boxes (placed anywhere, drawn on top of everything)
  (ev.texts || []).forEach((t, i) => {
    if (!t.s) return;
    const f = FONTS[t.font] || FONTS.sans, size = t.size * Math.min(W, H), lh = size * 1.15;
    const lines = String(t.s).split('\n');
    ctx.save(); ctx.translate(t.x * W, t.y * H); ctx.rotate((t.rot || 0) * Math.PI / 180);
    ctx.font = `${t.italic ? 'italic ' : ''}${t.bold === false ? 400 : f.w} ${size}px ${f.css}`; ctx.textBaseline = 'middle';
    ctx.globalAlpha = t.opacity ?? 1;
    const bw = Math.max(...lines.map(l => ctx.measureText(l).width)), bh = lines.length * lh;
    const ax = t.align === 'left' ? -bw / 2 : t.align === 'right' ? bw / 2 : 0;
    ctx.textAlign = t.align || 'center';
    lines.forEach((l, k) => {
      const y = -bh / 2 + lh * (k + .5);
      ctx.save();
      if (t.glow) { // soft colored halo: draw a few blurred passes behind the text
        ctx.save(); ctx.shadowColor = t.glowColor || '#ffffff'; ctx.fillStyle = t.glowColor || '#ffffff';
        for (const k of [.9, .5, .25]) { ctx.shadowBlur = size * k * (t.glowSize ?? 1); ctx.fillText(l, ax, y); }
        ctx.restore();
      }
      if (t.shadow) { ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = size * .25; ctx.shadowOffsetY = size * .06; }
      if (t.outline) { ctx.lineJoin = 'round'; ctx.lineWidth = size * .14 * (t.outlineW ?? 1); ctx.strokeStyle = t.outlineColor || '#000'; ctx.strokeText(l, ax, y); ctx.shadowColor = 'transparent'; }
      ctx.fillStyle = t.color || '#000'; ctx.fillText(l, ax, y);
      ctx.restore();
    });
    if (opts.selText === i) { ctx.strokeStyle = '#ff5a6e'; ctx.lineWidth = 4 * u; ctx.setLineDash([10 * u, 8 * u]); ctx.strokeRect(-bw / 2 - 8 * u, -bh / 2 - 6 * u, bw + 16 * u, bh + 12 * u); }
    ctx.restore();
    if (opts.hits) opts.hits.push({ i, w: bw / W + .03, h: bh / H + .02, x: t.x, y: t.y });
  });
  if (g.L.double) {
    const d = document.createElement('canvas'); d.width = W * 2; d.height = H;
    const dc = d.getContext('2d'); dc.drawImage(c, 0, 0); dc.drawImage(c, W, 0);
    return d;
  }
  return c;
}
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
// Published designs live in library.json next to index.html (only the owner can upload it to GitHub).
async function loadLibrary() {
  try {
    const r = await fetch('library.json?t=' + Date.now(), { cache: 'no-store' });
    if (r.ok) { const lib = await r.json(); if (Array.isArray(lib.designs)) { S.library = lib; await DB.put('kv', lib, 'library'); return; } }
  } catch (e) { /* offline: use the saved copy */ }
  S.library = (await DB.get('kv', 'library')) || { designs: [] };
}
async function loadDrafts() {
  const all = (await DB.all('designs')).sort((a, b) => a.created - b.created);
  S.drafts = all.filter(d => !d.mine);   // the creator's designs (publishable)
  S.mine = all.filter(d => d.mine);      // anyone's own designs, kept on this iPad only
}
/* everyone sees published designs; the creator also sees their unpublished drafts */
function allDesigns() {
  const list = S.library.designs.map(d => ({ ...d, _pub: true }));
  if (S.creator) for (const d of S.drafts) {
    const i = list.findIndex(x => x.id === d.id);
    const item = { ...d, _draft: true };
    if (i >= 0) list[i] = item; else list.push(item);
  }
  for (const d of S.mine || []) list.push({ ...d, _mine: true });
  return list;
}

/* ---------------- HOME ---------------- */
async function renderHome() {
  await loadEvents();
  const box = $('#eventCards');
  box.innerHTML = `<button class="card newcard" id="newEv">＋ New event</button>` + S.events.map(ev => `
    <div class="card" data-id="${ev.id}">
      <div class="thumb"><img alt=""></div>
      <div class="body"><div class="name">${esc(ev.name)}</div>
        <div class="muted" style="font-size:13px;margin-bottom:8px">${esc(designFor(ev).name)} · ${LAYOUTS[designFor(ev).layout].label}</div>
        <div class="actions">
          <button class="btn sm primary" data-a="start">Start ▶</button>
          <button class="btn sm" data-a="edit">Edit</button>
          <button class="btn sm ghost" data-a="del">Delete</button>
        </div></div></div>`).join('');
  $('#newEv').onclick = newEventDialog;
  await loadDrafts();
  const mb = $('#myDesigns');
  mb.innerHTML = `<button class="card newcard" id="newMine" style="min-height:240px">＋ Create my own design<br><span style="font-size:13px">upload your own frame, add text</span></button>` + S.mine.map(d => `
    <div class="card" data-id="${d.id}"><div class="thumb"><img alt=""></div>
      <div class="body"><div class="name">${esc(d.name)}</div><div class="muted" style="font-size:13px;margin-bottom:8px">${LAYOUTS[d.layout].label}</div>
        <div class="actions"><button class="btn sm primary" data-a="use">Use</button><button class="btn sm" data-a="edit">Edit</button>
          <button class="btn sm ghost" data-a="dup">Copy</button><button class="btn sm ghost" data-a="del">Delete</button></div></div></div>`).join('');
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
  for (const card of $$('.card[data-id]', box)) {
    const ev = S.events.find(e => e.id === card.dataset.id);
    thumbURL(compose(ev)).then(u => $('img', card).src = u);
    card.onclick = async e => {
      const a = e.target.dataset.a; if (!a) return;
      if (a === 'start') startBooth(compose(ev));
      if (a === 'edit') openEditor('event', ev);
      if (a === 'del' && confirm(`Delete "${ev.name}"? (Photos already taken stay in the Gallery.)`)) { await DB.del('events', ev.id); renderHome(); }
    };
  }
}
async function newEventDialog() {
  const designs = allDesigns();
  if (!designs.length) {
    const box = openModal(`<h2 style="margin-top:0">No designs yet</h2>
      <p class="muted">${S.creator ? 'Make your first design in Creator mode.' : 'No ready-made designs yet. Tap <b>Create my own design</b> on the home screen to upload your own frame.'}</p>
      <div class="row" style="justify-content:flex-end">${S.creator ? '<button class="btn primary" id="nC">Open Creator mode</button>' : ''}<button class="btn ghost" id="nX">Close</button></div>`);
    $('#nX', box).onclick = closeModal; if (S.creator) $('#nC', box).onclick = () => { closeModal(); go('creator'); };
    return;
  }
  let pick = designs[0].id;
  const box = openModal(`<h2 style="margin-top:0">New event</h2>
    <label>Event name</label><input id="nName" placeholder="e.g. Cruz Family Christmas Party">
    <label>Pick a design</label><div class="dpick" id="nPick">${designs.map(d => `
      <button data-d="${d.id}" class="${d.id === pick ? 'on' : ''}"><img alt=""><span style="font-size:13px">${esc(d.name)}${d._draft ? '<span class="badge">draft</span>' : ''}${d._mine ? '<span class="badge">mine</span>' : ''}</span>
      <span class="muted" style="font-size:11px">${LAYOUTS[d.layout].label}</span></button>`).join('')}</div>
    <div class="row" style="justify-content:flex-end;margin-top:18px">
      <button class="btn ghost" id="nCancel">Cancel</button><button class="btn primary" id="nGo">Create</button></div>`);
  for (const b of $$('#nPick button', box)) thumbURL(designs.find(d => d.id === b.dataset.d), 340).then(u => $('img', b).src = u);
  $('#nPick', box).onclick = e => { const b = e.target.closest('[data-d]'); if (!b) return; pick = b.dataset.d; $$('#nPick button').forEach(x => x.classList.toggle('on', x === b)); };
  $('#nCancel', box).onclick = closeModal;
  $('#nGo', box).onclick = async () => {
    const d = designs.find(x => x.id === pick), clean = clone(d); delete clean._draft; delete clean._pub; delete clean._mine;
    const ev = newEventFrom(clean, $('#nName', box).value.trim());
    await saveEvent(ev); closeModal(); openEditor('event', ev);
  };
}

/* ---------------- EDITOR (mode 'design' = creator only, mode 'event' = everyone) ---------------- */
let selSticker = -1, selText = -1, lastHits = [], renderQueued = false;
function edView() { return S.mode === 'design' ? S.ed : compose(S.ed); }
function openEditor(mode, obj) {
  if (mode === 'design' && !S.creator && !obj.mine) return;
  S.mode = mode; S.ed = clone(obj); if (mode === 'design' && !S.ed.texts) S.ed.texts = []; S.dirty = false; selSticker = -1; selText = -1;
  $('#edTitle').textContent = (mode === 'design' ? '🎨 ' : '') + obj.name;
  $('#edStart').textContent = mode === 'design' ? 'Test booth ▶' : 'Start booth ▶';
  buildPanel(); go('editor'); queueRender();
}
function queueRender() {
  if (renderQueued) return; renderQueued = true;
  requestAnimationFrame(async () => {
    renderQueued = false;
    const d = S.mode === 'design', o = { selected: d ? selSticker : -1, selText: d ? selText : -1, hits: [] };
    const c = await render(edView(), [], o); lastHits = o.hits;
    const pc = $('#previewCanvas'); pc.width = c.width; pc.height = c.height; pc.getContext('2d').drawImage(c, 0, 0);
  });
}
function set(k, v) {
  if (S.mode === 'event' && TEXT_KEYS.includes(k)) S.ed.text[k] = v; else S.ed[k] = v;
  S.dirty = true; queueRender();
}
function chips(key, map, cur) { return `<div class="chips" data-chips="${key}">${Object.entries(map).map(([k, l]) => `<button class="chip ${String(k) === String(cur) ? 'on' : ''}" data-v="${k}">${esc(l)}</button>`).join('')}</div>`; }
function rng_(key, min, max, step, val) { return `<input type="range" data-k="${key}" min="${min}" max="${max}" step="${step}" value="${val}">`; }

function textSection(v, note) {
  return `<div class="sec"><h3>Text</h3>${note || ''}
    <label>Title</label><input data-k="title" value="${esc(v.title)}" placeholder="Merry Christmas">
    <label>Second line</label><input data-k="subtitle" value="${esc(v.subtitle)}" placeholder="Cruz Family 2026">
    <div class="row" style="margin-top:10px"><input type="checkbox" data-k="showDate" ${v.showDate ? 'checked' : ''} style="width:24px"> <span>Show date line</span></div>
    <input data-k="dateText" value="${esc(v.dateText)}" style="margin-top:6px"></div>`;
}
function buildPanel() { $('#edPanel').innerHTML = S.mode === 'design' ? designPanel() : eventPanel(); syncStickerCtl(); syncTextCtl(); }
function syncTextCtl() {
  const box = $('#txCtl'); if (!box) return;
  const t = S.mode === 'design' && S.ed.texts[selText];
  if (!t) { box.innerHTML = S.ed.texts && S.ed.texts.length ? '<div class="hint">Tap a text box on the preview to edit it.</div>' : ''; return; }
  box.innerHTML = `<div style="background:var(--panel2);border-radius:12px;padding:4px 12px 12px;margin-top:10px">
    <label>Words (press return for a new line)</label><textarea id="txS" rows="2">${esc(t.s)}</textarea>
    <label>Font</label><select id="txFont">${Object.entries(FONTS).map(([k, f]) => `<option value="${k}" ${k === t.font ? 'selected' : ''}>${f.label}</option>`).join('')}</select>
    <div class="grid2"><div><label>Color</label><input type="color" id="txColor" value="${t.color}"></div>
      <div><label>Size</label><input type="range" id="txSize" min=".02" max=".3" step=".005" value="${t.size}"></div></div>
    <label>Rotate</label><input type="range" id="txRot" min="-180" max="180" step="1" value="${t.rot || 0}">
    <label>Align lines</label><div class="chips">${['left', 'center', 'right'].map(a => `<button class="chip ${(t.align || 'center') === a ? 'on' : ''}" data-al="${a}">${a[0].toUpperCase() + a.slice(1)}</button>`).join('')}</div>
    <label>Style</label>
    <div class="row"><input type="checkbox" id="txBold" ${t.bold !== false ? 'checked' : ''} style="width:24px"> <span>Bold</span>
      <input type="checkbox" id="txItalic" ${t.italic ? 'checked' : ''} style="width:24px;margin-left:14px"> <span>Italic</span></div>
    <label>Transparency</label><input type="range" id="txOp" min=".15" max="1" step=".05" value="${t.opacity ?? 1}">
    <label>Effects</label>
    <div class="row"><input type="checkbox" id="txShadow" ${t.shadow ? 'checked' : ''} style="width:24px"> <span>Shadow</span>
      <input type="checkbox" id="txOutline" ${t.outline ? 'checked' : ''} style="width:24px;margin-left:14px"> <span>Outline</span>
      <input type="checkbox" id="txGlow" ${t.glow ? 'checked' : ''} style="width:24px;margin-left:14px"> <span>Glow</span></div>
    ${t.outline ? `<div class="grid2"><div><label>Outline color</label><input type="color" id="txOC" value="${t.outlineColor || '#000000'}"></div>
      <div><label>Outline thickness</label><input type="range" id="txOW" min=".3" max="3" step=".1" value="${t.outlineW ?? 1}"></div></div>` : ''}
    ${t.glow ? `<div class="grid2"><div><label>Glow color</label><input type="color" id="txGC" value="${t.glowColor || '#ffffff'}"></div>
      <div><label>Glow size</label><input type="range" id="txGS" min=".3" max="2.5" step=".1" value="${t.glowSize ?? 1}"></div></div>` : ''}
    ${S.ed.mine ? '' : `<div class="row" style="margin-top:12px"><input type="checkbox" id="txEdit" ${t.editable ? 'checked' : ''} style="width:24px"> <span>Let people change these words</span></div>`}
    <div class="row" style="margin-top:12px"><button class="btn sm" id="txDup">Duplicate</button><button class="btn sm danger" id="txDel">Delete text box</button></div></div>`;
}

function eventPanel() {
  const ev = S.ed, d = designFor(ev), v = compose(ev);
  return `
  <div class="sec"><h3>Event</h3>
    <label>Event name (for your list)</label><input data-k="name" value="${esc(ev.name)}">
    <div class="hint">Design: <b>${esc(d.name)}</b> · ${LAYOUTS[d.layout].label} · ${shotsFor(d)} photo${shotsFor(d) > 1 ? 's' : ''}</div></div>
  ${d.allowText && d.textPos !== 'none' ? textSection(v, '<div class="hint">Change the words for your event. The rest of the design is set by the creator.</div>')
    : ((d.texts || []).some(t => t.editable) ? '' : '<div class="sec"><h3>Text</h3><div class="hint">The text on this design is set by the creator.</div></div>')}
  ${(d.texts || []).filter(t => t.editable).length ? `<div class="sec"><h3>Your words</h3><div class="hint">Change what these text boxes say. Position and style are set by the creator.</div>
    ${(d.texts || []).filter(t => t.editable).map((t, k) => `<label>Text ${k + 1}</label><textarea data-tx="${t.id}" rows="2">${esc(ev.textEdits && ev.textEdits[t.id] != null ? ev.textEdits[t.id] : t.s)}</textarea>`).join('')}</div>` : ''}
  <div class="sec"><h3>Booth</h3>
    <label>Countdown before each photo</label>${chips('countdown', { 3: '3 sec', 5: '5 sec', 10: '10 sec' }, ev.countdown)}
    <label>Go back to start screen after</label>${chips('autoReturn', { 20: '20 sec', 30: '30 sec', 60: '60 sec', 0: 'Never' }, ev.autoReturn)}
    <div class="row" style="margin-top:12px"><input type="checkbox" data-k="mirror" ${ev.mirror ? 'checked' : ''} style="width:24px"> <span>Mirror photos (like a selfie)</span></div>
    <div class="row" style="margin-top:8px"><input type="checkbox" data-k="sound" ${ev.sound ? 'checked' : ''} style="width:24px"> <span>Countdown beeps</span></div>
    <label>Start screen button text</label><input data-k="attractMsg" value="${esc(ev.attractMsg)}"></div>`;
}
function designPanel() {
  const ev = S.ed, L = LAYOUTS[ev.layout], g = geom(ev);
  return `
  <div class="sec"><h3>Design</h3>
    <label>Design name</label><input data-k="name" value="${esc(ev.name)}">
    ${ev.mine ? '<div class="hint">This is your own design. It stays on this iPad.</div>' : `
    <div class="row" style="margin-top:12px"><input type="checkbox" data-k="allowText" ${ev.allowText ? 'checked' : ''} style="width:24px">
      <span>Let people change the title-area lines (title, second line, date)</span></div>
    <div class="hint">Everything else in this design is locked for everyone but you.</div>`}</div>

  <div class="sec"><h3>Layout</h3>
    ${chips('layout', Object.fromEntries(Object.entries(LAYOUTS).map(([k, l]) => [k, l.label])), ev.layout)}
    <div class="hint">${L.label}: ${shotsFor(ev)} photo${shotsFor(ev) > 1 ? 's' : ''}, prints at ${L.size} (${L.double ? L.W * 2 : L.W}×${L.H} px).</div></div>

  <div class="sec"><h3>Frame image (Canva or any photo)</h3>
    <div class="hint" style="font-size:13px">Have a frame image already? Just tap <b>Upload background</b>.<br>To make one: 1) Tap <b>Get Canva guide</b> and save the image. 2) In Canva, make a design with
      custom size <b>${g.W} × ${g.H} px</b>, put the guide in as a background, and design around the grey photo boxes.
      3) Delete the guide, download as PNG, and upload it below as the <b>background</b>.
      Use <b>Overlay</b> only for a PNG with a transparent background that should sit on top of the photos.</div>
    <div class="row" style="margin-top:10px">
      <button class="btn sm gold" id="edGuide">Get Canva guide</button>
      <button class="btn sm" id="edBgUp">${ev.bgImage ? 'Replace' : 'Upload'} background</button>
      ${ev.bgImage ? '<button class="btn sm danger" id="edBgDel">Remove</button>' : ''}
    </div>
    <div class="row" style="margin-top:8px">
      <button class="btn sm" id="edOvUp">${ev.overlayImage ? 'Replace' : 'Upload'} overlay</button>
      ${ev.overlayImage ? '<button class="btn sm danger" id="edOvDel">Remove</button>' : ''}
    </div>
    <div class="hint">If your Canva design already has all the words on it, set Text position to “No text”.</div>
    <input type="file" id="edFile" accept="image/*" hidden></div>

  <div class="sec"><h3>Or build it here: background</h3>
    ${chips('bgStyle', { solid: 'Solid', gradient: 'Gradient' }, ev.bgStyle)}
    <div class="grid2"><div><label>Color 1</label><input type="color" data-k="c1" value="${ev.c1}"></div>
      <div><label>Color 2 (gradient)</label><input type="color" data-k="c2" value="${ev.c2}"></div></div>
    <label>Pattern</label>${chips('pattern', PATTERNS, ev.pattern)}
    <div class="grid2"><div><label>Pattern color</label><input type="color" data-k="pColor" value="${ev.pColor}"></div>
      <div><label>Pattern strength</label>${rng_('pAmt', 0.05, 1, 0.05, ev.pAmt)}</div></div></div>

  <div class="sec"><h3>Title area (optional)</h3>
    <div class="hint">A fixed strip for the title lines. For text anywhere, use <b>Text boxes</b> below — set this to “No text” if you only want those.</div>
    <label>Position</label>${chips('textPos', { bottom: 'Bottom', top: 'Top', none: 'No text' }, ev.textPos)}
    <label>Title font</label><select data-k="font">${Object.entries(FONTS).map(([k, f]) => `<option value="${k}" ${k === ev.font ? 'selected' : ''}>${f.label}</option>`).join('')}</select>
    <div class="grid2"><div><label>Text color</label><input type="color" data-k="textColor" value="${ev.textColor}"></div>
      <div><label>Title size</label>${rng_('titleScale', .5, 1.8, .05, ev.titleScale)}</div></div>
    <label>Text area height</label>${rng_('textSize', .5, 2, .05, ev.textSize)}</div>
  ${ev.textPos !== 'none' ? textSection(ev, '<div class="hint">Default words for the title area. People can change these only if you allowed it above.</div>') : ''}

  <div class="sec" id="txSec"><h3>Text boxes (place anywhere)</h3>
    <button class="btn sm gold" id="txAdd">＋ Add text box</button>
    <div class="hint">Drag a text box on the preview to move it. Tap one to select and style it.</div>
    <div id="txCtl"></div></div>

  <div class="sec"><h3>Photos</h3>
    <label>Look</label>${chips('filter', FILTERS, ev.filter)}
    <div class="grid2">
      <div><label>Outer margin</label>${rng_('padding', 0, 80, 1, ev.padding)}</div>
      <div><label>Space between</label>${rng_('gap', 0, 60, 1, ev.gap)}</div>
      <div><label>Rounded corners</label>${rng_('radius', 0, 60, 1, ev.radius)}</div>
      <div><label>Border width</label>${rng_('borderW', 0, 20, 1, ev.borderW)}</div></div>
    <label>Border color</label><input type="color" data-k="borderColor" value="${ev.borderColor}"></div>

  <div class="sec"><h3>Stickers</h3>
    <div class="stickers" id="edStk">${STICKERS.map(s => `<button data-s="${s}">${s}</button>`).join('')}</div>
    <div class="hint">Tap to add, then drag it on the preview. Tap a sticker on the preview to select it.</div>
    <div id="stkCtl" style="display:none">
      <div class="grid2"><div><label>Size</label><input type="range" id="stkSize" min=".03" max=".6" step=".01"></div>
        <div><label>Rotate</label><input type="range" id="stkRot" min="-180" max="180" step="1"></div></div>
      <button class="btn sm danger" id="stkDel" style="margin-top:8px">Remove sticker</button></div></div>`;
}
// generic bindings (delegated)
$('#edPanel').addEventListener('input', e => {
  const k = e.target.dataset.k; if (!k) return;
  let v = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
  if (e.target.type === 'range') v = +v;
  set(k, v);
  if (k === 'name') $('#edTitle').textContent = (S.mode === 'design' ? '🎨 ' : '') + v;
});
$('#edPanel').addEventListener('click', async e => {
  const chip = e.target.closest('[data-chips] .chip');
  if (chip) {
    const key = chip.parentElement.dataset.chips; let v = chip.dataset.v;
    if (key === 'countdown' || key === 'autoReturn') v = +v;
    set(key, v);
    if (key === 'layout') { buildPanel(); return; }
    $$('.chip', chip.parentElement).forEach(c => c.classList.toggle('on', c === chip));
    return;
  }
  if (S.mode !== 'design') return;
  const st = e.target.closest('#edStk [data-s]');
  if (st) { S.ed.stickers.push({ e: st.dataset.s, x: .5, y: .5, size: .18, rot: 0 }); selSticker = S.ed.stickers.length - 1; S.dirty = true; syncStickerCtl(); queueRender(); return; }
  const id = e.target.id;
  if (id === 'edGuide') downloadGuide();
  if (id === 'edBgUp') pickImage('bgImage');
  if (id === 'edOvUp') pickImage('overlayImage');
  if (id === 'edBgDel') { set('bgImage', null); buildPanel(); }
  if (id === 'edOvDel') { set('overlayImage', null); buildPanel(); }
  if (id === 'stkDel' && selSticker >= 0) { S.ed.stickers.splice(selSticker, 1); selSticker = -1; S.dirty = true; syncStickerCtl(); queueRender(); }
});
function syncStickerCtl() {
  const box = $('#stkCtl'); if (!box) return;
  const st = S.mode === 'design' && S.ed.stickers[selSticker];
  box.style.display = st ? 'block' : 'none';
  if (st) { $('#stkSize').value = st.size; $('#stkRot').value = st.rot || 0; }
}
$('#edPanel').addEventListener('input', e => {
  if (S.mode !== 'design') return;
  const st = S.ed.stickers[selSticker]; if (!st) return;
  if (e.target.id === 'stkSize') { st.size = +e.target.value; S.dirty = true; queueRender(); }
  if (e.target.id === 'stkRot') { st.rot = +e.target.value; S.dirty = true; queueRender(); }
});
// text box controls (design mode)
$('#edPanel').addEventListener('input', e => {
  const id = e.target.id, tx = e.target.dataset.tx;
  if (tx && S.mode === 'event') { S.ed.textEdits = S.ed.textEdits || {}; S.ed.textEdits[tx] = e.target.value; S.dirty = true; queueRender(); return; }
  if (S.mode !== 'design' || !id.startsWith('tx')) return;
  const t = S.ed.texts[selText]; if (!t) return;
  const v = e.target.value, chk = e.target.checked;
  if (id === 'txS') t.s = v; if (id === 'txFont') t.font = v; if (id === 'txColor') t.color = v;
  if (id === 'txSize') t.size = +v; if (id === 'txRot') t.rot = +v; if (id === 'txOC') t.outlineColor = v;
  if (id === 'txBold') t.bold = chk; if (id === 'txShadow') t.shadow = chk; if (id === 'txEdit') t.editable = chk;
  if (id === 'txItalic') t.italic = chk; if (id === 'txOp') t.opacity = +v; if (id === 'txOW') t.outlineW = +v;
  if (id === 'txGC') t.glowColor = v; if (id === 'txGS') t.glowSize = +v;
  if (id === 'txOutline') { t.outline = chk; syncTextCtl(); }
  if (id === 'txGlow') { t.glow = chk; syncTextCtl(); }
  S.dirty = true; queueRender();
});
$('#edPanel').addEventListener('click', e => {
  if (S.mode !== 'design') return;
  const id = e.target.id, al = e.target.dataset.al;
  if (id === 'txAdd') {
    S.ed.texts.push({ id: 't-' + uid(), s: 'Your text', x: .5, y: .5, size: .08, font: 'script', color: S.ed.textColor || '#222222', rot: 0, align: 'center', bold: true, outline: false, outlineColor: '#000000', shadow: false, editable: false });
    selText = S.ed.texts.length - 1; selSticker = -1;
  } else if (id === 'txDup' && S.ed.texts[selText]) {
    const c = clone(S.ed.texts[selText]); c.id = 't-' + uid(); c.y = Math.min(.97, c.y + .05); S.ed.texts.push(c); selText = S.ed.texts.length - 1;
  } else if (id === 'txDel' && S.ed.texts[selText]) { S.ed.texts.splice(selText, 1); selText = -1; }
  else if (al && S.ed.texts[selText]) S.ed.texts[selText].align = al;
  else return;
  S.dirty = true; syncTextCtl(); syncStickerCtl(); queueRender();
  if (id === 'txAdd') $('#txS')?.select();
});
let pickKey = 'bgImage';
function pickImage(key) { pickKey = key; $('#edFile').click(); }
$('#edPanel').addEventListener('change', async e => {
  if (e.target.id !== 'edFile' || S.mode !== 'design') return;
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  // backgrounds become JPEG (smaller library file); overlays keep transparency as PNG
  const url = await shrinkImage(f, 2400, pickKey === 'bgImage' ? 'image/jpeg' : 'image/png');
  set(pickKey, url); buildPanel();
  const g = geom(S.ed), img = await loadImg(url);
  if (img && pickKey === 'bgImage' && Math.abs(img.naturalWidth / img.naturalHeight - g.W / g.H) > .03)
    toast(`Heads up: your image's shape doesn't match ${g.W}×${g.H}. It will be cropped to fit.`, 4500);
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
    ctx.fillStyle = '#9a96a3'; ctx.font = `600 ${g.u * 24}px sans-serif`; ctx.fillText('text area (optional)', g.W / 2, g.text.y + g.text.h / 2); }
  const blob = await toBlob(c, .95);
  shareOrDownload([new File([blob], `canva-guide-${S.ed.layout}-${g.W}x${g.H}.jpg`, { type: 'image/jpeg' })]);
}
// sticker drag on preview (design mode only)
(() => {
  const pc = $('#previewCanvas'); let drag = null;
  const pos = e => { const r = pc.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }; };
  pc.addEventListener('pointerdown', e => {
    if (S.mode !== 'design' || !S.ed) return;
    const ev = S.ed; let p = pos(e); const L = LAYOUTS[ev.layout];
    if (L.double) p.x = (p.x * 2) % 1;
    const g = geom(ev); let hit = -1;
    for (let k = lastHits.length - 1; k >= 0; k--) {
      const h = lastHits[k];
      if (Math.abs(p.x - h.x) < h.w / 2 && Math.abs(p.y - h.y) < h.h / 2) {
        const was = selText; selText = h.i; selSticker = -1; syncStickerCtl(); syncTextCtl(); queueRender();
        if (was !== h.i) $('#txSec')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        const t = ev.texts[h.i]; drag = { obj: t, dx: p.x - t.x, dy: p.y - t.y, dbl: L.double }; pc.setPointerCapture(e.pointerId); return;
      }
    }
    selText = -1; syncTextCtl();
    for (let i = ev.stickers.length - 1; i >= 0; i--) {
      const s = ev.stickers[i], half = s.size * Math.min(g.W, g.H) * .6;
      if (Math.abs((p.x - s.x) * g.W) < half && Math.abs((p.y - s.y) * g.H) < half) { hit = i; break; }
    }
    selSticker = hit; syncStickerCtl(); queueRender();
    if (hit >= 0) { drag = { obj: ev.stickers[hit], dx: p.x - ev.stickers[hit].x, dy: p.y - ev.stickers[hit].y, dbl: L.double }; pc.setPointerCapture(e.pointerId); }
  });
  pc.addEventListener('pointermove', e => {
    if (!drag) return; let p = pos(e); if (drag.dbl) p.x = (p.x * 2) % 1;
    const s = drag.obj; s.x = Math.max(0, Math.min(1, p.x - drag.dx)); s.y = Math.max(0, Math.min(1, p.y - drag.dy));
    S.dirty = true; queueRender();
  });
  const end = () => drag = null; pc.addEventListener('pointerup', end); pc.addEventListener('pointercancel', end);
})();
async function saveEd() {
  if (S.mode === 'design') { S.ed.updated = Date.now(); await DB.put('designs', clone(S.ed)); await loadDrafts(); }
  else await saveEvent(S.ed);
  S.dirty = false;
}
$('#edSave').onclick = async () => { await saveEd(); toast(S.mode === 'design' && !S.ed.mine ? 'Draft saved ✓ (publish to share it)' : 'Saved ✓'); };
$('#edBack').onclick = async () => {
  if (S.dirty && confirm('Save your changes?')) await saveEd();
  go(S.mode === 'design' && !S.ed.mine ? 'creator' : 'home');
};
$('#edStart').onclick = async () => {
  await saveEd();
  if (S.mode === 'design') { const t = newEventFrom(S.ed, 'Test: ' + S.ed.name); B.returnTo = S.ed.mine ? 'home' : 'creator'; startBooth(compose(Object.assign(t, { id: 'test' }))); }
  else startBooth(compose(S.ed));
};

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
  $('#cStatus').innerHTML = `Published right now: <b>${pub}</b> design${pub === 1 ? '' : 's'}${S.library.updated ? ' (last published ' + new Date(S.library.updated).toLocaleString() + ')' : ''} · Drafts on this iPad: <b>${S.drafts.length}</b>`;
  const box = $('#designCards');
  box.innerHTML = `<button class="card newcard" id="newDesign">＋ New design</button>` + S.drafts.map(d => `
    <div class="card" data-id="${d.id}"><div class="thumb"><img alt=""></div>
      <div class="body"><div class="name">${esc(d.name)}${S.library.designs.some(x => x.id === d.id) ? '' : '<span class="badge">not published</span>'}</div>
        <div class="muted" style="font-size:13px;margin-bottom:8px">${LAYOUTS[d.layout].label}${d.allowText ? ' · text editable' : ' · fully locked'}</div>
        <div class="actions"><button class="btn sm primary" data-a="edit">Edit</button><button class="btn sm ghost" data-a="dup">Copy</button><button class="btn sm ghost" data-a="del">Delete</button></div>
      </div></div>`).join('');
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
function newDesignDialog(mine = false) {
  let layout = 'strip4';
  const box = openModal(`<h2 style="margin-top:0">New design</h2>
    <label>Design name</label><input id="dName" placeholder="e.g. Red Christmas Strip">
    <label>Layout</label><div class="chips" id="dLay">${Object.entries(LAYOUTS).map(([k, l]) => `<button class="chip ${k === layout ? 'on' : ''}" data-k="${k}">${l.label}</button>`).join('')}</div>
    <div class="row" style="justify-content:flex-end;margin-top:18px"><button class="btn ghost" id="dX">Cancel</button><button class="btn primary" id="dGo">Create</button></div>`);
  $('#dLay', box).onclick = e => { const k = e.target.dataset.k; if (!k) return; layout = k; $$('#dLay .chip').forEach(c => c.classList.toggle('on', c.dataset.k === k)); };
  $('#dX', box).onclick = closeModal;
  $('#dGo', box).onclick = async () => {
    const d = newDesign(layout, mine); d.name = $('#dName', box).value.trim() || (mine ? 'My design' : 'New design');
    await DB.put('designs', d); closeModal(); openEditor('design', d);
  };
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
    for (const d of lib.designs) await DB.put('designs', d);
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
  const tc = ev.bgImage ? '#fff' : ev.textColor;
  a.innerHTML = `<img class="sample" alt="">
    ${ev.title ? `<div class="ttl" style="color:${tc};font-family:${FONTS[ev.font].css}">${esc(ev.title)}</div>` : ''}
    ${ev.subtitle ? `<div class="sub" style="color:${tc}">${esc(ev.subtitle)}</div>` : ''}
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
  $('#galGrid').innerHTML = items.map(p => { const u = URL.createObjectURL(p.blob); galURLs.push(u); return `<div class="it" data-id="${p.id}"><img src="${u}" loading="lazy">${p.publicId ? `<span class="dot">${p.uploaded ? '☁️ ✓' : '⏳'}</span>` : ''}</div>`; }).join('')
    || '<div class="muted">No photos yet. Start a booth from the home screen.</div>';
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
