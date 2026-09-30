"""
Athlete models for Blender: chunky arcade-caricature athletes built from
low-poly lofts and ellipsoids, posed with the game's own joint angles
(src/athletes/stickFigure.js).

Every body part hangs off a pivot empty at its joint, the same way drawFigure
places limbs, so export_sprites.py can render the parts one by one as cutout
sprites that the game puts back together along its skeleton.

Conventions (as the game): H = 1.8 m. Limb angles from straight down, torso
from straight up, + = toward the running direction (+X). The camera looks along
+Y from -Y, so index 0 (near) limbs sit at -Y. The face is a true side profile.

Run inside Blender (the scripts exec this file; see tools/blender/README.md).
"""
import bpy, bmesh, math
from mathutils import Vector

H = 1.8
THIGH, SHIN, TORSO = 0.25 * H, 0.25 * H, 0.32 * H
UPPER, FORE = 0.17 * H, 0.16 * H
ARM_Y, LEG_Y = 0.27, 0.1          # half-spacing of arms / legs across the body
HEAD_YAW = 0.0                    # true side profile: face looks straight ahead (+X)
TORSO_YAW = math.radians(-15)
HEAD_SCALE = 1.25
HEAD_FOLLOW = 0.85                # the head tilts this share of the torso lean (as the game draws it)

# Juno's kit (src/athletes/roster.js), plus sneakers.
JUNO = {'shirt': '#ffb400', 'shorts': '#12203a', 'skin': '#f1c9a5', 'hair': '#3a2416', 'shoe': '#e8322b'}


def hex_lin(h):
    h = h.lstrip('#')
    def c(v):
        v = int(v, 16) / 255
        return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4
    return (c(h[0:2]), c(h[2:4]), c(h[4:6]), 1)


MATS = {}
def mat(name, hexcol, rough=0.45, spec=0.35):
    key = f'{name}{hexcol}'
    if key in MATS:
        return MATS[key]
    m = bpy.data.materials.get('A_' + key) or bpy.data.materials.new('A_' + key)
    try:
        m.use_nodes = True
    except Exception:
        pass
    b = m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value = hex_lin(hexcol)
    b.inputs['Roughness'].default_value = rough
    if 'Specular IOR Level' in b.inputs:
        b.inputs['Specular IOR Level'].default_value = spec
    MATS[key] = m
    return m


def palette(c):
    return {
        'skin': mat('skin', c['skin'], 0.55, 0.25),
        'nose': mat('nose', c.get('nose', '#e9a888'), 0.5, 0.3),
        'shirt': mat('shirt', c['shirt'], 0.5),
        'shorts': mat('shorts', c['shorts'], 0.5),
        'hair': mat('hair', c['hair'], 0.6),
        'shoe': mat('shoe', c['shoe'], 0.35, 0.5),
        'sole': mat('sole', '#f4f4f4', 0.5),
        'sock': mat('sock', '#ffffff', 0.7),
        'white': mat('eyewhite', '#ffffff', 0.25, 0.6),
        'black': mat('pupil', '#111111', 0.2, 0.8),
        'mouth': mat('mouth', '#6b1420', 0.6),
        'teeth': mat('teeth', '#fbfbf2', 0.3),
        'brow': mat('brow', c['hair'], 0.7),
    }


def empty(name, parent=None, loc=(0, 0, 0)):
    e = bpy.data.objects.new(name, None)
    e.empty_display_size = 0.05
    COLL.objects.link(e)
    e.parent = parent
    e.location = loc
    return e


def ellip(name, parent, center, radii, material, segs=14, rings=9, rot=(0, 0, 0)):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=rings, radius=1.0)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    me.materials.append(material)
    o = bpy.data.objects.new(name, me)
    COLL.objects.link(o)
    o.parent = parent
    o.location = center
    o.scale = radii
    o.rotation_euler = rot
    return o


