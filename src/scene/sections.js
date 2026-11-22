import * as THREE from 'three';
import { getSection } from '../content.js';
import { VURGU, createScreen, makeEntry, bindPick, labelSprite, wrap, planeGeo } from './screens.js';

const CYAN = new THREE.Color(VURGU);

function emissiveMat(intensity = 1.2) {
  return new THREE.MeshStandardMaterial({ color: 0x0a1218, emissive: CYAN, emissiveIntensity: intensity, roughness: 0.5 });
}

// Eğitim şeridi dokusu: koyu zemin, vurgu çizgisi, başlık (content'ten). Ana görünümde uzaktan okunsun diye büyük punto:
// başlık virgülden bölünür; ilk parça (program) büyük, ikinci parça (kurum) altında küçük. Sığmazsa punto küçülür.
function fitLines(g, text, maxW, font0, minFont, maxLines, weight) {
  for (let f = font0; f >= minFont; f -= 4) {
    g.font = `${weight} ${f}px Inter, system-ui, sans-serif`;
    const words = text.split(' '), lines = []; let line = '';
    for (const w of words) { const t = line ? line + ' ' + w : w; if (g.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; }
    if (line) lines.push(line);
    if (lines.length <= maxLines && lines.every((l) => g.measureText(l).width <= maxW)) return { f, lines };
  }
  g.font = `${weight} ${minFont}px Inter, system-ui, sans-serif`;
  return { f: minFont, lines: [text] };
}
function stripTexture(item) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 524;
  const g = c.getContext('2d');
  g.fillStyle = '#121826'; g.fillRect(0, 0, 1024, 524);
  g.fillStyle = VURGU; g.fillRect(48, 44, 120, 10);
  const i = item.title.indexOf(',');
  const main = i > 0 ? item.title.slice(0, i).trim() : item.title, sub = i > 0 ? item.title.slice(i + 1).trim() : '';
  g.textBaseline = 'alphabetic';
  const a = fitLines(g, main, 930, 112, 56, 2, 700);
  let y = 150 + a.f * 0.55;
  g.fillStyle = '#f7f9fc'; g.font = `700 ${a.f}px Inter, system-ui, sans-serif`;
  for (const l of a.lines) { g.fillText(l, 48, y); y += a.f * 1.08; }
  if (sub) {
    const b = fitLines(g, sub, 930, 72, 40, 2, 500);
    y += 14; g.fillStyle = '#b4bccc'; g.font = `500 ${b.f}px Inter, system-ui, sans-serif`;
    for (const l of b.lines) { g.fillText(l, 48, y); y += b.f * 1.15; }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
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
  const SY0 = 1.6, SY1 = 3.4, SZ = -3.6;   // deneyim şeridi: derinlik yerine yanlamasına (etiketler üst üste binmesin), eğitim çerçevesinin arkasında
  const lineMat = new THREE.MeshBasicMaterial({ color: CYAN.clone().multiplyScalar(1.4), toneMapped: false });
  const line = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.012, 0.04), lineMat);
  line.position.set((SY0 + SY1) / 2, 0.02, SZ);
  root.add(line);
  const sphereGeo = new THREE.SphereGeometry(0.17, 20, 14);
  const postGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.55, 8);
  const xsPos = [SY0, (SY0 + SY1) / 2, SY1];
  xs.items.forEach((item, i) => {
    const SX = xsPos[i] ?? SY0 + i, z = SZ;
    const mat = emissiveMat(1.3);
    const post = new THREE.Mesh(postGeo, mat); post.position.set(SX, 0.28, z);
    const ball = new THREE.Mesh(sphereGeo, mat); ball.position.set(SX, 0.7, z);
    const company = item.title.includes(',') ? item.title.split(',').pop().trim() : item.title;
    const label = labelSprite(company, { w: 0.85 }); label.position.set(SX, 1.05, z);
    root.add(post, ball, label);
    const { dir, stand } = standFor(SX, z, 1.5);
    const e = makeEntry({
      kind: 'exp', id: item.id, item, section: xs, group: ball, standPoint: stand, dir, index: i,
      stripStart: new THREE.Vector3(SY0 - 0.6, 0.03, SZ), post, ball,
      mats: [{ mat, base: 1.3, hov: 1.6 }],
    });
    bindPick(e, ball, label);
    entries.push(e);
  });
  const xCap = labelSprite(xs.title, { w: 0.9, color: VURGU, opacity: 0.8 });
  xCap.position.set((SY0 + SY1) / 2, 1.5, SZ); root.add(xCap);

  // --- Eğitim: tek dikey çerçeve içinde 3 yatay şerit (her biri bir madde) + altında dil plakası ---
  const es = getSection('egitim');
  const FX = 3.7, FZ = -1.9, FY = 1.35, ES = 0.95; // ana görünümde avatarın sağ-önü: yay ekranlarının ve deneyim şeridinin ekran-uzayı dışında, alt kenar ~1.05 m
  const eduG = new THREE.Group();
  eduG.position.set(FX, 0, FZ);
  eduG.lookAt(0, 0, 4.5);
  eduG.scale.setScalar(ES);
  root.add(eduG);
  const frameMat = emissiveMat(0.7);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.6, 0.03), frameMat);
  frame.position.set(0, FY, 0);
  eduG.add(frame);
  const { dir: eDir, stand: eStand } = standFor(FX, FZ, 2.2);
  const stripGeo = planeGeo(0.9, 0.46);
  const eduEntries = [];
  es.items.forEach((item, i) => {
    const mat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: stripTexture(item), emissiveIntensity: 1.1 });
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
  eCap.position.set(0, 0.075, 0.01); eduG.add(eCap);

  // Dil bilgisi: çerçevenin altında küçük plaka
  const ds = getSection('diller');
  const dItem = ds.items[0];
  const dl = createScreen(dItem, 0);
  dl.group.scale.setScalar(0.5);
  dl.group.position.set(0, 0.32, 0.01);
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
