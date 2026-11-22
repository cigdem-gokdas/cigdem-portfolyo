# Lisans ve Avatar Notu (Kaşif)

Tarih: 2026-11-22. İnceleme aracı: Python 3 (-I, harici paket yok), GLB başlığı + JSON chunk. ~/Desktop/cigdem.glb değiştirilmedi.

## A) GLB incelemesi (~/Desktop/cigdem.glb)

Genel: glTF 2.0, 3 966 988 bayt, üretici "Avaturn.me | Blender". `extensionsUsed`/`extensionsRequired` yok (hiç KHR_* uzantısı yok; Draco/Meshopt/KHR_texture_basisu yok). Animasyon: 0. Skin: 1 ("Armature", 52 eklem).

Not: TalkingHead/avatars/cigdem.glb, Desktop dosyasıyla bayt bayt aynı (`cmp`) ve TalkingHead deposunda izlenmeyen (untracked) dosya olarak duruyor. Salt okunur kuralı gereği dokunulmadı.

### Mesh'ler ve morph target'lar
| # | Mesh | Primitive | Morph target |
|---|------|-----------|--------------|
| 0 | avaturn_body | 1 | 0 |
| 1 | avaturn_hair_0 | 1 | 0 |
| 2 | avaturn_hair_1 | 1 | 0 |
| 3 | avaturn_shoes_0 | 1 | 0 |
| 4 | avaturn_look_0 | 1 | 0 |

Hiçbir mesh'te `targets` yok, `extras.targetNames` yok. Toplam köşe: 17 361 (POSITION/NORMAL/JOINTS/WEIGHTS), TEXCOORD_1 4 824.
- Oculus viseme_* (15): HEPSİ EKSİK (sil, PP, FF, TH, DD, kk, CH, SS, nn, RR, aa, E, I, O, U).
- ARKit 52 (jawOpen, mouthClose, eyeBlinkLeft/Right vb.): HEPSİ EKSİK.
- Sonuç: bu GLB "yüzsüz iskelet"tir; dudak senkronu, göz kırpma, mimik için morph yok. Durum: viseme = YOK.