def loft(name, parent, secs, mats, segs=16):
    """Smooth shape through cross-sections (z, rx, ry, cx, mat index) along local Z.
    A section with rx == 0 is a pole (closed end); otherwise the end is left open."""
    bm = bmesh.new()
    rings = []
    for z, rx, ry, cx, _ in secs:
        if rx == 0:
            rings.append([bm.verts.new((cx, 0, z))])
        else:
            rings.append([bm.verts.new((cx + rx * math.cos(2 * math.pi * j / segs),
                                        ry * math.sin(2 * math.pi * j / segs), z)) for j in range(segs)])
    for k in range(len(rings) - 1):
        A, B, mi = rings[k], rings[k + 1], secs[k][4]
        for j in range(segs):
            n = (j + 1) % segs
            if len(A) == 1:
                f = bm.faces.new((A[0], B[n], B[j]))
            elif len(B) == 1:
                f = bm.faces.new((A[j], A[n], B[0]))
            else:
                f = bm.faces.new((A[j], A[n], B[n], B[j]))
            f.material_index = mi
            f.smooth = True
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for m_ in mats:
        me.materials.append(m_)
    o = bpy.data.objects.new(name, me)
    COLL.objects.link(o)
    o.parent = parent
    return o


def capsule(top, mids, bot, caps=(True, True)):
    """Sections for a tapered capsule along -Z: top/bot = (z, r, cx), mids = [(z, r, cx)]; rounded ends."""
    out = []
    z0, r0, c0 = top
    z1, r1, c1 = bot
    if caps[0]:
        out.append((z0 + r0 * 0.85, 0, 0, c0, 0))
        for t in (60, 30):
            a = math.radians(t)
            out.append((z0 + r0 * 0.85 * math.sin(a), r0 * math.cos(a), r0 * math.cos(a), c0, 0))
    out.append((z0, r0, r0, c0, 0))
    # mids: (z, r, cx) round, or (z, rx, ry, cx) for a muscle bulge (rx: front-back, seen from the side)
    out += [(m[0], m[1], m[1], m[2], 0) if len(m) == 3 else (m[0], m[1], m[2], m[3], 0) for m in mids]
    out.append((z1, r1, r1, c1, 0))
    if caps[1]:
        for t in (30, 60):
            a = math.radians(t)
            out.append((z1 - r1 * 0.85 * math.sin(a), r1 * math.cos(a), r1 * math.cos(a), c1, 0))
        out.append((z1 - r1 * 0.85, 0, 0, c1, 0))
    return out


def hugging_band(name, parent, shells, zc, tilt, half_h, thick, material, segs=48):
    """A band that wraps the outermost of `shells` (sibling objects under `parent`):
    at each angle a ray from the head's axis finds the outer surface, and the band
    sits `thick` proud of it. Centre height zc - tilt*cos(angle): lower at the front."""
    from mathutils.bvhtree import BVHTree
    trees = []
    for o in shells:
        mw = o.matrix_basis
        trees.append(BVHTree.FromPolygons([mw @ v.co for v in o.data.vertices],
                                          [tuple(p.vertices) for p in o.data.polygons]))
    profile = [(-half_h, 0.004), (-half_h * 0.7, thick), (half_h * 0.7, thick), (half_h, 0.004)]
    bm = bmesh.new()
    rows = []
    for j in range(segs):
        a = 2 * math.pi * j / segs
        d = Vector((math.cos(a), math.sin(a), 0))
        row = []
        for dz, out in profile:
            z = zc - tilt * math.cos(a) + dz
            r = 0.0
            for t in trees:
                hit = t.ray_cast(Vector((0, 0, z)), d)
                if hit[0] is not None:
                    r = max(r, hit[3])
            row.append(bm.verts.new(Vector((0, 0, z)) + d * (r + out)))
        rows.append(row)
    for j in range(segs):
        A, B = rows[j], rows[(j + 1) % segs]
        for k in range(len(profile) - 1):
            f = bm.faces.new((A[k], B[k], B[k + 1], A[k + 1]))
            f.smooth = True
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(material)
    o = bpy.data.objects.new(name, me)
    COLL.objects.link(o)
    o.parent = parent
    return o


# ---------------------------------------------------------------- the build

