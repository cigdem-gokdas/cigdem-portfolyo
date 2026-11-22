import * as THREE from 'three';
import { getSection } from '../content.js';
import { makeEntry, bindPick } from './screens.js';

const damp = (v, t, k, dt) => v + (t - v) * (1 - Math.exp(-k * dt));
const TINT = new THREE.Color(0x7cf3ff), WHITE = new THREE.Color(0xffffff);

// Beceri etiket halkası: avatarın çevresinde yavaş döner, tıklanabilir (tüm etiketler tek entry, kind 'skill').
// Ön yüz opaklığı 1.0, arka 0.25. Tıklanınca (setExploded) halka hızlanır, etiketler gruplara ayrılıp yükselir.
function labelSprite(text) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 80;
  const g = c.getContext('2d');
  g.font = '500 56px Inter, system-ui, sans-serif';
  g.fillStyle = '#e4e8f0'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 256, 42);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 1, depthWrite: false }));
  s.scale.set(0.42, 0.42 * 80 / 512, 1); // önceki 0.3 genişlikten 1.4x
  s.userData.sc = s.scale.clone();
  return s;
}

export function createSkillRing() {
  const ring = new THREE.Group();
  ring.position.y = 0;
  const section = getSection('beceriler');
  const entry = makeEntry({ kind: 'skill', id: section.id, item: section, section, group: ring, mats: [] });
  const labels = [];

  // Başlangıç: iki kat (bel hizası, r 1.1 ve 1.3, kaydırılmış açı). Hedef: grup başına bir halka, yükselmiş.
  const all = section.groups.flatMap((g, gi) => g.items.map((i) => ({ name: i.name, gi })));
  const tiers = [{ y: 0.88, r: 1.1, list: [] }, { y: 1.12, r: 1.3, list: [] }];
  all.forEach((n, i) => tiers[i % 2].list.push(n));
  tiers.forEach((tier, ti) => tier.list.forEach((n, i) => {
    const a = (i / tier.list.length) * Math.PI * 2 + ti * Math.PI / tier.list.length;
    const s = labelSprite(n.name);
    s.userData.base = { a, r: tier.r, y: tier.y };
    s.userData.gi = n.gi;
    s.position.set(Math.cos(a) * tier.r, tier.y, Math.sin(a) * tier.r);
    ring.add(s); labels.push(s);
  }));
  const groupCount = section.groups.map((g) => g.items.length);
  const seen = section.groups.map(() => 0);
  labels.forEach((s) => {
    const gi = s.userData.gi, k = seen[gi]++;
    s.userData.grp = { a: (k / groupCount[gi]) * Math.PI * 2 + gi * 0.6, r: 1.25 + (gi % 2) * 0.15, y: 0.75 + gi * 0.32 };
  });
  bindPick(entry, ...labels);

  const w = new THREE.Vector3(), cen = new THREE.Vector3();
  let mix = 0, mixT = 0, speed = 0.05, hoverAny = false, vis = 1, visT = 1;
  ring.userData.entry = entry;
  ring.userData.setExploded = (v) => { mixT = v ? 1 : 0; };
  ring.userData.setHidden = (v) => { visT = v ? 0 : 1; };  // açılış efekti: 250 ms solar / geri gelir
  ring.userData.visibility = () => vis;
  ring.userData.update = (dt, camera) => {
    vis += Math.sign(visT - vis) * Math.min(Math.abs(visT - vis), dt / 0.25);
    ring.visible = vis > 0.003;
    mix = damp(mix, mixT, 2.2, dt);
    speed = damp(speed, mixT ? 0.9 : 0.05, 2.5, dt);
    ring.rotation.y += dt * speed;
    ring.updateMatrixWorld(true);
    ring.getWorldPosition(cen);
    const cx = camera.position.x - cen.x, cz = camera.position.z - cen.z;
    const cl = Math.hypot(cx, cz) || 1;
    const hov = entry.hover > 0.5;
    const hs = hov ? 1 : 0;
    for (const s of labels) {
      const b = s.userData.base, g = s.userData.grp;
      const a = b.a + (g.a - b.a) * mix, r = b.r + (g.r - b.r) * mix, y = b.y + (g.y - b.y) * mix;
      s.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
      s.getWorldPosition(w);
      const lx = w.x - cen.x, lz = w.z - cen.z;
      const dot = (lx * cx + lz * cz) / ((Math.hypot(lx, lz) || 1) * cl); // 1 = kameraya dönük taraf
      s.material.opacity = THREE.MathUtils.lerp(0.25, 1.0, (dot + 1) / 2) * vis;
      s.material.color.copy(WHITE).lerp(TINT, hs * 0.6);
      s.scale.copy(s.userData.sc).multiplyScalar(1 + hs * 0.08);
    }
  };
  ring.userData.labels = labels;
  return ring;
}
