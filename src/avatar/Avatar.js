import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const clamp = THREE.MathUtils.clamp;
const damp = (v, t, k, dt) => v + (t - v) * (1 - Math.exp(-k * dt));
const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const sm = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const AX = new THREE.Vector3(1, 0, 0);
const qAxis = (axis, a) => new THREE.Quaternion().setFromAxisAngle(axis, a);

const VMAX = 1.8;       // m/s
const CADENCE = 1.9;    // adım/s (tam hızda); adım uzunluğu = hız / kadans (~0.95 m), kadans hızla ölçeklenir
const TURN_MS = 300;    // yürüme öncesi / sonrası dönüş süresi
const WAVE_HOLD = 0.75; // sallama süresi (3 salınım); toplam ~1.75 s
const FINGERS = ['Index', 'Middle', 'Ring', 'Pinky'];

// Hiyerarşi sırası: ebeveynler önce uygulanır
const ORDER = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head',
  'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'RightUpLeg', 'RightLeg', 'RightFoot',
  'LeftArm', 'LeftForeArm', 'RightArm', 'RightForeArm'];

/**
 * Avatar: sahnenin tek avatar arayüzü.
 * Mevcut GLB: Mixamo iskeleti, morph target YOK. Bu yüzden ağız hareketi yok; konuşma sırasında
 * "konuşuyor" görünümü için baş/boyun hafif ritmik nod yapar (morph yokluğunun yerine geçen yorum).
 *
 * Tüm hareketler update(dt) içinde her karede, kemiğin BAĞ (bind/duruş) pozuna göre DELTA olarak uygulanır:
 * Mixamo bacak kemiklerinde bağ rotasyonu ~180 derece (z≈π) olduğundan mutlak açı yazılmaz; delta avatar-kök
 * uzayında tanımlanır (+X yanal, +Y yukarı, +Z ön) ve _apply ile kemiğin base quaternion'una eklenir.
 * Durum makinesi: idle | walking | pointing | waving.
 *
 * TODO(TH) TalkingHead (yeni GLB: morph + göz kemiği) eşlemesi, docs/NOTLAR.md'ye göre:
 *  - speak(line)    -> head.speakAudio({audio: sessiz AudioBuffer, words, wtimes, wdurations, visemes, vtimes, vdurations},
 *                      null, onsubtitles) (sesli: gerçek AudioBuffer); lipsyncModules: [] ya da HeadAudio akustik viseme
 *                      (head.opt.update kancası). Durdurma: head.stopSpeaking(). Nod kalkar; sessiz konuşma için
 *                      head.setValue('jawOpen', v) (NOTLAR 7.3).
 *  - wave()         -> head.playGesture('👋', 1.6, false, 400); TH'de bilek salınımı yok, opt.update içinde delta eklenir.
 *  - point(target)  -> head.playGesture('index', dur, true /* sağ el *\/, 500); hedefe yönlendirme head.ikSolve(...) ya da
 *                      bu dosyadaki _applyRightArm (opt.update içinde).
 *  - lookAtPoint(v) -> head.speakTo = v (dünya konumu) ya da head.lookAt(x, y, t) (ekran pikseli) / head.lookAtCamera(t).
 *  - faceTowards/walkTo/home -> TH'de yürüme yok: head.armature.position (x,z) ve rotation.y güvenli (NOTLAR 5);
 *                      bacak/kol deltaları head.opt.update(dt) kancasında (HeadAudio ile tek fonksiyon). playAnimation çağrılmaz.
 */
