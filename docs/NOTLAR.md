# NOTLAR: TalkingHead + HeadAudio API doğrulaması (Kaşif)

Kısaltmalar (hepsi salt okunur kaynaklar):
- TH = ~/Projects/TalkingHead/modules/talkinghead.mjs
- THR = ~/Projects/TalkingHead/README.md
- HA = ~/Projects/HeadAudio (modules/, dist/, README.md = HAR, tester.html = HAT)

Kaynak sürüm ipucu: three ^0.186 (TalkingHead/package.json:23), TalkingHead 1.8 CDN etiketi (HAT:88). Lisans: ikisi de MIT.

---

## 1. Kurucu (constructor)

- İmza: `constructor(node, opt = null)` — TH:128. `node` bir DOM öğesi; kurucu `Object.assign(this.opt, opt)` ile varsayılanların üstüne yazar (TH:195).
- ttsEndpoint ZORUNLU DEĞİL: varsayılan `""` (TH:132). Yalnızca doluysa tarayıcının OGG/MP3 desteği denetlenir (TH:821-830); TTS'e `fetch` sadece `speakText` yolunda yapılır (TH:3399). Yani anahtarsız/TTS'siz kurulabilir. Kanıt: HAT:249-257 `ttsEndpoint: "N/A"`, `lipsyncModules: []` ile kuruyor. `ttsApikey` varsayılan null (TH:133).
- lipsync zorunlu değil: `lipsyncModules` varsayılan `['fi','en','lt']` (TH:144), `[]` verilebilir (HAT:251). UYARI: `words` verip `visemes` vermezseniz `lipsyncWordsToVisemes` çağrılır (TH:3133-3136) ve hiç modül yoksa `Object.values(this.lipsync)[0]` undefined olur, hata atar (TH:2832-2854). Türkçe modül yok: modüller en, fi, lt, de, fr, pt_br, bn (dizin listesi, TH modules/lipsync-*.mjs); `lipsyncGetProcessor` modülü `./lipsync-<dil>.mjs` diye dinamik import eder (TH:2814-2822).
- cameraView: varsayılan `'full'` (TH:151); geçerli değerler `full|mid|upper|head` (TH:1465-1467, 1482-1484). Daha iyi: `setView(view, {cameraX,cameraY,cameraDistance,cameraRotateX,cameraRotateY})` (TH:1482-1500).
- avatarMood: varsayılan `"neutral"` (TH:173). Bilinmeyen ad kurucuda sessizce neutral'a düşer (TH:612-617).
- modelFPS: varsayılan 30 (TH:149); `animFrameDur = 1000/modelFPS` (TH:761); `animate` bu süreden kısa kareleri atlar (TH:2413-2416). Bu sınır `opt.update` kancasını da etkiler (kanca yalnız çizilen karelerde çalışır).
- Işık: `lightAmbientColor/Intensity` (varsayılan 0xffffff/2), `lightDirectColor/Intensity/Phi/Theta` (0x8888aa/30/1/2), `lightSpot*` (yoğunluk 0) — TH:161-175. Çalışma anında `setLighting(opt)` (TH:1545-1585); yoğunluk 0 ışığı gizler. Ayrıca sahne ortam haritası RoomEnvironment'tan kurulur (TH:866); kapatma seçeneği bulunamadı.
- Arka plan: renderer `alpha:true` (TH:841) ve `scene.background` atanmaz, yani saydam canvas; arka plan CSS/DOM ile verilir. Ayrı bir "background" seçeneği bulunamadı.
- Kendi sahne/renderer'ımız: İKİ MOD var.
  - Standart mod: kendi `WebGLRenderer`, `Scene`, `PerspectiveCamera(10°)`, `OrbitControls` ve ışıkları kurar (TH:840-882); dışarıdan renderer/scene verme seçeneği yok.
  - `avatarOnly: true` (TH:187, THR:188): renderer/sahne/ışık kurmaz; `avatarOnlyScene` ve `avatarOnlyCamera` verilir (TH:188-189, 833-839). Döngüyü bizim kodumuz sürer: `head.animate(dt_ms)`; THR Appendix H (THR:940-970) örneği: `head.armature.position.set(..)`, `scene.add(head.armature)`, `head.animate(delta*1000)`. THR bu modu "EXPERIMENTAL" diye işaretliyor (THR:188). avatarOnly'de `setView/setLighting` işlevsizdir (TH:1493, 1547); `start()` rAF başlatmaz (TH:4301-4304).
