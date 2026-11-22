import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { loadContent, getSite, getLine } from './content.js';
import { createRoom } from './scene/room.js';
import { createStations } from './scene/stations.js';
import { createDust } from './scene/dust.js';
import { createSkillRing } from './scene/skillRing.js';
import { Avatar } from './avatar/Avatar.js';
import { subtitle } from './ui/subtitle.js';
import { loader } from './ui/loader.js';

async function main() {
  loader.set(0);
  await loadContent();
  document.getElementById('ad').textContent = 'Çiğdem Gökdaş'; // TODO: site.json'a ad alanı eklenirse oradan oku
  loader.set(0.1);

  // Renderer, sahne, kamera
  const canvas = document.getElementById('sahne');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x07090f);
  scene.fog = new THREE.FogExp2(0x07090f, 0.03);

  const camera = new THREE.PerspectiveCamera(46, innerWidth / innerHeight, 0.1, 60);
  const camBase = new THREE.Vector3(0, 1.55, 4.3);
  const camLook = new THREE.Vector3(0, 1.2, -1);
  camera.position.copy(camBase);

  // Sahne öğeleri
  scene.add(createRoom());
  const { root: stationRoot, stations } = await createStations();
  scene.add(stationRoot);
  const dust = createDust(); scene.add(dust);
  const skills = createSkillRing(); scene.add(skills);
  loader.set(0.2);

  // Avatar
  const avatar = new Avatar({ subtitle });
  await avatar.load('./assets/cigdem.glb', (p) => loader.set(0.2 + p * 0.75));
  avatar.idleTarget.copy(camera.position);
  scene.add(avatar.root);

  // Post-process: hafif bloom (yüksek eşik)
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: 4 }));
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.35, 0.5, 0.85));
  composer.addPass(new OutputPass());
  const resize = () => {
    renderer.setSize(innerWidth, innerHeight, false);
    composer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    composer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  };
  addEventListener('resize', resize); resize();

  // Fare: parallax + hover
  const mouse = new THREE.Vector2(0, 0);
  let mouseSeen = false;
  addEventListener('pointermove', (e) => {
    mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    mouseSeen = true;
  });
  const ray = new THREE.Raycaster();
  const screens = stations.map((s) => s.screen);
  let hovered = null;

  const timer = new THREE.Timer();
  renderer.setAnimationLoop(() => {
    timer.update();
    const dt = Math.min(timer.getDelta(), 0.05), t = timer.getElapsed();

    // Çok hafif parallax (OrbitControls yok)
    camera.position.x = THREE.MathUtils.damp(camera.position.x, camBase.x + mouse.x * 0.35, 3, dt);
    camera.position.y = THREE.MathUtils.damp(camera.position.y, camBase.y + mouse.y * 0.1, 3, dt);
    camera.lookAt(camLook);

    // Hover: ekran üstündeyse imleç pointer, avatar ekrana bakar
    let hit = null;
    if (mouseSeen) {
      ray.setFromCamera(mouse, camera);
      const h = ray.intersectObjects(screens, false)[0];
      if (h) hit = stations.find((s) => s.screen === h.object);
    }
    if (hit !== hovered) {
      hovered = hit;
      canvas.style.cursor = hit ? 'pointer' : 'default';
      avatar.lookAtPoint(hit ? hit.screen.getWorldPosition(new THREE.Vector3()) : null);
    }

    stationRoot.userData.update(dt, t, hovered);
    dust.userData.update(dt, t);
    skills.userData.update(dt, camera);
    avatar.idleTarget.copy(camera.position);
    avatar.update(dt);
    composer.render(dt);
  });

  loader.set(1);
  loader.done();
  // Karşılama: 600 ms sonra (altyazı; ses ilk tıklamadan sonra denenir)
  setTimeout(() => avatar.speak(getLine('karsilama')), 600);

  window.__portfolyo = { avatar, scene, camera, stations }; // hata ayıklama
}

main().catch((e) => { console.error(e); document.getElementById('yuzde').textContent = 'Yüklenemedi'; });
