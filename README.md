# Çiğdem Gökdaş: portfolyo

"Hoca anlatıyor" düzeni: arkada okul kara tahtası (yeşil tahta, ahşap çerçeve, tebeşir rafı; yazılar ve küçük çizimler beyaz tebeşir gibi) (bölümler → alt başlıklar → detay), solda önde belden yukarı 3B Çiğdem avatarı. Bir karta basınca avatar tahtaya yarı dönüp sol eliyle o karta dokunur, slayt açılır, avatar izleyiciye dönüp altyazıyla anlatır; anlatırken el-kol jestleri yapar, göz kırpar, nefes alır, göz teması kurar. Derleme adımı, sunucu, API anahtarı ve harici servis yok: statik dosyalar, ES modülleri ve bir importmap. Dar ekranlarda (<900 px) avatar yüklenmez, tahta tek sütun çalışır.

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

`Presenter.say()` şöyle çalışır (`src/avatar/Presenter.js`):
1. Altyazıyı hemen gösterir.
2. Kullanıcı sayfada en az bir kez tıkladıysa (`pointerdown`) `assets/voice/<id>.mp3` için `HEAD` isteği atar. Tarayıcılar ilk etkileşimden önce ses çalmayı engellediği için ilk tıklamaya kadar ses denenmez.
3. `HEAD` başarılıysa sesi çalar, bitince altyazıyı kaldırır.
4. Ses yoksa ya da çalınamazsa altyazı `max(1600 ms, karakter sayısı × 70 ms)` kadar kalır. Sesle konuşurken HeadAudio dudakları sesten sürer (şimdilik İngilizce model; Türkçe dudak senkronu sonra eklenecek).

Ses dosyası yokken `HEAD` isteği 404 döner, bu beklenen durumdur. Dar ekranda avatar olmadığı için ses çalınmaz, yalnızca tahta çalışır.

## GitHub Pages yayını

Settings → Pages → Source: Deploy from a branch → `main` / (root). Adres: https://cigdem-gokdas.github.io/cigdem-portfolyo/

Alt yolda çalışmasının nedeni: tüm yollar göreli (`./assets/...`, `./src/...`, `./content/...`) ve Three.js importmap ile jsDelivr'den sabit sürümle (`three@0.186.0`) yükleniyor. Yazı tipi (Kalam, latin + latin-ext, Türkçe karakterler dahil) `assets/fonts/` altında yereldir. `.nojekyll` gerekmiyor: alt çizgiyle başlayan dosya veya klasör yok. Not: `docs/` ve `content/` klasörleri de sitede herkese açık olur.

## İçerik düzenleme

- `content/site.json`: `contact` (github, linkedin, email, phone) ve `sections` listesi. Her bölümde `id`, `type`, `title` ve `items`; her öğede `id`, `title`, `meta`, `summary`, `bullets`, `tech`, `url`. `beceriler` bölümü `items` yerine `groups` kullanır (`name` ve `items: [{name, source}]`).
- `content/lines.json`: avatarın konuştuğu satırlar, `id`, `text`, `where`. Kalıp seçimi `lineFor(item, section, lines)` ile yapılır (`src/content.js`): önce öğenin `line` alanı, sonra öğenin `id`'si, sonra bölümün `line` alanı (`site.json`). Seçilen kaydın `id`'si ses dosyası adıdır. `content/lines.md` aynı satırların insan okur tablosudur; ikisini birlikte güncelle.
- Sitede görünen tüm metin bu iki dosyadan okunur; `src/` içinde metin yoktur (adın `Çiğdem Gökdaş` olarak `src/main.js`'te yazılı olması hariç).

## Avatar (GLB)

- `assets/avatar.glb` sıfırdan, MakeHuman/MPFB2 ile `tools/avatar/` betikleriyle üretilir (ayrıntı: `tools/avatar/README.md`). Yüz oranları fotoğraflardan MediaPipe yüz noktalarıyla ölçülüp MakeHuman hedeflerine uydurulur (`ratio_fit.py`); koyu kahve iri gözler, kalın kaşlar, ortadan ayrılmış uzun koyu kahve saç, siyah üst. ≈1,7 MB (meshopt + WebP).
- Mixamo adlı iskelet + `LeftEye`/`RightEye`, 50 ARKit + 15 Oculus viseme şekil anahtarı: TalkingHead avatarOnly modunda göz kırpma, nefes, mimik, jest ve HeadAudio ile sesten dudak senkronu çalışır.
- `src/avatar/Presenter.js`: kamera/ışık, TalkingHead kurulumu, `point(el)` (tahtaya dönme + sol elle dokunma; dokunma anında Promise çözülür), `say(id, metin)` (altyazı + varsa ses), `idle()`.
- Geliştirme: `?hata-ayikla` parametresiyle `window.__sunucu` açılır.

## Lisanslar

- Three.js: MIT.
- TalkingHead ve HeadAudio: MIT, değiştirilmeden `src/vendor/` altında (LICENSE dosyalarıyla).
- Avatar: MakeHuman taban, hedefler, ten, kaş (`mindfront_eyebrows_12`, Mindfront) vb. CC0. Saç `punkduck_alpha7_long` (uyarlama punkduck): dosyada AGPL3 yazar ve MakeHuman'ın dışa aktarım istisnasına işaret eder (makehuman.org external tools license); tamamen CC0 isteniyorsa `cigdem.json`'da `"hair": "long01"` yapılıp yeniden üretilir.
- Yazı tipi Kalam: SIL Open Font License 1.1.
- TalkingHead örnek avatarları/animasyonları ve Mixamo dosyaları kullanılmadı.
- CV PDF'i repoda yok (`.gitignore` `*.pdf` dışlar).

## Klasör yapısı

```
index.html, styles.css
assets/    avatar.glb, favicon.svg  (voice/ ses eklenince oluşur)
content/   site.json, lines.json, lines.md, cv.md
docs/      NOTLAR.md (TalkingHead/HeadAudio API notları), LISANS-VE-AVATAR.md
src/       main.js, content.js
  board/   board.js (tahta: seviyeler, hash yönlendirme, presenter sözleşmesi), board.css, icons.js
  avatar/  Presenter.js
  ui/      subtitle, loader
tools/avatar/  avatar üretim betikleri (Blender/MPFB, iskelet düzeltme, göz dokusu)
```