- Three.js sürümü / importmap (THR:93-98, examples/minimal.html:17-22, HAT:84-92):
  ```
  "three": "https://cdn.jsdelivr.net/npm/three@0.186/build/three.module.js/+esm",
  "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.186/examples/jsm/",
  "talkinghead": ".../talkinghead.mjs"
  ```
  TH içe aktardığı adlar: `three`, `three/addons/controls/OrbitControls.js`, `loaders/GLTFLoader.js`, `loaders/DRACOLoader.js`, `libs/meshopt_decoder.module.js`, `loaders/FBXLoader.js`, `environments/RoomEnvironment.js`, `libs/stats.module.js` (TH:25-33). Yani `three/addons/` eşlemesi şart. index.html ayrıca `three/examples/` eşliyor (index.html:396), TH'ye gerekmez.
- Dikkat (kendi three kopyamız): avatarOnly'de bile TH `import * as THREE from 'three'` yapar; bizim sahne ile AYNI three örneği kullanılmalı (importmap tek `three` adı) yoksa instanceof sorunları olur (çıkarım; kaynakta doğrudan uyarı bulunamadı).

## 2. showAvatar

- İmza: `async showAvatar(avatar, onprogress=null, onpreprocess=null)` — TH:1224. Dönüş: Promise<void> (sonda dönüş değeri yok, TH:1455-1458 `this.start()` ile biter). `url` yoksa hata (TH:1226-1228).
- Avatar alanları (typedef TH:50-69, THR tablo 211-235): `url` (zorunlu), `body` 'M'|'F', `lipsyncLang`, `ttsLang/ttsVoice/ttsRate/ttsPitch/ttsVolume`, `avatarMood`, `avatarMute`, `avatarIdleEyeContact`, `avatarIdleHeadMove`, `avatarSpeakingEyeContact`, `avatarSpeakingHeadMove`, `modelDynamicBones`; ayrıca kodda `baseline` (TH:1348, THR:215-220 örnek `{headRotateX:-0.05, eyeBlinkLeft:0.15, ...}`), `retarget` (TH:1269-1271), `skeletonHelper` (TH:1448).
- İlerleme geri çağrısı: `onprogress` doğrudan `GLTFLoader.loadAsync(url, onprogress)` olur (TH:1243); `ev.lengthComputable/loaded/total` (TH:73-79, examples/minimal.html:44-49). `onpreprocess(gltf)` yükleme sonrası (TH:1245-1248).
- Kök nesne: `modelRoot` seçeneği, varsayılan "Armature" (TH:147); bulunamazsa uyarı + `gltf.scene` yedek (TH:1292-1296).
- "mixamorig" öneki otomatik silinir (TH:1251-1255, THR:463-464).
- Gerekli kemikler (eksikse `throw 'Avatar object X not found'`, TH:1258-1264): poz şablonlarında geçen tüm adlar: Hips, Spine, Spine1, Spine2, Neck, Head, Left/Right{Shoulder, Arm, ForeArm, Hand, UpLeg, Leg, Foot, ToeBase}, Left/Right{HandThumb, HandIndex, HandMiddle, HandRing, HandPinky}{1,2,3} (TH:205-282 şablonlardan türetildi). Ayrıca kontrolsüz kullanılanlar: LeftEye, RightEye (TH:1435-1436, 1444-1445 — yoksa TypeError). README bu rigi "Mixamo-compatible" diye tarif eder (THR:421-424, 449-452).
- Gerekli morph hedefleri (THR:469-489): 52 ARKit adı (eyeBlinkLeft ... tongueOut) + 15 Oculus `viseme_sil, PP, FF, TH, DD, kk, CH, SS, nn, RR, aa, E, I, O, U`. Kod "Blend shapes not found" hatası atar yalnız hiç morph yoksa (TH:1317-1319). `mouthOpen, mouthSmile, eyesClosed, eyesLookUp, eyesLookDown` eksikse ARKit'ten otomatik üretilir (TH:743-749, 1329-1335; THR:491-494). İç özel anahtarlar: handFistLeft/Right, bodyRotateX/Y/Z, headRotateX/Y/Z, chestInhale (TH:695-698) — avatarda yoksa da sorun değil, sanal.
- Uyumluluk: depoda örnekler `avatars/avaturn.glb`, `brunette.glb`, `vroid.glb`, `mpfb.glb`, `avatarsdk.glb`, `cigdem.glb` var (dizin listesi). THR:204-222 Avaturn örneği baseline düzeltmesiyle gösterir; THR:508 Avaturn'u uyumlu avatar kaynağı olarak anar. RPM (Ready Player Me) için README ayrı bir cümle içermiyor ("RPM extra blend shapes" kod yorumu TH:1329 ve "RPM/Mixamo animation" TH:4358); RPM'in bu adlarla uyumlu olduğu çıkarım, kaynakta açık beyan bulunamadı.
- Yükleme sonrası: `scene.add(gltf.scene)` + ışıklar (standart mod, TH:1412-1419); avatarOnly'de yalnız `scene.add(armature)` (TH:1407-1410). `setView(opt.cameraView)`, `setMood(...)`, `start()` (TH:1455-1457). Avatar boyu göz hizasından tahmin edilir (TH:1443-1446).

