"""
Render an athlete's body parts as cutout sprites and pack them into one sheet:
src/athletes/sprites/<id>.png plus <id>.json (where each part sits on the sheet
and where its joint pivot is), for src/athletes/sprites.js.

Each part is rendered alone in its rest orientation, the way the game rotates
it: limbs hanging straight down from their joint, the torso standing straight up
from the hip, the head upright on the neck, the foot flat and pointing forward
from the ankle. The game rotates each one about its pivot by the pose's angle.

Run from the repo root, with Blender closed or open:
    /Applications/Blender.app/Contents/MacOS/Blender -b -P tools/blender/export_sprites.py
or from a running Blender (e.g. over MCP):
    exec(open('<repo>/tools/blender/export_sprites.py').read(), {'REPO': '<repo>'})
"""
import bpy, json, math, os, tempfile
import numpy as np
from mathutils import Vector

if 'REPO' not in globals():
    REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
exec(open(os.path.join(REPO, 'tools', 'blender', 'athlete.py')).read(), globals())

PPM = 240           # sprite pixels per meter (a 1.8 m athlete is about 430 px tall)
PAD = 3             # transparent pixels around each part, so rotated parts don't clip
FAR_SHADE = 0.78    # far-side limbs are darker, as drawFigure does
FACES = ('focus', 'strain', 'joy', 'shock')
LIMBS = ('upper', 'fore', 'hand', 'thigh', 'shin', 'foot')


def descendants(o):
    """Every mesh under `o` (through the pivot empties)."""
    out = []
    for c in o.children:
        if c.type == 'MESH':
            out.append(c)
        out += descendants(c)
    return out


def render_part(scene, objs, pivot):
    """Render just `objs` (framed on their bounds) and return (rgba top-down, pivot px, py)."""
    for o in scene.objects:
        if o.type == 'MESH':
            o.hide_render = o not in objs
    bpy.context.view_layer.update()
    xs, zs = [], []
    for o in objs:
        for v in o.data.vertices:
            w = o.matrix_world @ v.co
            xs.append(w.x)
            zs.append(w.z)
    # Snap the frame to whole pixels so the pivot lands on an exact sprite coordinate.
    x0 = (math.floor(min(xs) * PPM) - PAD) / PPM
    x1 = (math.ceil(max(xs) * PPM) + PAD) / PPM
    z0 = (math.floor(min(zs) * PPM) - PAD) / PPM
    z1 = (math.ceil(max(zs) * PPM) + PAD) / PPM
    w, h = round((x1 - x0) * PPM), round((z1 - z0) * PPM)
    camera(scene, 'SpriteCam', ((x0 + x1) / 2, (z0 + z1) / 2), max(x1 - x0, z1 - z0), (w, h))
    path = os.path.join(tempfile.gettempdir(), 'athlete_part.png')
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    img = bpy.data.images.load(path, check_existing=False)
    a = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)[::-1]  # Blender rows run bottom-up
    bpy.data.images.remove(img)
    bpy.data.objects.remove(bpy.data.objects['SpriteCam'], do_unlink=True)
    return a, (pivot.x - x0) * PPM, (z1 - pivot.z) * PPM


def pack(sprites, width=1024, gap=2):
    """Shelf-pack {name: (rgba, px, py)} into one sheet. Returns (sheet, {name: rect + pivot})."""
    order = sorted(sprites, key=lambda n: -sprites[n][0].shape[0])
    x = y = shelf = 0
    rects = {}
    for n in order:
        h, w = sprites[n][0].shape[:2]
        if x + w > width:
            x, y, shelf = 0, y + shelf + gap, 0
        rects[n] = (x, y, w, h)
        x += w + gap
        shelf = max(shelf, h)
    sheet = np.zeros((y + shelf, width, 4), dtype=np.float32)
    meta = {}
    for n, (x, y, w, h) in rects.items():
        a, px, py = sprites[n]
        sheet[y:y + h, x:x + w] = a
        meta[n] = {'x': x, 'y': y, 'w': w, 'h': h, 'px': round(px, 2), 'py': round(py, 2)}
    return sheet, meta


def export(ident, colors):
    scene = bpy.context.scene
    reset_scene()
    setup_render(scene)
    scene.render.film_transparent = True
    scene.eevee.taa_render_samples = 64
    # Parts get rotated in the game, so light them mostly from the camera side:
    # a rotated limb then keeps believable shading. The rim stays gentle.
    key, rim = bpy.data.objects['Key'], bpy.data.objects['Rim']
    key.rotation_euler = Vector((0.3, 1.0, -0.6)).normalized().to_track_quat('-Z', 'Y').to_euler()
    rim.data.energy = 1.2

    root = build(ident, colors)  # every pivot at the origin, unrotated: the rest pose
    O = lambda n: bpy.data.objects[f'{ident}.{n}']
    origin = Vector((0, 0, 0))
    sprites = {}
    sprites['torso'] = render_part(scene, descendants(O('torso')), origin)
    for face in FACES:
        expression(root, face)
        shown = [o for o in descendants(O('head')) if not o.hide_viewport]
        sprites[f'head.{face}'] = render_part(scene, shown, origin)
    for i in (0, 1):
        for limb in LIMBS:
            a, px, py = render_part(scene, descendants(O(f'{limb}{i}')), origin)
            if i == 1:
                a[..., :3] *= FAR_SHADE
            sprites[f'{limb}{i}'] = (a, px, py)

    sheet, parts = pack(sprites)
    out = os.path.join(REPO, 'src', 'athletes', 'sprites')
    os.makedirs(out, exist_ok=True)
    h, w = sheet.shape[:2]
    img = bpy.data.images.new(f'{ident}_sheet', w, h, alpha=True)
    img.pixels = sheet[::-1].ravel()
    img.filepath_raw = os.path.join(out, f'{ident}.png')
    img.file_format = 'PNG'
    img.save()
    bpy.data.images.remove(img)
    with open(os.path.join(out, f'{ident}.json'), 'w') as f:
        json.dump({'ppm': PPM, 'height': H, 'headFollow': HEAD_FOLLOW, 'parts': parts}, f, indent=1)
    return {'sheet': [w, h], 'parts': len(parts)}


result = export('juno', JUNO)
print('exported', result)
