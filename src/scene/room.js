import * as THREE from 'three';

const VURGU = 0x7cf3ff;

// Yarım altıgen oda: zemin, 3 duvar, zemin-duvar ışık şeritleri, sahne dairesi, ışıklar
// (plakalar, deneyim şeridi ve eğitim çerçevesi sections.js'te).
export function createRoom() {
  const room = new THREE.Group();
  const R = 7; // duvar mesafesi (apothem)
  const H = 4.5;

  // Zemin: mat, koyu
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(10, 64),
    new THREE.MeshStandardMaterial({ color: 0x0b0e16, roughness: 0.95, metalness: 0 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  room.add(floor);

  const wallMat = new THREE.MeshStandardMaterial({ color: 0x0a0c13, roughness: 1 });
  const stripMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(VURGU).multiplyScalar(1.4), toneMapped: false });
  const wallW = 2 * R * Math.tan(Math.PI / 6);

  const walls = {};
  [-60, 0, 60].forEach((deg) => {
    const a = THREE.MathUtils.degToRad(deg);
    const g = new THREE.Group();
    g.position.set(Math.sin(a) * R, 0, -Math.cos(a) * R);
    g.lookAt(0, 0, 0); // yüzü odaya dönük
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(wallW + 0.05, H), wallMat);
    wall.position.y = H / 2;
    g.add(wall);
    // Zemin-duvar birleşiminde ince yatay ışık şeridi
    const strip = new THREE.Mesh(new THREE.BoxGeometry(wallW, 0.03, 0.03), stripMat);
    strip.position.set(0, 0.06, 0.02);
    g.add(strip);
    room.add(g);
    walls[deg] = g;
  });

  // Sahne dairesi: avatarın altında yumuşak radyal ışık, additive
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const cg = c.getContext('2d');
  const gr = cg.createRadialGradient(128, 128, 0, 128, 128, 128);
  gr.addColorStop(0, 'rgba(124,243,255,0.8)'); gr.addColorStop(0.5, 'rgba(124,243,255,0.2)'); gr.addColorStop(1, 'rgba(124,243,255,0)');
  cg.fillStyle = gr; cg.fillRect(0, 0, 256, 256);
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(1.8, 48),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  disc.rotation.x = -Math.PI / 2; disc.position.y = 0.01;
  room.add(disc);

  // Işıklar: üstten tek SpotLight (gölge açık) + hafif dolgu
  const spot = new THREE.SpotLight(0xdfeaff, 110, 14, 0.5, 0.9, 2); // 220'de yukarı bakan ten (dekolte) 1.0'ı aşıp beyaza taşıyor + bloom; yarıya indirildi
  spot.position.set(0, 6.5, 1);
  spot.target.position.set(0, 0.8, 0);
  spot.castShadow = true;
  spot.shadow.mapSize.set(1024, 1024);
  spot.shadow.bias = -0.0005; spot.shadow.normalBias = 0.04;
  room.add(spot, spot.target);
  const hemi = new THREE.HemisphereLight(0x3a4a6a, 0x05060a, 0.55);
  room.add(hemi);
  // Açılış efektinde sahne ışığını kısmak için (k: 1 = normal)
  const lights = [[spot, spot.intensity], [hemi, hemi.intensity]];
  room.userData.setDim = (k) => { for (const [l, base] of lights) l.intensity = base * k; };

  return room;
}