### Kemik/node adları (58 node)
Mixamo/RPM adlandırması, `mixamorig` öneki YOK (TalkingHead'in beklediği düz ad): Hips, Spine, Spine1, Spine2, Neck, Head, LeftShoulder/Arm/ForeArm/Hand, LeftHandThumb1-3, Index1-3, Middle1-3, Ring1-3, Pinky1-3 (sağ için aynı), LeftUpLeg, LeftLeg, LeftFoot, LeftToeBase (sağ için aynı). Kök: "Armature".
- EKSİK: `LeftEye`, `RightEye` (node listesinde yok).
- Ek (şablon dışı): sadece "Armature" (kök) ve mesh node'ları.

### Dokular
13 görsel, hepsi GLB içine gömülü (bufferView). Toplam 2 847 816 bayt (BIN 3 938 992 bayt içinde ~%72). Geri kalan ~1,09 MB geometri.
| # | Tür | Boyut | Bayt |
|---|-----|-------|------|
| 0 | JPEG | 512x512 | 23 604 |
| 1 | JPEG | 1024x1024 | 187 172 |
| 2 | JPEG | 1024x1024 | 70 324 |
| 3 | PNG | 1024x1024 | 1 160 988 (tek başına %41; muhtemelen alfa/saç dokusu, doğrulanmadı) |
| 4 | JPEG | 1024x1024 | 148 200 |
| 5 | JPEG | 1024x1024 | 62 164 |
| 6 | JPEG | 1024x1024 | 182 972 |
| 7 | JPEG | 1024x1024 | 393 172 |
| 8 | JPEG | 512x512 | 21 516 |
| 9 | JPEG | 1024x1024 | 108 816 |
| 10 | JPEG | 1024x1024 | 229 296 |
| 11 | JPEG | 1024x1024 | 238 512 |
| 12 | JPEG | 512x512 | 21 080 |

Sıkıştırma potansiyeli: PNG (#3) WebP/JPEG'e çevrilirse (alfa gerekmiyorsa) ~1 MB kazanç; JPEG kalite düşürme ile ~%30-40; KTX2/Basis'e geçiş GPU belleğini düşürür ama TalkingHead yükleyicisinde KTX2Loader yok (kaynakta bulunmadı, tahmin değil: modules/talkinghead.mjs:25-32 import listesinde yok). Tahmini hedef: ~1,2-1,6 MB doku. (Bu sayı ölçülmedi, tahmindir.)

### TalkingHead uyumu
- Gerekli kemikler: `posePropNames` (talkinghead.mjs:341) şablonlarından türetilen 52 kemik; GLB'de hepsi var (betikle doğrulandı, eksik 0). Kontrol: modules/talkinghead.mjs:1259-1265.
- `mixamorig` öneki varsa otomatik silinir: talkinghead.mjs:1250-1255. Kök adı "Armature" (opt.modelRoot): talkinghead.mjs:1292; README.md:446-460 (Appendix A).
- BLOKE EDİCİ 1: Morph yoksa `showAvatar` hata fırlatır: `throw new Error('Blend shapes not found')` talkinghead.mjs:1319-1321 (morphs toplama: 1305-1318).
- BLOKE EDİCİ 2: `this.armature.getObjectByName('LeftEye'/'RightEye')` talkinghead.mjs:1435-1436; hemen ardından `this.objectLeftEye.getWorldPosition(plEye)` talkinghead.mjs:1445 -> göz yoksa null üzerinde TypeError. Ayrıca bakış takibi 3940-3980.
- Viseme adları `'viseme_'+x`: talkinghead.mjs:2801, 2935, 3149, 3169, 3758. ARKit adları (eyeBlinkLeft vb.) mimik tablolarında: talkinghead.mjs:414-415, 438-602, 627-686.
- README gereksinimi: "Mixamo-compatible rig and ARKit and Oculus viseme blend shapes": README.md:49-51, 446-490. Eksik ekstra şekiller (mouthOpen, mouthSmile, eyesClosed...) ARKit'ten türetilir (README.md:~486); ARKit olmadan türetilemez.
- Özet: kemik adlandırması UYUMLU, morph + göz kemikleri UYUMSUZ. Mevcut haliyle TalkingHead bu GLB'yi yükleyemez. Çözüm adayları (karar Mimar'ın): Avaturn'un "head/ARKit blendshape" içeren dışa aktarımı (Avaturn belgeleri doğrulanmadı), Blender'da morph + göz kemiği ekleme (README Faceit önerir, ücretli eklenti), veya TalkingHead'e yama (salt okunur olduğu için bizim kopyada).

## B) Lisanslar

| Bileşen | Tür | Kaynak | Dağıtım koşulu |
|---|---|---|---|
| TalkingHead | MIT, "Copyright (c) 2023-2024 Mika Suominen" | ~/Projects/TalkingHead/LICENSE:1-3 | Telif + lisans metni kopyalarda korunmalı |
| HeadAudio | MIT, "Copyright (c) 2025 Mika Suominen" | ~/Projects/HeadAudio/LICENSE:1-3 | Aynı |
| Three.js | MIT, "Copyright (c) 2010-2026 three.js authors" | https://raw.githubusercontent.com/mrdoob/three.js/dev/LICENSE (okundu) | Aynı; CDN kullanımı lisansı değiştirmez |

### HeadAudio model dosyası
- dist/model-en-mixed.bin 14 352 bayt. README.md:25-29: "MIT licensed", HeadTTS vb. geliştirme/eğitim/test aracı. README.md:205-216: model dört HeadTTS sesiyle, Harvard Sentences metniyle eğitildi (sentetik veri; kişisel ses verisi yok). Dosya için ayrı bir lisans satırı bulunamadı; depo MIT'i kapsar kabul edilir (açık beyan yok). HeadTTS'in kendi lisansı/ses lisansları kontrol edilmedi.

### TalkingHead örnek avatarlar ve animasyonlar (README.md:365-385)
- brunette.glb: Ready Player Me, CC BY-NC 4.0 (ticari değil). mpfb.glb: CC0. avaturn (README'de "avatar.glb"; dosya avatars/avaturn.glb): Avaturn, ticari olmayan kullanım. avatarsdk.glb, vroid.glb: ticari olmayan.
- walking.fbx ve dance.fbx: Mixamo; README: ">2000 animasyon kişisel, ticari, kâr amacı gütmeyen projelerde royalty-free; ham animasyon dosyaları proje ekibi dışına dağıtılamaz, ML eğitiminde kullanılamaz."
- README.md:385-388 notu: bu varlıkların hiçbiri TalkingHead sınıf sürümlerinin parçası olarak kullanılmaz/dağıtılmaz; kendi uygulamanda kullanacaksan hak sahiplerinin şartlarına bak. Sonuç: avatars/, animations/, poses/ projeye KOPYALANMAMALI; yalnızca modules/ ve MIT metni alınır.

### Avaturn (kritik)
Kaynak: Terms of use, https://docs.google.com/document/d/e/2PACX-1vT5_TR6-MNs29LqI-LLKHvIKHVE0iluuapOpHODGRVDaqyfuCsEgaiE3ZIliI1-FN_-9rxJZ3iVo_jJ/pub (bağlantı https://avaturn.me/ ana sayfasından), fiyat: https://avaturn.me/pricing. WebFetch özetinden okundu (ham metin değil).
- Bölüm 4: avatarın fikri mülkiyeti Avaturn'a aittir; bölüm 5: kullanıcı içeriği hakları 3B avatarları kapsamaz.
- Bölüm 7: avatar "Goodsize Content"; kullanıcıya sınırlı, münhasır olmayan, devredilemez, alt lisanslanamaz, geri alınabilir, KİŞİSEL KULLANIM lisansı. Kopyalama, dağıtma, herkese açık gösterme, değiştirme, bildirim silme açıkça Avaturn izni olmadan yasak. Ticari kullanım ve yeniden satış personal lisansta yok.
- Bölüm 4: ticari kullanım ancak Avaturn'a bildirim + proje linki ile; Pro paket kısıtlı (2021 sonrası startup, <1M$ gelir); fiyat sayfasında ücretsiz plan görünmüyor (Pro 800$/ay, Enterprise).
- Atıf: bölüm 4'e göre uygun atıf, Avaturn bağlantısı, değişiklik belirtimi isteniyor.
- Sonuç: Kişisel portfolyo sitesinde avatarı GLB olarak herkese açık indirilebilir şekilde yayınlamak, metne göre "dağıtma/herkese açık gösterme" ile çakışabilir. Serbest olduğu DOĞRULANAMADI; fazlasıyla riskli (özetteki ceza maddesi 1 000 000 USD). Hukuki yorum değildir.

### Mixamo (yalnızca bilgi; kullanılmıyor)
Adobe SSS sayfası 403, Mixamo sayfası yüklenmedi: doğrulanamadı. TalkingHead README'sindeki özet (yukarıda) tek kaynak.

### Three.js ve CDN
- MIT (yukarıda). TalkingHead index.html:395-397 importmap: `https://cdn.jsdelivr.net/npm/three@0.186/build/three.module.js/+esm` ve `three/addons/` -> `.../three@0.186/examples/jsm/`. DRACOLoader/Meshopt/FBXLoader import ediliyor (talkinghead.mjs:25-32). Bizim için sürümü tam sabitleyin (örn. three@0.186.x), `@latest` kullanmayın (index.html:403 Azure Speech `@latest` kullanıyor; biz gerek duymuyoruz).
- CDN (jsDelivr) kullanım koşulları okunmadı.

## Belirsizlikler
1. Avaturn avatarının statik sitede herkese açık indirilebilir GLB olarak yayını: şartlar kişisel kullanım diyor, dağıtımı yasaklıyor; ücretsiz kullanıcı için özel bir "yayın" istisnası bulunamadı. Avaturn'a yazılı izin/e-posta veya avatarı sadece sunucuda tutup dokular/mesh'i dışarı vermeyen bir yol gerekir. Karar Mimar/Çiğdem'in.
2. Şartlar özet üzerinden okundu (WebFetch modeli), ham Google Docs metni değil; maddeler resmi metinden tekrar doğrulanmalı. "Çıkarılan varlıklar için ayrı lisans" belgesi okunmadı.
3. Avaturn'un morph (ARKit/viseme) içeren dışa aktarımı olup olmadığı: bulunamadı/doğrulanmadı.
4. HeadAudio model-en-mixed.bin için ayrı lisans satırı yok; HeadTTS ses/model lisansları incelenmedi.
5. Mixamo resmi koşulları (Adobe) çevrimiçi doğrulanamadı.
6. PNG dokunun (#3) hangi materyale ait olduğu ve alfa kullanıp kullanmadığı kontrol edilmedi.
7. jsDelivr kullanım koşulları okunmadı.
