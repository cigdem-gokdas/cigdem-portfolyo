import cv2
import os

# Çıktı klasörünü oluştur
os.makedirs('public/frames', exist_ok=True)

# Videoyu yükle
cap = cv2.VideoCapture('character-rotation.mp4')

if not cap.isOpened():
    print("Hata: Video bulunamadı! 'character-rotation.mp4' dosyasının script ile aynı klasörde olduğundan emin ol.")
    exit()

total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
step = max(1, total_frames // 64)

frame_count = 0
saved_count = 0

print(
    f"Toplam kare sayısı: {total_frames}. Kareler çıkarılıyor, lütfen bekle...")

while cap.isOpened() and saved_count < 64:
    ret, frame = cap.read()
    if not ret:
        break
    if frame_count % step == 0:
        cv2.imwrite(
            f'public/frames/frame-{saved_count:03d}.webp', frame, [cv2.IMWRITE_WEBP_QUALITY, 90])
        saved_count += 1
    frame_count += 1

# Merkez pozisyonunu manuel olarak ilk kareden alıyoruz
cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
ret, center_frame = cap.read()
if ret:
    cv2.imwrite('public/frames/center.webp', center_frame,
                [cv2.IMWRITE_WEBP_QUALITY, 100])

cap.release()
print("İşlem tamam! 64 kare ve center.webp 'public/frames' klasörüne başarıyla çıkarıldı.")
