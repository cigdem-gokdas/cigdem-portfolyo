import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const clamp = THREE.MathUtils.clamp;
const damp = (v, t, k, dt) => v + (t - v) * (1 - Math.exp(-k * dt));
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Avatar: sahnenin tek avatar arayüzü.
 * F2: GLTFLoader ile yüklenen kemikli avatar (morph yok). TalkingHead entegrasyonu
 * yeni GLB (morph + göz kemiği) gelince F3'te bu sınıfın içine girecek; arayüz aynı kalır.
 */
export class Avatar {
  constructor({ subtitle } = {}) {
    this.root = new THREE.Group();   // sahneye eklenen kök; yönü (+Z ön) burada döner
    this.subtitle = subtitle;
    this.bones = {};
    this.base = {};                  // kemiklerin başlangıç (duruş sonrası) yerel quaternion'ları
    this.lookTarget = null;          // THREE.Vector3 | null
    this.idleTarget = new THREE.Vector3(0, 1.6, 6); // null iken bakılan nokta (main kamerayı verir)
    this.baseYaw = 0;                // faceTowards ile ayarlanan gövde yönü
    this.bodyYaw = 0; this.headYaw = 0; this.headPitch = 0;
    this.t = 0;
    this.userInteracted = false;     // ilk tıklamaya kadar ses denenmez
    addEventListener('pointerdown', () => { this.userInteracted = true; }, { once: true });
  }

