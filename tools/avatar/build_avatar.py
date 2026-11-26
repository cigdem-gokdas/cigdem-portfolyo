"""Çiğdem avatarını MPFB2 (MakeHuman, CC0) ile sıfırdan üretir.

Kullanım (proje kökünden):
  blender -b -P tools/avatar/build_avatar.py -- --config tools/avatar/cigdem.json --preview out_dir
  blender -b -P tools/avatar/build_avatar.py -- --config tools/avatar/cigdem.json --export out.glb [--blend out.blend]

Gereken: Blender 5.x + MPFB eklentisi + MakeHuman varlık paketleri (makehuman_system_assets, faceunits01,
visemes02, eyebrows01, eyelashes01, skins01, hair03). Ayrıntı: tools/avatar/README.md
"""
import argparse
import glob
import json
import math
import os
import sys

import bpy
from mathutils import Vector

from bl_ext.blender_org.mpfb.services import (  # noqa: E402
    HumanService, FaceService, TargetService, ObjectService, ExportService, LocationService,
)

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
ap = argparse.ArgumentParser()
ap.add_argument('--config', required=True)
ap.add_argument('--preview')
ap.add_argument('--export')
ap.add_argument('--blend')
ap.add_argument('--set', action='append', default=[], help='anahtar=json (yapılandırmayı geçersiz kılar)')
ap.add_argument('--views', default='yuz,yuz34,bust,profil')
args = ap.parse_args(argv)
cfg = json.load(open(args.config))
for kv in args.set:
    k, v = kv.split('=', 1)
    cfg[k] = json.loads(v)
DATA = LocationService.get_user_data()


def find(subdir, name, ext):
    hits = glob.glob(os.path.join(DATA, subdir, name, '*' + ext)) or glob.glob(os.path.join(DATA, subdir, '**', name + ext), recursive=True)
    if not hits:
        raise FileNotFoundError(f'{subdir}/{name}/*{ext}')
    return hits[0]


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def build():
    clear_scene()
    info = HumanService._create_default_human_info_dict()
    info['name'] = cfg['name']
    info['phenotype'] = cfg['phenotype']
    info['targets'] = [{'target': k, 'value': v} for k, v in cfg['targets'].items()]
    info['rig'] = cfg['rig']
    for part in ['eyes', 'eyebrows', 'eyelashes', 'teeth', 'tongue', 'hair']:
        if cfg.get(part):
            info[part] = os.path.basename(find(part, cfg[part], '.mhclo'))
    info['clothes'] = [os.path.basename(find('clothes', c, '.mhclo')) for c in cfg.get('clothes', [])]
    info['skin_mhmat'] = os.path.basename(find('skins', cfg['skin'], '.mhmat'))
    info['skin_material_type'] = 'MAKESKIN'
    info['eyes_material_type'] = 'MAKESKIN'
    settings = HumanService.get_default_deserialization_settings()
    settings['subdiv_levels'] = 0
    settings['material_instances'] = 'NEVER'
    basemesh = HumanService.deserialize_from_dict(info, settings)
    return basemesh


def relatives(basemesh):
    rig = basemesh.parent if basemesh.parent and basemesh.parent.type == 'ARMATURE' else None
    kids = [o for o in bpy.data.objects if o.type == 'MESH' and o is not basemesh]
    return rig, kids


def image_nodes(obj):
    for slot in obj.material_slots:
        if slot.material and slot.material.use_nodes:
            for n in slot.material.node_tree.nodes:
                if n.type == 'TEX_IMAGE' and n.image:
                    yield slot.material, n


