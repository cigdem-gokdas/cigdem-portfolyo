# Çiğdem Gökdaş: 3B portfolyo

3B bir odada duran avatar ve istasyonlar (projeler, hackathonlar, deneyim, eğitim, beceri halkası, dil). Bir istasyona tıklayınca avatar oraya yürür, altyazıyla konuşur ve içerik paneli açılır. Derleme adımı, sunucu, API anahtarı ve harici servis yok: statik dosyalar, ES modülleri ve bir importmap. Dar/mobil ekranlarda 3B hiç başlatılmaz, düz liste gösterilir.

## Yerelde çalıştırma

```sh
cd ~/Projects && python3 -m http.server 8765
```

Sonra http://localhost:8765/cigdem-portfolyo/ adresini aç. Sunucuyu bir üst klasörden başlatmak, GitHub Pages'in alt yolunu (`/cigdem-portfolyo/`) benzetir; göreli yollar bu şekilde sınanır.

## Ses dosyaları

- Konuşulacak metinler ve dosya adları `content/lines.md` tablosunda (kaynak: `content/lines.json`). Her satırın dosyası `assets/voice/<id>.mp3`.
- Önerilen biçim: mp3, mono, 44.1 veya 48 kHz, baştaki/sondaki sessizlik kırpılmış.
- Dosya eklemek için kod değişikliği gerekmez; adı doğru olması yeter.
- Metin değişirse o satırın sesi yeniden kaydedilmeli (ses ile altyazı ayrı tutulur, otomatik eşleşmez).

3B modda `Avatar.speak()` şöyle çalışır (`src/avatar/Avatar.js`):
1. Altyazıyı hemen gösterir.
2. Kullanıcı sayfada en az bir kez tıkladıysa (`pointerdown`) `assets/voice/<id>.mp3` için `HEAD` isteği atar. Tarayıcılar ilk etkileşimden önce ses çalmayı engellediği için ilk tıklamaya kadar ses denenmez.
3. `HEAD` başarılıysa sesi çalar, bitince altyazıyı kaldırır.
4. Ses yoksa ya da çalınamazsa altyazı `max(1500 ms, karakter sayısı × 70 ms)` kadar kalır.

Ses dosyası yokken tarayıcı konsolunda 404 görülmesi beklenen durumdur. Mobil düz listede (`src/main.js`) altyazı yok; kayda tıklanınca doğrudan `new Audio(...).play()` denenir, dosya yoksa sessiz kalır.

## GitHub Pages yayını

Settings → Pages → Source: Deploy from a branch → `main` / (root). Adres: https://cigdem-gokdas.github.io/cigdem-portfolyo/

Alt yolda çalışmasının nedeni: tüm yollar göreli (`./assets/...`, `./src/...`, `./content/...`) ve Three.js importmap ile jsDelivr'den sabit sürümle (`three@0.186.0`) yükleniyor. Yazı tipi (Inter) Google Fonts'tan gelir. `.nojekyll` gerekmiyor: alt çizgiyle başlayan dosya veya klasör yok. Not: `docs/` ve `content/` klasörleri de sitede herkese açık olur.

## İçerik düzenleme

- `content/site.json`: `contact` (github, linkedin, email, phone) ve `sections` listesi. Her bölümde `id`, `type`, `title` ve `items`; her öğede `id`, `title`, `meta`, `summary`, `bullets`, `tech`, `url`. `beceriler` bölümü `items` yerine `groups` kullanır (`name` ve `items: [{name, source}]`).
- `content/lines.json`: avatarın konuştuğu satırlar, `id`, `text`, `where`. Kalıp seçimi 3B ve mobilde aynı `lineFor(item, section, lines)` ile yapılır (`src/content.js`): önce öğenin `line` alanı, sonra öğenin `id`'si, sonra bölümün `line` alanı (`site.json`). Seçilen kaydın `id`'si ses dosyası adıdır. `content/lines.md` aynı satırların insan okur tablosudur; ikisini birlikte güncelle.
- Sitede görünen tüm metin bu iki dosyadan okunur; `src/` içinde metin yoktur (adın `Çiğdem Gökdaş` olarak `src/main.js`'te yazılı olması hariç).

## Avatar (GLB)

- `assets/cigdem.glb`, gltf-transform ile sıkıştırıldı (meshopt + WebP). Komut:

```bash
npx @gltf-transform/cli@4 optimize kaynak.glb assets/cigdem.glb --compress meshopt --texture-compress webp --texture-size 1024 --simplify false --join false --instance false --flatten false --palette false
```

  Sonuç 3.97 MB → 1.33 MB; tarayıcıda MeshoptDecoder ile açılır.
- Sitede GLB için indirme bağlantısı yok. Dosya herkese açık repoda ve sitede teknik olarak yine de erişilebilir. Avaturn kullanım şartları kişisel kullanımla sınırlı olabilir: bkz. `docs/LISANS-VE-AVATAR.md`.
- Mevcut GLB'de yüz morph'ları yok; ağız hareketi yok, konuşurken baş hafifçe sallanır.
- TalkingHead entegrasyonu Avaturn Type-2 (T-Pose) dışa aktarımını bekliyor. Yeni GLB gelince:
  1. Hash ve morph kontrolü (morph target adları, göz kemikleri var mı).
  2. TalkingHead dosyalarını ve LICENSE'ı kopyala (liste: `docs/NOTLAR.md` §6 sonu).
  3. `src/avatar/Avatar.js` içindeki `TODO(TH)` noktalarını bağla (`speak`, `wave`, `point`, `lookAtPoint`, yürüme).
  4. İstenirse HeadAudio ekle (3 dosya: `headaudio.min.mjs`, `headworklet.min.mjs`, `model-en-mixed.bin`).

## Lisanslar

- Three.js: MIT.
- TalkingHead ve HeadAudio: MIT (henüz repoya kopyalanmadı).
- TalkingHead örnek avatarları/animasyonları ve Mixamo dosyaları kullanılmadı.
- CV PDF'i repoda yok (`.gitignore` `*.pdf` dışlar).

## Klasör yapısı

```
index.html, styles.css
assets/    cigdem.glb, avatar-poster.webp, favicon.svg  (voice/ ses eklenince oluşur)
content/   site.json, lines.json, lines.md, cv.md
docs/      NOTLAR.md (TalkingHead/HeadAudio API notları), LISANS-VE-AVATAR.md
src/       main.js, content.js, mobile.js
  scene/   app3d, room, stations, sections, screens, skillRing, dust, reveal
  avatar/  Avatar.js
  ui/      panel, subtitle, loader, contact, flatList, ui.css
```
