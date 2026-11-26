"""MakeHuman brown_eye.png (CC0) dokusundan koyu kahve, biraz büyütülmüş irisli göz dokusu üretir.
Kullanım: python3 tools/avatar/make_eye_texture.py <brown_eye.png> <çıktı.png>
"""
import sys
import cv2
import numpy as np

raw = cv2.imread(sys.argv[1], cv2.IMREAD_UNCHANGED)
alpha = raw[..., 3:4] if raw.shape[2] == 4 else None
src = raw[..., :3].astype(np.float32) / 255.0
H, W = src.shape[:2]
out = src.copy()

# Sclera: kırmızı damarları azalt, hafif sıcak beyaz
gray = cv2.cvtColor(src, cv2.COLOR_BGR2GRAY)[..., None]
sclera = 0.55 * src + 0.45 * np.concatenate([gray * 0.97, gray * 0.98, gray * 1.0], axis=2)
out = np.clip(sclera * 1.04, 0, 1)

# Göz bebeklerini bul (en koyu iki bölge)
dark = (gray[..., 0] < 0.12).astype(np.uint8)
n, lab, stats, cents = cv2.connectedComponentsWithStats(dark)
order = np.argsort(-stats[1:, cv2.CC_STAT_AREA])[:2] + 1
SCALE = 1.38          # iris büyütme
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
for i in order:
    cx, cy = cents[i]
    # iris yarıçapı: bebekten dışa doğru sclera parlaklığına çıkana kadar
    r = 10
    while r < 300 and gray[int(cy), min(W - 1, int(cx + r)), 0] < 0.55:
        r += 1
    R = r
    d = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2)
    R2 = R * SCALE
    m = d < R2 + 6
    # yeni irisi eskisinden ölçekleyerek örnekle
    mapx = (cx + (xx - cx) / SCALE).astype(np.float32)
    mapy = (cy + (yy - cy) / SCALE).astype(np.float32)
    scaled = cv2.remap(src, mapx, mapy, cv2.INTER_LINEAR)
    lum = cv2.cvtColor(scaled, cv2.COLOR_BGR2GRAY)
    # renk paleti: koyu çikolata kahve, bebeğe yakın amber halka (BGR)
    t = np.clip(d / R2, 0, 1)
    base = np.stack([0.022 + 0.0 * t, 0.045 + 0.0 * t, 0.095 + 0.0 * t], axis=2)
    amber = np.array([0.04, 0.13, 0.28], np.float32)
    ring = np.exp(-((t - 0.45) / 0.18) ** 2)[..., None]
    col = base * (0.45 + 4.0 * lum[..., None]) + amber * ring * 1.4 * lum[..., None]
    limbal = np.clip((t - 0.85) / 0.15, 0, 1)[..., None]          # koyu dış halka
    col = col * (1 - 0.7 * limbal)
    pupil = np.clip(1 - (d - R2 * 0.27) / 4, 0, 1)[..., None]     # bebek
    col = col * (1 - pupil) + np.array([0.01, 0.01, 0.012]) * pupil
    a = np.clip((R2 + 3 - d) / 6, 0, 1)[..., None] * m[..., None]
    out = out * (1 - a) + col * a

res = np.clip(out * 255, 0, 255).astype(np.uint8)
if alpha is not None:
    res = np.concatenate([res, alpha], axis=2)
cv2.imwrite(sys.argv[2], res)
print('ok', sys.argv[2])