def principled(mat):
    return next((n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)


ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def recolor_image(img, col, gain):
    """Dokuyu gri tona çevirip col ile çarpar (piksel uzayında; glTF'e düz doku olarak çıkar). Alfa korunur."""
    import numpy as np
    w, h = img.size
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    px = px.reshape(-1, 4)
    lum = px[:, 0] * 0.2126 + px[:, 1] * 0.7152 + px[:, 2] * 0.0722
    lum = lum / max(1e-4, float(np.percentile(lum[px[:, 3] > 0.5] if (px[:, 3] > 0.5).any() else lum, 70)))
    for c in range(3):
        px[:, c] = np.clip(lum * col[c] * gain, 0, 1)
    new = bpy.data.images.new(img.name + '_renk', w, h, alpha=True)
    new.pixels.foreach_set(px.ravel())
    new.pack()
    return new


def tint_lips(img, col):
    import numpy as np
    import colorsys
    w, h = img.size
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    px = px.reshape(-1, 4)
    r, g, b = px[:, 0], px[:, 1], px[:, 2]
    mx = np.maximum(np.maximum(r, g), b); mn = np.minimum(np.minimum(r, g), b)
    sat = (mx - mn) / np.maximum(mx, 1e-4)
    # dudak: ten ortalamasından belirgin daha kırmızı ve doygun
    redness = r - (g + b) / 2
    base_red = np.percentile(redness, 60); base_sat = np.percentile(sat, 60)
    m = np.clip((redness - base_red - 0.06) / 0.08, 0, 1) * np.clip((sat - base_sat - 0.05) / 0.08, 0, 1)
    lum = (0.2126 * r + 0.7152 * g + 0.0722 * b)
    ref = np.median(lum[m > 0.5]) if (m > 0.5).any() else 0.4
    for c in range(3):
        target = np.clip(col[c] * lum / max(ref, 1e-3), 0, 1)
        px[:, c] = px[:, c] * (1 - m * 0.85) + target * m * 0.85
    tint = cfg.get('skin_tint')
    if tint:   # tenin geri kalanını sıcak tona çek (dudak hariç)
        for c in range(3):
            px[:, c] = np.clip(px[:, c] * ((1 - m) * tint[c] + m), 0, 1)
    print('LIPS', int((m > 0.5).sum()), 'piksel')
    new = bpy.data.images.new(img.name + '_dudak', w, h, alpha=True)
    new.pixels.foreach_set(px.ravel())
    new.pack()
    return new


def tune_materials(basemesh):
    _, kids = relatives(basemesh)
    for o in [basemesh] + kids:
        nm = o.name.lower()
        # Göz: kendi ürettiğimiz koyu kahve, büyük irisli doku (make_eye_texture.py)
        if cfg.get('eyes') and o.name.endswith(cfg['eyes']) and cfg.get('eye_texture'):
            png = os.path.join(ROOT, cfg['eye_texture'])
            for mat, n in image_nodes(o):
                if 'eye' in os.path.basename(n.image.filepath).lower() and 'normal' not in n.image.name.lower():
                    n.image = bpy.data.images.load(png, check_existing=True)
        # Saç: gri ton x koyu kahve
        if cfg.get('hair') and o.name.endswith(cfg['hair']) and cfg.get('hair_color'):
            for mat, n in image_nodes(o):
                if n.name == 'diffuseTexture':
                    n.image = recolor_image(n.image, cfg['hair_color'], cfg.get('hair_gain', 1.0))
        # Kaş: koyu kahve
        if cfg.get('eyebrows') and o.name.endswith(cfg['eyebrows']) and cfg.get('brow_color'):
            for mat, n in image_nodes(o):
                if n.name == 'diffuseTexture':
                    n.image = recolor_image(n.image, cfg['brow_color'], 1.0)
        # Ten: dudak bölgesini (doygun kırmızı-turuncu pikseller) gül rengine çek
        if o is basemesh and cfg.get('lip_color'):
            for mat, n in image_nodes(o):
                if n.name == 'diffuseTexture':
                    n.image = tint_lips(n.image, cfg['lip_color'])
        # Kıyafet: desen/logo yerine düz renk (normal haritası kalır)
        for c in cfg.get('clothes', []):
            if o.name.endswith(c) and cfg.get('clothes_color'):
                for slot in o.material_slots:
                    m = slot.material
                    p = principled(m) if m and m.use_nodes else None
                    if not p:
                        continue
                    for l in list(p.inputs['Base Color'].links):
                        m.node_tree.links.remove(l)
                    p.inputs['Base Color'].default_value = (*cfg['clothes_color'], 1.0)
                    p.inputs['Roughness'].default_value = 0.85


def paint_scalp(basemesh):
    """Saç meshinin altında görünebilecek kafa derisini saç rengine boyar (COLOR_0; dokuyla çarpılır)."""
    sc = cfg.get('scalp')
    if not sc:
        return
    eyes = next(o for o in bpy.data.objects if o.type == 'MESH' and (o.name == 'Eyes' or cfg['eyes'] in o.name))
    ec = sum((eyes.matrix_world @ v.co for v in eyes.data.vertices), Vector()) / len(eyes.data.vertices)
    me = basemesh.data
    # Gerçek konum: şekil anahtarlarının karışımı (referans + Σ değer·fark)
    import numpy as np
    n = len(me.vertices)
    co = np.empty(n * 3, np.float32); me.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
    if me.shape_keys:
        kbs = me.shape_keys.key_blocks
        ref = np.empty(n * 3, np.float32); me.shape_keys.reference_key.data.foreach_get('co', ref)
        co = ref.reshape(-1, 3).copy()
        for kb in kbs:
            if kb == me.shape_keys.reference_key or kb.value == 0 or kb.mute:
                continue
            a = np.empty(n * 3, np.float32); kb.data.foreach_get('co', a)
            r = np.empty(n * 3, np.float32); kb.relative_key.data.foreach_get('co', r)
            co += kb.value * (a - r).reshape(-1, 3)
    hc = [c * 1.0 for c in cfg['hair_color']]
    attr = me.color_attributes.get('Col') or me.color_attributes.new('Col', 'BYTE_COLOR', 'POINT')
    mw = basemesh.matrix_world
    for i, v in enumerate(me.vertices):
        p = mw @ Vector(co[i].tolist())
        dz = p.z - ec.z
        back = min(1.0, max(0.0, (p.y - ec.y - 0.02) / 0.07))   # MPFB'de karakter -Y'ye bakar; +Y arka
        thr = sc['front'] * (1 - back) + sc['back'] * back
        w = min(1.0, max(0.0, (dz - thr) / sc['feather']))
        if p.z < ec.z - 0.02 or abs(p.x - ec.x) > 0.11:
            w = 0.0
        attr.data[i].color = (1 - w + w * hc[0], 1 - w + w * hc[1], 1 - w + w * hc[2], 1.0)
    me.color_attributes.active_color = attr
    # Malzemede köşe rengini dokuyla çarp (glTF: COLOR_0 x baseColor)
    m = basemesh.active_material
    nt = m.node_tree
    p = principled(m)
    tex = nt.nodes.get('diffuseTexture')
    vc = nt.nodes.new('ShaderNodeVertexColor'); vc.layer_name = 'Col'
    mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'; mix.inputs['Factor'].default_value = 1.0
    nt.links.new(tex.outputs['Color'], mix.inputs['A'])
    nt.links.new(vc.outputs['Color'], mix.inputs['B'])
    nt.links.new(mix.outputs['Result'], p.inputs['Base Color'])


def fade_hairline(basemesh):
    """Saç kepinin alındaki sert kenarını yumuşatır: alnın önündeki saç köşelerinin alfasını aşağı doğru sıfıra indirir
    (COLOR_0 alfa; glTF'de doku alfasıyla çarpılır). Yan tutamlara dokunmaz."""
    hf = cfg.get('hair_fade')
    hair = bpy.data.objects.get('Hair')
    if not hf or not hair:
        return
    eyes = bpy.data.objects.get('Eyes')
    ec = sum((eyes.matrix_world @ v.co for v in eyes.data.vertices), Vector()) / len(eyes.data.vertices)
    me = hair.data
    attr = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
    n = 0
    for i, v in enumerate(me.vertices):
        p = hair.matrix_world @ v.co - ec
        a = 1.0
        if p.y < hf['front_y'] and abs(p.x) < hf['half_w'] + hf['x_feather']:
            za = min(1.0, max(0.0, (p.z - hf['z0']) / hf['z_feather']))
            xa = min(1.0, max(0.0, (abs(p.x) - hf['half_w']) / hf['x_feather']))
            a = max(za, xa)
            n += a < 1
        attr.data[i].color = (1.0, 1.0, 1.0, a)
    me.color_attributes.active_color = attr
    print('HAIRFADE', n, 'köşe')


def setup_preview_scene(basemesh):
    rig, _ = relatives(basemesh)
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_EEVEE'
    sc.render.resolution_x, sc.render.resolution_y = 900, 1100
    sc.render.film_transparent = False
    sc.view_settings.view_transform = 'AgX'
    world = bpy.data.worlds.new('w'); sc.world = world
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs[0].default_value = (0.05, 0.06, 0.08, 1)
    world.node_tree.nodes['Background'].inputs[1].default_value = 0.6
    # Baş konumu
    head = rig.pose.bones.get('mixamorig:Head') if rig else None
    hp = (rig.matrix_world @ head.head) if head else Vector((0, 0, 1.55))
    def light(name, loc, energy, size=1.0):
        d = bpy.data.lights.new(name, 'AREA'); d.energy = energy; d.size = size
        o = bpy.data.objects.new(name, d); sc.collection.objects.link(o)
        o.location = hp + Vector(loc)
        o.rotation_euler = (Vector(hp) - o.location).to_track_quat('-Z', 'Y').to_euler()
    light('key', (-0.9, -1.2, 0.5), 70, 1.5)
    light('fill', (1.0, -1.0, 0.1), 45, 1.5)
    light('rim', (0.3, 1.2, 0.6), 60, 0.8)
    cam_d = bpy.data.cameras.new('cam'); cam = bpy.data.objects.new('cam', cam_d); sc.collection.objects.link(cam)
    sc.camera = cam
    return hp, cam


def render_views(basemesh, out):
    os.makedirs(out, exist_ok=True)
    hp, cam = setup_preview_scene(basemesh)
    views = {
        'yuz': (Vector((0, -0.55, 0.06)), 50),
        'yuz34': (Vector((-0.35, -0.45, 0.06)), 50),
        'bust': (Vector((0, -1.6, -0.15)), 50),
        'profil': (Vector((-0.6, 0, 0.05)), 50),
    }
    for name, (off, lens) in views.items():
        if name not in args.views.split(','):
            continue
        cam.location = hp + off
        target = hp + Vector((0, 0, 0.02 if name != 'bust' else -0.2))
        cam.rotation_euler = (target - cam.location).to_track_quat('-Z', 'Y').to_euler()
        cam.data.lens = lens
        bpy.context.scene.render.filepath = os.path.join(out, name + '.png')
        bpy.ops.render.render(write_still=True)


# ---------------- Dışa aktarma (TalkingHead uyumlu GLB) ----------------
# Mesh adları: TalkingHead ve Presenter bunları adla tanır
MESH_NAMES = {'body': 'Body', 'eyes': 'Eyes', 'eyebrows': 'Eyebrows', 'eyelashes': 'Eyelashes',
              'teeth': 'Teeth', 'tongue': 'Tongue', 'hair': 'Hair'}


def add_face_shape_keys(basemesh):
    TargetService.bake_targets(basemesh)   # fenotip/yüz ayarlarını tabana göm
    FaceService.load_targets(basemesh, load_microsoft_visemes=False, load_meta_visemes=True, load_arkit_faceunits=True)
    FaceService.interpolate_targets(basemesh)   # kaş, kirpik, diş, dil, göz vb. alt meshlere aktar
    ExportService.bake_modifiers_remove_helpers(basemesh, bake_masks=True, bake_subdiv=False, remove_helpers=True, also_proxy=False)
    for md in list(basemesh.modifiers):
        if md.type == 'MASK':
            basemesh.modifiers.remove(md)


def clean_shape_keys():
    """Adlar ARKit/Oculus adlarıyla birebir olmalı; MPFB'nin kodladığı adları çöz, boş ve yardımcı anahtarları at."""
    for o in [o for o in bpy.data.objects if o.type == 'MESH']:
        sk = o.data.shape_keys
        if not sk:
            continue
        if cfg.get('hair') and o.name.endswith(cfg['hair']) or (cfg.get('clothes') and any(o.name.endswith(c) for c in cfg['clothes'])):
            o.shape_key_clear()   # saç/kıyafet yüz şekillerine gerek duymaz (dosya boyutu)
            continue
        for kb in list(sk.key_blocks):
            if kb.name == 'Basis' or kb == sk.reference_key:
                continue
            nm = TargetService.decode_shapekey_name(kb.name) if kb.name.startswith('$') else kb.name
            nm = os.path.basename(nm).replace('.target', '')
            kb.name = nm
            kb.value = 0.0
        # Hiç köşe oynatmayan anahtarları sil
        import numpy as np
        base = np.empty(len(o.data.vertices) * 3, np.float32)
        sk.reference_key.data.foreach_get('co', base)
        for kb in list(sk.key_blocks):
            if kb == sk.reference_key:
                continue
            co = np.empty_like(base)
            kb.data.foreach_get('co', co)
            if np.abs(co - base).max() < 1e-6:
                o.shape_key_remove(kb)
        if len(sk.key_blocks) <= 1 if o.data.shape_keys else False:
            o.shape_key_clear()


def add_eye_bones(rig):
    eyes = next(o for o in bpy.data.objects if o.type == 'MESH' and cfg['eyes'] in o.name)
    mw = eyes.matrix_world
    cos = [mw @ v.co for v in eyes.data.vertices]
    sides = {'Left': [c for c in cos if c.x > 0], 'Right': [c for c in cos if c.x <= 0]}
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='EDIT')
    eb = rig.data.edit_bones
    head = eb['mixamorig:Head']
    inv = rig.matrix_world.inverted()
    for sd, pts in sides.items():
        c = sum(pts, Vector()) / len(pts)
        b = eb.new('mixamorig:%sEye' % sd)
        b.head = inv @ c
        b.tail = inv @ (c + Vector((0, 0, 0.03)))   # yukarı: referans göz çerçevesi (Y yukarı)
        b.roll = 0
        b.parent = head
        b.use_deform = True
    bpy.ops.object.mode_set(mode='OBJECT')
    # Göz köşelerini yeni kemiklere bağla
    for vg in list(eyes.vertex_groups):
        eyes.vertex_groups.remove(vg)
    for sd in ('Left', 'Right'):
        vg = eyes.vertex_groups.new(name='mixamorig:%sEye' % sd)
        idx = [v.index for v in eyes.data.vertices if ((mw @ v.co).x > 0) == (sd == 'Left')]
        vg.add(idx, 1.0, 'REPLACE')


