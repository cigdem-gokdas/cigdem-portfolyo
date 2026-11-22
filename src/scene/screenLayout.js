import { VURGU } from './screens.js';

// Büyük ekranın içerik yerleşimi (canvas piksel uzayında). Sıra: vurgu çizgisi, bölüm adı, başlık, meta, özet, madde işaretleri
// (en çok 3), "Kullanılan teknolojiler" + çipler (item.tech yoksa yok), "Projeyi aç" düğmesi (url varsa).
// Beceriler: başlık + grup başlığı/çipler. Uzun içerikte punto küçülür (canvas ölçümüyle), satırlar kaydırılır; taşma olmaz.
// Çıktı: katmanlar (head, body, tech, btn) için çizim işlemleri + düğme dikdörtgeni (canvas px).
export const CW = 1600, CH = 1000;
export const LABEL_OPEN = 'Projeyi aç';
export const LABEL_TECH = 'Kullanılan teknolojiler';
const M = 100, WIDTH = CW - 2 * M, BOTTOM = CH - 84;
const FONT = (w, px) => `${w} ${px}px Inter, system-ui, sans-serif`;

function wrapLines(g, text, maxW, maxLines) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = []; let line = '';
  for (const w of words) {
    const t = line ? line + ' ' + w : w;
    if (g.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t;
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    let l = lines[maxLines - 1];
    while (l.length > 1 && g.measureText(l + '…').width > maxW) l = l.replace(/\s*\S*$/, '') || l.slice(0, -1);
    lines[maxLines - 1] = l + '…';
  }
  return lines;
}

// Çipler: satır sonunda kaydırır; her çip {x,y,w,h,text}. Dönüş: bitiş y.
function chipFlow(g, texts, y, s, size, ops, layer) {
  const fs = Math.round(size * s), h = Math.round((size + 26) * s), px = Math.round(22 * s), gap = Math.round(14 * s);
  g.font = FONT(500, fs);
  let x = M;
  for (const t of texts) {
    const w = Math.ceil(g.measureText(t).width) + px * 2;
    if (x + w > M + WIDTH && x > M) { x = M; y += h + gap; }
    const cx = x, cy = y;
    ops.push({ layer, fn: (c) => {
      c.font = FONT(500, fs);
      c.fillStyle = 'rgba(124,243,255,0.07)'; c.fillRect(cx, cy, w, h);
      c.strokeStyle = 'rgba(232,237,245,0.34)'; c.lineWidth = 2; c.strokeRect(cx + 1, cy + 1, w - 2, h - 2);
      c.fillStyle = '#e8edf5'; c.textBaseline = 'middle'; c.fillText(t, cx + px, cy + h / 2 + 1); c.textBaseline = 'alphabetic';
    } });
    x += w + gap;
  }
  return y + h;
}