def build(tag, c):
    P = palette(c)
    root = empty(f'{tag}')

    # Pelvis + torso share the hip pivot; the torso group is yawed a little toward camera.
    torso = empty(f'{tag}.torso', root)
    tg = empty(f'{tag}.torso_geo', torso)
    tg.rotation_euler = (0, 0, TORSO_YAW)
    loft(f'{tag}.body', tg, [
        (-0.13, 0, 0, 0, 0), (-0.1, 0.1, 0.13, 0, 0), (-0.03, 0.155, 0.195, 0, 0),
        (0.06, 0.165, 0.205, 0.005, 0), (0.1, 0.16, 0.2, 0.005, 1), (0.2, 0.17, 0.23, 0.015, 1),
        (0.32, 0.225, 0.29, 0.035, 1), (0.42, 0.24, 0.31, 0.04, 1), (0.5, 0.21, 0.29, 0.03, 1),
        (0.56, 0.13, 0.2, 0.01, 1), (0.59, 0, 0, 0, 1)], [P['shorts'], P['shirt']], segs=20)
    ellip(f'{tag}.neck', tg, (0.02, 0, 0.6), (0.075, 0.08, 0.1), P['skin'])

    # Head: pivot at the neck; the geometry sits above it, scaled up for the caricature.
    head = empty(f'{tag}.head', root)
    hg = empty(f'{tag}.head_geo', head, (0, 0, 0.29))
    hg.rotation_euler = (0, 0, HEAD_YAW)
    hg.scale = (HEAD_SCALE,) * 3
    loft(f'{tag}.skull', hg, [
        (-0.265, 0, 0, 0.07, 0), (-0.25, 0.09, 0.09, 0.075, 0), (-0.2, 0.16, 0.15, 0.055, 0),
        (-0.12, 0.2, 0.185, 0.04, 0), (-0.02, 0.222, 0.205, 0.02, 0), (0.08, 0.228, 0.212, 0.005, 0),
        (0.17, 0.212, 0.2, -0.005, 0), (0.24, 0.17, 0.16, -0.015, 0), (0.285, 0.1, 0.095, -0.025, 0),
        (0.305, 0, 0, -0.03, 0)], [P['skin']], segs=24)
    ellip(f'{tag}.nose', hg, (0.232, -0.005, -0.005), (0.055, 0.04, 0.052), P['nose'], rot=(0, math.radians(20), 0))
    # Profile face: only the near side (-Y, toward the camera) has an eye and brow.
    ellip(f'{tag}.ear', hg, (-0.045, -0.205, 0.0), (0.045, 0.035, 0.065), P['skin'])
    ellip(f'{tag}.eye', hg, (0.14, -0.15, 0.06), (0.07, 0.04, 0.085), P['white'], segs=16)
    ellip(f'{tag}.pupil', hg, (0.19, -0.17, 0.055), (0.024, 0.02, 0.038), P['black'])
    ellip(f'{tag}.brow', hg, (0.145, -0.16, 0.16), (0.075, 0.03, 0.024), P['brow'])
    # Hair: cap over the top and back, topknot, headband in the shirt color.
    ellip(f'{tag}.hair', hg, (-0.05, 0, 0.12), (0.238, 0.224, 0.225), P['hair'], segs=32, rings=16,
          rot=(0, math.radians(8), 0))
    ellip(f'{tag}.topknot', hg, (-0.14, 0, 0.31), (0.075, 0.07, 0.07), P['hair'])
    hugging_band(f'{tag}.headband', hg, [bpy.data.objects[f'{tag}.skull'], bpy.data.objects[f'{tag}.hair']],
                 zc=0.245, tilt=0.02, half_h=0.03, thick=0.022, material=P['shirt'])
    # Mouths (one shown at a time), long front-to-back so they read in profile.
    m = empty(f'{tag}.mouth_grin', hg)
    ellip(f'{tag}.grin_in', m, (0.175, -0.105, -0.115), (0.065, 0.045, 0.058), P['mouth'], rot=(0, 0.3, 0))
    ellip(f'{tag}.grin_teeth', m, (0.185, -0.11, -0.086), (0.056, 0.042, 0.02), P['teeth'], rot=(0, 0.3, 0))
    m = empty(f'{tag}.mouth_grit', hg)
    ellip(f'{tag}.grit_teeth', m, (0.18, -0.105, -0.105), (0.065, 0.045, 0.04), P['teeth'], rot=(0, 0.12, 0))
    ellip(f'{tag}.grit_line', m, (0.185, -0.115, -0.105), (0.062, 0.042, 0.006), P['mouth'], rot=(0, 0.12, 0))
    m = empty(f'{tag}.mouth_line', hg)
    ellip(f'{tag}.line', m, (0.185, -0.11, -0.105), (0.05, 0.035, 0.012), P['mouth'])
    m = empty(f'{tag}.mouth_o', hg)
    ellip(f'{tag}.o', m, (0.19, -0.1, -0.115), (0.04, 0.045, 0.058), P['mouth'])

    for i, s in ((0, -1), (1, 1)):
        # Arm: upper arm, forearm (with a sweatband), mitt hand.
        ua = empty(f'{tag}.upper{i}', root)
        loft(f'{tag}.upper{i}.m', ua, capsule((0.01, 0.1, 0), [  # deltoid cap, biceps (front) + triceps (back), elbow
            (-0.05, 0.106, 0.095, 0.004), (-0.13, 0.13, 0.092, 0.022), (-0.2, 0.108, 0.078, 0.022), (-0.26, 0.066, 0.06, 0.006)],
            (-UPPER, 0.054, 0)), [P['skin']])
        fa = empty(f'{tag}.fore{i}', root)
        loft(f'{tag}.fore{i}.m', fa, capsule((0, 0.06, 0), [  # thick below the elbow, thin wrist
            (-0.05, 0.098, 0.078, 0.014), (-0.1, 0.09, 0.07, 0.012), (-0.18, 0.058, 0.052, 0.004)],
            (-FORE, 0.042, 0)), [P['skin']])
        ellip(f'{tag}.band{i}', fa, (0, 0, -FORE * 0.86), (0.058, 0.058, 0.038), P['shirt'])
        hd = empty(f'{tag}.hand{i}', root)
        ellip(f'{tag}.hand{i}.m', hd, (0.005, 0, -0.095), (0.09, 0.08, 0.115), P['skin'])
        ellip(f'{tag}.thumb{i}', hd, (0.065, s * 0.04, -0.045), (0.04, 0.038, 0.05), P['skin'])
        # Leg: thigh with a shorts leg, shin with a sock, big sneaker.
        th = empty(f'{tag}.thigh{i}', root)
        loft(f'{tag}.thigh{i}.m', th, capsule((0.02, 0.1, 0), [  # quads bulge forward, tapering into the knee
            (-0.06, 0.13, 0.112, 0.012), (-0.18, 0.158, 0.11, 0.035), (-0.3, 0.125, 0.095, 0.03), (-0.39, 0.078, 0.072, 0.008)],
            (-THIGH, 0.064, 0)), [P['skin']])
        loft(f'{tag}.shortsleg{i}', th, [(0.12, 0, 0, 0, 0), (0.09, 0.1, 0.1, 0, 0), (0.04, 0.135, 0.125, 0, 0),
                                         (-0.06, 0.15, 0.13, 0.01, 0), (-0.17, 0.172, 0.13, 0.034, 0)], [P['shorts']])
        sh = empty(f'{tag}.shin{i}', root)
        loft(f'{tag}.shin{i}.m', sh, capsule((0, 0.068, 0), [  # big calf at the back, thin ankle
            (-0.06, 0.092, 0.078, -0.025), (-0.13, 0.12, 0.082, -0.045), (-0.22, 0.085, 0.066, -0.028), (-0.34, 0.05, 0.047, -0.004)],
            (-SHIN, 0.045, 0)), [P['skin']])
        loft(f'{tag}.sock{i}', sh, [(-SHIN + 0.13, 0.056, 0.056, -0.004, 0), (-SHIN + 0.03, 0.058, 0.058, 0, 0),
                                    (-SHIN - 0.03, 0.058, 0.058, 0, 0)], [P['sock']])
        ft = empty(f'{tag}.foot{i}', root)
        ellip(f'{tag}.shoe{i}', ft, (0.1, 0, 0.085), (0.21, 0.1, 0.095), P['shoe'], segs=16)
        ellip(f'{tag}.sole{i}', ft, (0.1, 0, 0.022), (0.225, 0.108, 0.038), P['sole'], segs=16)
        ellip(f'{tag}.lace{i}', ft, (0.15, 0, 0.14), (0.085, 0.07, 0.035), P['sole'])
    return root


