import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// "Öğretmen" avatarı: tahtanın solunda belden yukarı durur, izleyiciye anlatır; tıklanan karta dönüp sol eliyle dokunur.
// GLB: tools/avatar ile MPFB2'den üretilir (Mixamo adlı iskelet, 50 ARKit + 15 Oculus viseme, göz kemikleri).
// TalkingHead avatarOnly modunda: sahne/kamera/çizim bizim; TalkingHead pozu, göz kırpmayı, nefesi, mimikleri, göz temasını yazar.
// Bizim hareketlerimiz (dönme, işaret, dokunma) head.opt.update kancasında kemiklere kök uzayında DELTA olarak eklenir.

const AVATAR_URL = new URL('../../assets/avatar.glb', import.meta.url).href;
const clamp = THREE.MathUtils.clamp;
const damp = (v, t, k, dt) => v + (t - v) * (1 - Math.exp(-k * dt));
const sm = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const FINGERS = ['Middle', 'Ring', 'Pinky'];
const IDLE_YAW = 0.22;        // boşta tahtaya hafif dönük (rad)
const POINT_YAW = 0.95;       // dokunurken tahtaya yarı dönük
const T_TURN = 0.45, T_REACH = 0.42, T_TAP = 0.16, T_HOLD = 0.25, T_BACK = 0.55; // s

export async function createPresenter(canvas, { subtitle, onProgress } = {}) {
  const p = new Presenter(canvas, subtitle);
  await p.load(onProgress);
  p.start();
  if (new URLSearchParams(location.search).has('hata-ayikla')) window.__sunucu = p;   // yalnızca geliştirme
  return {
    point: (el) => p.point(el),
    say: (id, text) => p.say(id, text),
    idle: () => p.idle(),
  };
}

