"""Yüz oranı uydurma: fotoğraftaki oranları (MediaPipe 3B noktaları, göz merkezleri arası mesafeye göre) MakeHuman
hedefleriyle modelin köşelerinde yakalar. fit_dump.py çıktısını (dump.npz, front.png, cam.json) kullanır.

  python ratio_fit.py --model face_landmarker.task --dump tools/avatar/out/fit --photo f2.jpg:2 --photo f1.jpg:1 \
      --out tools/avatar/out/fit/ratio_targets.json
"""
import argparse
import json
import os

import cv2
import mediapipe as mp
import numpy as np
from scipy.optimize import minimize

ap = argparse.ArgumentParser()
ap.add_argument('--model', required=True)
ap.add_argument('--dump', required=True)
ap.add_argument('--photo', action='append', required=True)
ap.add_argument('--out', required=True)
ap.add_argument('--lam', type=float, default=0.004)
ap.add_argument('--measure', nargs='*', default=[], help='yalnızca ölç: bu görüntülerin oranlarını yazdır')
a = ap.parse_args()
det = mp.tasks.vision.FaceLandmarker.create_from_options(mp.tasks.vision.FaceLandmarkerOptions(
    base_options=mp.tasks.BaseOptions(model_asset_path=a.model), num_faces=1))


def lm(path):
    img = cv2.imread(path)
    h, w = img.shape[:2]
    r = det.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(img, cv2.COLOR_BGR2RGB)))
    return np.array([(l.x * w, l.y * h, l.z * w) for l in r.face_landmarks[0]])[:468]


# ad: (nokta çiftleri, önem, perspektife duyarlı mı, gülümseme düzeltmesi)
M = {
    'göz genişliği':   ([(33, 133), (362, 263)], 2.0, False, 1.0),
    'göz açıklığı':    ([(159, 145), (386, 374)], 2.0, False, 1.06),
    'kaş-göz':         ([(105, 159), (334, 386)], 1.0, False, 1.0),
    'burun genişliği': ([(64, 294)], 1.5, True, 0.97),
    'burun uzunluğu':  ([(168, 2)], 1.0, True, 1.0),
    'ağız genişliği':  ([(61, 291)], 2.0, False, 0.92),
    'üst dudak':       ([(0, 13)], 1.5, False, 1.10),
    'alt dudak':       ([(14, 17)], 1.5, False, 1.03),
    'burun-ağız':      ([(2, 0)], 1.0, True, 1.0),
    'ağız-çene':       ([(17, 152)], 1.0, False, 1.0),
    'yanak genişliği': ([(116, 345)], 1.0, False, 1.0),
    'çene genişliği':  ([(172, 397)], 1.5, False, 1.0),
    'yüz boyu':        ([(9, 152)], 1.5, False, 1.0),
}
NEED = sorted({i for v in M.values() for p in v[0] for i in p} | {33, 133, 362, 263})


def norm_of(P):
    return np.linalg.norm((P[33] + P[133]) / 2 - (P[362] + P[263]) / 2)


def ratios(P):
    n = norm_of(P)
    return np.array([np.mean([np.linalg.norm(P[i] - P[j]) for i, j in v[0]]) / n for v in M.values()])


def to_blender(p):
    return np.stack([p[:, 0], p[:, 2], -p[:, 1]], 1)


if a.measure:
    print(f"{'':18s}" + ''.join(f'{os.path.basename(x)[:12]:>13s}' for x in a.measure))
    R = [ratios(lm(x)) for x in a.measure]
    for k, name in enumerate(M):
        print(f'{name:18s}' + ''.join(f'{r[k]:13.3f}' for r in R))
    raise SystemExit

d = np.load(os.path.join(a.dump, 'dump.npz'))
base, names, deltas = d['base'].astype(np.float64), list(d['names']), d['deltas'].astype(np.float64)
cam = json.load(open(os.path.join(a.dump, 'cam.json')))
lr = lm(os.path.join(a.dump, 'front.png'))
res, scl = cam['res'], cam['scale']
px = np.stack([((base[:, 0] - cam['cx']) / scl + 0.5) * res, (0.5 - (base[:, 2] - cam['cz']) / scl) * res], 1)
front = base[:, 1] < base[:, 1].min() + 0.09
vmap = {}
for i in NEED:
    dd = np.hypot(px[:, 0] - lr[i, 0], px[:, 1] - lr[i, 1]) + (~front) * 1e9
    cand = np.where(dd < 6)[0]
    vmap[i] = cand[np.argmin(base[cand, 1])] if len(cand) else int(np.argmin(dd))

# Hedef oranlar: fotoğrafların ağırlıklı ortalaması (perspektife duyarlılarda yalnızca ağırlığı ≥2 olanlar)
pr, pw = [], []
for spec in a.photo:
    path, _, wt = spec.partition(':')
    pr.append(ratios(to_blender(lm(path)))); pw.append(float(wt or 1))