# ---------------------------------------------------------------- posing

def down(a, L):   # limb vector: angle from straight down, + = +X
    return Vector((math.sin(a) * L, 0, -math.cos(a) * L))


def pose(root, p):
    tag = root.name
    O = lambda n: bpy.data.objects[f'{tag}.{n}']
    hip = Vector((p['hipX'] * H, 0, -p['hipY'] * H))
    lean = p['lean']
    up = Vector((math.sin(lean), 0, math.cos(lean)))
    neck = hip + up * TORSO
    shoulder = hip + up * TORSO * 0.9
    O('torso').location = hip
    O('torso').rotation_euler = (0, lean, 0)
    O('head').location = neck
    O('head').rotation_euler = (0, lean * HEAD_FOLLOW, 0)
    for i, s in ((0, -1), (1, 1)):
        a = p['arms'][i]
        sh = shoulder + Vector((0, s * ARM_Y, 0))
        el = sh + down(a['upper'], UPPER)
        wr = el + down(a['fore'], FORE)
        O(f'upper{i}').location, O(f'upper{i}').rotation_euler = sh, (0, -a['upper'], 0)
        O(f'fore{i}').location, O(f'fore{i}').rotation_euler = el, (0, -a['fore'], 0)
        O(f'hand{i}').location, O(f'hand{i}').rotation_euler = wr, (0, -a['fore'], 0)
        l = p['legs'][i]
        hp = hip + Vector((0, s * LEG_Y, 0))
        kn = hp + down(l['thigh'], THIGH)
        an = kn + down(l['shin'], SHIN)
        O(f'thigh{i}').location, O(f'thigh{i}').rotation_euler = hp, (0, -l['thigh'], 0)
        O(f'shin{i}').location, O(f'shin{i}').rotation_euler = kn, (0, -l['shin'], 0)
        O(f'foot{i}').location, O(f'foot{i}').rotation_euler = an, (0, l.get('toe', 0), 0)


