import * as THREE from 'three';

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
const ORDER = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'LeftEye', 'RightEye',
  'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'RightUpLeg', 'RightLeg', 'RightFoot',
  'LeftArm', 'LeftForeArm', 'RightArm', 'RightForeArm'];

/**
 * Avatar: sahnenin tek avatar arayüzü.
 * GLB: Avaturn T2 (Mixamo adlı iskelet, 52 ARKit + 15 Oculus viseme morph, göz kemikleri). TalkingHead avatarOnly modunda
 * çalışır: sahne ve renderer bizim; TalkingHead yalnızca pozu/morphları/göz kırpmayı/nefesi/ifadeyi her karede yazar
 * (head.animate(dt_ms)), bizim prosedürel hareketlerimiz head.opt.update kancasında (poz yazımından sonra, morph ve çizimden önce)
 * kemiklerin O ANKİ quaternion'una kök uzayında DELTA olarak eklenir (docs/NOTLAR.md §5; "F5 entegrasyon").
 * Kök uzayı: +X yanal, +Y yukarı, +Z ön. Durum makinesi: idle | walking | pointing | waving.
 */
export class Avatar {
  constructor({ subtitle, scene, camera } = {}) {
    this.root = new THREE.Group();   // mantıksal kök (konum/yön burada); armature her karede buradan eşlenir
    this.subtitle = subtitle;
    this.scene = scene; this.camera = camera;
    this.bones = {};
    this.lookTarget = null;          // THREE.Vector3 | null
    this.idleTarget = new THREE.Vector3(0, 1.6, 6); // null iken bakılan nokta (main kamerayı verir)
    this.homePos = new THREE.Vector3(0, 0, 0);
    this.baseYaw = 0;
    this.bodyYaw = 0; this.headYaw = 0; this.headPitch = 0; this._relYaw = 0; this._tPitch = 0;
    this.t = 0;
    this.state = 'idle';             // idle | walking | pointing | waving
    this.userInteracted = false;     // ilk tıklamaya kadar ses denenmez
    this.gaitPhase = 0; this.gaitAmp = 0;
    this.armW = 0;                   // sağ kol geçersiz kılma ağırlığı (0..1)
    this.fingerW = 0;
    this._walk = null; this._act = null; this._turn = null;
    this.speaking = false; this._voiced = false; this._mouth = 0; this._speakId = 0; this._idleW = []; this._sleep = null;
    this.side = { Left: 1, Right: -1 };
    this.curlAxis = {};
    this.head = null; this.headaudio = null; this._haOk = false; this._frames = 0; this._eyeBase = {}; this._dtHook = 0.016;
    addEventListener('pointerdown', () => { this.userInteracted = true; }, { once: true });
  }

