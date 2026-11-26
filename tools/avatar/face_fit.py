"""Fotoğraflardan yüz şekli uydurma (MediaPipe + MakeHuman hedefleri, doğrusal en küçük kareler).

MakeHuman hedefleri köşe farklarıdır: şekil = taban + Σ w·delta. Fotoğraftaki 3B yüz noktaları ile (benzerlik
dönüşümüyle hizalanmış) modeldeki karşılık gelen köşeler arasındaki farkı, w ∈ [0,1] sınırıyla en aza indirir.
Kafa duruşu (ölçek/dönüş/öteleme) ile ağırlıklar dönüşümlü çözülür.

Gerekenler: mediapipe, numpy, scipy, opencv-python; face_landmarker.task modeli
(https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task)

  python face_fit.py --model face_landmarker.task --dump tools/avatar/out/fit \
      --photo foto1.jpg:1 --photo foto2.jpg:2 --out tools/avatar/fit_targets.json
"""
import argparse
import json
import os

import cv2
import mediapipe as mp
import numpy as np
from scipy.optimize import lsq_linear

ap = argparse.ArgumentParser()
ap.add_argument('--model', required=True)
ap.add_argument('--dump', required=True)
ap.add_argument('--photo', action='append', required=True, help='yol[:ağırlık]')
ap.add_argument('--out', required=True)
ap.add_argument('--lam-force', type=float)
ap.add_argument('--check', help='uydurulmuş render (front.png) ile hata ölç')
args = ap.parse_args()

BaseOptions = mp.tasks.BaseOptions
opts = mp.tasks.vision.FaceLandmarkerOptions(base_options=BaseOptions(model_asset_path=args.model), num_faces=1)
det = mp.tasks.vision.FaceLandmarker.create_from_options(opts)


def landmarks(path):
    img = cv2.imread(path)
    h, w = img.shape[:2]
    r = det.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(img, cv2.COLOR_BGR2RGB)))
    if not r.face_landmarks:
        raise SystemExit('yüz bulunamadı: ' + path)
    p = np.array([(l.x * w, l.y * h, l.z * w) for l in r.face_landmarks[0]], np.float64)
    return p[:468]


def to_blender(p):  # görüntü x sağ, y aşağı, z kameraya doğru eksi → Blender X, Z yukarı, Y derinlik
    return np.stack([p[:, 0], p[:, 2], -p[:, 1]], 1)


def umeyama(src, dst, wts):
    wts = wts / wts.sum()
    ms, md = (src * wts[:, None]).sum(0), (dst * wts[:, None]).sum(0)
    S, D = src - ms, dst - md
    C = (D * wts[:, None]).T @ S
    U, s, Vt = np.linalg.svd(C)
    E = np.eye(3); E[2, 2] = np.sign(np.linalg.det(U @ Vt))
    R = U @ E @ Vt
    var = ((S ** 2).sum(1) * wts).sum()
    sc = (s * np.diag(E)).sum() / var
    return sc, R, md - sc * R @ ms


d = np.load(os.path.join(args.dump, 'dump.npz'))
base, names, deltas = d['base'].astype(np.float64), list(d['names']), d['deltas'].astype(np.float64)
cam = json.load(open(os.path.join(args.dump, 'cam.json')))

# Render landmark → köşe eşlemesi (önden ortografik, en öndeki köşe)
lr = landmarks(os.path.join(args.dump, 'front.png'))
res, scl = cam['res'], cam['scale']
px = np.stack([((base[:, 0] - cam['cx']) / scl + 0.5) * res, (0.5 - (base[:, 2] - cam['cz']) / scl) * res], 1)
vid, keep = [], []
for i, (x, y, _) in enumerate(lr):
    dd = np.hypot(px[:, 0] - x, px[:, 1] - y)
    cand = np.where(dd < 3.0)[0]
    if len(cand) == 0:
        continue
    j = cand[np.argmin(base[cand, 1])]
    if base[j, 1] > base[:, 1].min() + 0.09:   # arka yüzey değil
        continue
    vid.append(j); keep.append(i)
vid, keep = np.array(vid), np.array(keep)
print('eşlenen nokta', len(keep), '/ 468')
np.savez(os.path.join(args.dump, 'corr.npz'), vid=vid, keep=keep, lr=lr)

# Nokta ağırlıkları: gülümseme ağız köşelerini oynatır → düşük ağırlık
MOUTH_CORNER = {61, 291, 78, 308, 76, 306, 62, 292, 185, 409, 40, 270, 146, 375, 91, 321}
wpt = np.array([0.3 if k in MOUTH_CORNER else 1.0 for k in keep])

