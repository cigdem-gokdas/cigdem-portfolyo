import * as THREE from 'three';
import { getSection } from '../content.js';
import { VURGU, createScreen, makeEntry, bindPick } from './screens.js';

const YAY = 110;        // derece
const YARICAP = 4.2;    // ekran yayı
const STAND_R = 2.4;    // avatarın duracağı halka yarıçapı (yürüme hedefi)
const BASE_Y = 2.6;     // ekranlar avatarın başının üstünde kalsın; altlarında eğitim çerçevesi/deneyim şeridi için boşluk

// Projeler content/site.json'dan üretilir: yay üzerinde yüzen ince çerçeveli ekranlar.
// Tıklanabilir yüzeyler yalnızca ekran yüzü + çerçeve (bindPick); başka görünmez hitbox yok.
export async function createStations() {
  try { await document.fonts.load('600 40px Inter'); await document.fonts.load('400 30px Inter'); } catch (e) { /* sistem fontu */ }

  const section = getSection('projeler');
  const items = section.items;
  const root = new THREE.Group();
  const stations = [];
  const ringGeo = new THREE.RingGeometry(0.45, 0.5, 48);
  const ringMatBase = new THREE.MeshBasicMaterial({
    color: new THREE.Color(VURGU).multiplyScalar(1.2), transparent: true, opacity: 0.6, toneMapped: false, side: THREE.DoubleSide,
  });

  items.forEach((item, i) => {
    const deg = items.length > 1 ? -YAY / 2 + (YAY * i) / (items.length - 1) : 0;
    const a = THREE.MathUtils.degToRad(deg);
    const dir = new THREE.Vector3(Math.sin(a), 0, -Math.cos(a));

    const s = createScreen(item, i);
    s.group.position.copy(dir).multiplyScalar(YARICAP).setY(BASE_Y);
    s.group.lookAt(0, 1.4, 0);
    root.add(s.group);

    // Zeminde ışıklı halka = yürüme hedefi (görsel işaret; tıklanamaz)
    const ring = new THREE.Mesh(ringGeo, ringMatBase.clone());
    ring.rotation.x = -Math.PI / 2;
    const stand = dir.clone().multiplyScalar(STAND_R);
    ring.position.set(stand.x, 0.02, stand.z);
    root.add(ring);

    const e = makeEntry({
      kind: 'project', id: item.id, item, section, group: s.group, standPoint: stand, dir,
      baseY: BASE_Y, phase: i * 1.3, ring, index: i,
      mats: [{ mat: s.mat, base: 1.15, hov: 0.9 }, { mat: s.frameMat, base: 0.7, hov: 1.6 }],
    });
    e.tick = (en, dt, t) => {
      en.group.position.y = en.baseY + Math.sin(t * 0.8 + en.phase) * 0.04; // bob
      en.ring.material.opacity = (0.45 + en.hover * 0.45) * Math.max(0.35, en.dim);
    };
    bindPick(e, s.screen, s.frame);
    stations.push(e);
  });

  return { root, stations };
}