  async load(url, onProgress) {
    const { TalkingHead } = await import('../vendor/talkinghead/talkinghead.mjs');
    this.head = new TalkingHead(document.createElement('div'), {
      ttsEndpoint: '', lipsyncModules: [],
      avatarOnly: true, avatarOnlyScene: this.scene, avatarOnlyCamera: this.camera,
      update: (dtMs) => this._hook(dtMs),
    });
    const head = this.head;
    // Göz teması/baş hareketi bizim bakış kodumuzda; TalkingHead'in rastgele boşta hareketi kapalı. Göz kırpma/nefes/ifade yerleşik.
    await head.showAvatar({ url, body: 'F', avatarMood: 'neutral', lipsyncLang: 'en', avatarIdleEyeContact: 0, avatarIdleHeadMove: 0 },
      (e) => e.total && onProgress?.(e.loaded / e.total));
    // Boşta rastgele poz değişimi (hip/side/straight) yürüme/işaret deltalarıyla çakışır: neutral ifadesinin 'pose' animasyonunu çıkar,
    // sabit simetrik 'straight' pozunu kur (ifade: göz kırpma, nefes, kaş/ağız mikro hareketleri yerleşik kalır)
    // Göz gezdirme ('eyes') kaldırılır (gözleri bakış kodumuz sürer); boşta baş hareketi ('head'.idle) küçültülür, konuşurkenki kalır.
    const mood = head.animMoods.neutral;
    mood.anims = mood.anims.filter((a) => a.name !== 'pose' && a.name !== 'eyes');
    const hd = mood.anims.find((a) => a.name === 'head');
    if (hd) hd.idle.vs = { bodyRotateX: [[-0.01, 0.03]], bodyRotateY: [[-0.04, 0.04]], bodyRotateZ: [[-0.02, 0.02]] };
    // Gülümseme + çene birleşimi köpek dişlerini öne çıkarıyordu: gülümseme/yanak büzmesi üst sınırı 0.15 (applied değeri sınırlanır)
    for (const k of ['mouthSmile', 'mouthSmileLeft', 'mouthSmileRight', 'cheekSquintLeft', 'cheekSquintRight']) if (head.mtAvatar[k]) head.mtAvatar[k].max = 0.15;
    head.playPose('straight');
    const arm = head.armature;
    this.armature = arm;
    arm.traverse((o) => {
      if (o.isMesh) {
        // Gölge: görünmeyecek küçük mesh'ler (göz/kirpik/diş/dil) gölge haritasına girmez (FPS)
        o.castShadow = !/^(Eye|EyeAO|Eyelash|Teeth|Tongue)_Mesh$/.test(o.name); o.receiveShadow = true; o.frustumCulled = false;
        // Ortam haritası yok; göğüs parlaması metalik/speküler katkıdan geliyordu. Deri/saç/giysi: metalness 0, pürüzlülük dokudan (roughnessMap) ve
        // orijinal faktörden gelir, zorla mat yapılmaz. Göz malzemelerine dokunulmaz (parlaklık istenir).
        if (/^(Eye|EyeAO)_Mesh$/.test(o.name)) { /* göz: olduğu gibi */ } else {
          for (const m of [].concat(o.material)) if (m && m.isMeshStandardMaterial) { m.metalness = 0; m.metalnessMap = null; m.needsUpdate = true; }
        }
      }
      if (o.isBone) this.bones[o.name] = o;
    });
    this._syncArmature();
    // TalkingHead pozu (kollar aşağı) 2 s'lik geçişle kurar: hızlı sar, sonra yanlılık ve parmak eksenlerini hesapla
    head.animate(2500); head.animate(2500); head.animate(50);
    // Boyu 1.7 m'ye ölçekle (sahne ölçüleri, poster kadrajı, tıklama kutusu buna göre). TalkingHead ölçeği yalnızca yüklemede 1'e sabitler.
    arm.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(arm);
    this.scale = 1.7 / (bb.max.y - bb.min.y);
    arm.scale.setScalar(this.scale);
    head.animate(50); head.animate(50);
    this.root.updateMatrixWorld(true); arm.updateMatrixWorld(true);
    for (const sd of ['Left', 'Right']) {
      const a = this.bones[sd + 'Arm'];
      if (a) this.side[sd] = Math.sign(this.root.worldToLocal(a.getWorldPosition(new THREE.Vector3())).x) || this.side[sd];
    }
    this._computeCurlAxes();
    // Göz kemikleri poz şablonunda yok (TalkingHead gözü eyeLook* morphlarıyla yönlendirir, kemiği her karede yazmaz):
    // delta birikmesin diye bağ quaternion'u saklanır, her karede ondan başlanır.
    this._eyeBase = { LeftEye: this.bones.LeftEye.quaternion.clone(), RightEye: this.bones.RightEye.quaternion.clone() };
    await this._setupHeadAudio();

    // Tıklama kutusu: avatar gövdesi (SkinnedMesh'i CPU'da raycast etmemek için görünmez kutu)
    const hit = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.8, 0.5), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.y = 0.9;
    hit.userData.pick = { kind: 'avatar' };
    this.root.add(hit);
    this.hitbox = hit;
  }

  // HeadAudio: ses -> akustik viseme (tester.html:265-302 deseni). Başarısız olursa genel ağız hareketine düşülür.
  async _setupHeadAudio() {
    try {
      const head = this.head, ctx = head.audioCtx;
      const { HeadAudio } = await import('../vendor/headaudio/headaudio.min.mjs');
      await ctx.audioWorklet.addModule(new URL('../vendor/headaudio/headworklet.min.mjs', import.meta.url).href);
      const ha = new HeadAudio(ctx, { visemeMinMs: 120, processorOptions: {}, parameterData: { vadMode: 1 } });
      await ha.loadModel(new URL('../vendor/headaudio/model-en-mixed.bin', import.meta.url).href);
      head.audioSpeechGainNode.connect(ha);
      const delay = new DelayNode(ctx, { delayTime: 0.15 });   // analiz sesten önce bitsin: ses 150 ms gecikmeli çıkar
      head.audioSpeechGainNode.disconnect(head.audioReverbNode);
      head.audioSpeechGainNode.connect(delay);
      delay.connect(head.audioReverbNode);
      ha.onvalue = (key, value) => { const m = head.mtAvatar[key]; if (m) Object.assign(m, { newvalue: value, needsUpdate: true }); };
      this.headaudio = ha; this._haOk = true;
    } catch (e) { console.warn('HeadAudio kurulamadı, genel ağız hareketi kullanılacak', e); }
  }

  // armature (sahnenin doğrudan çocuğu) kök konum/yönünü izler: TalkingHead ayak-kalça dengesi armature.position'ı dünya konumu sayar
  _syncArmature() {
    const a = this.armature; if (!a) return;
    a.position.set(this.root.position.x, 0, this.root.position.z);
    a.rotation.set(0, this.root.rotation.y, 0);
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

  // Kök uzayında tanımlı bir dönüşü kemiğin O ANKİ (TalkingHead'in bu karede yazdığı) quaternion'una ekler
  _apply(name, qRoot) {
    const b = this.bones[name]; if (!b) return;
    b.parent.updateWorldMatrix(true, false);
    const rootQ = this.root.getWorldQuaternion(new THREE.Quaternion());
    const parentQ = b.parent.getWorldQuaternion(new THREE.Quaternion());
    const worldDelta = rootQ.clone().multiply(qRoot).multiply(rootQ.clone().invert());
    b.quaternion.copy(parentQ.clone().invert().multiply(worldDelta).multiply(parentQ).multiply(b.quaternion));
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

  // Her çizim karesinde: durum makinesi + kök/bakış hesapları, sonra TalkingHead'i sür (poz+morph yazar, kancayı çağırır)
  update(dt) {
    if (!this.head || !this.armature) return;
    this.t += dt;
    this._stepAct(dt);
    this._dtHook = dt;

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
      // Boştayken gövde hedefe en fazla %20 döner, kalanı boyun+baş+göz üstlenir
      const inf = (this._walk || this._act) ? 0 : 0.2;
      const bodyT = this.baseYaw + clamp(wrapA(worldYaw - this.baseYaw) * inf, -0.5, 0.5);
      this.bodyYaw += wrapA(bodyT - this.bodyYaw) * (1 - Math.exp(-2.5 * dt));
    }
    this.root.rotation.y = this.bodyYaw;
    this._relYaw = clamp(wrapA(worldYaw - this.bodyYaw), -1.0, 1.0);
    this._tPitch = clamp(pitch, -0.35, 0.35);
    this.headYaw = damp(this.headYaw, this._relYaw, 5, dt);
    this.headPitch = damp(this.headPitch, this._tPitch, 5, dt);
    this._syncArmature();
    this.head.animate(dt * 1000);   // -> _hook(dtMs)
  }

  // head.opt.update kancası: TalkingHead bu karede pozu yazdı, morphlar ve çizim henüz yok. Burada delta + HeadAudio + ağız.
  _hook(dtMs) {
    const dt = Math.min(dtMs / 1000, 0.1);
    this._frames++;
    this.headaudio?.update(dtMs);
    this._mouthStep(dt);
    const e = (a, b, c) => new THREE.Quaternion().setFromEuler(new THREE.Euler(a, b, c));
    const D = {};
    const add = (n, q) => { D[n] = D[n] ? D[n].multiply(q) : q; };

    // Baş+boyun bakışın %70'ini, gözler kalanını (+ gecikmeyi) üstlenir
    add('Neck', e(-this.headPitch * 0.28, this.headYaw * 0.28, 0));
    add('Head', e(-this.headPitch * 0.42, this.headYaw * 0.42, 0));
    const eyeY = clamp(this._relYaw - this.headYaw * 0.7, -0.6, 0.6), eyeP = clamp(this._tPitch - this.headPitch * 0.7, -0.4, 0.4);
    add('LeftEye', e(-eyeP, eyeY, 0)); add('RightEye', e(-eyeP, eyeY, 0));

    // Yürüyüş: kalça salınımı, bacaklar, karşı kol salınımı (Hips.y'ye dokunulmaz: TalkingHead ayak-kalça dengesi, NOTLAR §5)
    const A = this.gaitAmp;
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
      const fwdR = -0.3 * A * Math.sin(p), fwdL = 0.3 * A * Math.sin(p);
      if (this.armW < 0.01) {
        add('RightArm', qAxis(AX, -fwdR)); add('RightForeArm', qAxis(AX, -(0.15 * A + 0.35 * Math.max(0, fwdR))));
      }
      add('LeftArm', qAxis(AX, -fwdL)); add('LeftForeArm', qAxis(AX, -(0.15 * A + 0.35 * Math.max(0, fwdL))));
    }
    for (const n of ORDER) if (D[n]) {
      if (this._eyeBase[n]) this.bones[n].quaternion.copy(this._eyeBase[n]);
      this._apply(n, D[n]);
    }

    if (this.armW > 0.001 || this.fingerW > 0.001) this._applyRightArm();
  }

  // Ağız: sesli konuşmada HeadAudio sürer. Sesiz konuşmada (ya da HeadAudio yoksa) dile bağımsız düşük genlikli yumuşak hareket.
  _mouthStep(dt) {
    const mt = this.head.mtAvatar;
    const on = this.speaking && !(this._voiced && this._haOk);
    const t = this.t;
    const env = 0.5 + 0.5 * Math.sin(t * 2 * Math.PI * 0.9 + 1.3);
    const syl = Math.abs(Math.sin(t * 2 * Math.PI * 2.6) * 0.6 + Math.sin(t * 2 * Math.PI * 4.1 + 0.7) * 0.4);
    const v = on ? syl * (0.45 + 0.55 * env) : 0;
    this._mouth = damp(this._mouth, v, 22, dt);
    const m = this._mouth;
    const set = (k, val) => { const o = mt[k]; if (!o) return; if (val > 0.002) Object.assign(o, { realtime: val, needsUpdate: true }); else if (o.realtime !== null) Object.assign(o, { realtime: null, needsUpdate: true }); };
    // Dişler öne çıkmasın: çene en çok ~0.18; dudak kapanışlı, yuvarlak/yarı açık viseme karışımı (aa/O/E düşük, dönüşümlü)
    const ph = t * 2 * Math.PI * 1.3;
    const wa = 0.5 + 0.5 * Math.sin(ph), wo = 0.5 + 0.5 * Math.sin(ph + 2.1), we = 0.5 + 0.5 * Math.sin(ph + 4.2);
    set('jawOpen', Math.min(0.18, 0.18 * m));
    set('viseme_aa', 0.10 * m * wa);
    set('viseme_O', 0.14 * m * wo);
    set('viseme_E', 0.07 * m * we);
    set('mouthClose', 0.12 * m);
  }

  // Sağ kol: işaret (hedefe) ya da el sallama; parmaklar
  _applyRightArm() {
    const B = this.bones;
    const arm = B.RightArm, fore = B.RightForeArm, hand = B.RightHand;
    if (!arm || !fore || !hand) return;
    const a = this._act;
    this.armature.updateMatrixWorld(true);
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
      if (ang) b.quaternion.multiply(qAxis(this.curlAxis[b.name], ang));
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

  // Konuşmayı hemen keser (ses + altyazı + ağız); bekleyen speak() promise'leri çözülür
  stopSpeak() {
    this._speakId++; this.speaking = false; this._voiced = false; this.subtitle?.hide();
    try { this.head?.stopSpeaking(); } catch (e) { /* ses yoktu */ }
    if (this._sleep) { clearTimeout(this._sleep.h); this._sleep.r(); this._sleep = null; }
  }

  _wait(ms) { return new Promise((r) => { this._sleep = { r, h: setTimeout(r, ms) }; }); }

  // Konuş: altyazı + (varsa, ilk tıklamadan sonra) assets/voice/<id>.mp3. Sesli: head.audioCtx ile çözülür, TalkingHead'e verilir
  // (speakAudio, isRaw: jest/bakış bize ait), HeadAudio dudakları sesten sürer. Sessiz: genel ağız hareketi (_mouthStep).
  // Promise: konuşma bitince çözülür.
  async speak(line) {
    if (!line) return;
    const id = ++this._speakId;
    this.speaking = true; this._voiced = false;
    this.subtitle?.show(line.text);
    let sure = Math.max(1500, line.text.length * 70);
    if (this.userInteracted && this.head) {
      const url = `./assets/voice/${line.id}.mp3`;
      try {
        const probe = await fetch(url, { method: 'HEAD' });
        if (probe.ok) {
          const buf = await (await fetch(url)).arrayBuffer();
          const audio = await this.head.audioCtx.decodeAudioData(buf);
          if (id === this._speakId) {
            this._voiced = true;
            this.head.speakAudio({ audio }, { isRaw: true });
            sure = audio.duration * 1000 + 300;
          } else sure = 0;
        }
      } catch (e) { /* ses yok/çözülemedi: süre ile bekle */ }
    }
    if (sure && id === this._speakId) await this._wait(sure);
    if (id === this._speakId) { this.speaking = false; this._voiced = false; this._sleep = null; this.subtitle?.hide(); }
  }
}