pr, pw = np.array(pr), np.array(pw)
goal = []
for k, (name, (_, imp, persp, smile)) in enumerate(M.items()):
    ww = pw * ((pw >= 2) if persp else 1)
    goal.append((pr[:, k] * ww).sum() / ww.sum() * smile)
goal = np.array(goal)
imp = np.array([v[1] for v in M.values()])

VARS = [  # (artı, eksi) — l-/r- otomatik eşlenir
    ('eye-scale-incr', 'eye-scale-decr'), ('eye-height2-incr', 'eye-height2-decr'),
    ('eye-height1-incr', 'eye-height1-decr'), ('eye-move-in', 'eye-move-out'),
    ('eyebrows-trans-up', 'eyebrows-trans-down'),
    ('nose-scale-horiz-incr', 'nose-scale-horiz-decr'), ('nose-width1-incr', 'nose-width1-decr'),
    ('nose-scale-vert-incr', 'nose-scale-vert-decr'), ('nose-trans-up', 'nose-trans-down'),
    ('mouth-scale-horiz-incr', 'mouth-scale-horiz-decr'), ('mouth-upperlip-volume-incr', 'mouth-upperlip-volume-decr'),
    ('mouth-lowerlip-volume-incr', 'mouth-lowerlip-volume-decr'), ('mouth-upperlip-height-incr', 'mouth-upperlip-height-decr'),
    ('mouth-lowerlip-height-incr', 'mouth-lowerlip-height-decr'), ('mouth-trans-up', 'mouth-trans-down'),
    ('chin-width-incr', 'chin-width-decr'), ('chin-height-incr', 'chin-height-decr'),
    ('cheek-bones-incr', 'cheek-bones-decr'), ('head-scale-vert-incr', 'head-scale-vert-decr'),
    ('head-oval', None), ('head-invertedtriangular', None), ('head-diamond', None), ('chin-triangle', None),
    ('chin-bones-incr', 'chin-bones-decr'), ('chin-jaw-drop-incr', 'chin-jaw-drop-decr'), ('head-scale-horiz-incr', 'head-scale-horiz-decr'),
]


def side(n):
    out = []
    for c in ([n] if n in names else ['l-' + n, 'r-' + n]):
        if c in names:
            out.append(c)
    return out


ix = {n: i for i, n in enumerate(names)}
cols, spec = [], []
for p, q in VARS:
    P, Q = side(p), side(q) if q else []
    if not P:
        print('yok:', p); continue
    dp = deltas[[ix[n] for n in P]].sum(0)
    dq = deltas[[ix[n] for n in Q]].sum(0) if Q else None
    cols.append((dp, dq)); spec.append((P, Q))
vid = np.array([vmap[i] for i in NEED])
pos = {i: k for k, i in enumerate(NEED)}


def shape(w):
    X = base[vid].copy()
    for (dp, dq), x in zip(cols, w):
        X += (dp[vid] * x) if x >= 0 or dq is None else (dq[vid] * -x)
    return X


def mesh_ratios(w):
    X = shape(w)
    P = np.zeros((468, 3)); P[NEED] = X
    return ratios(P)


def loss(w):
    r = mesh_ratios(w)
    return (imp * ((r - goal) / goal) ** 2).sum() + a.lam * (w ** 2).sum()


# Algılayıcı yanlılığı: aynı ölçüyü render üzerinde MediaPipe ile alıp köşe ölçüsüne oranla düzelt
r_render = ratios(to_blender(lr))
r_mesh0 = mesh_ratios(np.zeros(len(cols)))
goal = r_mesh0 * goal / r_render
# Baş ölçeği gövdeye göre küçülmesin; gülümseme dudakları inceltir → dudak hacmi azaltılmasın
CAP = {'head-scale-horiz-incr': (-0.3, 0.3), 'head-scale-vert-incr': (-0.15, 0.15),
       'mouth-upperlip-volume-incr': (0, 1), 'mouth-lowerlip-volume-incr': (0, 1)}
lo = [CAP.get(P[0].removeprefix('l-'), (0 if q is None else -1, 1)) for (P, _), (_, q) in zip(spec, cols)]
r0 = mesh_ratios(np.zeros(len(cols)))
best = minimize(loss, np.zeros(len(cols)), method='L-BFGS-B', bounds=lo, options={'maxiter': 500})
w = best.x
r1 = mesh_ratios(w)
print(f"{'oran':18s}{'hedef':>9s}{'taban':>9s}{'uyan':>9s}")
for k, name in enumerate(M):
    print(f'{name:18s}{goal[k]:9.3f}{r0[k]:9.3f}{r1[k]:9.3f}')
out = {}
for (P, Q), x in zip(spec, w):
    if abs(x) > 0.03:
        for n in (P if x > 0 else Q):
            out[n] = round(float(abs(x)), 3)
json.dump(dict(sorted(out.items())), open(a.out, 'w'), indent=1, ensure_ascii=False)
for k, v in sorted(out.items()):
    print(f'  {k:34s}{v}')
