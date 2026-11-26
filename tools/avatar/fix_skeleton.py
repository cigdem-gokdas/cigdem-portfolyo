"""GLB iskeletinin kemik eksenlerini Mixamo/RPM düzenine getirir (TalkingHead pozları bu düzeni varsayar).

Her kemik için: dünya konumu korunur; dünya yönelimi = R(d_ref -> d_bizim) * W_ref. Burada d = kemiğin Y ekseni
(kemik boyunca), W_ref = tools/avatar/ref_frames.json'daki T-poz yönelimi. Böylece bizim A-pozumuzdaki kemik, referans
kemiğin "aşağı döndürülmüş" hali olur; rulo (roll) ekseni referansla tutarlıdır. Göz kemikleri doğrudan W_ref alır.
Ağ köşeleri değişmez: inverseBindMatrix'ler J_yeni^-1 * J_eski * IBM_eski olarak güncellenir.

Kullanım: python3 tools/avatar/fix_skeleton.py girdi.glb çıktı.glb
"""
import json
import os
import struct
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
REF = {k: np.array(v) for k, v in json.load(open(os.path.join(HERE, 'ref_frames.json')))['frames'].items()}
_REFJ = json.load(open(os.path.join(HERE, 'ref_frames.json')))
REFPOS = _REFJ['positions']
DIRECT = {'LeftEye', 'RightEye', 'Head'}
MAIN_CHILD = {'Hips': 'Spine', 'Spine': 'Spine1', 'Spine1': 'Spine2', 'Spine2': 'Neck', 'Neck': 'Head'}


def child_of(name):
    if name in MAIN_CHILD:
        return MAIN_CHILD[name]
    for sd in ('Left', 'Right'):
        if not name.startswith(sd):
            continue
        b = name[len(sd):]
        seq = {'Shoulder': 'Arm', 'Arm': 'ForeArm', 'ForeArm': 'Hand', 'Hand': 'HandMiddle1',
               'UpLeg': 'Leg', 'Leg': 'Foot', 'Foot': 'ToeBase'}
        if b in seq:
            return sd + seq[b]
        if b.startswith('Hand') and b[-1] in '12':
            return sd + b[:-1] + str(int(b[-1]) + 1)
    return None


def read_glb(path):
    b = open(path, 'rb').read()
    jl = struct.unpack('<I', b[12:16])[0]
    g = json.loads(b[20:20 + jl])
    off = 20 + jl
    bl = struct.unpack('<I', b[off:off + 4])[0]
    return g, bytearray(b[off + 8:off + 8 + bl])


def write_glb(path, g, bin_):
    js = json.dumps(g, separators=(',', ':')).encode()
    js += b' ' * ((4 - len(js) % 4) % 4)
    bin_ = bytes(bin_) + b'\0' * ((4 - len(bin_) % 4) % 4)
    total = 12 + 8 + len(js) + 8 + len(bin_)
    with open(path, 'wb') as f:
        f.write(struct.pack('<III', 0x46546C67, 2, total))
        f.write(struct.pack('<II', len(js), 0x4E4F534A) + js)
        f.write(struct.pack('<II', len(bin_), 0x004E4942) + bin_)


def q2m(q):
    x, y, z, w = q
    return np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                     [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                     [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])


def m2q(m):
    t = np.trace(m)
    if t > 0:
        s = np.sqrt(t + 1.0) * 2
        q = [(m[2, 1] - m[1, 2]) / s, (m[0, 2] - m[2, 0]) / s, (m[1, 0] - m[0, 1]) / s, 0.25 * s]
    elif m[0, 0] > m[1, 1] and m[0, 0] > m[2, 2]:
        s = np.sqrt(1.0 + m[0, 0] - m[1, 1] - m[2, 2]) * 2
        q = [0.25 * s, (m[0, 1] + m[1, 0]) / s, (m[0, 2] + m[2, 0]) / s, (m[2, 1] - m[1, 2]) / s]
    elif m[1, 1] > m[2, 2]:
        s = np.sqrt(1.0 + m[1, 1] - m[0, 0] - m[2, 2]) * 2
        q = [(m[0, 1] + m[1, 0]) / s, 0.25 * s, (m[1, 2] + m[2, 1]) / s, (m[0, 2] - m[2, 0]) / s]
    else:
        s = np.sqrt(1.0 + m[2, 2] - m[0, 0] - m[1, 1]) * 2
        q = [(m[0, 2] + m[2, 0]) / s, (m[1, 2] + m[2, 1]) / s, 0.25 * s, (m[1, 0] - m[0, 1]) / s]
    q = np.array(q)
    return (q / np.linalg.norm(q)).tolist()


