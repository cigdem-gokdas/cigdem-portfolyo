import * as THREE from 'three';

export const VURGU = '#7cf3ff';

// Metni verilen genişliğe sarar; maxLines aşılırsa "…" ile keser. Sonraki y'yi döndürür.
export function wrap(g, text, x, y, maxW, lh, maxLines) {
  const words = (text || '').split(' ');
  const lines = []; let line = '';
  for (const w of words) {
    const t = line ? line + ' ' + w : w;
    if (g.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t;
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) { lines.length = maxLines; lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, '') + '…'; }
  lines.forEach((l) => { g.fillText(l, x, y); y += lh; });
  return y;
}

const texCache = new Map();
// Ekran yüzü: koyu zemin, açık yazı, tek vurgu rengi (paylaşılan doku: orijinal ve klon aynı dokuyu kullanır)
export function faceTexture(item, index) {
  if (texCache.has(item.id)) return texCache.get(item.id);
  const W = 2048, H = 1280; // ekran oranı 1.6
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#121826'; g.fillRect(0, 0, W, H);
  g.fillStyle = VURGU; g.fillRect(112, 120, 128, 8);
  g.font = '600 52px Inter, system-ui, sans-serif';
  g.fillText(String(index + 1).padStart(2, '0'), 112, 220);
  g.fillStyle = '#f7f9fc'; g.font = '600 152px Inter, system-ui, sans-serif';
  const y = wrap(g, item.title, 112, 440, 1824, 172, 3);
  g.fillStyle = '#b4bccc'; g.font = '400 68px Inter, system-ui, sans-serif';
  wrap(g, item.meta || '', 112, y + 40, 1824, 88, 3);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  texCache.set(item.id, tex);
  return tex;
}

// Boş ekran yüzü (yalnızca zemin): açılış efektindeki klon bunu kullanır; içerik katmanlardan gelir
let blankTex = null;
export function blankFaceTexture() {
  if (blankTex) return blankTex;
  const c = document.createElement('canvas'); c.width = 64; c.height = 40;
  const g = c.getContext('2d'); g.fillStyle = '#121826'; g.fillRect(0, 0, 64, 40);
  blankTex = new THREE.CanvasTexture(c); blankTex.colorSpace = THREE.SRGBColorSpace;
  return blankTex;
}

const geoCache = new Map();
const boxGeo = (w, h, d) => { const k = `b${w}_${h}_${d}`; if (!geoCache.has(k)) geoCache.set(k, new THREE.BoxGeometry(w, h, d)); return geoCache.get(k); };
export const planeGeo = (w, h) => { const k = `p${w}_${h}`; if (!geoCache.has(k)) geoCache.set(k, new THREE.PlaneGeometry(w, h)); return geoCache.get(k); };

export const SW = 1.05, SH = 0.656; // ekran yüzü ölçüsü (yerel birim)

// Çerçeveli ekran: geometriler paylaşılır, malzemeler nesneye özel (vurgu/kararma için)
export function createScreen(item, index, { blank = false } = {}) {
  const group = new THREE.Group();
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x0a1218, emissive: VURGU, emissiveIntensity: 0.7, roughness: 0.5 });
  const frame = new THREE.Mesh(boxGeo(SW + 0.05, SH + 0.05, 0.03), frameMat);
  const mat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: blank ? blankFaceTexture() : faceTexture(item, index), emissiveIntensity: 1.15 });
  const screen = new THREE.Mesh(planeGeo(SW, SH), mat);
  screen.position.z = 0.02;
  group.add(frame, screen);
  return { group, frame, screen, frameMat, mat };
}

// Tıklanabilir giriş (entry): vurgu (hover) ve kararma (dim) durumları tek yerde.
// mats: [{ mat, base, hov }] -> emissiveIntensity = (base + hov * hover) * dim
export function makeEntry(props) {
  return Object.assign({ hover: 0, dim: 1, dimT: 1, mats: [], standPoint: null, dir: null }, props);
}

export function bindPick(entry, ...meshes) {
  entry.meshes = (entry.meshes || []).concat(meshes);
  for (const m of meshes) m.userData.entry = entry;
}

export function updateEntries(list, dt, t, hovered) {
  const kh = 1 - Math.exp(-8 * dt), kd = 1 - Math.exp(-6 * dt);
  for (const e of list) {
    e.hover += ((e === hovered ? 1 : 0) - e.hover) * kh;
    e.dim += (e.dimT - e.dim) * kd;
    for (const m of e.mats) m.mat.emissiveIntensity = (m.base + m.hov * e.hover) * e.dim;
    if (e.tick) e.tick(e, dt, t);
  }
}

// Küçük etiket (sprite) — metin content'ten gelir
export function labelSprite(text, { w = 0.5, color = '#c9ced8', opacity = 0.9 } = {}) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 80;
  const g = c.getContext('2d');
  g.font = '500 54px Inter, system-ui, sans-serif';
  g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 256, 42);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity, depthWrite: false }));
  s.scale.set(w, w * 80 / 512, 1);
  return s;
}