## 3. speakAudio ve konuşma kuyruğu

- İmza: `speakAudio(r, opt=null, onsubtitles=null)` — TH:3106. Senkron (void); kuyruğa ekler ve `startSpeaking()` çağırır (TH:3220-3226).
- `r` alanları (typedef TH:96-107): `audio` (ArrayBuffer|ArrayBuffer[]), `words[]`, `wtimes[]`, `wdurations[]`, `visemes[]`, `vtimes[]`, `vdurations[]`, `markers[]` (fonksiyonlar), `mtimes[]`; ek olarak `anim` (blendshapes şablonu: `{name, dt:[ms...], vs:{morph:[değerler]}}`, TH:3194-3203, THR:857-870).
- Zaman birimi: MİLİSANİYE. Kanıt: THR speakAudio satırı "wtimes ... in milliseconds" (THR:274); kodda `ts = animClock + ts + delay` (animClock ms, TH:3279-3283) ve `source.start(currentTime + delay/1000)` (TH:3288).
- `audio` içeriği: THR'ye göre `AudioBuffer` ya da 16-bit LE PCM parçaları dizisi (THR:274, TH:3246-3254 `pcmToAudioBuffer`, örnekleme `pcmSampleRate` 22050, TH:147-148). Sıkıştırılmış ArrayBuffer (mp3) çözümlemesi bulunamadı; `AudioBuffer` verilmeli (örnek: examples/mp3.html).
- Visemeler yalnız `r.words` varsa işlenir: `if (r.words) {... visemes ...}` (TH:3112, 3167-3178). Yani `visemes/vtimes/vdurations` tek başına işe yaramaz; `words/wtimes/wdurations` birlikte verilmeli. Viseme zaman kodlaması: `ts: [t - 2d/3, t + d/2, t + d + d/2]`, tepe değer 0.6 (PP/FF için 0.9) (TH:3171-3175).
- Altyazı: üçüncü parametre `onsubtitles(text)`; her kelime için `' ' + word` olarak, kelimenin `wtimes` anında çağrılır (TH:3121-3130, işleyici TH:2580-2584). `words` verilmişse çalışır.
- SES OLMADAN çağırma: `audio` yoksa kuyruk öğesi "Only subtitles" dalına girer (TH:3464-3475): tüm `ts` değerleri `animClock + 10*i` yapılır, yani kelime/viseme zamanlaması YOK SAYILIR, hepsi hemen oynar. Zamanlı sessiz konuşma için sessiz bir `AudioBuffer` verilmeli (bkz. madde 7).
- `speakAudio` kuyruğa `break:300` ekler (TH:3221-3223; `opt.isRaw` ise eklemez). Her konuşma satırı başında `lookAtCamera(500)`, rastgele `speakWithHands()` ve `resetLips()` çağırır (TH:3322-3326); yani konuşurken jestler kendiliğinden çıkar (isRaw verilirse atlanır).
- `speakMarker(onmarker)`: kuyruğa `{marker: fn}` ekler; sıra gelince fn çağrılır (TH:3019-3023, işleme TH:3476-3480). Zamanlı işaretçi için `r.markers[]` + `r.mtimes[]` (ms) (TH:3181-3191).
- `stopSpeaking()`: ses kaynağını durdurur, kuyruğu ve viseme/altyazı/blendshapes animlerini temizler, `isSpeaking=false` (TH:3508-3520). `pauseSpeaking()` TH:3492.
- `isSpeaking`: METOT DEĞİL, özellik (boolean) — `this.isSpeaking` (TH:822-826, 3312-3313). Ses çalma ayrıca `isAudioPlaying`.
- Diğer: `speakText(s, opt, onsubtitles, excludes)` (TH:2856; TTS gerektirir), `speakBreak(ms)` (TH:3010), `speakEmoji(em)` (TH:2997).

