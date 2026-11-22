import * as THREE from 'three';

// Toz zerreleri: ~400 nokta, çok yavaş süzülme, additive.
export function createDust(count = 400) {
  const pos = new Float32Array(count * 3);
  const speed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 14;
    pos[i * 3 + 1] = Math.random() * 5;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 14 - 1;
    speed[i] = 0.02 + Math.random() * 0.04;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));

  // Yuvarlak nokta dokusu
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 32, 32);

  const mat = new THREE.PointsMaterial({
    size: 0.05, map: new THREE.CanvasTexture(c), transparent: true, opacity: 0.35,
    blending: THREE.AdditiveBlending, depthWrite: false, color: 0x9fdcff,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;

  // Açılış efekti: parçacıklar hedefe doğru akar (hız alanı), süre sonunda yumuşakça söner
  let att = null;
  points.userData.attract = (target, dur = 1.5) => { att = target ? { target: target.clone(), dur, t: 0 } : null; };
  points.userData.update = (dt, t) => {
    if (att) {
      att.t += dt;
      const f = Math.min(1, att.t / 0.3) * Math.min(1, Math.max(0, (att.dur - att.t) / 0.4));
      if (att.t >= att.dur) att = null;
      else {
        const k = 1.8 * f * dt, tg = att.target;
        for (let i = 0; i < count; i++) {
          const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
          const dx = tg.x - x, dy = tg.y - y, dz = tg.z - z;
          if (dx * dx + dy * dy + dz * dz < 0.12) { // vardı: rastgele yeniden doğ
            pos[i * 3] = (Math.random() - 0.5) * 14; pos[i * 3 + 1] = Math.random() * 5; pos[i * 3 + 2] = (Math.random() - 0.5) * 14 - 1;
          } else { pos[i * 3] += dx * k; pos[i * 3 + 1] += dy * k; pos[i * 3 + 2] += dz * k; }
        }
      }
    }
    for (let i = 0; i < count; i++) {
      pos[i * 3 + 1] += speed[i] * dt;
      pos[i * 3] += Math.sin(t * 0.1 + i) * 0.003 * dt * 10;
      if (pos[i * 3 + 1] > 5) pos[i * 3 + 1] = 0;
    }
    geo.attributes.position.needsUpdate = true;
  };
  return points;
}
