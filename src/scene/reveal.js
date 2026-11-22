import * as THREE from 'three';
import { VURGU, SW, SH, createScreen, planeGeo, faceTexture } from './screens.js';
import { CW, CH, layoutScreen, drawLayer } from './screenLayout.js';

// 3D AÇILIŞ EFEKTİ: seçilen ekranın klonu yayından kopar, kameranın önüne uçar (1 tur döner, büyür) ve BÜYÜK EKRAN olur
// (kadrajda genişliğin ~%62'si, ortanın biraz sağında; avatar solda). Üstünde parallax katmanları sırayla belirir:
// çerçeve ışığı, başlık bloğu, özet/maddeler, teknolojiler, "Projeyi aç" düğmesi (screenLayout.js).
// Diğer ekranlar/ışık kısılır, toz ekrana doğru akar. Kapanışta ters sıra. Bölüme göre varyantlar (open içinde).
// Düğmenin gerçek tıklaması HTML <a> ile yapılır (ui/bigScreen.js); burada yalnız düğmenin dünya köşeleri verilir (linkQuad).
const CYAN = new THREE.Color(VURGU);
const LZ = { border: 0.03, head: 0.04, body: 0.05, tech: 0.06, btn: 0.07 };   // katman derinlikleri (yerel)
const FRAC_W = 0.62, CENTER_NX = 0.2, CENTER_NY = 0.0, MAX_H = 0.74;       // büyük ekranın kadraj payı
const FLY = 0.9;

const easeOutCubic = (k) => 1 - Math.pow(1 - k, 3);
const easeInOutCubic = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const easeOutBack = (k) => { const c = 1.4; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); };
const lerp = THREE.MathUtils.lerp;
const Y = new THREE.Vector3(0, 1, 0);