## 4. Jestler, duruş, bakış

- `playGesture(name, dur=3, mirror=false, ms=1000)` — TH:4596. `dur` SANİYE (setTimeout `1000*dur`, TH:4630-4632), `ms` geçiş süresi milisaniye (TH:4625-4626). Aynı ad hem el jesti hem emoji animasyonu olabilir (TH:4637).
- El jesti adları (`gestureTemplates`, TH:282-305): `handup`, `index`, `ok`, `thumbup`, `thumbdown`, `side`, `shrug`, `namaste`. THR:295 listeye `namaste` eklemiyor ama kodda var. Tek el jestleri varsayılan SOL el; `mirror=true` sağ el (TH:4617-4619, şablon notu TH:280-281).
- İşaret jesti: `index` (TH:285). "Parmakla işaret" ayrı bir ad bulunamadı; `index` bunun en yakın adıdır, ama sağ/sol elin kameraya göre yönü ve hedefi parametrik değil (şablon sabit açılar, bazı eksenlerde gaussian rastgele aralık, TH:1089-1103). Hedefe göre işaret için `ikSolve(...)` (TH:4731) ve README Appendix'indeki IK anlatımı var ama jest adı değil.
- `wave` YOK: `grep wave` sonuç vermedi. En yakın: `handup` (el kaldırma) ve emoji adları `'✋'` (handup + mirror=true, mouthSmile, TH:677), `'👋'` bunu bağlar (TH:679); `playGesture('👋')` çalışır (animEmojis TH:677-689). Sallama hareketi (el bileği salınımı) bulunamadı; `handup` statik.
- Emoji animasyonları ek olarak `'yes'` ve `'no'` (baş sallama, TH:688-689).
- `stopGesture(ms=1000)` — TH:4693; zamanlayıcıyı iptal eder, el pozunu şablona döndürür (TH:4693-4725).
- `playPose(url, onprogress, dur=5, ndx=0, scale=0.01)` — TH:4500. `url` bir poz ADI (`poseTemplates`) ya da FBX adresi. Hazır poz adları: `side, hip, turn, bend, back, straight, wide, oneknee, kneel, sitting` (TH:208-272). `dur` saniye. `stopPose()` = `stopAnimation()` (TH:4584-4586).
- `playAnimation(url, onprogress, dur=10, ndx=0, scale=0.01)` — TH:4357. FBX GEREKİR (FBXLoader, Mixamo; iz adlarında `mixamorig` silinir, konumlar `scale` ile çarpılır, TH:4401-4415). `dur` saniye, tam tur tekrar (TH:4388-4392). Depoda `animations/walking.fbx` ve `poses/dance.fbx` var (dizin listesi). `stopAnimation()` TH:4455. Animasyon çalışırken `speakWithHands` devre dışı (TH:4190-4191).
- `setMood(s)` — TH:2084; küçük harfe çevirir; bilinmeyen adda `Error("Unknown mood.")` fırlatır (TH:2085-2087). Mood adları (`animMoods`): `neutral, happy, angry, sad, fear, disgust, love, sleep` (TH:419, 441, 478, 500, 522, 545, 563, 601; THR:173 ile aynı). `getMoodNames()` TH:2068. Not: `getMood()` `this.opt.avatarMood` döndürür (TH:2076-2078), `setMood` bunu güncellemez, yani güncel mood için `head.moodName` (TH:2088) okunmalı.
- `makeEyeContact(t)` — TH:3885; `t` milisaniye (kuyruğa `dt:[0,t]` anim, TH:3886-3888).
- `lookAtCamera(t)` — TH:3934; `t` ms. `avatarIgnoreCamera` doğruysa kameraya değil ileri bakar (THR). Hedef `head.speakTo` (başka TalkingHead, Object3D ya da dünya konumu) ile değiştirilebilir (TH:3938-3941, THR:1000-1006).
- `lookAt(x, y, t)` — TH:4051; (x,y) EKRAN piksel koordinatı (görünür viewport; `nodeAvatar.getBoundingClientRect()` ile göreli, TH:4054-4058), `t` ms. Kamera yoksa hiçbir şey yapmaz (TH:4052). `lookAhead(t)` TH:3895.

