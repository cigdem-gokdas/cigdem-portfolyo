import * as THREE from 'three';
import { getSection } from '../content.js';

// Beceri etiket halkası: F2'de yalnızca yer tutucu (tıklanamaz), yavaş döner.
// Küçük etiketler, iki kat (farklı yükseklik/yarıçap, kaydırılmış açı); arka yarı kameraya göre solar.
function labelSprite(text) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 96;
  const g = c.getContext('2d');
  g.font = '500 44px Inter, system-ui, sans-serif';
  g.fillStyle = '#c9ced8'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 256, 48);
  const mat = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, opacity: 0.8, depthWrite: false });
  const s = new THREE.Sprite(mat);
  s.scale.set(0.3, 0.056, 1); // önceki 0.5 x 0.125'in yaklaşık yarısı
  return s;
}

export function createSkillRing() {
  const ring = new THREE.Group();
  ring.position.y = 0; // avatar kökünde; yükseklikler katmana göre
  const names = getSection('beceriler').groups.flatMap((g) => g.items.map((i) => i.name));
  // İki kat: bel hizası (~1.0 m) çevresinde, r 1.1 ve 1.3
  const tiers = [{ y: 0.88, r: 1.1, list: [] }, { y: 1.12, r: 1.3, list: [] }];
  names.forEach((n, i) => tiers[i % 2].list.push(n));
  const labels = [];
  tiers.forEach((tier, ti) => tier.list.forEach((n, i) => {
    const a = (i / tier.list.length) * Math.PI * 2 + ti * Math.PI / tier.list.length;
    const s = labelSprite(n);
    s.position.set(Math.cos(a) * tier.r, tier.y, Math.sin(a) * tier.r);
    ring.add(s);
    labels.push(s);
  }));

  const w = new THREE.Vector3(), cam = new THREE.Vector3();
  ring.userData.update = (dt, camera) => {
    ring.rotation.y += dt * 0.05;
    if (!camera) return;
    ring.updateMatrixWorld(true);
    ring.getWorldPosition(cam); // merkez
    const cx = camera.position.x - cam.x, cz = camera.position.z - cam.z;
    const cl = Math.hypot(cx, cz) || 1;
    for (const s of labels) {
      s.getWorldPosition(w);
      const lx = w.x - cam.x, lz = w.z - cam.z;
      const dot = (lx * cx + lz * cz) / ((Math.hypot(lx, lz) || 1) * cl); // 1 = kameraya dönük taraf
      s.material.opacity = THREE.MathUtils.lerp(0.15, 1.0, (dot + 1) / 2);
    }
  };
  return ring;
}