EXPR = {
    # brow: (tilt rad, + = front end down; height offset), eye squash, mouth
    'focus': dict(brow=(0.25, -0.012), eye=0.8, mouth='line'),
    'strain': dict(brow=(0.45, -0.025), eye=0.55, mouth='grit'),
    'joy': dict(brow=(-0.25, 0.012), eye=1.05, mouth='grin'),
    'shock': dict(brow=(-0.45, 0.018), eye=1.15, mouth='o'),
}


def expression(root, name):
    tag, e = root.name, EXPR[name]
    for mname in ('grin', 'grit', 'line', 'o'):
        show = mname == e['mouth']
        mo = bpy.data.objects[f'{tag}.mouth_{mname}']
        for ch in mo.children:
            ch.hide_render = ch.hide_viewport = not show
    b = bpy.data.objects[f'{tag}.brow']
    tilt, dz = e['brow']
    b.rotation_euler = (0, tilt, 0)
    b.location.z = 0.16 + dz
    for n, base in (('eye', 0.08), ('pupil', 0.036)):
        bpy.data.objects[f'{tag}.{n}'].scale.z = base * e['eye']


# ---------------------------------------------------------------- scene

def reset_scene():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.lights, bpy.data.cameras):
        for d in list(coll):
            if d.users == 0:
                coll.remove(d)


def setup_render(scene):
    eng = [e.identifier for e in scene.render.bl_rna.properties['engine'].enum_items]
    scene.render.engine = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in eng else 'BLENDER_EEVEE'
    scene.view_settings.view_transform = 'Standard'   # keep kit colors saturated (AgX washes them out)
    scene.view_settings.look = 'None'
    world = scene.world or bpy.data.worlds.new('World')
    scene.world = world
    try:
        world.use_nodes = True
    except Exception:
        pass
    bg = world.node_tree.nodes.get('Background')
    bg.inputs['Color'].default_value = hex_lin('#bcd6ee')
    bg.inputs['Strength'].default_value = 0.9

    def sun(name, direction, strength, color='#ffffff'):
        ld = bpy.data.lights.new(name, 'SUN')
        ld.energy = strength
        ld.color = hex_lin(color)[:3]
        ld.angle = math.radians(8)
        o = bpy.data.objects.new(name, ld)
        COLL.objects.link(o)
        o.rotation_euler = Vector(direction).normalized().to_track_quat('-Z', 'Y').to_euler()
        return o
    sun('Key', (0.45, 1.0, -0.9), 3.2, '#fff4e0')
    sun('Rim', (-0.3, -0.7, -0.5), 2.5, '#dfeaff')


def camera(scene, name, center, width, res):
    cd = bpy.data.cameras.new(name)
    cd.type = 'ORTHO'
    cd.ortho_scale = width
    o = bpy.data.objects.new(name, cd)
    COLL.objects.link(o)
    o.location = (center[0], -20, center[1])
    o.rotation_euler = (math.radians(90), 0, 0)
    scene.camera = o
    scene.render.resolution_x, scene.render.resolution_y = res
    scene.render.resolution_percentage = 100
    return o


COLL = bpy.context.scene.collection