## 5. Animasyon döngüsü, kök nesne, kanca

- Kök: `head.armature` (TH:1292, THR:995-996); standart modda `gltf.scene` sahneye eklenir (TH:1412) ve `armature` onun çocuğudur. avatarOnly'de yalnız `armature` eklenir (TH:1408-1410). Ölçek 1'e sabitlenir (TH:1297).
- Dünya konumu/rotasyonu dışarıdan değiştirilebilir: THR:994-996 `head.armature.position.set(1,0,0)`, README Appendix H örneği `rotation.set(0,0.5,0)` (THR:955-957). TH kendi kodunda armature'ün dünya dönüşünü hesaba katıyor: `lookAtCamera/lookAt` `armature.quaternion` kullanır (TH:3982, 4071); ayak-kalça dengesi `toe_world - armature.position` (TH:2727-2733).
  - RİSK (Y ekseni): ayak-kalça dengesi her karede `box.setFromObject(armature)` DÜNYA kutusunun min.y'sini alıp `Hips.position.y -= box.min.y/2` yapar (TH:2726-2733). Armature'ü Y'de yükseltmek/zıplatmak bu düzeltmeyle çakışır. Yatay (x,z) taşıma ve Y-dönüşü (yön) güvenli görünüyor: x,z düzeltmesi `armature.position` çıkarılarak hesaplanır (TH:2728-2731) — bu bir okuma; test edilmedi.
- Kare sırası (`animate(t)`, TH:2403-2796), hepsi tek karede:
  1. dt hesaplanır, `modelFPS` altındaysa kare atlanır (TH:2413-2420).
  2. Animasyon kuyruğu / morph hedefleri üretilir (arada, TH:~2440-2690).
  3. `updatePoseBase(animClock)` — poz hedefinden kemiklere (quaternion/position) KOPYALAR; `mixer.update()` (varsa); `updatePoseDelta()` (TH:2692-2697). Her karede kemikleri yeniden yazar.
  4. Ses seviyesine bağlı boyun hareketi (TH:2699-2724).
  5. Ayak-kalça dengesi (Hips.position düzeltmesi, TH:2726-2733).
  6. `dynamicbones.update(dt)` (TH:2736).
  7. `if (this.opt.update) this.opt.update(dt)` — ÖZEL KANCA (TH:2739-2742).
  8. `updateMorphTargets(dt)` (TH:2745).
  9. Kamera geçişi / `controls.update` / `render()` (TH:2748-2791).