def rename_all(basemesh, rig):
    for b in rig.data.bones:
        b.name = b.name.replace('mixamorig:', '')   # köşe grupları da otomatik yeniden adlanır
    rig.name = 'Armature'
    rig.data.name = 'Armature'
    basemesh.name = MESH_NAMES['body']
    for key, nm in MESH_NAMES.items():
        if key == 'body' or not cfg.get(key):
            continue
        o = next((o for o in bpy.data.objects if o.type == 'MESH' and o.name.endswith(cfg[key])), None)
        if o:
            o.name = nm
    for c in cfg.get('clothes', []):
        o = next((o for o in bpy.data.objects if o.type == 'MESH' and o.name.endswith(c)), None)
        if o:
            o.name = 'Outfit'


def simplify_materials():
    """glTF dışa aktarıcısı yalnızca dokunun doğrudan Base Color'a bağlı olduğu düzeni tanır."""
    for o in [o for o in bpy.data.objects if o.type == 'MESH']:
        for slot in o.material_slots:
            m = slot.material
            if not (m and m.use_nodes):
                continue
            nt = m.node_tree
            p = principled(m)
            tex = nt.nodes.get('diffuseTexture')
            solid = (o.name == 'Outfit' and cfg.get('clothes_color')) or (o.name == 'Body' and cfg.get('scalp'))
            if tex and tex.image and p and not solid:
                for l in list(p.inputs['Base Color'].links):
                    nt.links.remove(l)
                nt.links.new(tex.outputs['Color'], p.inputs['Base Color'])
                p.inputs['Base Color'].default_value = (1, 1, 1, 1)
            # Alfa yalnızca gerçekten saydam parçalarda (göz korneası, kaş/kirpik kartları)
            keep_alpha = o.name in ('Eyes', 'Eyebrows', 'Eyelashes', 'Hair')
            if p and not keep_alpha:
                for l in list(p.inputs['Alpha'].links):
                    nt.links.remove(l)
                p.inputs['Alpha'].default_value = 1.0
            if p:
                p.inputs['Metallic'].default_value = 0.0
                if o.name in ('Eyebrows', 'Eyelashes') and not p.inputs['Base Color'].links:
                    p.inputs['Base Color'].default_value = (*cfg.get('brow_color', [0.03, 0.018, 0.012]), 1)
                if o.name == 'Body':
                    p.inputs['Roughness'].default_value = 0.6
                if o.name == 'Hair':
                    p.inputs['Roughness'].default_value = 0.55
            m.surface_render_method = 'BLENDED' if keep_alpha else 'DITHERED'


