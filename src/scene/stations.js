import * as THREE from 'three';
import { getSection } from '../content.js';

const VURGU = '#7cf3ff';
const YAY = 110;        // derece
const YARICAP = 4.2;    // ekran yayı
const STAND_R = 3.0;    // avatarın duracağı halka yarıçapı (F3 yürüme hedefi)

// Metni verilen genişliğe sarar
function wrap(g, text, x, y, maxW, lh, maxLines) {
  const words = text.split(' ');
  let line = '', n = 0;
  for (const w of words) {
    const t = line ? line + ' ' + w : w;
    if (g.measureText(t).width > maxW && line) {
      g.fillText(line, x, y); y += lh; line = w; if (++n >= maxLines) return y;
    } else line = t;
  }
  g.fillText(line, x, y);
  return y + lh;
}

// Ekran yüzü: koyu zemin, açık yazı, tek vurgu rengi
function makeTexture(item, index) {
  const W = 2048, H = 1280; // ekran oranı 1.6
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#121826'; g.fillRect(0, 0, W, H);
  g.fillStyle = VURGU; g.fillRect(112, 120, 128, 8);
  g.font = '600 52px Inter, system-ui, sans-serif';
  g.fillText(String(index + 1).padStart(2, '0'), 112, 220);
  g.fillStyle = '#f7f9fc'; g.font = '600 152px Inter, system-ui, sans-serif';
  let y = wrap(g, item.title, 112, 440, 1824, 172, 3);
  g.fillStyle = '#b4bccc'; g.font = '400 68px Inter, system-ui, sans-serif'; // ~%45 başlık
  wrap(g, item.meta || '', 112, y + 40, 1824, 88, 3);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

// Projeler content/site.json'dan üretilir: 120° yay, yüzen ince çerçeveli ekranlar
export async function createStations() {
  try { await document.fonts.load('600 40px Inter'); await document.fonts.load('400 30px Inter'); } catch (e) { /* sistem fontu */ }

  const items = getSection('projeler').items;
  const root = new THREE.Group();
  const stations = [];
    const ringGeo = new THREE.RingGeometry(0.45, 0.5, 48);

  items.forEach((item, i) => {
    // Yay avatarın karşısında (arka tarafta): -60° ... +60°, ekranlar kameraya/merkeze bakar
    const deg = items.length > 1 ? -YAY / 2 + (YAY * i) / (items.length - 1) : 0;
    const a = THREE.MathUtils.degToRad(deg);
    const dir = new THREE.Vector3(Math.sin(a), 0, -Math.cos(a));
    const baseY = 1.6;

    const group = new THREE.Group();
    group.position.copy(dir).multiplyScalar(YARICAP).setY(baseY);
    group.lookAt(0, 1.2, 0); // hafif aşağı ve merkeze dönük

    const frameMat = new THREE.MeshStandardMaterial({ color: 0x0a1218, emissive: VURGU, emissiveIntensity: 0.7, roughness: 0.5 });
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.706, 0.03), frameMat);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x000000, emissive: 0xffffff, emissiveMap: makeTexture(item, i), emissiveIntensity: 1.15,
    });
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 0.656), mat);
    screen.position.z = 0.02;
    screen.userData.frameMat = frameMat;
    screen.userData.stationId = item.id;
    group.add(frame, screen);
    root.add(group);

    // Zeminde ışıklı halka = yürüme hedefi
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
      color: new THREE.Color(VURGU).multiplyScalar(1.2), transparent: true, opacity: 0.6, toneMapped: false, side: THREE.DoubleSide,
    }));
    ring.rotation.x = -Math.PI / 2;
    const stand = dir.clone().multiplyScalar(STAND_R);
    ring.position.set(stand.x, 0.02, stand.z);
    root.add(ring);

    stations.push({ id: item.id, title: item.title, group, screen, mat, frameMat, ring, standPoint: stand, baseY, phase: i * 1.3, hover: 0 });
  });

  root.userData.update = (dt, t, hovered) => {
    for (const s of stations) {
      s.group.position.y = s.baseY + Math.sin(t * 0.8 + s.phase) * 0.04; // bob
      s.hover += ((s === hovered ? 1 : 0) - s.hover) * Math.min(1, dt * 8);
      s.mat.emissiveIntensity = 1.15 + s.hover * 0.9;
      s.frameMat.emissiveIntensity = 0.7 + s.hover * 1.6;
      s.ring.material.opacity = 0.45 + s.hover * 0.45;
    }
  };
  return { root, stations };
}