- GÜVENLİ NOKTA: `opt.update(dt)` (dt: ms, `animSlowdownRate`'e bölünmüş değer, TH:2421-2422). Poz yazımından SONRA, morph güncellemesi ve çizimden ÖNCE çalışır; burada kemik `quaternion`/`position` değerlerini ezersek aynı karede çizilir, bir sonraki karede `updatePoseBase` yine üzerine yazar (bu yüzden her karede yeniden uygulanmalı). Kurucuda verilir (TH:186, THR:191) veya sonradan `head.opt.update = fn` (HAT:302 aynı şeyi yapar). HeadAudio de bu kancayı kullanır (bkz. madde 6) — ikisini birleştirmek için tek bir fonksiyon yazılmalı.
- Prosedürel yürüyüş için çakışma riski:
  - Bacak kemikleri (`Left/Right UpLeg, Leg, Foot, ToeBase`) poz şablonlarının parçası (TH:211 vb.) ve `poseDelta` içinde (Leg, UpLeg, TH:318-325); `updatePoseBase` bunları her karede poz hedefine çeker. Bizim kodumuz `opt.update` içinde ezerse kalıcı çakışma yok.
  - Şablon bacak dönüşleri Mixamo rigine özgü olduğundan (örn. `LeftUpLeg.rotation.z ≈ ±3`, TH:211, 218) ABSOLÜT değer yazmak yerine kemiğin güncel quaternion'una delta çarpmak (ya da poz şablon değerini baz alıp salınım eklemek) daha güvenli (çıkarım).
  - `Hips.position` TH'nin ayak-kalça dengesi tarafından kare içinde DEĞİŞTİRİLİR (TH:2731-2733); kanca bunun sonrasında çalıştığından Hips.y'ye müdahale edersek düzeltme bizim değerimizin üstüne yazılmaz ama bir sonraki karede yeniden başlar. Kalça yüksekliğine dokunmamak daha güvenli.
  - `playAnimation` (mixer) bacakları sürerken `opt.update` bunun ÜSTÜNE yazabilir (mixer.update kancadan önce, TH:2693-2695); yürüyüşü kendi kodumuzla yapacaksak `playAnimation` çağrılmamalı (konuşurken `speakWithHands` kolları da kendiliğinden oynatır; mixer yokken çalışır, TH:4190).
  - `walking.fbx` ile mixer tabanlı yürüme alternatifi mevcut (TH ile gelen dosya).
  - Dinamik kemik yok sayıldı.

## 6. HeadAudio

- Kurulum adımları (HAR:80-140, HAT:265-302):
  1. `import { HeadAudio } from "./modules/headaudio.mjs"` (HAT:96; HAR:92-95 küçültülmüş `./dist/headaudio.min.mjs`). DİKKAT: HAR kod örneği `HeadAudioNode` içe aktarıp `new HeadAudio` diyor (HAR:109 vs 119) ve `loadModel("./dist/model-en-mixed.mjs")` yazıyor (HAR:129); gerçek ad `HeadAudio` (modules/headaudio.mjs:276 `export { HeadAudio }`), model uzantısı `.bin` (HAT:284). HAT'ı esas alın.
  2. AudioWorklet: `await head.audioCtx.audioWorklet.addModule("./modules/headworklet.mjs")` (HAT:267). Worklet dosyası `registerProcessor("headworklet", ...)` yapar (modules/headworklet.mjs:109); `dist/headworklet.min.mjs` kendi içinde tüm bağımlılıkları paketlenmiş tek dosya (dist sonu `registerProcessor("headworklet",HeadWorklet)`). Modüllerden kullanılırsa headworklet.mjs şu dosyaları içe aktarır: processor, ringbuffer, mfcc, vadgate, classifier, parameters (modules/processor.mjs:1-5, classifier/mfcc/vadgate: parameters.mjs).
  3. `new HeadAudio(head.audioCtx, { visemeMinMs:120, processorOptions:{}, parameterData:{vadMode:1} })` (HAT:270-279).
  4. `await headaudio.loadModel("./dist/model-en-mixed.bin")` (HAT:284); 14352 bayt (dist listesi).
  5. Bağlantı: `head.audioSpeechGainNode.connect(headaudio)`, sonra gecikme: `DelayNode(delayTime: 0.15)` ile `audioSpeechGainNode -> delay -> audioReverbNode` (HAT:290-294; HAR önerisi 0.1 s, HAR:134-137). Düğüm tek mono giriş, çıkış yok (HAR:99-101, headaudio.mjs:39 `numberOfOutputs:0`). Mikrofon girişi doğrudan `micNode.connect(headaudio)` (HAT:601-603).
  6. Morph eşleme: `headaudio.onvalue = (key,value) => Object.assign(head.mtAvatar[key], {newvalue: value, needsUpdate: true})` (HAT:297-299). `key` Oculus adı (`viseme_aa, _E, _I, _O, _U, _PP, _SS, _TH, _DD, _FF, _kk, _nn, _RR, _CH, _sil`, modules/headaudio.mjs:56-60 dizisi; HAR:onvalue satırı). Değer 0..1; `visemeMaxs` ile tavan 0.65-0.75 (headaudio.mjs:28-32).
  7. Döngüye bağlama: `head.opt.update = headaudio.update.bind(headaudio)` (HAT:302); `update(dt_ms)` yumuşatma ve `onvalue` çağrısı yapar (headaudio.mjs:196-231). Yani HeadAudio'nun ürettiği kanca ile bizim yürüyüş kodumuz AYNI `opt.update` yuvasında buluşur, tek fonksiyonda çağrılmalı.
  8. TalkingHead tarafı: HAT:249-257 örneği `lipsyncModules: []`, `ttsEndpoint: "N/A"`. TH'nin kendi viseme animleri aynı anda çalışırsa karışır; HAT metin tabanlı viseme üretmez (HeadTTS sesi doğrudan `audioSpeechGainNode`'a verir, HAT:659 örneği AudioBufferSource -> audioSpeechGainNode).