# Sol/sağ hedefleri tek değişkende birleştir (simetrik yüz); karşıt çiftler (incr/decr, in/out, up/down…)
# tek işaretli değişken: w>0 → artı hedef, w<0 → eksi hedef (eksi hedefin deltası ≈ -artı)
PAIRS = [('-incr', '-decr'), ('-in', '-out'), ('-up', '-down'), ('-convex', '-concave'), ('-uncompress', '-compress'),
         ('-forward', '-backward'), ('-bigger', '-smaller'), ('-wide', '-narrow')]


def lr_group(n):
    if n.startswith('l-') and ('r-' + n[2:]) in names:
        return [n, 'r-' + n[2:]]
    return [n]


SKIP = ('head-age', 'head-fat', 'head-angle', 'head-scale', 'neck', 'trans-')
used, vars_ = set(), []   # her biri: (artı adlar, eksi adlar)
for n in names:
    if n in used or n.startswith('r-') or any(s in n for s in SKIP):
        continue
    pos, neg = lr_group(n), []
    for a, b in PAIRS:
        if n.endswith(a) and n[:-len(a)] + b in names:
            neg = lr_group(n[:-len(a)] + b)
        elif n.endswith(b) and n[:-len(b)] + a in names:
            pos, neg = lr_group(n[:-len(b)] + a), lr_group(n)
        if neg:
            break
    used.update(pos + neg)
    vars_.append((pos, neg))
ix = {n: i for i, n in enumerate(names)}
G = np.stack([(deltas[[ix[n] for n in p]].sum(0) - (deltas[[ix[n] for n in q]].sum(0) if q else 0)) / (2 if q else 1)
              for p, q in vars_])
Gk = G[:, vid]
lo = np.array([-1.0 if q else 0.0 for _, q in vars_])
print('değişken', len(vars_))

AXW = np.array([1.0, 0.15, 1.0])   # MediaPipe derinliği zayıf


def fit(ph, lam, iters=5):
    K = len(vars_)
    w = np.zeros(K)
    for _ in range(iters):
        X = base[vid] + np.einsum('k,kpc->pc', w, Gk)
        rows_A, rows_b = [], []
        for P, pw in ph:
            s, R, t = umeyama(P, X, wpt)
            Pa = (s * (R @ P.T)).T + t
            ww = np.sqrt(pw * wpt)[:, None] * np.sqrt(AXW)[None, :]
            rows_A.append((Gk.transpose(1, 2, 0) * ww[:, :, None]).reshape(-1, K))
            rows_b.append(((Pa - base[vid]) * ww).reshape(-1))
        A = np.vstack(rows_A)
        reg = np.sqrt(lam) * np.linalg.norm(A, axis=0).mean()
        A = np.vstack([A, reg * np.eye(K)])
        b = np.concatenate(rows_b + [np.zeros(K)])
        w = lsq_linear(A, b, bounds=(lo, 1.0)).x
    return w


def err(w, P):
    X = base[vid] + np.einsum('k,kpc->pc', w, Gk)
    s, R, t = umeyama(P, X, wpt)
    Pa = (s * (R @ P.T)).T + t
    return np.sqrt((((Pa - X) ** 2) * AXW).sum(1).mean()) * 1000


photos = []
for spec in args.photo:
    path, _, wt = spec.partition(':')
    photos.append((to_blender(landmarks(path))[keep], float(wt or 1)))
print('başlangıç hata (mm):', [round(err(np.zeros(len(vars_)), P), 2) for P, _ in photos])
best = None
for lam in [0.003, 0.01, 0.03, 0.1, 0.3, 1.0]:
    cv = []
    if len(photos) > 1:
        for i in range(len(photos)):
            tr = [photos[j] for j in range(len(photos)) if j != i]
            cv.append(err(fit(tr, lam), photos[i][0]))
    wf = fit(photos, lam)
    tr_err = [err(wf, P) for P, _ in photos]
    score = np.mean(cv) if cv else np.mean(tr_err)
    print(f'lam {lam}: çapraz {np.round(cv, 2)}  eğitim {np.round(tr_err, 2)}')
    if best is None or score < best[0]:
        best = (score, lam, wf)
print('seçilen lam', best[1])
w = best[2]
if args.lam_force:
    w = fit(photos, args.lam_force)

out = {}
for (pos, neg), val in zip(vars_, w):
    if abs(val) > 0.03:
        for n in (pos if val > 0 else neg):
            out[n] = round(float(abs(val)), 3)
json.dump(dict(sorted(out.items())), open(args.out, 'w'), indent=1, ensure_ascii=False)
print('hedef', len(out))
for k, v in sorted(out.items(), key=lambda kv: -kv[1])[:60]:
    print(f'  {k:40s} {v}')