  async load(url, onProgress) {
    const gltf = await new GLTFLoader().loadAsync(url, (e) => e.total && onProgress?.(e.loaded / e.total));
    const model = gltf.scene;
    // Boyu 1.7 m'ye ölçekle, ayakları yere oturt
    const box = new THREE.Box3().setFromObject(model);
    const s = 1.7 / (box.max.y - box.min.y);
    model.scale.setScalar(s);
    model.position.y = -box.min.y * s;
    model.traverse((o) => {
      if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; }
      if (o.isBone) this.bones[o.name] = o;
    });
    this.root.add(model);
    this.model = model;
    this.root.updateMatrixWorld(true);
    this._poseArms();
    for (const k of ['Spine', 'Spine1', 'Spine2', 'Neck', 'Head']) {
      if (this.bones[k]) this.base[k] = this.bones[k].quaternion.clone();
    }
  }

  // A-pozdan doğal duruş: kol ve ön kolları dünya uzayında aşağı çevirir (eksen bağımsız).
  // Kemikler: LeftArm/RightArm (üst kol), LeftForeArm/RightForeArm (ön kol).
  _poseArms() {
    for (const side of ['Left', 'Right']) {
      this._aim(this.bones[side + 'Arm'], this.bones[side + 'ForeArm'], 0.10, 0.0);
      this._aim(this.bones[side + 'ForeArm'], this.bones[side + 'Hand'], 0.05, 0.12);
    }
  }

  // bone'dan child'a giden yönü hedef yöne (aşağı, hafif dışa/öne) döndürür
  _aim(bone, child, out, fwd) {
    if (!bone || !child) return;
    bone.updateWorldMatrix(true, true);
    const p = new THREE.Vector3(), c = new THREE.Vector3();
    bone.getWorldPosition(p); child.getWorldPosition(c);
    const cur = c.sub(p).normalize();
    const sign = Math.sign(cur.x) || 1; // kolun baktığı yan
    const target = new THREE.Vector3(sign * out, -1, fwd).normalize();
    const delta = new THREE.Quaternion().setFromUnitVectors(cur, target);
    const parentQ = bone.parent.getWorldQuaternion(new THREE.Quaternion());
    const worldQ = bone.getWorldQuaternion(new THREE.Quaternion()).premultiply(delta);
    bone.quaternion.copy(parentQ.invert().multiply(worldQ));
    bone.updateWorldMatrix(false, true);
  }

  // Kök (avatar) uzayında tanımlı bir dönüşü, kemiğin başlangıç rotasyonunun üstüne uygular
  _apply(name, qRoot) {
    const b = this.bones[name]; if (!b || !this.base[name]) return;
    b.parent.updateWorldMatrix(true, false);
    const rootQ = this.root.getWorldQuaternion(new THREE.Quaternion());
    const parentQ = b.parent.getWorldQuaternion(new THREE.Quaternion());
    const worldDelta = rootQ.clone().multiply(qRoot).multiply(rootQ.clone().invert());
    b.quaternion.copy(parentQ.clone().invert().multiply(worldDelta).multiply(parentQ).multiply(this.base[name]));
  }

  update(dt) {
    if (!this.model) return;
    this.t += dt;
    const e = (a, b, c) => new THREE.Quaternion().setFromEuler(new THREE.Euler(a, b, c));

    // Bakış hedefi: dünya uzayında yaw/pitch
    const target = this.lookTarget || this.idleTarget;
    const headPos = this.bones.Head ? this.bones.Head.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(0, 1.6, 0);
    const d = target.clone().sub(headPos);
    const worldYaw = Math.atan2(d.x, d.z);
    const pitch = Math.atan2(d.y, Math.hypot(d.x, d.z));

    // Gövde hedefe en fazla %20 döner, kalanı boyun+baş üstlenir (sınırlı)
    const bodyT = this.baseYaw + clamp((worldYaw - this.baseYaw) * 0.2, -0.5, 0.5);
    this.bodyYaw = damp(this.bodyYaw, bodyT, 2.5, dt);
    this.root.rotation.y = this.bodyYaw;
    const relYaw = clamp(worldYaw - this.bodyYaw, -1.0, 1.0);
    this.headYaw = damp(this.headYaw, relYaw, 5, dt);
    this.headPitch = damp(this.headPitch, clamp(pitch, -0.35, 0.35), 5, dt);

    // Idle nefes: omurga hafif yükselip alçalır
    const br = Math.sin(this.t * 1.6) * 0.012;
    this._apply('Spine', e(br, 0, 0));
    this._apply('Spine1', e(br * 0.8, 0, 0));
    this._apply('Spine2', e(br * 0.6, 0, 0));
    // Boyun %40, baş %60: yaw (Y) ve pitch (X, yukarı = eksi)
    this._apply('Neck', e(-this.headPitch * 0.4, this.headYaw * 0.4, 0));
    this._apply('Head', e(-this.headPitch * 0.6, this.headYaw * 0.6, 0));
  }

  lookAtPoint(v) { this.lookTarget = v ? v.clone() : null; }

  // Gövdeyi (yumuşak) noktaya çevirir
  faceTowards(v) {
    this.baseYaw = v ? Math.atan2(v.x - this.root.position.x, v.z - this.root.position.z) : 0;
  }

  // TODO(F3): yürüme animasyonu; şimdilik hemen çözülür
  walkTo(v) { return Promise.resolve(); }
  // TODO(F3): işaret etme (kol kaldırma); şimdilik hemen çözülür
  point() { return Promise.resolve(); }
  // TODO(F3): el sallama
  wave() {}

  // Konuş: altyazı + (varsa, ilk tıklamadan sonra) assets/voice/<id>.mp3.
  // Ağız hareketi yok: bu GLB'de morph target bulunmuyor (F3'te TalkingHead ile gelecek).
  async speak(line) {
    this.subtitle?.show(line.text);
    let sure = Math.max(1500, line.text.length * 70);
    if (this.userInteracted) {
      const url = `./assets/voice/${line.id}.mp3`;
      try {
        const head = await fetch(url, { method: 'HEAD' });
        if (head.ok) {
          await new Promise((res) => {
            const a = new Audio(url);
            a.addEventListener('ended', res); a.addEventListener('error', res);
            a.play().catch(res);
          });
          sure = 0;
        }
      } catch (e) { /* ses yok: süre ile bekle */ }
    }
    if (sure) await bekle(sure);
    this.subtitle?.hide();
  }
}