- Dil bağımlılığı: Model akustik (MFCC + Gauss prototipleri) ve metinsiz çalışır ("works with any audio stream or TTS output without requiring text transcripts", HAR:12-17). ANCAK tek hazır model `model-en-mixed.bin`, İngilizce Kokoro/HeadTTS sesleri ve Harvard cümleleriyle eğitilmiş (HAR:195-218; 4 ses: af_bella, af_heart, am_adam, am_fenrir). README Türkçe uygunluğu hakkında bir şey söylemez: "Türkçe/dil" ifadesi README'de bulunamadı (grep language/turk/multiling sonuç vermedi). Fonem sınıfları IPA temelli (HAR Appendix A) olduğundan Türkçe ünlü/ünsüzlerin çoğu karşılığı var (çıkarım), ancak doğruluk gerçek test olmadan doğrulanamaz. README doğruluğun "far from optimal" olduğunu, düşük SNR'de zorlandığını belirtir (HAR:21-26).
- Sessiz ortam notu: HeadAudio SES gerektirir (ses -> viseme). Ses çalmayan sessiz konuşma için kullanılamaz.
- Bizim projeye kopyalanacak minimum set:
  - Seçenek A (önerilen, 3 dosya): `dist/headaudio.min.mjs`, `dist/headworklet.min.mjs`, `dist/model-en-mixed.bin` + `LICENSE` (MIT, Copyright (c) 2025 Mika Suominen, HeadAudio/LICENSE:1-3). (`dist/headaudio.min.mjs` sonunda `export{HeadAudio}`; `headworklet.min.mjs` kendi içinde paketli, harici import yok — dosya başı/sonu kontrol edildi.)
  - Seçenek B (kaynak): modules/headaudio.mjs, training.mjs, parameters.mjs (ana iş parçacığı) + modules/headworklet.mjs, processor.mjs, ringbuffer.mjs, mfcc.mjs, vadgate.mjs, classifier.mjs, parameters.mjs (worklet tarafı; HeadAudio import grafı modules/*.mjs:1-5) + model .bin + LICENSE. UI dosyaları (ui-headaudio, ui-mixer) gerekmez.
- TalkingHead için kopyalanacak (kaynak içe aktarma grafı): modules/talkinghead.mjs, retargeter.mjs, dynamicbones.mjs, playback-worklet.js (`new URL('./playback-worklet.js', import.meta.url)`, TH:36-38), kullanılan `lipsync-*.mjs` (dinamik import, TH:2814-2822; yalnız `words` verip `visemes` vermiyorsak gerekir) + `LICENSE` (MIT, Copyright (c) 2024 Mika Suominen, TH:1-3 ve TalkingHead/LICENSE). Three addons ve three importmap ile CDN'den ya da yerelden gelir.

## 7. Ses yokken dile bağımsız "konuşma" görünümü

TalkingHead'de bunun için tek hazır "sessiz konuşma" API'si bulunamadı. Çalışan yollar:

1. `speakAudio` + SESSİZ AudioBuffer + hazır viseme dizisi (dile bağımsız, zamanlı): `head.audioCtx.createBuffer(1, rate*sn, rate)` ile boş (sıfır dolu) bir `AudioBuffer` üretip `audio` olarak verin; `words/wtimes/wdurations` (altyazı için; viseme için de gerekli, bkz. madde 3) + `visemes/vtimes/vdurations` (ms) verin. `visemes` verildiğinde dil modülüne ihtiyaç kalmaz (TH:3112-3113 `if(!r.visemes)`; 3167-3178). `audioCtx` herkese açık özellik (TH:925-938). Bu, "sessiz AudioBuffer" kısmı TH kodunda değil, Web Audio standardında; TH koduyla doğrulanan kısım: `line.audio` doluysa `playAudio` ses kaynağını başlatır ve anim zamanlarını ses başlangıcına hizalar (TH:3279-3288). Sessizlik ses analizöründen geçtiği için ses-hacmine bağlı baş hareketi tetiklenmez; çıkarım.
2. `speakAudio({audio: sessizBuffer, anim:{name:'blendshapes', dt:[ms...], vs:{jawOpen:[...], mouthRollLower:[...]}}})`: doğrudan blendshape dizisi, dil gerektirmez (THR:857-870; kod TH:3194-3203, `animFactory(r.anim,false,1,1,true)`). Yine `audio` şart (aksi halde "Only subtitles" dalı, zamanlama yok, TH:3464-3475).
3. Doğrudan morph kontrolü:
   - `head.setFixedValue(mt, val, ms=null)` — TH:2201; en yüksek öncelik, diğer her şeyi ezer; geri dönmek için `null` (THR:Appendix F, 838-842). `ms` bu fonksiyonda kullanılmıyor (parametre alınır ama gövdede atanmıyor, TH:2201-2222).
   - `head.setValue(mt, val, ms=null)` — TH:2057; "system" değeri, animasyonları ezer, `ms` geçiş süresi (TH:2057-2061, öncelik açıklaması TH:1658-1664). `getValue(mt)` TH:2047.
   - `Object.assign(head.mtAvatar[mt], {realtime: v, needsUpdate: true})` — geçişsiz, "fixed" hariç hepsini ezer (THR:844-846; TH:1672-1676). HeadAudio'nun kullandığı `newvalue` en düşük (animasyon) öncelikli (TH:1344, 1672-1698 sırası).
   - `setBaselineValue(mt, val)` TH:2153, `getMorphTargetNames()` TH:2117. Kullanılabilir adlar: `jawOpen`, `mouthOpen` (ARKit'ten türetilir, TH:743), `mouthFunnel`, `mouthPucker`, `viseme_*`.
   - Bir salınım için `opt.update` kancasında (madde 5) her karede `setValue('jawOpen', 0.3*Math.abs(Math.sin(t)))` çağırmak en basit, dile bağımsız "konuşuyor gibi" görünüm; zamanlama bizim elimizde.
4. `avatarMute` (speakText seçeneği, TH:2954): yalnız TTS çağrısını atlar; kuyruk öğesi "Only subtitles" dalına düşer, vizemeler zamanlanmaz (hepsi 10 ms aralıkla anında oynar, TH:3464-3475). Sessiz zamanlı lipsync için YETERSİZ.
5. `speakText` (TTS'siz) mümkün değil: metin dalı Google TTS'e `fetch` yapar (TH:3399) ve hata olursa sonraki öğeye geçer (TH:3456-3459).
