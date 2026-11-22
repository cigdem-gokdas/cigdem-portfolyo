import * as THREE from 'three';
import { getSection } from '../content.js';
import { VURGU, createScreen, makeEntry, bindPick, labelSprite, wrap, planeGeo } from './screens.js';

const CYAN = new THREE.Color(VURGU);

function emissiveMat(intensity = 1.2) {
  return new THREE.MeshStandardMaterial({ color: 0x0a1218, emissive: CYAN, emissiveIntensity: intensity, roughness: 0.5 });
}

// Eğitim şeridi dokusu: koyu zemin, vurgu çizgisi, başlık (content'ten)
function stripTexture(item, i) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 524;
  const g = c.getContext('2d');
  g.fillStyle = '#121826'; g.fillRect(0, 0, 1024, 524);
  g.fillStyle = VURGU; g.fillRect(48, 56, 96, 8);
  g.font = '600 34px Inter, system-ui, sans-serif';
  g.fillText(String(i + 1).padStart(2, '0'), 48, 120);
  g.fillStyle = '#f7f9fc'; g.font = '600 58px Inter, system-ui, sans-serif';
  wrap(g, item.title, 48, 210, 930, 72, 4);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

// Hackathon plakaları (sol), deneyim şeridi (sağ yan), eğitim çerçevesi + dil plakası (arka-yan).
// Hepsi aynı entry sözleşmesi: { kind, item, section, group, standPoint, dir, mats, meshes }.
export function createSections() {
  const root = new THREE.Group();
  const entries = [];

  // standPoint: hedef noktaya (xz) merkezden bakıp avatarın duracağı yer
  const standFor = (x, z, back) => {
    const r = Math.hypot(x, z), dir = new THREE.Vector3(x / r, 0, z / r);
    return { dir, stand: dir.clone().multiplyScalar(Math.min(2.6, Math.max(1.6, r - back))) }; // merkeze yakın: yürüme ~2.5 s içinde biter
  };

  // --- Hackathon plakaları: sol, ekranlarla aynı stil, daha küçük, kameraya dönük ---
  const hs = getSection('hackathonlar');
  hs.items.forEach((item, i) => {
    const s = createScreen(item, i);
    s.group.scale.setScalar(0.8);
    s.group.position.set(-4.1, 1.75 - i * 0.95, -1.8);
    s.group.lookAt(0, 1.6, 4.5);
    root.add(s.group);
    const { dir, stand } = standFor(-4.1, -1.8, 1.9);
    const e = makeEntry({
      kind: 'hack', id: item.id, item, section: hs, group: s.group, standPoint: stand, dir,
      mats: [{ mat: s.mat, base: 1.15, hov: 0.9 }, { mat: s.frameMat, base: 0.7, hov: 1.6 }],
    });
    bindPick(e, s.screen, s.frame);
    entries.push(e);
  });
  const hCap = labelSprite(hs.title, { w: 0.9, color: VURGU, opacity: 0.8 });
  hCap.position.set(-4.1, 2.5, -1.8); root.add(hCap);

  // --- Deneyim şeridi: sağ yanda zemine uzanan ışık çizgisi + 3 nokta + küçük etiket ---
  const xs = getSection('deneyim');
  const SX = 3.3;
  const lineMat = new THREE.MeshBasicMaterial({ color: CYAN.clone().multiplyScalar(1.4), toneMapped: false });
  const line = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.012, 3.8), lineMat);
  line.position.set(SX, 0.02, -1.7);
  root.add(line);
  const sphereGeo = new THREE.SphereGeometry(0.17, 20, 14);
  const postGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.55, 8);
  const zs = [-0.7, -1.8, -2.9];
  xs.items.forEach((item, i) => {
    const z = zs[i] ?? -0.7 - i * 1.1;
    const mat = emissiveMat(1.3);
    const post = new THREE.Mesh(postGeo, mat); post.position.set(SX, 0.28, z);
    const ball = new THREE.Mesh(sphereGeo, mat); ball.position.set(SX, 0.7, z);
    const company = item.title.includes(',') ? item.title.split(',').pop().trim() : item.title;
    const label = labelSprite(company, { w: 0.85 }); label.position.set(SX, 1.05, z);
    root.add(post, ball, label);
    const { dir, stand } = standFor(SX, z, 1.5);
    const e = makeEntry({
      kind: 'exp', id: item.id, item, section: xs, group: ball, standPoint: stand, dir, index: i,
      stripStart: new THREE.Vector3(SX, 0.03, 0.15), post, ball,
      mats: [{ mat, base: 1.3, hov: 1.6 }],
    });
    bindPick(e, ball, label);
    entries.push(e);
  });
  const xCap = labelSprite(xs.title, { w: 0.9, color: VURGU, opacity: 0.8 });
  xCap.position.set(SX, 1.5, -1.8); root.add(xCap);

  // --- Eğitim: tek dikey çerçeve içinde 3 yatay şerit (her biri bir madde) + altında dil plakası ---
  const es = getSection('egitim');
  const FX = 3.7, FZ = -6.0, FY = 1.08; // sağ duvara yakın kendi boşluğu: yaydan ve deneyim şeridinden ayrı
  const eduG = new THREE.Group();
  eduG.position.set(FX, 0, FZ);
  eduG.lookAt(0, 0, 4.5);
  eduG.scale.setScalar(0.72);
  root.add(eduG);
  const frameMat = emissiveMat(0.7);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.6, 0.03), frameMat);
  frame.position.set(0, FY, 0);
  eduG.add(frame);
  const { dir: eDir, stand: eStand } = standFor(FX, FZ, 2.8);
  const stripGeo = planeGeo(0.9, 0.46);
  const eduEntries = [];
  es.items.forEach((item, i) => {
    const mat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: stripTexture(item, i), emissiveIntensity: 1.1 });
    const m = new THREE.Mesh(stripGeo, mat);
    m.position.set(0, FY + 0.52 - i * 0.52, 0.02);
    eduG.add(m);
    const e = makeEntry({
      kind: 'edu', id: item.id, item, section: es, group: m, standPoint: eStand, dir: eDir, index: i, frameGroup: eduG, frame,
      mats: [{ mat, base: 1.1, hov: 0.9 }, { mat: frameMat, base: 0.7, hov: 0.9 }],
    });
    bindPick(e, m);
    eduEntries.push(e); entries.push(e);
  });
  bindPick(eduEntries[0], frame); // çerçeve kenarı: ilk maddeyi açar
  const eCap = labelSprite(es.title, { w: 0.9, color: VURGU, opacity: 0.8 });
  eCap.position.set(0, FY + 1.05, 0); eduG.add(eCap);

  // Dil bilgisi: çerçevenin altında küçük plaka
  const ds = getSection('diller');
  const dItem = ds.items[0];
  const dl = createScreen(dItem, 0);
  dl.group.scale.setScalar(0.5);
  dl.group.position.set(0, 0.1, 0.01);
  eduG.add(dl.group);
  const le = makeEntry({
    kind: 'lang', id: dItem.id, item: dItem, section: ds, group: dl.group, standPoint: eStand, dir: eDir, frameGroup: eduG,
    mats: [{ mat: dl.mat, base: 1.15, hov: 0.9 }, { mat: dl.frameMat, base: 0.7, hov: 1.6 }],
  });
  bindPick(le, dl.screen, dl.frame);
  entries.push(le);

  eduG.updateMatrixWorld(true);
  return { root, entries };
}