function build(g, item, section, hasUrl, s) {
  const ops = []; let y = 96;
  const isSkills = !!(section && section.type === 'skills' && item === section);
  ops.push({ layer: 'head', fn: (c) => { c.fillStyle = VURGU; c.fillRect(M, 96, 140, 8); } });
  y += 8;
  if (section && section.title && !isSkills) {
    const fs = Math.round(30 * s); y += Math.round(48 * s);
    const yy = y, txt = section.title.toLocaleUpperCase('tr');
    ops.push({ layer: 'head', fn: (c) => { c.font = FONT(500, fs); c.fillStyle = '#8a94a6'; c.fillText(txt, M, yy); } });
  }
  // başlık
  {
    const fs = Math.round(84 * s), lh = Math.round(fs * 1.13);
    g.font = FONT(600, fs);
    const lines = wrapLines(g, item.title || item.name || (section && section.title) || '', WIDTH, 2);
    y += Math.round(18 * s) + fs;
    lines.forEach((l, i) => { const yy = y + i * lh; ops.push({ layer: 'head', fn: (c) => { c.font = FONT(600, fs); c.fillStyle = '#f7f9fc'; c.fillText(l, M, yy); } }); });
    y += (lines.length - 1) * lh;
  }
  if (item.meta) {
    const fs = Math.round(34 * s), lh = Math.round(fs * 1.35);
    g.font = FONT(400, fs);
    const lines = wrapLines(g, item.meta, WIDTH, 2);
    y += Math.round(26 * s) + fs;
    lines.forEach((l, i) => { const yy = y + i * lh; ops.push({ layer: 'head', fn: (c) => { c.font = FONT(400, fs); c.fillStyle = '#8a94a6'; c.fillText(l, M, yy); } }); });
    y += (lines.length - 1) * lh;
  }
  if (item.summary) {
    const fs = Math.round(42 * s), lh = Math.round(fs * 1.42);
    g.font = FONT(400, fs);
    const lines = wrapLines(g, item.summary, WIDTH, 4);
    y += Math.round(38 * s) + fs;
    lines.forEach((l, i) => { const yy = y + i * lh; ops.push({ layer: 'body', fn: (c) => { c.font = FONT(400, fs); c.fillStyle = '#c3cada'; c.fillText(l, M, yy); } }); });
    y += (lines.length - 1) * lh;
  }
  const bullets = (item.bullets || []).slice(0, 3);
  if (bullets.length) {
    const fs = Math.round(36 * s), lh = Math.round(fs * 1.36), indent = Math.round(44 * s);
    g.font = FONT(400, fs);
    y += Math.round(22 * s);
    for (const b of bullets) {
      const lines = wrapLines(g, b, WIDTH - indent, 2);
      y += Math.round(14 * s) + fs;
      const y0 = y;
      ops.push({ layer: 'body', fn: (c) => { c.fillStyle = VURGU; c.fillRect(M, y0 - Math.round(fs * 0.36), Math.round(22 * s), 4); } });
      lines.forEach((l, i) => { const yy = y0 + i * lh; ops.push({ layer: 'body', fn: (c) => { c.font = FONT(400, fs); c.fillStyle = '#dbe1ec'; c.fillText(l, M + indent, yy); } }); });
      y += (lines.length - 1) * lh;
    }
  }
  const small = (txt, yy, sz) => ops.push({ layer: 'tech', fn: (c) => { c.font = FONT(500, Math.round(sz * s)); c.fillStyle = '#8a94a6'; c.fillText(txt, M, yy); } });
  if (isSkills) {
    for (const grp of section.groups || []) {
      y += Math.round(30 * s) + Math.round(26 * s);
      small(String(grp.name).toLocaleUpperCase('tr'), y, 26);
      y = chipFlow(g, (grp.items || []).map((x) => (typeof x === 'string' ? x : x.name)), y + Math.round(14 * s), s, 28, ops, 'tech');
    }
  } else if (item.tech && item.tech.length) {
    y += Math.round(40 * s) + Math.round(28 * s);
    small(LABEL_TECH, y, 28);
    y = chipFlow(g, item.tech, y + Math.round(16 * s), s, 32, ops, 'tech');
  }
  let button = null;
  if (hasUrl) {
    const fs = Math.round(44 * s), h = Math.round(96 * s);
    g.font = FONT(600, fs);
    const w = Math.ceil(g.measureText(LABEL_OPEN).width) + Math.round(96 * s);
    y += Math.round(46 * s);
    button = { x: M, y, w, h };
    ops.push({ layer: 'btn', fn: (c) => {
      c.fillStyle = VURGU; c.fillRect(M, button.y, w, h);
      c.fillStyle = '#07090f'; c.font = FONT(600, fs); c.textBaseline = 'middle'; c.fillText(LABEL_OPEN, M + Math.round(48 * s), button.y + h / 2 + 2); c.textBaseline = 'alphabetic';
    } });
    y += h;
  }
  return { ops, button, bottom: y };
}

export function layoutScreen(item, section, hasUrl) {
  const g = document.createElement('canvas').getContext('2d');
  let res = null;
  for (let s = 1; s >= 0.5; s -= 0.04) {
    res = build(g, item, section, hasUrl, s);
    if (res.bottom <= BOTTOM) { res.scale = s; return res; }
  }
  res.scale = 0.5;
  return res;
}

// Bir katmanın dokusunu çizer (canvas döndürür); boş katman için null
export function drawLayer(layout, layer) {
  const mine = layout.ops.filter((o) => o.layer === layer);
  if (!mine.length) return null;
  const c = document.createElement('canvas'); c.width = CW; c.height = CH;
  const g = c.getContext('2d'); g.textBaseline = 'alphabetic';
  for (const o of mine) o.fn(g);
  return c;
}