def export_glb(path):
    for o in [o for o in bpy.data.objects if o.type not in ('MESH', 'ARMATURE')]:
        bpy.data.objects.remove(o)
    bpy.ops.export_scene.gltf(
        filepath=os.path.abspath(path), export_format='GLB', use_selection=False,
        export_apply=False, export_animations=False, export_skins=True, export_morph=True,
        export_morph_normal=False, export_morph_tangent=False, export_yup=True,
        export_texcoords=True, export_normals=True, export_tangents=False,
        export_image_format='JPEG', export_jpeg_quality=90, export_extras=False,
        export_def_bones=True, export_vertex_color='ACTIVE', export_all_vertex_colors=False)


def report():
    for o in bpy.data.objects:
        if o.type == 'MESH':
            sk = o.data.shape_keys
            print('MESH', o.name, len(o.data.vertices), 'sk', len(sk.key_blocks) - 1 if sk else 0)
        elif o.type == 'ARMATURE':
            print('RIG', o.name, len(o.data.bones), sorted(b.name for b in o.data.bones))
    body = bpy.data.objects.get('Body')
    if body and body.data.shape_keys:
        print('KEYS', [k.name for k in body.data.shape_keys.key_blocks])


def main():
    basemesh = build()
    tune_materials(basemesh)
    if args.preview:
        paint_scalp(basemesh)
        render_views(basemesh, args.preview)
    if args.export:
        rig, _ = relatives(basemesh)
        add_face_shape_keys(basemesh)
        clean_shape_keys()
        add_eye_bones(rig)
        rename_all(basemesh, rig)
        paint_scalp(basemesh)
        fade_hairline(basemesh)
        simplify_materials()
        report()
        export_glb(args.export)
    if args.blend:
        bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(args.blend))
    print('OBJECTS', [(o.name, o.type) for o in bpy.data.objects])


main()
