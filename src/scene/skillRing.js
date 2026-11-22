import * as THREE from 'three';
import { getSection } from '../content.js';
import { VURGU, makeEntry, bindPick } from './screens.js';

const TINT = new THREE.Color(VURGU), WHITE = new THREE.Color(0xffffff);
const OP_BASE = 0.45, OP_HOVER = 1.0;

// Beceri "takımyıldızı": avatarın ve ekran yayının ÜSTÜNDE, arkada, havada süzülen seyrek etiketler. Halka yok.
// Beş küme (grup başına bir tane); her kümenin başlığı biraz daha belirgin. Yükseklik 3.0–4.4 m, yay yarıçapı 3.5–5.5 m,
// ekran yayıyla aynı yönde (-Z tarafı). Hareket: çok yavaş yukarı-aşağı ve yatay kayma (dönme yok). Opaklık 0.45, hover 1.0.
// Yerleşim: kümeler yay boyunca sıralanır, her kümede etiketler satırlara dizilir (gerçek ölçülerle, aralıklı) -> çakışma yok.
// Tıklanınca (tek entry, kind 'skill') beceriler büyük ekranı açılır.
const LABEL_H = 0.17, TITLE_H = 0.27;
const ROW_Y = [4.14, 3.86, 3.58, 3.3];    // etiket satırları
const TITLE_Y = 4.4;
const GAP = 0.2;                          // etiketler arası yatay boşluk (m)
const ARC_HALF = 62 * Math.PI / 180;      // toplam yay yarım açısı
const RADII = [4.5, 5.0, 4.7, 5.0, 4.5];  // küme yarıçapları (3.5–5.5)

function textSprite(text, { weight = 500, color = '#e4e8f0', h = LABEL_H } = {}) {
  const fs = 52, ch = 84, pad = 36;
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  g.font = `${weight} ${fs}px Inter, system-ui, sans-serif`;
  const tw = Math.ceil(g.measureText(text).width);
  c.width = tw + pad * 2; c.height = ch;
  g.font = `${weight} ${fs}px Inter, system-ui, sans-serif`;
  g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, c.width / 2, ch / 2 + 2);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: OP_BASE, depthWrite: false }));
  s.scale.set(h * c.width / ch, h, 1);
  s.userData.sc = s.scale.clone();
  s.userData.w = s.scale.x * (tw / c.width);   // metnin gerçek genişliği (m)
  return s;
}

export function createSkillRing() {
  const ring = new THREE.Group();
  const section = getSection('beceriler');
  const entry = makeEntry({ kind: 'skill', id: section.id, item: section, section, group: ring, mats: [] });
  const labels = [];

  const n = section.groups.length;
  // Küme merkez açıları: yay boyunca eşit aralık
  const span = 2 * ARC_HALF * 0.86;
  const angles = section.groups.map((_, i) => (n === 1 ? 0 : -span / 2 + (span * i) / (n - 1)));
  section.groups.forEach((grp, gi) => {
    const r = RADII[gi % RADII.length];
    const allot = Math.min(2.5, (n > 1 ? span * r / (n - 1) : 3) - 0.3);     // kümenin satır genişliği (m)
    const sprites = grp.items.map((it) => textSprite(typeof it === 'string' ? it : it.name));
    // Satırlara dizilim (açgözlü); satır sayısı ROW_Y'yi aşarsa genişlik artırılır
    let W = allot, rows;
    for (let tries = 0; tries < 10; tries++) {
      rows = [[]]; let cur = 0;
      for (const s of sprites) {
        const last = rows[rows.length - 1];
        const need = s.userData.w + (last.length ? GAP : 0);
        if (cur + need > W && last.length) { rows.push([s]); cur = s.userData.w; } else { last.push(s); cur += need; }
      }
      if (rows.length <= ROW_Y.length) break;
      W += 0.25;
    }
    rows.forEach((row, ri) => {
      const total = row.reduce((a, s) => a + s.userData.w, 0) + GAP * (row.length - 1);
      let u = -total / 2 + (ri % 2 ? 0.12 : -0.12);                       // satırlar hafif kaydırılmış
      row.forEach((s, k) => {
        const uc = u + s.userData.w / 2; u += s.userData.w + GAP;
        const a = angles[gi] + uc / r;
        s.userData.base = { a, r, y: ROW_Y[ri] };
        s.userData.ph = [gi * 1.7 + ri * 0.9 + k * 0.6, gi * 2.3 + ri * 1.3 + k * 0.8];
        s.userData.title = false;
        ring.add(s); labels.push(s);
      });
    });
    const title = textSprite(grp.name, { weight: 700, color: VURGU, h: TITLE_H });
    title.material.opacity = 0.8;
    title.userData.base = { a: angles[gi], r, y: TITLE_Y };
    title.userData.ph = [gi * 1.1, gi * 0.7];
    title.userData.title = true;
    ring.add(title); labels.push(title);
  });
  bindPick(entry, ...labels);

  let vis = 1, visT = 1;
  ring.userData.entry = entry;
  ring.userData.setExploded = () => {};   // eski halka API'si (artık yok): büyük ekran reveal.js'te
  ring.userData.setHidden = (v) => { visT = v ? 0 : 1; };  // büyük ekran açıkken solar / geri gelir
  ring.userData.visibility = () => vis;
  // Büyük ekranın doğuş noktası: takımyıldızın orta-üstü (dünya)
  ring.userData.center = new THREE.Vector3(0, 3.7, -4.6);
  ring.userData.update = (dt, camera, t = 0) => {
    vis += Math.sign(visT - vis) * Math.min(Math.abs(visT - vis), dt / 0.25);
    ring.visible = vis > 0.003;
    if (!ring.visible) return;
    const hov = entry.hover;
    for (const s of labels) {
      const b = s.userData.base, ph = s.userData.ph;
      const a = b.a + (0.06 * Math.sin(t * 0.21 + ph[0])) / b.r;            // yatay kayma ~7 cm
      const y = b.y + 0.035 * Math.sin(t * 0.17 + ph[1]);                   // yukarı-aşağı ~3.5 cm
      s.position.set(Math.sin(a) * b.r, y, -Math.cos(a) * b.r);
      const base = s.userData.title ? 0.8 : OP_BASE;
      s.material.opacity = (base + (OP_HOVER - base) * hov) * vis;
      if (s.userData.title) s.material.color.copy(WHITE); else s.material.color.copy(WHITE).lerp(TINT, hov * 0.5);
      s.scale.copy(s.userData.sc).multiplyScalar(1 + hov * 0.06);
    }
  };
  ring.userData.labels = labels;
  return ring;
}