// Çerçeve ışığı + koyu dolgu katmanı: çevre boyunca ilerleyen ışık çizgisi (shader)
function borderMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: false, toneMapped: false,
    uniforms: { uProg: { value: 0 }, uFill: { value: 0 }, uColor: { value: new THREE.Vector3(CYAN.r, CYAN.g, CYAN.b) }, uAspect: { value: SW / SH } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec2 vUv; uniform float uProg, uFill, uAspect; uniform vec3 uColor;
      void main(){
        vec2 p = vUv; float bx = 0.014, by = bx * uAspect;
        float d = min(min(p.x, 1.0 - p.x) / bx, min(p.y, 1.0 - p.y) / by);
        float edge = 1.0 - smoothstep(0.6, 1.0, d);
        vec2 c = p - 0.5;
        float s = fract(atan(c.x, c.y) / 6.2831853); // üstten başlayıp saat yönünde
        float lit = step(s, uProg) * step(0.0001, uProg);
        float head = smoothstep(0.1, 0.0, uProg - s) * lit * (1.0 - smoothstep(0.9, 1.0, uProg));
        float e = edge * lit;
        vec3 col = mix(vec3(0.03, 0.05, 0.08), uColor * (1.1 + head * 1.4), e);
        float a = max(uFill * (1.0 - edge), e);
        gl_FragColor = vec4(col, a);
      }`,
  });
}

export function createReveal({ scene, room, dust, skills, getEntries, sprites = [] }) {
  sprites.forEach((o) => { o.userData.o0 = o.material.opacity; });
  let labelK = 1;
  const tw = [];
  const tween = (dur, fn, { delay = 0, ease = (k) => k } = {}) => new Promise((res) => tw.push({ t: -delay, dur, fn, ease, res }));
  let cur = null, lightK = 1, lightT = 1;
  const tmp = new THREE.Object3D();

  // Kamera çerçevesinde (ndc, derinlik) bir dünya noktası
  function framePoint(fr, aspect, nx, ny, depth) {
    const fwd = fr.look.clone().sub(fr.pos).normalize();
    const right = new THREE.Vector3().crossVectors(fwd, Y).normalize();
    const up = new THREE.Vector3().crossVectors(right, fwd).normalize();
    const th = Math.tan(THREE.MathUtils.degToRad(fr.fov) / 2);
    return fr.pos.clone().addScaledVector(fwd, depth).addScaledVector(right, nx * th * aspect * depth).addScaledVector(up, ny * th * depth);
  }

  function makeLayers(item, section, hasUrl) {
    const geo = planeGeo(SW, SH);
    const layout = layoutScreen(item, section, hasUrl);
    const layers = [];
    const border = new THREE.Mesh(geo, borderMaterial());
    border.userData.z = LZ.border; border.position.z = LZ.border; border.renderOrder = 4;
    layers.push(border);
    for (const name of ['head', 'body', 'tech', 'btn']) {
      const cv = drawLayer(layout, name); if (!cv) continue;
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, depthTest: false, toneMapped: false }));
      m.userData.z = LZ[name]; m.position.z = LZ[name] + 0.03; m.renderOrder = 5; m.material.color.setScalar(0.9);
      layers.push(m);
    }
    return { layers, button: layout.button, fit: { scale: layout.scale, bottom: layout.bottom } };
  }

  function setLayerOpacity(m, o, k) {
    m.material.opacity = o; m.position.z = m.userData.z + (1 - k) * 0.03;
  }

  // Klon başlangıcı: entry türüne göre
  function spawn(entry) {
    const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    if (entry.kind === 'skill') {
      skills.localToWorld(p.copy(skills.userData.center)); s.setScalar(0.3); q.identity();
    } else if (entry.kind === 'exp' || entry.kind === 'edu') {
      entry.group.updateWorldMatrix(true, false);
      entry.group.getWorldPosition(p);
      if (entry.kind === 'exp') { p.y += 0.25; s.setScalar(0.12); q.identity(); }
      else { entry.group.getWorldQuaternion(q); s.setScalar(0.45); p.addScaledVector(new THREE.Vector3(0, 0, 1).applyQuaternion(q), 0.05); }
    } else {
      entry.group.updateWorldMatrix(true, false);
      entry.group.matrixWorld.decompose(p, q, s);
    }
    return { p, q, s: s.x };
  }

  async function open(entry, fr, aspect) {
    if (cur) await close();
    const c = { entry, tl: [], clone: null, layers: [], idle: false, open: null };
    cur = c;
    dimOthers(entry, true);
    skills.userData.setHidden(true); // büyük ekran boyunca beceri takımyıldızı solar (250 ms)

    // Varyant ön efektleri
    let delay = 0;
    if (entry.kind === 'exp') {
      const pulse = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8), new THREE.MeshBasicMaterial({ color: CYAN.clone().multiplyScalar(3), toneMapped: false }));
      const from = entry.stripStart, to = entry.ball.getWorldPosition(new THREE.Vector3()); to.y = 0.03;
      scene.add(pulse); c.pulse = pulse;
      tween(0.5, (k) => { pulse.position.lerpVectors(from, to, k); }, { ease: easeInOutCubic }).then(() => { scene.remove(pulse); pulse.geometry.dispose(); pulse.material.dispose(); });
      delay = 0.45;
    } else if (entry.kind === 'edu') {
      const door = makeDoor(); entry.frame.parent.add(door); door.position.set(0, entry.frame.position.y, 0.05); c.door = door;
      tween(0.55, (k) => { door.material.uniforms.uOpen.value = k; door.material.uniforms.uA.value = 1; }, { ease: easeOutCubic });
      tween(0.4, (k) => { door.material.uniforms.uA.value = 1 - k; }, { delay: 0.6 });
      delay = 0.45;
    }

    const sp = spawn(entry);
    // Yerleşim: ekran kadrajın ~%62'sini kaplar, ortanın biraz sağında; avatar solda. Ekran görüntü düzlemine paralel (çarpıtma yok).
    const th = Math.tan(THREE.MathUtils.degToRad(fr.fov) / 2), depth = fr.dist * 0.9;
    const visW = 2 * depth * th * aspect, visH = 2 * depth * th;
    let wWorld = FRAC_W * visW;
    if (wWorld / (SW / SH) > MAX_H * visH) wWorld = MAX_H * visH * (SW / SH);
    const f = wWorld / visW;                      // ekranın kadraj genişlik oranı (NDC yarı genişlik)
    const nx = Math.min(CENTER_NX, 0.94 - f);
    const endScale = wWorld / SW;
    const ep = framePoint(fr, aspect, nx, CENTER_NY, depth);
    c.endScale = endScale;
    const fwdV = fr.look.clone().sub(fr.pos).normalize();
    tmp.position.copy(ep); tmp.lookAt(ep.clone().sub(fwdV));
    const eq = tmp.quaternion.clone();
    const ct = createScreen(entry.item, entry.index ?? 0, { blank: true }); // yüz boş: içerik yalnızca katmanlardan
    // Şeffaf + yüksek renderOrder: ekranın önüne hiçbir sprite/etiket/toz çizilmez (onlar renderOrder 0, önce çizilir)
    // depthTest kapalı: ekran, sahnedeki daha yakın nesneler (eğitim çerçevesi, toplar, yay ekranları) tarafından kesilmesin
    for (const m of [ct.frame, ct.screen]) { m.material.transparent = true; m.material.depthTest = false; m.renderOrder = 3; }
    // Uçuşun başında özgün yüzün solması (anî değişim olmasın)
    const faceMesh = new THREE.Mesh(planeGeo(SW, SH), new THREE.MeshBasicMaterial({ map: faceTexture(entry.item, entry.index ?? 0), transparent: true, depthWrite: false, depthTest: false, toneMapped: false }));
    faceMesh.position.z = 0.03; faceMesh.renderOrder = 4; ct.group.add(faceMesh);
    tween(0.35, (k) => { faceMesh.material.opacity = 1 - k; }, { delay: delay + 0.05 }).then(() => { ct.group.remove(faceMesh); faceMesh.material.dispose(); });
    ct.group.position.copy(sp.p); ct.group.quaternion.copy(sp.q); ct.group.scale.setScalar(sp.s);
    scene.add(ct.group);
    c.clone = ct; c.sp = sp; c.ep = ep; c.eq = eq;
    const mk = makeLayers(entry.item, entry.section, !!entry.item.url);
    c.layers = mk.layers; c.button = mk.button; c.fit = mk.fit;
    c.layers.forEach((m) => { m.visible = true; ct.group.add(m); });
    c.layers[0].material.uniforms.uProg.value = 0;
    dust.userData.attract(ep, 1.5);

    const spin = new THREE.Quaternion();
    const place = (k, rev) => {
      const e = easeOutCubic(k);
      ct.group.position.lerpVectors(sp.p, ep, e).y += Math.sin(Math.PI * k) * 0.45;
      ct.group.quaternion.slerpQuaternions(sp.q, eq, e).multiply(spin.setFromAxisAngle(Y, Math.PI * 2 * easeInOutCubic(k) * (rev ? -1 : 1)));
      ct.group.scale.setScalar(lerp(sp.s, endScale, easeOutBack(k)));
    };
    c.place = place;
    const fly = tween(FLY, (k) => place(k, false), { delay });
    // Katmanlar: uçuşun sonuna doğru 120 ms arayla
    const L0 = delay + 0.7;
    const [border, ...rest] = c.layers;
    const u = border.material.uniforms;
    tween(0.6, (k) => { u.uProg.value = k; }, { delay: L0, ease: easeInOutCubic });
    tween(0.4, (k) => { u.uFill.value = 0.93 * k; ct.mat.emissiveIntensity = lerp(1.15, 0.08, k); }, { delay: L0 + 0.15 });
    const ends = rest.map((m, i) => tween(0.26, (k) => { setLayerOpacity(m, k, easeOutCubic(k)); }, { delay: L0 + 0.11 * (i + 1) }));
    c.open = Promise.all([fly, ...ends]);
    await c.open;
    c.idle = true;
  }

  function makeDoor() {
    return new THREE.Mesh(planeGeo(0.95, 1.55), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending,
      uniforms: { uOpen: { value: 0 }, uA: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `varying vec2 vUv; uniform float uOpen, uA;
        void main(){ float dx = abs(vUv.x - 0.5) * 2.0; float m = smoothstep(uOpen, uOpen - 0.25, dx);
          float v = 1.0 - abs(vUv.y - 0.5) * 0.9; gl_FragColor = vec4(vec3(0.3, 0.95, 1.0) * 2.2 * m * v * uA, m * uA); }`,
    }));
  }

  function dimOthers(entry, on) {
    for (const e of getEntries()) e.dimT = on ? (e === entry ? (entry.kind === 'skill' ? 1 : 0.12) : 0.35) : 1;
    lightT = on ? 0.45 : 1; // spec %35; avatar tamamen kararmasın diye ışık 0.45
  }

  async function close() {
    const c = cur; if (!c) return;
    cur = null;
    if (c.open) await c.open;
    c.idle = false;
    // Ters sıra: düğme, teknolojiler, özet, başlık, çerçeve; sonra klon yerine uçar
    const rest = c.layers.slice(1).reverse();
    const outs = rest.map((m, i) => tween(0.18, (k) => setLayerOpacity(m, 1 - k, 1 - k), { delay: 0.1 * i }));
    const u = c.layers[0].material.uniforms;
    const bd = 0.1 * rest.length;
    tween(0.3, (k) => { u.uFill.value = 0.93 * (1 - k); c.clone.mat.emissiveIntensity = lerp(0.08, 1.15, k); }, { delay: bd });
    await tween(0.35, (k) => { u.uProg.value = 1 - k; }, { delay: bd, ease: easeInOutCubic });
    await Promise.all(outs);
    c.layers.forEach((m) => { c.clone.group.remove(m); m.material.map?.dispose(); m.material.dispose(); });
    dimOthers(c.entry, false); // ışık ve ekranlar geri gelir
    skills.userData.setHidden(false); // beceri takımyıldızı geri solar
    // Klon yerine uçar (ters: geri dönerken ters yönde 1 tur)
    const cp = c.clone.group;
    const fp = cp.position.clone(), fq = cp.quaternion.clone(), fs = cp.scale.x;
    const spin = new THREE.Quaternion();
    const fm = new THREE.Mesh(planeGeo(SW, SH), new THREE.MeshBasicMaterial({ map: faceTexture(c.entry.item, c.entry.index ?? 0), transparent: true, opacity: 0, depthWrite: false, depthTest: false, toneMapped: false }));
    fm.position.z = 0.03; fm.renderOrder = 4; cp.add(fm);
    tween(0.4, (k) => { fm.material.opacity = k; }, { delay: 0.25 });
    await tween(0.7, (k) => {
      const e = easeInOutCubic(k);
      cp.position.lerpVectors(fp, c.sp.p, e).y += Math.sin(Math.PI * k) * 0.3;
      cp.quaternion.slerpQuaternions(fq, c.sp.q, e).multiply(spin.setFromAxisAngle(Y, -Math.PI * 2 * e));
      cp.scale.setScalar(lerp(fs, c.sp.s, e));
    });
    scene.remove(cp); fm.material.dispose();
    c.clone.frameMat.dispose(); c.clone.mat.dispose();
    if (c.door) { c.door.parent.remove(c.door); c.door.material.dispose(); }
    dust.userData.attract(null);
  }

  function update(dt, t, mouse) {
    for (let i = tw.length - 1; i >= 0; i--) {
      const a = tw[i]; a.t += dt;
      if (a.t < 0) continue;
      const k = Math.min(1, a.t / a.dur);
      a.fn(a.ease(k));
      if (k >= 1) { tw.splice(i, 1); a.res(); }
    }
    // Sahne etiketleri (bölüm başlıkları, şirket adları) efekt boyunca solar: ekranın/avatarın önüne düşmesin
    labelK += ((cur ? 0 : 1) - labelK) * (1 - Math.exp(-8 * dt));
    for (const o of sprites) o.material.opacity = o.userData.o0 * labelK;
    // Deneyim topları/direkleri (seçili olan hariç) efekt boyunca küçülür: kameranın önüne büyük küre gelmesin
    const shrink = !!cur;
    for (const e of getEntries()) if (e.kind === 'exp') {
      const k = Math.max(0.001, shrink && cur.entry !== e ? labelK : 1);
      e.ball.scale.setScalar(k); e.post.scale.setScalar(k);
    }
    // Sahne ışığı yumuşak kısılır
    lightK += (lightT - lightK) * (1 - Math.exp(-5 * dt));
    room.userData.setDim(lightK);
    // Açık ekran: hafif yüzme + fare parallax'ı (katmanlar farklı z'de olduğundan derinlik hissi)
    if (cur && cur.idle && cur.clone) {
      const g = cur.clone.group;
      g.position.copy(cur.ep); g.position.y += Math.sin(t * 1.2) * 0.025;
      g.quaternion.copy(cur.eq).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-mouse.y * 0.025, Math.sin(t * 0.5) * 0.02 + mouse.x * 0.035, 0)));
    }
  }

  // "Projeyi aç" düğmesinin 4 köşesi (dünya); yalnız ekran tamamen açıkken (idle). HTML <a> bunun ekran izdüşümüne oturur.
  function linkQuad() {
    if (!cur || !cur.idle || !cur.clone || !cur.button) return null;
    const g = cur.clone.group, b = cur.button, z = LZ.btn;
    g.updateMatrixWorld(true);
    const P = (px, py) => new THREE.Vector3((px / CW - 0.5) * SW, (0.5 - py / CH) * SH, z).applyMatrix4(g.matrixWorld);
    return [P(b.x, b.y), P(b.x + b.w, b.y), P(b.x + b.w, b.y + b.h), P(b.x, b.y + b.h)];
  }
  // İşaret hedefi: klonun SOL kenarının ortası (ekran avatara göre kameraya daha yakın; elin ekranın arkasında kalmaması için kenara işaret edilir)
  function pointTarget() {
    if (!cur || !cur.clone) return null;
    const g = cur.clone.group;
    return g.position.clone().addScaledVector(new THREE.Vector3(1, 0, 0).applyQuaternion(g.quaternion), -g.scale.x * SW * 0.5);
  }
  // Büyük ekranın 4 köşesi (dünya): dışına tıklama = kapat
  function screenQuad() {
    if (!cur || !cur.clone) return null;
    const g = cur.clone.group; g.updateMatrixWorld(true);
    const P = (sx, sy) => new THREE.Vector3(sx * SW / 2, sy * SH / 2, 0.03).applyMatrix4(g.matrixWorld);
    return [P(-1, 1), P(1, 1), P(1, -1), P(-1, -1)];
  }

  return { open, close, update, linkQuad, screenQuad, pointTarget, cloneCenter: () => (cur && cur.clone ? cur.clone.group.position : null), get active() { return cur; } };
}