def rot_between(a, b):
    a = a / np.linalg.norm(a); b = b / np.linalg.norm(b)
    v = np.cross(a, b); c = float(np.dot(a, b))
    if c < -0.999999:
        axis = np.cross(a, [1, 0, 0]) if abs(a[0]) < 0.9 else np.cross(a, [0, 1, 0])
        axis /= np.linalg.norm(axis)
        return 2 * np.outer(axis, axis) - np.eye(3)
    vx = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]])
    return np.eye(3) + vx + vx @ vx / (1 + c)


def main(src, dst):
    g, bin_ = read_glb(src)
    nodes = g['nodes']
    par = {c: i for i, n in enumerate(nodes) for c in n.get('children', [])}

    def local(i):
        n = nodes[i]
        if 'matrix' in n:
            return np.array(n['matrix']).reshape(4, 4).T
        M = np.eye(4)
        M[:3, :3] = q2m(n.get('rotation', [0, 0, 0, 1])) * np.array(n.get('scale', [1, 1, 1]))
        M[:3, 3] = n.get('translation', [0, 0, 0])
        return M

    def world(i):
        M = local(i)
        while i in par:
            i = par[i]
            M = local(i) @ M
        return M

    skin = g['skins'][0]
    joints = skin['joints']
    name_of = {j: nodes[j]['name'] for j in joints}
    by_name = {v: k for k, v in name_of.items()}
    old_world = {j: world(j) for j in joints}

    def depth(i):
        d = 0
        while i in par:
            i = par[i]; d += 1
        return d

    # Hiyerarşik yeniden çerçeveleme: önce ebeveynin düzeltmesi aktarılır (W_tahmin = Rp * W_ref),
    # sonra kemik yönü (bir sonraki ana eklem) en küçük dönüşle bizimkine hizalanır.
    new_world, corr = {}, {}
    for j in sorted(joints, key=depth):
        name = name_of[j]
        Wo = old_world[j]
        ref = REF.get(name)
        p = par.get(j)
        Rp = corr.get(p, np.eye(3))
        if ref is None:
            new_world[j] = Wo; corr[j] = Rp
            continue
        if name in DIRECT:
            R = ref
        else:
            R = Rp @ ref
            ch = child_of(name)
            if ch and ch in by_name and ch in REFPOS:
                d_ref = Rp @ (np.array(REFPOS[ch]) - np.array(REFPOS[name]))
                d_our = old_world[by_name[ch]][:3, 3] - Wo[:3, 3]
                R = rot_between(d_ref, d_our) @ R
        M = np.eye(4); M[:3, :3] = R; M[:3, 3] = Wo[:3, 3]
        new_world[j] = M
        corr[j] = R @ ref.T

    # Yerel TRS'yi yeniden yaz (ebeveyn önce gelsin diye derinliğe göre)
    for j in sorted(joints, key=depth):
        p = par.get(j)
        Pw = new_world[p] if p in new_world else (world(p) if p is not None else np.eye(4))
        L = np.linalg.inv(Pw) @ new_world[j]
        n = nodes[j]
        n.pop('matrix', None); n.pop('scale', None)
        n['translation'] = L[:3, 3].tolist()
        n['rotation'] = m2q(L[:3, :3])

    # inverseBindMatrices
    acc = g['accessors'][skin['inverseBindMatrices']]
    bv = g['bufferViews'][acc['bufferView']]
    start = bv.get('byteOffset', 0) + acc.get('byteOffset', 0)
    ibm = np.frombuffer(bytes(bin_[start:start + 64 * len(joints)]), dtype='<f4').reshape(-1, 4, 4).transpose(0, 2, 1).copy()
    for k, j in enumerate(joints):
        ibm[k] = np.linalg.inv(new_world[j]) @ old_world[j] @ ibm[k]
    bin_[start:start + 64 * len(joints)] = ibm.transpose(0, 2, 1).astype('<f4').tobytes()

    write_glb(dst, g, bin_)
    # Kontrol: kol yönleri
    for nm in ('LeftArm', 'LeftForeArm', 'LeftHand', 'LeftUpLeg', 'Head', 'LeftEye'):
        j = next(j for j in joints if nodes[j]['name'] == nm)
        print(nm, 'ref Y', np.round(REF[nm][:, 1], 2), 'yeni Y', np.round(new_world[j][:3, 1], 2))
    print('yazıldı', dst)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
