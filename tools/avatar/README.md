# Avatar üretimi (MPFB2 / MakeHuman)

`assets/avatar.glb` bu klasördeki betiklerle sıfırdan üretilir. Çıktı TalkingHead uyumludur: Mixamo adlı iskelet
(`Hips` … `RightToeBase`, `LeftEye`/`RightEye`), gövdede 50 ARKit + 15 Oculus `viseme_*` şekil anahtarı.

## Gerekenler (bir kez)

1. Blender 5.x: `brew install --cask blender`
2. MPFB eklentisi: `blender --online-mode -b -c extension install -s -e mpfb`
3. MakeHuman varlık paketleri (https://static.makehumancommunity.org/assets/assetpacks.html), MPFB kullanıcı veri
   klasörüne açılır (`~/Library/Application Support/Blender/5.3/extensions/.user/blender_org/mpfb/data/`):
   `makehuman_system_assets_cc0`, `faceunits01`, `visemes02`, `skins01_cc0`, `eyebrows01_cc0`, `eyelashes01_cc0`, ve `punkduck_alpha7_long` saçını içeren paket.
4. Python 3 + numpy + opencv-python (yalnızca göz dokusu için), Node (gltf-transform `npx` ile gelir).

## Üretim

```bash
./tools/avatar/build.sh
```

Adımlar:
1. `build_avatar.py` (Blender içinde): `cigdem.json`'daki fenotip ve yüz ayarlarıyla insanı kurar; ten, göz, kaş, kirpik,
   diş, dil, saç ve kıyafeti ekler; saç/kaş/kıyafeti yeniden renklendirir, dudakları gül rengine çeker, kafa derisini
   saç rengine boyar (COLOR_0); ARKit + viseme hedeflerini yükleyip alt meshlere aktarır; göz kemiklerini ekler;
   adları TalkingHead düzenine çevirir; ham GLB yazar.
2. `fix_skeleton.py`: kemik eksenlerini Mixamo/RPM T-poz düzenine getirir (`ref_frames.json`). TalkingHead pozları
   mutlak yerel dönüşlerdir, bu adım olmadan kollar/parmaklar bozulur. Köşeler değişmez; inverseBindMatrix'ler güncellenir.
3. gltf-transform: meshopt + WebP 1024 (≈1,1 MB).

### Yüzü fotoğraflara uydurma

MakeHuman hedefleri köşe farklarıdır; yüz oranları (göz genişliği/açıklığı, kaş-göz, burun, ağız, dudaklar, çene,
yanak, yüz boyu; göz merkezleri arasına bölünmüş) fotoğraflardan MediaPipe ile ölçülür ve modelin köşelerinde aynı
oranları veren hedef ağırlıkları bulunur. Fotoğraflar repoya girmez.

```bash
# bir kez: python -m venv mpenv && mpenv/bin/pip install mediapipe opencv-python numpy scipy
# model: https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task
blender -b -P tools/avatar/fit_dump.py -- --config tools/avatar/cigdem.json --out tools/avatar/out/fit
mpenv/bin/python tools/avatar/ratio_fit.py --model face_landmarker.task --dump tools/avatar/out/fit \
    --photo onden.jpg:2 --photo selfie.jpg:1 --out tools/avatar/out/fit/ratio_targets.json
```

- `fit_dump.py`: fenotipli tabanı kurar, ~216 yüz hedefinin baş köşelerindeki deltasını ve önden ortografik render'ı yazar.
- `ratio_fit.py`: render üzerindeki MediaPipe noktalarıyla nokta→köşe eşlemesi yapar; algılayıcı yanlılığını render
  ölçümüyle düzeltir; sınırlı (L-BFGS-B) çözümle hedef ağırlıklarını verir. Selfie perspektifine duyarlı ölçüler (burun)
  yalnızca ağırlığı ≥2 fotoğraftan alınır; gülümseme ağız genişliği/dudak kalınlığı için düzeltilir.
- `face_fit.py`: nokta bazlı tam uydurma (deneysel; çapraz doğrulamada az kazanç, `ratio_fit.py` tercih edildi).
- `--measure a.jpg b.png ...`: yalnızca oran tablosu (doğrulama: uydurulmuş render'ı fotoğraflarla karşılaştır;
  render için `fit_dump.py --targets hedefler.json`).
- Sonuç `cigdem.json` → `targets`'a elle yazıldı; gülümsemeden ötürü dudak hacmi/kalınlığı elle dolgunlaştırıldı.

Önizleme render'ı (dışa aktarmadan): 
```bash
blender -b -P tools/avatar/build_avatar.py -- --config tools/avatar/cigdem.json --preview /tmp/onizleme --views yuz,yuz34,bust,profil
```
Tek ayarı denemek için: `--set 'hair="long01"'`.

Göz dokusu: `python3 tools/avatar/make_eye_texture.py <mpfb>/eyes/materials/brown_eye.png tools/avatar/textures/cigdem_eye.png`
(koyu kahve, %38 büyütülmüş iris; alfa korunur).

## Görünüm ayarları (`cigdem.json`)

- `phenotype`: kadın, ~23 yaş, ince yapı. `targets`: oval yüz, büyük göz, dolgun dudak, ince burun (MakeHuman hedef adları;
  liste: MPFB `data/targets/target.json`).
- `skin`: `skalldyrssuppe_creamy_female` + `skin_tint` (sıcak ton çarpanı), `eyebrows`: `mindfront_eyebrows_12`,
  `eyelashes`: `eyelashes03`, `hair`: `punkduck_alpha7_long` (ortadan ayrık, uzun; alfa kartlı, `hair_color` sıcak koyu kahve),
  `clothes`: `female_casualsuit01` (`clothes_color` siyah).
- `scalp`: saçın altındaki kafa derisini saç rengine boyar. `hair_fade`: saç kepinin alındaki sert kenarını köşe alfasıyla
  yumuşatır (COLOR_0). Tarayıcıda saç iki geçişle çizilir (Presenter: opak kesik alfa + yumuşak saydam kopya).

## Lisanslar

MakeHuman taban mesh, hedefler, ten, göz, kaş (`mindfront_eyebrows_12`, Mindfront), kirpik, diş, dil, kıyafet: CC0.
Saç `punkduck_alpha7_long` (yazar bilinmiyor, uyarlama punkduck): dosyada AGPL3 ve MakeHuman dışa aktarım istisnası
(makehuman.org external tools license) belirtilir. Tamamen CC0 için `hair: long01`. `ref_frames.json` yalnızca eksen yönelimi sayılarıdır.
