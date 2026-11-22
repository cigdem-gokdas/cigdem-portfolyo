import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { getSite, getLine, getLines, lineFor as pickLine } from '../content.js';
import { createRoom } from './room.js';
import { createStations } from './stations.js';
import { createSections } from './sections.js';
import { createDust } from './dust.js';
import { createSkillRing } from './skillRing.js';
import { createReveal } from './reveal.js';
import { updateEntries } from './screens.js';
import { Avatar } from '../avatar/Avatar.js';
import { subtitle } from '../ui/subtitle.js';
import { loader } from '../ui/loader.js';
import { openPanel, closePanel, onPanelClose, isPanelOpen } from '../ui/panel.js';
import { bigScreen } from '../ui/bigScreen.js';
import { initFlatList } from '../ui/flatList.js';
import { initContactCorner } from '../ui/contact.js';

const BASE_FOV = 50;
const FOCUS_FOV = 40;
const AV_NDC = 0.66;     // büyük ekran açıkken avatarın kadraj konumu (NDC, sol)
const Y = new THREE.Vector3(0, 1, 0);
const damp = (v, t, k, dt) => v + (t - v) * (1 - Math.exp(-k * dt));

export async function start3d() {
  const site = getSite();
  loader.set(0.1);

  const canvas = document.getElementById('sahne');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x07090f);
  scene.fog = new THREE.FogExp2(0x07090f, 0.03);

  const camera = new THREE.PerspectiveCamera(BASE_FOV, innerWidth / innerHeight, 0.1, 60);
  // Ana kadraj: avatar ortada, projeler arkada, kenarlarda hackathon (sol), deneyim (sağ), eğitim (arka sağ) sezilir
  const HOME = { pos: new THREE.Vector3(0, 1.6, 4.8), look: new THREE.Vector3(0, 1.3, -1), fov: BASE_FOV };
  const camPos = HOME.pos.clone(), camLook = HOME.look.clone();
  let camFov = HOME.fov;
  let target = { ...HOME };
  let parallaxK = 1;
  camera.position.copy(camPos);

  // Sahne öğeleri
  const room = createRoom(); scene.add(room);
  const { root: stationRoot, stations } = await createStations(); scene.add(stationRoot);
  const { root: secRoot, entries: secEntries } = createSections(); scene.add(secRoot);
  const dust = createDust(); scene.add(dust);
  const skills = createSkillRing(); scene.add(skills);
  const entries = [...stations, ...secEntries, skills.userData.entry];
  loader.set(0.2);

  // Avatar
  const avatar = new Avatar({ subtitle, scene, camera });
  await avatar.load('./assets/cigdem.glb', (p) => loader.set(0.2 + p * 0.75));
  avatar.idleTarget.copy(camera.position);
  scene.add(avatar.root);

  const reveal = createReveal({ scene, room, dust, skills, getEntries: () => entries, sprites: (() => { const l = []; for (const r of [stationRoot, secRoot]) r.traverse((o) => { if (o.isSprite) l.push(o); }); return l; })() });

  // Avatarı izleyen yumuşak dolgu ışığı: sahne kararırken (efekt) avatar siyah siluet olmasın; kararmadan etkilenmez
  const fill = new THREE.PointLight(0xffe9dc, 7, 5, 2);
  scene.add(fill);
  const tmpV = new THREE.Vector3();

  // Poster modu: yalnızca avatar, sade koyu degrade, baş-diz kadrajı
  let poster = false, posterSaved = null;
  const gradTex = (() => {
    const c = document.createElement('canvas'); c.width = 4; c.height = 256;
    const g = c.getContext('2d'); const gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, '#141c30'); gr.addColorStop(1, '#05070c');
    g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  function posterMode(on) {
    on = !!on;
    if (on === poster) return poster;
    poster = on;
    const roomMeshes = []; room.traverse((o) => { if (o.isMesh) roomMeshes.push(o); });
    if (on) {
      posterSaved = { bg: scene.background, fog: scene.fog, target, parallaxK };
      scene.background = gradTex; scene.fog = null;
      stationRoot.visible = secRoot.visible = dust.visible = skills.visible = false;
      roomMeshes.forEach((m) => { m.visible = false; });
      avatar.lookAtPoint(null);
      // baş-diz: görünür dikey ~1.5 m (3:4 kırpma için avatar ortada)
      const fov = 30, d = 0.68 / Math.tan(THREE.MathUtils.degToRad(fov / 2));
      const base = avatar.root.position;
      target = { pos: new THREE.Vector3(base.x, 1.12, base.z + d), look: new THREE.Vector3(base.x, 1.1, base.z), fov };
      parallaxK = 0;
      camPos.copy(target.pos); camLook.copy(target.look); camFov = fov; camera.fov = fov; camera.updateProjectionMatrix();
    } else {
      scene.background = posterSaved.bg; scene.fog = posterSaved.fog;
      stationRoot.visible = secRoot.visible = dust.visible = skills.visible = true;
      roomMeshes.forEach((m) => { m.visible = true; });
      target = posterSaved.target; parallaxK = posterSaved.parallaxK;
    }
    return poster;
  }

  // Post-process: hafif bloom (yüksek eşik). FPS ölçümü (1440x900): MSAA x4 + bloom ~50 fps, x2 ~59 fps (darboğaz: bloom bileşiminin MSAA hedefe yazması)
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: 2 }));
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.35, 0.5, 0.85);
  const bloomSetSize = bloom.setSize.bind(bloom);
  bloom.setSize = (w, h) => bloomSetSize(Math.max(1, w >> 1), Math.max(1, h >> 1));   // bloom yarım çözünürlükte (FPS); bulanık, fark edilmez
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const resize = () => {
    renderer.setSize(innerWidth, innerHeight, false);
    composer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    composer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  };
  addEventListener('resize', resize); resize();

  // ---- Seçim (hover / tıklama): yalnızca tıklanabilir nesneler ----
  const pickMeshes = [avatar.hitbox];
  for (const e of entries) pickMeshes.push(...e.meshes);
  const ray = new THREE.Raycaster();
  const mouse = new THREE.Vector2(0, 0);
  let mouseSeen = false;
  const pickAt = (x, y) => {
    ray.setFromCamera(new THREE.Vector2((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1), camera);
    const h = ray.intersectObjects(pickMeshes, false)[0];
    if (!h) return null;
    if (poster) return null;
    if (h.object.userData.entry === skills.userData.entry && skills.userData.visibility() < 0.5) return null; // gizli halka tıklanamaz
    return h.object.userData.entry || (h.object.userData.pick && h.object.userData.pick.kind === 'avatar' ? { kind: 'avatar' } : null);
  };
  let hovered = null, mx = 0, my = 0;
  addEventListener('pointermove', (e) => {
    mouseSeen = e.target === canvas;
    mx = e.clientX; my = e.clientY;
    mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  });

  // ---- Akış durumu ----
  let busy = false, active = null, closing = Promise.resolve(), openP = null, pendingClose = false;
  let lastAct = performance.now(), idleCount = 0;
  const touch = () => { lastAct = performance.now(); };

  const lineFor = (e) => pickLine(e.item, e.section, getLines());
  const anchorOf = (e) => e.group.getWorldPosition(new THREE.Vector3());

  function setCam(f) { target = f; }
  function resetCam() { target = { ...HOME }; }

  // Seçilen noktanın kadrajı. Beceri: avatar önden. Diğerleri: kamera avatarın SAĞINDA (işaret eden kol tarafı), hafif önden
  // (3/4 profil); avatar kadrajın solunda (NDC ~ -0.66), büyük ekran (genişliğin ~%62'si) ortanın biraz sağında. Panel yok.
  // Duvarın dışına çıkmamak için mesafe kısılır.
  function framingFor(entry) {
    if (entry.kind === 'skill') {
      const S = avatar.root.position.clone(), DIST = 4.6;
      const pos = S.clone().add(new THREE.Vector3(0, 0, DIST)); pos.y = 1.6;
      const look0 = new THREE.Vector3(S.x, 1.05, S.z);
      const fwd = look0.clone().sub(pos).setY(0).normalize();
      const right = new THREE.Vector3().crossVectors(fwd, Y).normalize();
      const half = Math.tan(THREE.MathUtils.degToRad(FOCUS_FOV) / 2) * camera.aspect * DIST;
      return { pos, look: look0.addScaledVector(right, half * AV_NDC), fov: FOCUS_FOV, dist: DIST };
    }
    const S = entry.standPoint.clone();
    const f = anchorOf(entry).sub(S).setY(0).normalize();
    const right = new THREE.Vector3().crossVectors(f, Y).normalize();
    const c = right.clone().multiplyScalar(0.93).addScaledVector(f, 0.35).normalize();
    // Kamera adayları: önce 3/4 profil; ekran yayının ARKASINA düşerse (yay dışı + yay açısı içinde) ya da duvara taşarsa
    // arkadan-sağa doğru açıyı kaydır / yaklaş
    let DIST = 4.2, pos = null, best = null;
    search:
    for (const [sg, al] of [[1, 0.35], [1, 0.1], [1, -0.25], [1, -0.55], [1, -0.85], [1, -1.15], [-1, 0.35], [-1, 0.1], [-1, -0.25]]) {
      const cc = right.clone().multiplyScalar(Math.cos(al) * sg).addScaledVector(f, Math.sin(al)).normalize();
      for (let d = 4.2; d >= 3.2; d -= 0.2) {
        const q = S.clone().addScaledVector(cc, d);
        const rad = Math.hypot(q.x, q.z), ang = Math.abs(Math.atan2(q.x, -q.z));
        const behindArc = rad > 3.9 && ang < 1.08;
        const wall = q.z < -6.2 || Math.abs(q.x) * 0.866 - q.z * 0.5 > 6.2;
        const nearLow = entries.some((e) => e.kind === 'exp' && Math.hypot(e.group.getWorldPosition(tmpV).x - q.x, tmpV.z - q.z) < 1.5); // deneyim küreleri kameranın önüne gelmesin
        if (nearLow) { if (!best || 5 < best.pen) best = { pen: 5, q, d }; continue; }
        if (!behindArc && !wall) { pos = q; DIST = d; break search; }
        const pen = (behindArc ? 10 : 0) + (wall ? 10 : 0) + (al === 0.35 ? 0 : 0.1);
        if (!best || pen < best.pen) best = { pen, q, d };
      }
    }
    if (!pos) { pos = best.q; DIST = best.d; }
    pos.y = 1.5;
    const look0 = new THREE.Vector3(S.x, 1.05, S.z);
    const fwd = look0.clone().sub(pos).setY(0).normalize();
    const vr = new THREE.Vector3().crossVectors(fwd, Y).normalize();
    const half = Math.tan(THREE.MathUtils.degToRad(FOCUS_FOV) / 2) * camera.aspect * DIST;
    return { pos, look: look0.addScaledVector(vr, half * AV_NDC), fov: FOCUS_FOV, dist: DIST };
  }

  async function activate(entry) {
    if (busy) return;          // animasyon sürerken yeni tıklama yok sayılır
    busy = true; touch();
    try {
      if (isPanelOpen()) closePanel();   // düz listeden açılan panel varsa önce kapanış (onPanelClose eşzamanlı çalışır)
      await closing;
      active = entry;
      avatar.lookAtPoint(null);
      const line = lineFor(entry);
      if (entry.kind === 'skill') {
        const fr = framingFor(entry); setCam(fr); parallaxK = 0.3;
        avatar.faceTowards(camera.position);
        const sp = avatar.speak(line);
        bigScreen.show(entry.item, entry.section);
        openP = reveal.open(entry, fr, camera.aspect);
        await openP;
        bigScreen.ready();
        return;
      }
      await avatar.walkTo(entry.standPoint);
      const anchor = anchorOf(entry);
      await avatar.faceTowards(anchor);
      const fr = framingFor(entry); setCam(fr); parallaxK = 0.3;
      const sp = avatar.speak(line);
      openP = reveal.open(entry, fr, camera.aspect);
      avatar.point(() => reveal.pointTarget() || anchor, { holdUntil: sp }); // hedef: uçan/açılmış ekran klonu
      bigScreen.show(entry.item, entry.section);
      await openP;
      bigScreen.ready();
    } catch (e) { console.error(e); }
    finally {
      busy = false;
      if (pendingClose) { pendingClose = false; requestClose(); }
    }
  }

  // Kapanış: ekranlar ters sırayla, avatar eve döner (Kapat düğmesi, Esc, ekran dışına tıklama, düz liste paneli kapanışı)
  function runClose() {
    const own = !busy; busy = true;
    const e = active; active = null;
    closing = (async () => {
      try {
        if (openP) await openP;
        avatar.stopSpeak();
        resetCam(); parallaxK = 1;
        const rc = e ? reveal.close() : null;
        await avatar.home();
        await rc;
      } catch (err) { console.error(err); }
      finally { if (own) busy = false; }
    })();
  }
  function requestClose() {
    if (!bigScreen.isOpen) return;
    if (busy) { pendingClose = true; return; }   // açılış sürüyor: bitince kapanır
    bigScreen.hide();
    runClose();
  }
  bigScreen.onClose(requestClose);
  onPanelClose(() => { if (!bigScreen.isOpen) runClose(); });

  // Büyük ekranın ekrandaki dörtgeni (piksel): dışına tıklama = kapat
  const toPx = (v) => { v.project(camera); return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight }; };
  function insideScreen(x, y) {
    const q = reveal.screenQuad(); if (!q) return false;
    const pts = q.map((v) => toPx(v.clone()));
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    return x >= Math.min(...xs) && x <= Math.max(...xs) && y >= Math.min(...ys) && y <= Math.max(...ys);
  }

  canvas.addEventListener('click', (ev) => {
    if (bigScreen.isOpen) {
      touch();
      if (!busy && !insideScreen(ev.clientX, ev.clientY)) requestClose();   // yalnız boş alan; açılış sürerken yok sayılır
      return;
    }
    const h = pickAt(ev.clientX, ev.clientY);
    if (!h) return;
    touch();
    if (h.kind === 'avatar') {
      if (busy) return;
      avatar.wave();
      avatar.speak(getLine('avatar-tik'));
      return;
    }
    activate(h);
  });

  // Düz liste seçimi: 3D'ye girmeden paneli açar
  initFlatList(site, { onSelect: (it, sec) => openPanel(it, sec) });
  initContactCorner(site.contact);

  const timer = new THREE.Timer();
  let hoverFrame = 0;
  renderer.setAnimationLoop(() => {
    timer.update();
    const dt = Math.min(timer.getDelta(), 0.05), t = timer.getElapsed();

    // Kamera: hedef çerçeveye yumuşak dolly + çok hafif parallax
    const k = 2.8;
    camPos.x = damp(camPos.x, target.pos.x, k, dt); camPos.y = damp(camPos.y, target.pos.y, k, dt); camPos.z = damp(camPos.z, target.pos.z, k, dt);
    camLook.x = damp(camLook.x, target.look.x, k, dt); camLook.y = damp(camLook.y, target.look.y, k, dt); camLook.z = damp(camLook.z, target.look.z, k, dt);
    const nf = damp(camFov, target.fov, k, dt);
    if (Math.abs(nf - camFov) > 1e-4) { camFov = nf; camera.fov = nf; camera.updateProjectionMatrix(); }
    camera.position.set(camPos.x + mouse.x * 0.35 * parallaxK, camPos.y + mouse.y * 0.1 * parallaxK, camPos.z);
    camera.lookAt(camLook);

    // Hover: her karede yalnızca tıklanabilir meshlere ışın
    let hit = null;
    if (mouseSeen) hit = pickAt(mx, my);
    if (hit !== hovered && !(hit && hovered && hit.kind === 'avatar' && hovered.kind === 'avatar')) {
      hovered = hit;
      canvas.style.cursor = hit ? 'pointer' : 'default';
      if (!busy && !active && avatar.state === 'idle') avatar.lookAtPoint(hit && hit.group ? (hit.kind === 'skill' ? skills.localToWorld(skills.userData.center.clone()) : hit.group.getWorldPosition(new THREE.Vector3())) : null);
    }

    updateEntries(entries, dt, t, hovered && hovered.kind !== 'avatar' ? hovered : null);
    dust.userData.update(dt, t);
    if (!poster) skills.userData.update(dt, camera, t);
    reveal.update(dt, t, mouse);
    // Gerçek <a>: 3D "Projeyi aç" düğmesinin 4 köşesi bu karenin kamerasıyla ekrana izdüşürülür, bağlantı tam üstüne oturur
    if (bigScreen.isOpen) {
      camera.updateMatrixWorld(true);
      const q = reveal.linkQuad();
      let r = null;
      if (q) {
        const p = q.map((v) => toPx(v.clone()));
        const x0 = Math.min(...p.map((a) => a.x)), x1 = Math.max(...p.map((a) => a.x)), y0 = Math.min(...p.map((a) => a.y)), y1 = Math.max(...p.map((a) => a.y));
        r = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
      }
      bigScreen.setLinkRect(r);
    }
    tmpV.copy(camera.position).sub(avatar.root.position).setY(0).normalize().multiplyScalar(1.8).add(avatar.root.position); tmpV.y = 1.25; fill.position.copy(tmpV);
    avatar.idleTarget.copy(camera.position);
    avatar.update(dt);

    // Boşta: 25 s etkileşim yoksa ve panel kapalıysa bir kez konuş (sayfa başına en çok 2)
    if (!busy && !active && !isPanelOpen() && !bigScreen.isOpen && idleCount < 2 && performance.now() - lastAct > 25000 && avatar.state === 'idle') {
      idleCount++; lastAct = performance.now();
      avatar.speak(getLine('bosta'));
    }
    composer.render(dt);
  });

  loader.set(1);
  loader.done();
  // Karşılama: 600 ms sonra (altyazı; ses ilk tıklamadan sonra denenir)
  setTimeout(() => { touch(); avatar.speak(getLine('karsilama')); }, 600);

  // Test/ölçüm kancası: kamerayı anında konumla (parallax kapalı)
  const camSnap = (pos, look, fov = BASE_FOV) => { target = { pos: new THREE.Vector3(...pos), look: new THREE.Vector3(...look), fov }; parallaxK = 0; camPos.copy(target.pos); camLook.copy(target.look); camFov = fov; camera.fov = fov; camera.updateProjectionMatrix(); };
  window.__portfolyo = { bigScreen, requestClose, camSnap, composer, avatar, scene, camera, entries, reveal, activate, renderer, pickAt, posterMode, skills };
}