class Presenter {
  constructor(canvas, subtitle) {
    this.canvas = canvas;
    this.subtitle = subtitle;
    this.bones = {};
    this.curlAxis = {};
    this.t = 0;
    this.yaw = IDLE_YAW; this.yawTarget = IDLE_YAW;
    this.act = null;              // { stage, t, target(Vector3), el, resolve }
    this.armW = 0;                // sol kol işaret ağırlığı
    this.tapW = 0;
    this.speaking = false; this._voiced = false; this._speakId = 0; this._mouth = 0; this._sleep = null;
    this.userInteracted = false;
    addEventListener('pointerdown', () => { this.userInteracted = true; }, { once: true });

    // TalkingHead lookAt() ekran koordinatı için kanvasla aynı kutuya ihtiyaç duyar
    this.node = document.createElement('div');
    this.node.style.cssText = 'position:fixed;pointer-events:none;visibility:hidden;';
    document.body.append(this.node);

    const r = this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(devicePixelRatio, 2));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.0;
    this.scene = new THREE.Scene();
    const pm = new THREE.PMREMGenerator(r);
    this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.35;
    this.camera = new THREE.PerspectiveCamera(24, 1, 0.1, 30);
    this._lights();
    this._resize();
    new ResizeObserver(() => this._resize()).observe(canvas);
  }

  _lights() {
    const s = this.scene;
    s.add(new THREE.HemisphereLight(0xe6ecff, 0x2b2230, 1.1));
    const key = new THREE.DirectionalLight(0xfff1e6, 2.2); key.position.set(-1.6, 2.6, 2.4); s.add(key);
    const fill = new THREE.DirectionalLight(0xdfe8ff, 0.7); fill.position.set(2.0, 1.4, 2.0); s.add(fill);
    const rim = new THREE.DirectionalLight(0x7cf3ff, 1.6); rim.position.set(1.8, 2.2, -2.2); s.add(rim);   // tahtadan gelen camgöbeği kenar ışığı
    const rim2 = new THREE.DirectionalLight(0xffc6a8, 0.6); rim2.position.set(-2.0, 1.8, -1.5); s.add(rim2);
  }

  // Kadraj: bel–baş arası görünür, avatar kanvasın yatayda ~%38'inde
  _resize() {
    const w = this.canvas.clientWidth || 1, h = this.canvas.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    const c = this.camera;
    c.aspect = w / h;
    const hy = this.headY || 1.62;            // baş kemiği yüksekliği (yüklemeden sonra ölçülür)
    const top = hy + 0.30, bottom = hy - 0.58;
    const halfH = (top - bottom) / 2, cy = (top + bottom) / 2;
    const dist = halfH / Math.tan(THREE.MathUtils.degToRad(c.fov / 2));
    const halfW = halfH * c.aspect;
    const shift = halfW * 0.5;
    c.position.set(shift, cy + 0.05, dist);
    c.lookAt(shift, cy, 0);
    c.updateProjectionMatrix();
    const rc = this.canvas.getBoundingClientRect();
    Object.assign(this.node.style, { left: rc.left + 'px', top: rc.top + 'px', width: rc.width + 'px', height: rc.height + 'px' });
  }

  async load(onProgress) {
    const { TalkingHead } = await import('../vendor/talkinghead/talkinghead.mjs');
    this.head = new TalkingHead(this.node, {
      ttsEndpoint: '', lipsyncModules: [],
      avatarOnly: true, avatarOnlyScene: this.scene, avatarOnlyCamera: this.camera,
      update: (dtMs) => this._hook(dtMs),
    });
    const head = this.head;
    await head.showAvatar({
      url: AVATAR_URL, body: 'F', avatarMood: 'happy', lipsyncLang: 'en',
      avatarIdleEyeContact: 0.55, avatarIdleHeadMove: 0.5, avatarSpeakingEyeContact: 0.75, avatarSpeakingHeadMove: 0.6,
    }, (e) => e.total && onProgress?.(e.loaded / e.total));
    // Rastgele boşta poz değişimi (el belde vb.) bu beden oranlarında eli sırta sokuyor: sabit 'straight' pozu
    for (const mood of Object.values(head.animMoods || {})) if (mood.anims) mood.anims = mood.anims.filter((a) => a.name !== 'pose');
    head.playPose('straight');
    // Gülümseme abartılmasın
    for (const k of ['mouthSmileLeft', 'mouthSmileRight', 'mouthSmile']) if (head.mtAvatar[k]) head.mtAvatar[k].max = 0.45;
    // MakeHuman'ın aşağı bakış şekli üst kapağı çok indiriyor (uykulu görünüm); burun kırışması/yanak şişirme abartılı
    const caps = { eyesLookDown: 0.1, eyeLookDownLeft: 0.1, eyeLookDownRight: 0.1, noseSneerLeft: 0.05, noseSneerRight: 0.05, cheekPuff: 0.05 };
    for (const [k, v] of Object.entries(caps)) if (head.mtAvatar[k]) head.mtAvatar[k].max = v;
    // Fotoğraflardaki gibi açık gözler ve hafif gülümseme (mutlu ruh halinin taban değerleri)
    const happy = head.animMoods?.happy;
    if (happy) { happy.baseline = { ...happy.baseline, eyesLookDown: 0, eyeWideLeft: 0.22, eyeWideRight: 0.22, mouthSmile: 0.24 }; head.setMood('happy'); }
    this.arm = head.armature;
    if (!this.arm.parent) this.scene.add(this.arm);
    this.arm.traverse((o) => {
      if (o.isBone) this.bones[o.name] = o;
      if (o.isMesh) {
        o.frustumCulled = false;
        for (const m of [].concat(o.material)) {
          if (!m) continue;
          if (o.name === 'Eyes') { m.transparent = true; m.depthWrite = false; }
          if (o.name === 'Eyebrows' || o.name === 'Eyelashes') { m.transparent = true; m.alphaTest = 0.15; m.depthWrite = false; }
          if (o.name === 'Hair') { m.roughness = 0.75; m.envMapIntensity = 0.35; m.transparent = false; m.alphaTest = 0.5; m.depthWrite = true; m.side = THREE.DoubleSide; }
          if (o.name === 'Body') { m.roughness = 0.58; }
        }
      }
    });
    // Saç iki geçiş: önce kesik alfa ile opak (derinlik yazar), sonra yumuşak kenarlar için saydam kopya
    let hair = null;
    this.arm.traverse((o) => { if (o.isMesh && o.name === 'Hair') hair = o; });
    if (hair) {
      const soft = hair.clone();
      soft.name = 'HairSoft';
      soft.material = [].concat(hair.material).map((m) => { const c = m.clone(); Object.assign(c, { alphaTest: 0.04, transparent: true, depthWrite: false }); return c; });
      if (!Array.isArray(hair.material)) soft.material = soft.material[0];
      soft.renderOrder = 3;
      hair.parent.add(soft);
    }
    // Göz ve kaş/kirpik saydamlığı doğru sırayla çizilsin
    this.arm.traverse((o) => { if (o.isMesh && /^(Eyebrows|Eyelashes)$/.test(o.name)) o.renderOrder = 2; if (o.isMesh && o.name === 'Eyes') o.renderOrder = 1; });
    head.animate(2500); head.animate(2500); head.animate(50);
    this._computeCurlAxes();
    this.arm.updateMatrixWorld(true);
    this.headY = this.bones.Head.getWorldPosition(new THREE.Vector3()).y;
    this._resize();
    await this._setupHeadAudio();
  }

  async _setupHeadAudio() {
    try {
      const head = this.head, ctx = head.audioCtx;
      const { HeadAudio } = await import('../vendor/headaudio/headaudio.min.mjs');
      await ctx.audioWorklet.addModule(new URL('../vendor/headaudio/headworklet.min.mjs', import.meta.url).href);
      const ha = new HeadAudio(ctx, { visemeMinMs: 120, processorOptions: {}, parameterData: { vadMode: 1 } });
      await ha.loadModel(new URL('../vendor/headaudio/model-en-mixed.bin', import.meta.url).href);
      head.audioSpeechGainNode.connect(ha);
      const delay = new DelayNode(ctx, { delayTime: 0.15 });
      head.audioSpeechGainNode.disconnect(head.audioReverbNode);
      head.audioSpeechGainNode.connect(delay);
      delay.connect(head.audioReverbNode);
      ha.onvalue = (key, value) => { const m = head.mtAvatar[key]; if (m) Object.assign(m, { newvalue: value, needsUpdate: true }); };
      this.headaudio = ha;
    } catch (e) { console.warn('HeadAudio kurulamadı, genel ağız hareketi kullanılacak', e); }
  }

  start() {
    let last = performance.now();
    const loop = (now) => {
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      if (!document.hidden) this._frame(dt);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    addEventListener('resize', () => this._resize());
  }

  _frame(dt) {
    this.t += dt;
    this._step(dt);
    this.arm.rotation.y = this.yaw * 0.6;   // gövdenin çoğu kökten, kalanı omurgadan döner (_hook)
    this.head.animate(dt * 1000);
    this.renderer.render(this.scene, this.camera);
  }

  // ---------- Durum makinesi: dön → uzan → dokun → (çöz) → tut → geri ----------
  _step(dt) {
    const a = this.act;
    if (a) {
      a.t += dt;
      if (a.target && a.el) a.target.copy(this._targetFor(a.el));
      if (a.stage === 'turn') {
        this.armW = sm(a.t / (T_TURN + T_REACH)) * 0.6;
        if (a.t >= T_TURN) { a.stage = 'reach'; a.t = 0; }
      } else if (a.stage === 'reach') {
        this.armW = 0.6 + 0.4 * sm(a.t / T_REACH);
        if (a.t >= T_REACH) { a.stage = 'tap'; a.t = 0; }
      } else if (a.stage === 'tap') {
        this.armW = 1;
        this.tapW = Math.sin(Math.PI * clamp(a.t / T_TAP, 0, 1));
        if (a.t >= T_TAP * 0.5 && !a.resolved) { a.resolved = true; a.resolve(); }
        if (a.t >= T_TAP) { a.stage = 'hold'; a.t = 0; this.tapW = 0; }
      } else if (a.stage === 'hold') {
        if (a.t >= T_HOLD) { a.stage = 'back'; a.t = 0; this.yawTarget = IDLE_YAW; this._eyeContact(true); }
      } else if (a.stage === 'back') {
        this.armW = 1 - sm(a.t / T_BACK);
        if (a.t >= T_BACK) { this.armW = 0; this.act = null; }
      }
    }
    this.yaw = damp(this.yaw, this.yawTarget, a && a.stage !== 'back' ? 7 : 3.5, dt);
  }

  _eyeContact(on) {
    const av = this.head.avatar;
    if (!av) return;
    av.avatarIdleEyeContact = on ? 0.55 : 0;
    av.avatarSpeakingEyeContact = on ? 0.75 : 0;
    av.avatarIdleHeadMove = on ? 0.5 : 0;
  }

  // DOM elemanının merkezini avatarın arkasındaki tahta düzlemine (z = -0.35) izdüşür
  _targetFor(el) {
    const rc = this.canvas.getBoundingClientRect();
    const er = el.getBoundingClientRect();
    const x = ((er.left + er.width / 2 - rc.left) / rc.width) * 2 - 1;
    const y = -((er.top + er.height / 2 - rc.top) / rc.height) * 2 + 1;
    const v = new THREE.Vector3(x, y, 0.5).unproject(this.camera).sub(this.camera.position).normalize();
    const t = (-0.35 - this.camera.position.z) / v.z;
    return this.camera.position.clone().addScaledVector(v, t);   // kol yalnızca bu yöne uzanır, menzil gerekmez
  }

  point(el) {
    if (!this.head) return Promise.resolve();
    if (this.act && this.act.resolve && !this.act.resolved) this.act.resolve();
    return new Promise((resolve) => {
      const target = this._targetFor(el);
      this.act = { stage: 'turn', t: 0, target, el, resolve, resolved: false };
      this.yawTarget = POINT_YAW;
      this._eyeContact(false);
      const er = el.getBoundingClientRect();
      try { this.head.lookAt(er.left + er.width / 2, er.top + er.height / 2, 1400); } catch (e) { /* bakış isteğe bağlı */ }
    });
  }

  idle() {
    if (this.act && this.act.stage !== 'back') { this.act.stage = 'back'; this.act.t = 0; if (!this.act.resolved) { this.act.resolved = true; this.act.resolve(); } }
    this.yawTarget = IDLE_YAW;
    this._eyeContact(true);
  }

  // ---------- Konuşma ----------
  async say(id, text) {
    const sid = ++this._speakId;
    this._stopAudio();
    this.speaking = true; this._voiced = false;
    this.subtitle?.show(text);
    // Anlatırken el-kol hareketi (işaret bitmişse)
    setTimeout(() => this._gesture(sid), 650);
    let ms = Math.max(1600, text.length * 70);
    if (this.userInteracted) {
      const url = new URL(`../../assets/voice/${id}.mp3`, import.meta.url).href;
      try {
        const probe = await fetch(url, { method: 'HEAD' });
        if (probe.ok && sid === this._speakId) {
          const buf = await (await fetch(url)).arrayBuffer();
          const audio = await this.head.audioCtx.decodeAudioData(buf);
          if (sid === this._speakId) {
            this._voiced = true;
            this.head.speakAudio({ audio }, { isRaw: true });
            ms = audio.duration * 1000 + 300;
          }
        }
      } catch (e) { /* ses yok: altyazı süresi kadar */ }
    }
    if (sid !== this._speakId) return;
    await new Promise((r) => { this._sleep = { r, h: setTimeout(r, ms) }; });
    if (sid === this._speakId) { this.speaking = false; this._voiced = false; this.subtitle?.hide(); }
  }

  _stopAudio() {
    try { this.head?.stopSpeaking(); } catch (e) { /* yok */ }
    if (this._sleep) { clearTimeout(this._sleep.h); this._sleep.r(); this._sleep = null; }
  }

  _gesture(sid) {
    if (sid !== this._speakId || !this.speaking || this.act) return;
    const opts = [['handup', false], ['index', false], ['side', false], ['handup', true], ['ok', false]];
    const [g, mirror] = opts[Math.floor(Math.random() * opts.length)];
    try { this.head.playGesture(g, 1.6, mirror, 700); } catch (e) { /* jest yok */ }
  }

  // ---------- Kemik yardımcıları ----------
  _apply(name, qRoot) {
    const b = this.bones[name]; if (!b) return;
    b.parent.updateWorldMatrix(true, false);
    const rootQ = this.arm.getWorldQuaternion(new THREE.Quaternion());
    const parentQ = b.parent.getWorldQuaternion(new THREE.Quaternion());
    const worldDelta = rootQ.clone().multiply(qRoot).multiply(rootQ.clone().invert());
    b.quaternion.copy(parentQ.clone().invert().multiply(worldDelta).multiply(parentQ).multiply(b.quaternion));
  }

  _rotateToward(bone, cur, dir, w) {
    const delta = new THREE.Quaternion().setFromUnitVectors(cur, dir);
    if (w < 1) delta.slerp(new THREE.Quaternion(), 1 - w);
    const parentQ = bone.parent.getWorldQuaternion(new THREE.Quaternion());
    const worldQ = bone.getWorldQuaternion(new THREE.Quaternion()).premultiply(delta);
    bone.quaternion.copy(parentQ.invert().multiply(worldQ));
    bone.updateWorldMatrix(false, true);
  }

  // Parmak kıvırma ekseni (kemik yerelinde): parmak yönü x avuç normali
  _computeCurlAxes() {
    this.arm.updateMatrixWorld(true);
    const B = this.bones;
    const hand = B.LeftHand; if (!hand) return;
    const hp = hand.getWorldPosition(new THREE.Vector3());
    const ip = B.LeftHandIndex1.getWorldPosition(new THREE.Vector3());
    const pp = B.LeftHandPinky1.getWorldPosition(new THREE.Vector3());
    const mp = B.LeftHandMiddle1.getWorldPosition(new THREE.Vector3());
    const across = ip.clone().sub(pp).normalize();
    const along = mp.clone().sub(hp).normalize();
    const palm = new THREE.Vector3().crossVectors(along, across).normalize(); // sol el: avuç içi yönü
    for (const f of ['Index', ...FINGERS, 'Thumb']) for (let i = 1; i <= 3; i++) {
      const b = B[`LeftHand${f}${i}`]; if (!b) continue;
      const axisW = new THREE.Vector3().crossVectors(along, palm).normalize();
      this.curlAxis[b.name] = axisW.applyQuaternion(b.getWorldQuaternion(new THREE.Quaternion()).invert()).normalize();
    }
  }

  // TalkingHead bu karede pozu yazdı; morph ve çizimden önce bizim deltalarımız
  _hook(dtMs) {
    const dt = Math.min(dtMs / 1000, 0.1);
    this.headaudio?.update(dtMs);
    this._mouthStep(dt);
    const e = (a, b, c) => new THREE.Quaternion().setFromEuler(new THREE.Euler(a, b, c));
    // Omurga burulması: dönüşün kalanı
    const tw = this.yaw * 0.4;
    this._apply('Spine1', e(0, tw * 0.45, 0));
    this._apply('Spine2', e(0, tw * 0.55, 0));
    if (this.armW > 0.001) this._applyLeftArm();
  }

  _applyLeftArm() {
    const B = this.bones, a = this.act;
    const arm = B.LeftArm, fore = B.LeftForeArm, hand = B.LeftHand;
    if (!arm || !fore || !hand || !a) return;
    this.arm.updateMatrixWorld(true);
    const w = this.armW;
    const pa = arm.getWorldPosition(new THREE.Vector3());
    // Hedef yönü: omuzdan tahtadaki noktaya; dirsek hafif bükük kalsın diye üst kol biraz aşağıda
    const toT = a.target.clone().sub(pa).normalize();
    const dirArm = toT.clone().add(new THREE.Vector3(0, -0.28, 0.12)).normalize();
    const dirFore = toT.clone().add(new THREE.Vector3(0, 0.04 + 0.08 * this.tapW, 0)).normalize();
    const pf = fore.getWorldPosition(new THREE.Vector3());
    this._rotateToward(arm, pf.clone().sub(pa).normalize(), dirArm, w);
    const pf2 = fore.getWorldPosition(new THREE.Vector3()), ph = hand.getWorldPosition(new THREE.Vector3());
    this._rotateToward(fore, ph.clone().sub(pf2).normalize(), dirFore, w);
    // El: bilek hedefe doğru, dokunuşta hafif öne itiş
    const ph2 = hand.getWorldPosition(new THREE.Vector3());
    const pm = B.LeftHandMiddle1.getWorldPosition(new THREE.Vector3());
    const dirHand = a.target.clone().sub(ph2).normalize().add(new THREE.Vector3(0, -0.15 * this.tapW, 0)).normalize();
    this._rotateToward(hand, pm.sub(ph2).normalize(), dirHand, w * 0.8);
    // Parmaklar: işaret düz, diğerleri ve başparmak kıvrık
    const amt = [1.25, 1.45, 1.0];
    for (const f of FINGERS) for (let i = 1; i <= 3; i++) {
      const b = B[`LeftHand${f}${i}`]; const ax = b && this.curlAxis[b.name];
      if (ax) b.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(ax, amt[i - 1] * w));
    }
    // İşaret parmağı: el ekseni boyunca düz (yerel dönüş birime yaklaştırılır; iskelet Mixamo eksen düzeninde)
    const I = new THREE.Quaternion();
    for (let i = 1; i <= 3; i++) {
      const b = B[`LeftHandIndex${i}`];
      if (b) b.quaternion.slerp(I, w * (i === 1 ? 0.85 : 1));
    }
    for (let i = 2; i <= 3; i++) {
      const b = B[`LeftHandThumb${i}`]; const ax = b && this.curlAxis[b.name];
      if (ax) b.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(ax, 0.5 * w));
    }
  }

  // Ses yokken ya da HeadAudio yokken dile bağımsız, düşük genlikli konuşma hareketi
  _mouthStep(dt) {
    const mt = this.head.mtAvatar;
    const on = this.speaking && !(this._voiced && this.headaudio);
    const t = this.t;
    const env = 0.5 + 0.5 * Math.sin(t * 2 * Math.PI * 0.9 + 1.3);
    const syl = Math.abs(Math.sin(t * 2 * Math.PI * 2.6) * 0.6 + Math.sin(t * 2 * Math.PI * 4.1 + 0.7) * 0.4);
    this._mouth = damp(this._mouth, on ? syl * (0.45 + 0.55 * env) : 0, 22, dt);
    const m = this._mouth;
    const set = (k, val) => { const o = mt[k]; if (!o) return; if (val > 0.002) Object.assign(o, { realtime: val, needsUpdate: true }); else if (o.realtime !== null) Object.assign(o, { realtime: null, needsUpdate: true }); };
    const ph = t * 2 * Math.PI * 1.3;
    set('jawOpen', 0.22 * m);
    set('viseme_aa', 0.25 * m * (0.5 + 0.5 * Math.sin(ph)));
    set('viseme_O', 0.25 * m * (0.5 + 0.5 * Math.sin(ph + 2.1)));
    set('viseme_E', 0.18 * m * (0.5 + 0.5 * Math.sin(ph + 4.2)));
  }
}
