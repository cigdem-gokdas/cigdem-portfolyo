"""Yüz oranlarını karşılaştırır (MediaPipe): fotoğraflar ve render(lar). Oranlar göz bebekleri arası mesafeye göre.

  python face_ratios.py --model face_landmarker.task foto1.jpg foto2.jpg render.png ...
"""
import argparse
import cv2
import mediapipe as mp
import numpy as np

ap = argparse.ArgumentParser()
ap.add_argument('--model', required=True)
ap.add_argument('images', nargs='+')
a = ap.parse_args()
det = mp.tasks.vision.FaceLandmarker.create_from_options(mp.tasks.vision.FaceLandmarkerOptions(
    base_options=mp.tasks.BaseOptions(model_asset_path=a.model), num_faces=1))

# 3B noktalar (x,y,z piksel) → duruştan bağımsız ölçüm için 3B mesafeler
M = {
    'göz genişliği':        [(33, 133), (362, 263)],
    'göz açıklığı':         [(159, 145), (386, 374)],
    'kaş-göz':              [(105, 159), (334, 386)],
    'burun genişliği':      [(64, 294)],
    'burun uzunluğu':       [(168, 2)],
    'ağız genişliği':       [(61, 291)],
    'üst dudak':            [(0, 13)],
    'alt dudak':            [(14, 17)],
    'burun-ağız':           [(2, 0)],
    'çene (ağız-çene ucu)': [(17, 152)],
    'yüz genişliği (elmacık)': [(234, 454)],
    'çene genişliği':       [(172, 397)],
    'yüz boyu (kaş-çene)':  [(9, 152)],
}


def lm(path):
    img = cv2.imread(path)
    h, w = img.shape[:2]
    r = det.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(img, cv2.COLOR_BGR2RGB)))
    return np.array([(l.x * w, l.y * h, l.z * w) for l in r.face_landmarks[0]])


rows = {}
for p in a.images:
    L = lm(p)
    ipd = np.linalg.norm(L[468] - L[473])
    rows[p.split('/')[-1]] = {k: np.mean([np.linalg.norm(L[i] - L[j]) for i, j in v]) / ipd for k, v in M.items()}
cols = list(rows)
print(f"{'oran / göz bebekleri arası':28s}" + ''.join(f'{c[:14]:>15s}' for c in cols))
for k in M:
    print(f'{k:28s}' + ''.join(f'{rows[c][k]:15.3f}' for c in cols))