export class Avatar {
  constructor({ subtitle } = {}) {
    this.root = new THREE.Group();   // sahneye eklenen kök; yönü (+Z ön) burada döner
    this.subtitle = subtitle;
    this.bones = {};
    this.base = {};                  // kemiklerin bağ pozu (kol duruşu sonrası) yerel quaternion'ları
    this.lookTarget = null;          // THREE.Vector3 | null
    this.idleTarget = new THREE.Vector3(0, 1.6, 6); // null iken bakılan nokta (main kamerayı verir)
    this.homePos = new THREE.Vector3(0, 0, 0);
    this.baseYaw = 0;
    this.bodyYaw = 0; this.headYaw = 0; this.headPitch = 0;
    this.t = 0;
    this.state = 'idle';             // idle | walking | pointing | waving
    this.userInteracted = false;     // ilk tıklamaya kadar ses denenmez
    this.gaitPhase = 0; this.gaitAmp = 0;
    this.armW = 0;                   // sağ kol geçersiz kılma ağırlığı (0..1)
    this.fingerW = 0;
    this._walk = null; this._act = null; this._turn = null;
    this.speaking = false; this.nodAmp = 0; this._speakId = 0; this._idleW = []; this._audio = null; this._sleep = null;
    this.side = { Left: 1, Right: -1 };
    this.curlAxis = {};
    addEventListener('pointerdown', () => { this.userInteracted = true; }, { once: true });
  }

