"""Yüz uydurma için veri döker (Blender içinde çalışır).

Fenotipli taban insanı kurar (yüz hedefleri olmadan), baş bölgesinin köşe konumlarını ve her yüz hedefinin
köşe farklarını (delta) .npz olarak yazar; ayrıca önden ortografik bir render alır (landmark → köşe eşlemesi için).

  blender -b -P tools/avatar/fit_dump.py -- --config tools/avatar/cigdem.json --out tools/avatar/out/fit
"""
import argparse
import glob
import json
import os
import sys

import bpy
import numpy as np
from mathutils import Vector

from bl_ext.blender_org.mpfb.services import HumanService, TargetService, LocationService

argv = sys.argv[sys.argv.index('--') + 1:]
ap = argparse.ArgumentParser()
ap.add_argument('--config', required=True)
ap.add_argument('--out', required=True)
ap.add_argument('--targets', help='JSON dosyası: bu hedeflerle kur ve yalnızca render al (doğrulama)')
args = ap.parse_args(argv)
cfg = json.load(open(args.config))
os.makedirs(args.out, exist_ok=True)
DATA = LocationService.get_user_data()
SYS = LocationService.get_mpfb_data('targets')
CATS = ['head', 'eyes', 'nose', 'mouth', 'chin', 'cheek', 'forehead', 'eyebrows']


def find(subdir, name, ext):
    hits = glob.glob(os.path.join(DATA, subdir, name, '*' + ext)) or glob.glob(os.path.join(DATA, subdir, '**', name + ext), recursive=True)
    return hits[0]


bpy.ops.wm.read_factory_settings(use_empty=True)
info = HumanService._create_default_human_info_dict()
info['name'] = 'fit'
info['phenotype'] = cfg['phenotype']
fixed = json.load(open(args.targets)) if args.targets else {}
info['targets'] = [{'target': k, 'value': v} for k, v in fixed.items()]
info['rig'] = ''
for part in ['eyes', 'eyebrows', 'eyelashes']:
    info[part] = os.path.basename(find(part, cfg[part], '.mhclo'))
info['skin_mhmat'] = os.path.basename(find('skins', cfg['skin'], '.mhmat'))
info['skin_material_type'] = 'MAKESKIN'
info['eyes_material_type'] = 'MAKESKIN'
st = HumanService.get_default_deserialization_settings()
st['subdiv_levels'] = 0
st['material_instances'] = 'NEVER'
body = HumanService.deserialize_from_dict(info, st)
TargetService.bake_targets(body)

M = np.array(body.matrix_world)
R3 = M[:3, :3]
n = len(body.data.vertices)
co = np.empty(n * 3, np.float32)
body.data.vertices.foreach_get('co', co)
co = co.reshape(-1, 3) @ R3.T + M[:3, 3]

# Baş bölgesi: boyun üstü, gövde önü
zmax = co[:, 2].max()
head_idx = np.where(co[:, 2] > zmax - 0.32)[0]
hc = co[head_idx]
print('HEAD verts', len(head_idx), 'z', hc[:, 2].min(), hc[:, 2].max())

if not args.targets:
    names, deltas = [], []
    loc0 = np.empty(n * 3, np.float32); body.data.vertices.foreach_get('co', loc0); loc0 = loc0.reshape(-1, 3)
    for cat in CATS:
        for p in sorted(glob.glob(os.path.join(SYS, cat, '*.target.gz'))):
            nm = os.path.basename(p)[:-len('.target.gz')]
            if any(s in nm for s in ('ears', 'expression', 'trans-in', 'trans-out')):
                continue
            kname = 'fit_' + nm
            TargetService.load_target(body, p, weight=1.0, name=kname)
            kb = body.data.shape_keys.key_blocks.get(kname)
            if kb is None:
                continue
            a = np.empty(n * 3, np.float32)
            kb.data.foreach_get('co', a)
            d = (a.reshape(-1, 3) - loc0) @ R3.T
            d = d[head_idx]
            if np.abs(d).max() > 1e-5:
                names.append(nm)
                deltas.append(d.astype(np.float32))
            body.shape_key_remove(kb)
    print('TARGETS', len(names))
    np.savez_compressed(os.path.join(args.out, 'dump.npz'), base=hc.astype(np.float32), idx=head_idx,
                        names=np.array(names), deltas=np.stack(deltas))
else:
    # Hedefli doğrulama: TargetService ile yüklenen hedefler fırında; baş köşelerini de yaz
    np.save(os.path.join(args.out, 'fitted_head.npy'), hc.astype(np.float32))

# Önden ortografik render
sc = bpy.context.scene
sc.render.engine = 'BLENDER_EEVEE'
sc.render.resolution_x = sc.render.resolution_y = 1024
sc.view_settings.view_transform = 'Standard'
w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
w.node_tree.nodes['Background'].inputs[0].default_value = (0.5, 0.5, 0.5, 1)
w.node_tree.nodes['Background'].inputs[1].default_value = 1.0
face = hc[hc[:, 1] < hc[:, 1].min() + 0.06]
cx, cz = float(np.median(face[:, 0])), float(hc[:, 2].max() - 0.13)
scale = 0.30
cam_d = bpy.data.cameras.new('cam'); cam_d.type = 'ORTHO'; cam_d.ortho_scale = scale
cam = bpy.data.objects.new('cam', cam_d); sc.collection.objects.link(cam); sc.camera = cam
cam.location = (cx, -2.0, cz)
cam.rotation_euler = (1.5707963, 0, 0)
for nm, loc, e in [('k', (-0.6, -1.5, 0.3), 120), ('f', (0.6, -1.5, 0.2), 90)]:
    L = bpy.data.lights.new(nm, 'AREA'); L.energy = e; L.size = 2
    o = bpy.data.objects.new(nm, L); sc.collection.objects.link(o)
    o.location = Vector((cx, 0, cz)) + Vector(loc)
    o.rotation_euler = (Vector((cx, 0, cz)) - o.location).to_track_quat('-Z', 'Y').to_euler()
sc.render.filepath = os.path.join(args.out, 'front.png')
bpy.ops.render.render(write_still=True)
json.dump({'cx': cx, 'cz': cz, 'scale': scale, 'res': 1024}, open(os.path.join(args.out, 'cam.json'), 'w'))
print('DONE')
