import * as THREE from 'three';

const VURGU = 0x7cf3ff;

// Yarım altıgen oda: zemin, 3 duvar, zemin-duvar ışık şeritleri, sahne dairesi, ışıklar
// ve F3 için boş yer tutucular (hackathon plakaları, deneyim şeridi, eğitim çerçevesi).
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
  const spot = new THREE.SpotLight(0xdfeaff, 220, 14, 0.5, 0.9, 2);
  spot.position.set(0, 6.5, 1);
  spot.target.position.set(0, 0.8, 0);
  spot.castShadow = true;
  spot.shadow.mapSize.set(1024, 1024);
  spot.shadow.bias = -0.0005;
  room.add(spot, spot.target);
  room.add(new THREE.HemisphereLight(0x3a4a6a, 0x05060a, 0.55));

  // --- F3 yer tutucuları (tıklanamaz) ---
  const dark = new THREE.MeshStandardMaterial({ color: 0x10141f, roughness: 0.8 });
  const rim = (w, h) => new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, 0.02)),
    new THREE.LineBasicMaterial({ color: VURGU, transparent: true, opacity: 0.4 })
  );

  // Sol duvarda iki hackathon plakası
  [-1.1, 1.1].forEach((x) => {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 0.03), dark);
    p.position.set(x, 1.9, 0.03);
    p.add(rim(0.9, 0.6));
    p.visible = false; // F3'e kadar gizli
    walls[-60].add(p);
  });

  // Arka duvarda eğitim çerçevesi
  const edu = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.1, 0.03), dark);
  edu.position.set(0, 2.1, 0.03);
  edu.add(rim(1.8, 1.1));
  edu.visible = false; // F3'e kadar gizli
  walls[0].add(edu);

  // Odanın sağ yanında, derinlik (z) yönünde deneyim şeridi: ışıklı çizgi + 3 nokta (F3 yer tutucusu)
  const SX = 4.6;
  const line = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.01, 4.0), stripMat);
  line.position.set(SX, 0.02, -2.5);
  room.add(line);
  [-4.5, -2.5, -0.5].forEach((z) => {
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.08, 24), stripMat);
    dot.rotation.x = -Math.PI / 2; dot.position.set(SX, 0.025, z);
    room.add(dot);
  });

  return room;
}