  async load(url, onProgress) {
    const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(url, (e) => e.total && onProgress?.(e.loaded / e.total));
    const model = gltf.scene;
    // Boyu 1.7 m'ye ölçekle, ayakları yere oturt
    const box = new THREE.Box3().setFromObject(model);
    const s = 1.7 / (box.max.y - box.min.y);
    model.scale.setScalar(s);
    model.position.y = -box.min.y * s;
    model.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
        // Kök neden (göğüs parlaması): GLB malzemeleri metalness 1 / roughness 1; ortam haritası yok, tek spot ışığın
        // speküleri dekolte/göğüs bölgesinde keskin beyaz bir nokta üretiyor ve bloom onu büyütüyordu. Zorla mat yap.
        for (const m of [].concat(o.material)) {
          if (m && m.isMeshStandardMaterial) { m.metalness = 0; m.roughness = Math.max(m.roughness, 0.7); m.envMapIntensity = 0; }
        }
      }
      if (o.isBone) this.bones[o.name] = o;
    });
    this.root.add(model);
    this.model = model;
    this.scale = s;
    this.root.updateMatrixWorld(true);
    // Yanlılık işareti (kök uzayında x): Left +, Right -
    for (const sd of ['Left', 'Right']) {
      const a = this.bones[sd + 'Arm'];
      if (a) this.side[sd] = Math.sign(this.root.worldToLocal(a.getWorldPosition(new THREE.Vector3())).x) || this.side[sd];
    }
    this._poseArms();
    this.model.updateMatrixWorld(true);
    for (const k of Object.keys(this.bones)) this.base[k] = this.bones[k].quaternion.clone();
    this.hipsY = this.bones.Hips ? this.bones.Hips.position.y : 0;
    this._computeCurlAxes();

    // Tıklama kutusu: avatar gövdesi (SkinnedMesh'i CPU'da raycast etmemek için görünmez kutu)
    const hit = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.8, 0.5), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.y = 0.9;
    hit.userData.pick = { kind: 'avatar' };
    this.root.add(hit);
    this.hitbox = hit;
  }

  // A-pozdan doğal duruş: kol ve ön kolları dünya uzayında aşağı çevirir (eksen bağımsız).
  _poseArms() {
    for (const side of ['Left', 'Right']) {
      this._aim(this.bones[side + 'Arm'], this.bones[side + 'ForeArm'], 0.10, 0.0);
      this._aim(this.bones[side + 'ForeArm'], this.bones[side + 'Hand'], 0.05, 0.12);
    }
  }

  _aim(bone, child, out, fwd) {
    if (!bone || !child) return;
    bone.updateWorldMatrix(true, true);
    const p = new THREE.Vector3(), c = new THREE.Vector3();
    bone.getWorldPosition(p); child.getWorldPosition(c);
    const cur = c.sub(p).normalize();
    const sign = Math.sign(cur.x) || 1;
    this._rotateToward(bone, cur, new THREE.Vector3(sign * out, -1, fwd).normalize(), 1);
  }

  // bone'u dünya uzayında cur yönünden dir yönüne w oranında döndürür
  _rotateToward(bone, cur, dir, w) {
    const delta = new THREE.Quaternion().setFromUnitVectors(cur, dir);
    if (w < 1) delta.slerp(new THREE.Quaternion(), 1 - w);
    const parentQ = bone.parent.getWorldQuaternion(new THREE.Quaternion());
    const worldQ = bone.getWorldQuaternion(new THREE.Quaternion()).premultiply(delta);
    bone.quaternion.copy(parentQ.invert().multiply(worldQ));
    bone.updateWorldMatrix(false, true);
  }

  // Parmak kıvırma ekseni: duruş pozunda avuç içi gövdeye bakar; eksen = cross(parmak yönü, avuç normali), kemik yerelinde
  _computeCurlAxes() {
    this.root.updateMatrixWorld(true);
    for (const sd of ['Left', 'Right']) {
      const inward = new THREE.Vector3(-this.side[sd], 0, 0);
      for (const f of FINGERS) for (let i = 1; i <= 3; i++) {
        const b = this.bones[`${sd}Hand${f}${i}`];
        if (!b) continue;
        const next = this.bones[`${sd}Hand${f}${i + 1}`];
        const p = b.getWorldPosition(new THREE.Vector3());
        let d;
        if (next) d = next.getWorldPosition(new THREE.Vector3()).sub(p);
        else d = p.clone().sub(this.bones[`${sd}Hand${f}${i - 1}`].getWorldPosition(new THREE.Vector3()));
        d.normalize();
        const axisW = new THREE.Vector3().crossVectors(d, inward).normalize();
        this.curlAxis[b.name] = axisW.applyQuaternion(b.getWorldQuaternion(new THREE.Quaternion()).invert()).normalize();
      }
    }
  }

  // Kök uzayında tanımlı bir dönüşü kemiğin bağ rotasyonunun üstüne uygular
  _apply(name, qRoot) {
    const b = this.bones[name]; if (!b || !this.base[name]) return;
    b.parent.updateWorldMatrix(true, false);
    const rootQ = this.root.getWorldQuaternion(new THREE.Quaternion());
    const parentQ = b.parent.getWorldQuaternion(new THREE.Quaternion());
    const worldDelta = rootQ.clone().multiply(qRoot).multiply(rootQ.clone().invert());
    b.quaternion.copy(parentQ.clone().invert().multiply(worldDelta).multiply(parentQ).multiply(this.base[name]));
  }

  // ---------- Durum makinesi ----------
  _stepAct(dt) {
    if (this._turn) {
      const tr = this._turn; tr.t += dt;
      this.bodyYaw = tr.from + tr.delta * sm(tr.t / tr.dur);
      if (tr.t >= tr.dur) { this.bodyYaw = tr.from + tr.delta; const r = tr.resolve; this._turn = null; r(); }
    }
    const w = this._walk;
    let speedTarget = 0;
    if (w) {
      if (w.stage === 'turn') {
        w.t += dt; if (w.t >= TURN_MS / 1000 * 0.75) w.stage = 'go';
      } else {
        const pos = this.root.position;
        const dx = w.target.x - pos.x, dz = w.target.z - pos.z;
        const rem = Math.hypot(dx, dz);
        if (rem < 0.02) {
          this._walk = null; this.state = 'idle'; w.resolve();
        } else {
          const sf = Math.max(0.2, sm(Math.min(w.traveled / 0.25, rem / 0.35, 1)));
          const step = Math.min(rem, VMAX * sf * dt);
          pos.x += (dx / rem) * step; pos.z += (dz / rem) * step;
          w.traveled += step;
          this.gaitPhase += Math.PI * CADENCE * (0.6 + 0.4 * sf) * dt; // 2 adım = 2π; kadans hızla ölçeklenir, adım = hız/kadans
          speedTarget = sf;
        }
      }
    }
    this.gaitAmp = damp(this.gaitAmp, speedTarget, 8, dt);

    const a = this._act;
    if (a) {
      a.t += dt;
      if (a.stage === 'up') {
        this.armW = sm(a.t / 0.5); if (a.t >= 0.5) { a.stage = 'hold'; a.t = 0; }
      } else if (a.stage === 'hold') {
        this.armW = 1;
        const done = a.type === 'wave' ? a.t >= WAVE_HOLD : ((a.t >= 1.4 && a.holdDone) || a.t > 14);
        if (done) { a.stage = 'down'; a.t = 0; }
      } else {
        this.armW = 1 - sm(a.t / 0.5);
        if (a.t >= 0.5) {
          this.armW = 0; this._act = null; this.state = 'idle';
          if (a.type === 'point') this.lookTarget = a.prevLook;
          a.resolve();
        }
      }
    } else this.armW = damp(this.armW, 0, 10, dt);
    if (a && a.type === 'point' && a.getT) { const v = a.getT(); if (v) { a.target.copy(v); this.lookTarget = a.target; } }
    this.fingerW = a && a.type === 'point' ? this.armW : damp(this.fingerW, 0, 10, dt);
    if (this.state === 'idle' && this._idleW.length) { const w2 = this._idleW; this._idleW = []; w2.forEach((r) => r()); }
  }

  update(dt) {
    if (!this.model) return;
    this.t += dt;
    this._stepAct(dt);
    const e = (a, b, c) => new THREE.Quaternion().setFromEuler(new THREE.Euler(a, b, c));
    const D = {};
    const add = (n, q) => { D[n] = D[n] ? D[n].multiply(q) : q; };

    // Bakış hedefi: dünya uzayında yaw/pitch
    const walking = !!this._walk && this._walk.stage === 'go';
    let target = this.lookTarget || this.idleTarget;
    const headPos = this.bones.Head ? this.bones.Head.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(0, 1.6, 0);
    if (walking && !this.lookTarget) {
      target = headPos.clone().add(new THREE.Vector3(Math.sin(this.baseYaw) * 3, 0, Math.cos(this.baseYaw) * 3));
    }
    const d = target.clone().sub(headPos);
    const worldYaw = Math.atan2(d.x, d.z);
    const pitch = Math.atan2(d.y, Math.hypot(d.x, d.z));

    if (!this._turn) {
      // Boştayken gövde hedefe en fazla %20 döner, kalanı boyun+baş üstlenir
      const inf = (this._walk || this._act) ? 0 : 0.2;
      const bodyT = this.baseYaw + clamp(wrapA(worldYaw - this.baseYaw) * inf, -0.5, 0.5);
      this.bodyYaw += wrapA(bodyT - this.bodyYaw) * (1 - Math.exp(-2.5 * dt));
    }
    this.root.rotation.y = this.bodyYaw;
    const relYaw = clamp(wrapA(worldYaw - this.bodyYaw), -1.0, 1.0);
    this.headYaw = damp(this.headYaw, relYaw, 5, dt);
    this.headPitch = damp(this.headPitch, clamp(pitch, -0.35, 0.35), 5, dt);

    // Nefes
    const br = Math.sin(this.t * 1.6) * 0.012;
    add('Spine', e(br, 0, 0)); add('Spine1', e(br * 0.8, 0, 0)); add('Spine2', e(br * 0.6, 0, 0));

    // Konuşma: baş hafif ritmik nod (morph yok)
    this.nodAmp = damp(this.nodAmp, this.speaking ? 1 : 0, 6, dt);
    const nod = this.nodAmp * (Math.sin(this.t * 2 * Math.PI * 2.7) * 0.035 + Math.sin(this.t * 2 * Math.PI * 1.1) * 0.02);
    const nodYaw = this.nodAmp * Math.sin(this.t * 2 * Math.PI * 0.8) * 0.03;
    add('Neck', e(-this.headPitch * 0.4 + nod * 0.4, this.headYaw * 0.4 + nodYaw * 0.4, 0));
    add('Head', e(-this.headPitch * 0.6 + nod * 0.6, this.headYaw * 0.6 + nodYaw * 0.6, 0));

    // Yürüyüş: kalça salınımı, bacaklar, karşı kol salınımı, hafif dikey bob
    const A = this.gaitAmp;
    let bob = 0;
    if (A > 0.004) {
      const p = this.gaitPhase;
      const legs = { Right: p, Left: p + Math.PI };
      for (const sd of ['Right', 'Left']) {
        const ph = legs[sd];
        const th = 0.5 * A * Math.sin(ph);                          // kalça ileri açısı
        const flex = A * (0.12 + 0.7 * Math.max(0, Math.cos(ph)));  // diz bükülmesi
        add(sd + 'UpLeg', qAxis(AX, -th));
        add(sd + 'Leg', qAxis(AX, flex));
        add(sd + 'Foot', qAxis(AX, (th - flex) * 0.7));
      }
      add('Hips', e(0, 0.07 * A * Math.sin(p), 0.03 * A * Math.cos(p)));
      add('Spine1', e(0, -0.05 * A * Math.sin(p), 0));
      bob = 0.02 * A * Math.cos(2 * p);
      const fwdR = -0.3 * A * Math.sin(p), fwdL = 0.3 * A * Math.sin(p);
      if (this.armW < 0.01) {
        add('RightArm', qAxis(AX, -fwdR)); add('RightForeArm', qAxis(AX, -(0.15 * A + 0.35 * Math.max(0, fwdR))));
      }
      add('LeftArm', qAxis(AX, -fwdL)); add('LeftForeArm', qAxis(AX, -(0.15 * A + 0.35 * Math.max(0, fwdL))));
    }
    if (this.bones.Hips) this.bones.Hips.position.y = this.hipsY + bob / this.scale;

    for (const n of ORDER) if (D[n] || this.base[n]) this._apply(n, D[n] || new THREE.Quaternion());

    if (this.armW > 0.001 || this.fingerW > 0.001) this._applyRightArm();
  }

  // Sağ kol: işaret (hedefe) ya da el sallama; parmaklar
  _applyRightArm() {
    const B = this.bones;
    const arm = B.RightArm, fore = B.RightForeArm, hand = B.RightHand;
    if (!arm || !fore || !hand) return;
    const a = this._act;
    this.model.updateMatrixWorld(true);
    if (a && this.armW > 0.001) {
      const rootQ = this.root.getWorldQuaternion(new THREE.Quaternion());
      const pa = arm.getWorldPosition(new THREE.Vector3());
      let dirArm, dirFore;
      if (a.type === 'point') {
        dirArm = a.target.clone().sub(pa).normalize();
        dirFore = dirArm.clone();
      } else {
        const rs = this.side.Right;
        const tw = a.stage === 'hold' ? a.t : (a.stage === 'up' ? 0 : WAVE_HOLD);
        const osc = Math.sin(tw * (2 * Math.PI * 3) / WAVE_HOLD);
        dirArm = new THREE.Vector3(rs * 0.85, 0.5, 0.2).normalize().applyQuaternion(rootQ);
        dirFore = new THREE.Vector3(rs * 0.1 + osc * 0.55, 1, 0.25 + osc * 0.1).normalize().applyQuaternion(rootQ);
      }
      const w = this.armW;
      const pf = fore.getWorldPosition(new THREE.Vector3());
      this._rotateToward(arm, pf.sub(pa).normalize(), dirArm, w);
      arm.updateWorldMatrix(true, true);
      const pf2 = fore.getWorldPosition(new THREE.Vector3()), ph = hand.getWorldPosition(new THREE.Vector3());
      this._rotateToward(fore, ph.sub(pf2).normalize(), dirFore, w);
    }
    // Parmaklar: işarette işaret parmağı düz, diğerleri kıvrık; el sallamada açık
    const curlW = a && a.type === 'point' ? this.fingerW : 0;
    const amt = [1.2, 1.4, 1.0];
    for (const f of FINGERS) for (let i = 1; i <= 3; i++) {
      const b = B[`RightHand${f}${i}`]; if (!b || !this.curlAxis[b.name]) continue;
      const ang = f === 'Index' ? 0 : amt[i - 1] * curlW;
      b.quaternion.copy(this.base[b.name]).multiply(qAxis(this.curlAxis[b.name], ang));
    }
  }

  lookAtPoint(v) { this.lookTarget = v ? v.clone() : null; }

  // ---------- Dış API ----------
  _turnTo(yaw, ms) {
    return new Promise((resolve) => {
      if (this._turn) this._turn.resolve();
      this.baseYaw = yaw;
      if (Math.abs(wrapA(yaw - this.bodyYaw)) < 0.12) { this.bodyYaw = yaw; resolve(); return; } // zaten dönük
      this._turn = { from: this.bodyYaw, delta: wrapA(yaw - this.bodyYaw), t: 0, dur: ms / 1000, resolve };
    });
  }

  // Gövdeyi (yumuşak, ~400 ms) noktaya çevirir
  faceTowards(v) {
    if (!v) return this._turnTo(0, TURN_MS);
    return this._turnTo(Math.atan2(v.x - this.root.position.x, v.z - this.root.position.z), TURN_MS);
  }

  // Önce hedefe döner (~350 ms), sonra prosedürel yürür (1.8 m/s, ease-in/out), varınca adım yumuşakça sıfırlanır
  async walkTo(target) {
    await this.whenIdle();
    const pos = this.root.position;
    const dx = target.x - pos.x, dz = target.z - pos.z;
    if (Math.hypot(dx, dz) < 0.05) return;
    this.state = 'walking';
    this._turnTo(Math.atan2(dx, dz), TURN_MS);
    return new Promise((resolve) => {
      this._walk = { target: target.clone(), stage: 'turn', t: 0, traveled: 0, resolve };
    });
  }

  whenIdle() {
    return this.state === 'idle' ? Promise.resolve() : new Promise((r) => this._idleW.push(r));
  }

  // Sağ kol hedefe kalkar (~500 ms), tutar (>=1.4 s ya da holdUntil bitene kadar), iner (~500 ms). Baş da hedefe bakar.
  point(target, { holdUntil } = {}) {
    if (this.state !== 'idle') return Promise.resolve();
    this.state = 'pointing';
    return new Promise((resolve) => {
      const getT = typeof target === 'function' ? target : null;
      if (getT) target = getT() || this.root.position;
      const act = { type: 'point', stage: 'up', t: 0, getT, target: target.clone(), holdDone: !holdUntil, prevLook: this.lookTarget, resolve };
      if (holdUntil) Promise.resolve(holdUntil).catch(() => {}).then(() => { act.holdDone = true; });
      this.lookTarget = target.clone();
      this._act = act;
    });
  }

  // Sağ el kalkar, önkol 3 kez salınır (~1.75 s)
  wave() {
    if (this.state !== 'idle') return Promise.resolve();
    this.state = 'waving';
    return new Promise((resolve) => { this._act = { type: 'wave', stage: 'up', t: 0, resolve }; });
  }

  // Merkeze yürü, kameraya dön
  async home() {
    await this.walkTo(this.homePos);
    await this._turnTo(Math.atan2(this.idleTarget.x - this.root.position.x, this.idleTarget.z - this.root.position.z), TURN_MS);
  }

  // Konuşmayı hemen keser (ses + altyazı); bekleyen speak() promise'leri çözülür
  stopSpeak() {
    this._speakId++; this.speaking = false; this.subtitle?.hide();
    if (this._audio) { this._audio.pause(); this._audio.dispatchEvent(new Event('ended')); this._audio = null; }
    if (this._sleep) { clearTimeout(this._sleep.h); this._sleep.r(); this._sleep = null; }
  }

  // Konuş: altyazı + (varsa, ilk tıklamadan sonra) assets/voice/<id>.mp3. Ağız hareketi yok (morph yok);
  // konuşma süresince baş hafif nod yapar. Promise: konuşma bitince çözülür.
  async speak(line) {
    if (!line) return;
    const id = ++this._speakId;
    this.speaking = true;
    this.subtitle?.show(line.text);
    let sure = Math.max(1500, line.text.length * 70);
    if (this.userInteracted) {
      const url = `./assets/voice/${line.id}.mp3`;
      try {
        const head = await fetch(url, { method: 'HEAD' });
        if (head.ok) {
          await new Promise((res) => {
            const a = new Audio(url); this._audio = a;
            a.addEventListener('ended', res); a.addEventListener('error', res);
            a.play().catch(res);
          });
          sure = 0;
        }
      } catch (e) { /* ses yok: süre ile bekle */ }
    }
    if (sure && id === this._speakId) await new Promise((r) => { this._sleep = { r, h: setTimeout(r, sure) }; });
    this._audio = null; this._sleep = null;
    if (id === this._speakId) { this.speaking = false; this.subtitle?.hide(); }
  }
}
