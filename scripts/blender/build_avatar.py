"""District 122 avatar builder (Quaternius base).

Builds the stylised character from the Quaternius "Universal Base Characters"
female (CC0) and the Universal Animation Library skeleton + clips, and exports
one GLB: public/models/avatar/avatar.glb, plus its textures next to it.

MODESTY RULE: the body mesh is NEVER exported. The GLB holds the head (head +
neck), the hands, eyes, brows, hair pieces and garment pieces. Garments are cut
from the body as offset shells (so they fit and inherit its skin weights), then
the body is discarded. Every outfit covers neck to ankles and shoulders to
wrists; legs always carry leggings or trousers.

Run:  tools/blender-4.2.23-windows-x64/blender.exe -b -P scripts/blender/build_avatar.py -- [--preview DIR]
Then: node scripts/avatar-postprocess.mjs

Pieces are named <piece>; the runtime (src/actors/avatar/) picks a subset per
look, merges them into one skinned geometry and colours each piece through a
`part` attribute (see PIECE_PART in src/actors/avatar/pieces.ts). Textured parts
(face, skin, hair, brows, eyes) sample the atlases exported here.
Coordinates: Blender Z-up, the character faces -Y, her left is +X (metres).
"""

import math
import os
import sys

import bmesh
import bpy
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
Q = os.path.join(ROOT, "tools", "quaternius")
UAL = os.path.join(Q, "UAL", "Universal Animation Library[Standard]", "Unreal-Godot", "UAL1_Standard.glb")
UBC = os.path.join(Q, "UBC", "Universal Base Characters[Standard]")
BODY = os.path.join(UBC, "Base Characters", "Godot - UE", "Superhero_Female_FullBody.gltf")
HAIR_DIR = os.path.join(UBC, "Hairstyles", "Rigged to Head Bone", "glTF (Godot -Unreal)")
OUT_DIR = os.path.join(ROOT, "public", "models", "avatar")
OUT = os.path.join(OUT_DIR, "avatar.glb")

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
PREVIEW = argv[argv.index("--preview") + 1] if "--preview" in argv else None

# Clips kept from the library (renamed without the "_Armature" suffix).
CLIPS = ["Idle_Loop", "Idle_Talking_Loop", "Walk_Loop", "Walk_Formal_Loop", "Jog_Fwd_Loop", "Interact", "Sitting_Idle_Loop", "Dance_Loop", "PickUp_Table"]
FINGERS = ("index", "middle", "ring", "pinky", "thumb")

# Body landmarks (UBC rest pose, metres): the Head bone sits at the top of the neck.
HEAD_PIVOT = Vector((0.0, 0.011, 1.55))
HEAD_SCALE = 1.15  # stylised: a larger head on the slim body; the hair, hijab, eyes and brows follow
COLLAR_Z = 1.562  # the tops reach up to the base of the jaw (stand collar above)
HIP_Z = 1.0
SKIRT_PIVOT_Z = 0.93

# ---------------------------------------------------------------- helpers


def smooth(e0, e1, x):
    t = max(0.0, min(1.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


def lerp(a, b, t):
    return a + (b - a) * t


def ellipse(c, u, v, ru, rv, n, a0=0.0):
    """Closed ring around axis u x v (counter-clockwise about that axis)."""
    c, u, v = Vector(c), Vector(u), Vector(v)
    return [c + u * (math.cos(a0 + 2 * math.pi * i / n) * ru) + v * (math.sin(a0 + 2 * math.pi * i / n) * rv) for i in range(n)]


class Builder:
    """Collects vertices/faces/uvs for a lofted piece."""

    def __init__(self):
        self.verts, self.faces, self.uvs = [], [], []

    def add_ring(self, ring):
        i0 = len(self.verts)
        self.verts.extend(ring)
        self.uvs.extend([(0.0, 0.0)] * len(ring))
        return list(range(i0, i0 + len(ring)))

    def loft(self, rings, cap_start=False, cap_end=False):
        """Rings progress along the axis; each ring runs CCW about it -> outward normals."""
        ids = [self.add_ring(r) for r in rings]
        n = len(rings[0])
        for k in range(len(ids) - 1):
            a, b = ids[k], ids[k + 1]
            for i in range(n):
                j = (i + 1) % n
                self.faces.append((a[i], a[j], b[j], b[i]))
        if cap_start:
            self.cap(ids[0], rings[0], flip=True)
        if cap_end:
            self.cap(ids[-1], rings[-1], flip=False)
        return ids

    def cap(self, ring_ids, ring, flip, point=None):
        c = point if point is not None else sum(ring, Vector()) / len(ring)
        ci = self.add_ring([Vector(c)])[0]
        n = len(ring_ids)
        for i in range(n):
            j = (i + 1) % n
            self.faces.append((ci, ring_ids[j], ring_ids[i]) if flip else (ci, ring_ids[i], ring_ids[j]))


def side_bone(name, s):
    return name.replace("_l", "_r") if s < 0 else name


def spine_weights(z):
    """Torso column weights by height (lofted pieces: skirts, drape, bands)."""
    bands = [("pelvis", 0.93), ("spine_01", 1.08), ("spine_02", 1.22), ("spine_03", 1.38), ("neck_01", 1.50), ("Head", 1.57)]
    if z <= bands[0][1]:
        return {"pelvis": 1.0}
    for (b0, z0), (b1, z1) in zip(bands, bands[1:]):
        if z <= z1:
            t = smooth(z0, z1, z)
            return {b0: 1 - t, b1: t}
    return {"Head": 1.0}


def leg_weights(p, rx, hip_z=HIP_Z, hem_z=0.06, strength=0.9, ry=None, panels=True):
    """Skirt/tunic: the sides follow the legs; the front and back panels follow the
    skirt_f / skirt_b hinge bones (driven at runtime by the leading / trailing leg)."""
    s = max(-1.0, min(1.0, p.x / max(rx, 1e-4)))
    t = max(0.0, min(1.0, (hip_z - p.z) / (hip_z - hem_z)))
    sideness = abs(s) ** 1.4
    w = sideness * min(1.0, t * 1.4) * strength
    calf = smooth(0.45, 1.0, t) * 0.7
    side = "l" if s >= 0 else "r"
    out = {}
    if w > 0:
        out["thigh_" + side] = w * (1 - calf)
        out["calf_" + side] = w * calf
    if panels:
        cy = max(-1.0, min(1.0, (p.y - 0.04) / max(ry or rx * 0.75, 1e-4)))
        k = (1 - sideness) * smooth(0.0, 0.5, t) * 0.95
        if cy < 0:
            out["skirt_f"] = k * (-cy) ** 0.8
        else:
            out["skirt_b"] = k * cy ** 0.8
    out["pelvis"] = max(0.0, 1.0 - sum(out.values()))
    return out


# ---------------------------------------------------------------- fitted lofts
# Garments are smooth tubes fitted to the body's measurements (no muscle detail):
# an ellipse per height for the torso, a circle per station along each arm / leg.


def body_points(body, pred, by_bone=None):
    """Vertices passing pred(co); with by_bone(dominant_bone_name) only those bones' vertices."""
    dom = dominant(body) if by_bone else None
    return [v.co.copy() for v in body.data.vertices if pred(v.co) and (by_bone is None or by_bone(dom.get(v.index, "")))]


def torso_sections(body, z0, z1, step=0.02, ease=0.0):
    """(z, rx, ry, cy) per height from the body's torso silhouette, plus `ease` of room."""
    pts = body_points(body, lambda p: abs(p.x) < 0.21 and z0 - 0.03 <= p.z <= z1 + 0.03)
    out = []
    z = z0
    while z <= z1 + 1e-6:
        sl = [p for p in pts if abs(p.z - z) < step]
        if len(sl) >= 6:
            rx = max(abs(p.x) for p in sl)
            ys = [p.y for p in sl]
            out.append((z, rx + ease, (max(ys) - min(ys)) / 2 + ease, (max(ys) + min(ys)) / 2))
        z += step
    # Light smoothing along the height so the loft has no steps.
    sm = []
    for i, (z, rx, ry, cy) in enumerate(out):
        nb = out[max(0, i - 1): i + 2]
        sm.append((z, sum(r[1] for r in nb) / len(nb), sum(r[2] for r in nb) / len(nb), sum(r[3] for r in nb) / len(nb)))
    return sm


def limb_sections(body, pred, axis, a0, a1, step=0.02, ease=0.0, by_bone=None, r_max=0.2):
    """(a, c, r) stations along `axis` ('x' arms, 'z' legs): centre and radius of the limb there."""
    pts = body_points(body, pred, by_bone)
    out = []
    a = a0
    k = 0 if axis == "x" else 2
    forward = a1 >= a0
    while (a <= a1 + 1e-6) if forward else (a >= a1 - 1e-6):
        sl = [p for p in pts if abs(p[k] - a) < step]
        if len(sl) >= 5:
            c = sum(sl, Vector()) / len(sl)
            c[k] = a
            r = min(r_max, max((p - c).length for p in sl))
            out.append((a, c, r + ease))
        a += step if forward else -step
    sm = []
    for i, (a, c, r) in enumerate(out):
        nb = out[max(0, i - 1): i + 2]
        sm.append((a, sum((x[1] for x in nb), Vector()) / len(nb), sum(x[2] for x in nb) / len(nb)))
    return sm


def loft_torso(b, secs, n=28):
    rings = [ellipse((0, cy, z), (1, 0, 0), (0, 1, 0), rx, ry, n) for z, rx, ry, cy in secs]
    return b.loft(rings)


def loft_limb(b, secs, axis, n=14, cap_start=False, cap_end=False):
    if axis == "x":
        u, v = Vector((0, 1, 0)), Vector((0, 0, 1))
    else:
        u, v = Vector((1, 0, 0)), Vector((0, 1, 0))
    rings = [ellipse(c, u, v, r, r, n) for a, c, r in secs]
    # Outward normals: rings must progress along +axis.
    if secs[0][0] > secs[-1][0]:
        rings.reverse()
        cap_start, cap_end = cap_end, cap_start
    return b.loft(rings, cap_start=cap_start, cap_end=cap_end)


def top_weights(p):
    """Torso column + clavicle blend at the shoulders; sleeves by distance along the arm."""
    ax = abs(p.x)
    sd = "l" if p.x >= 0 else "r"
    if ax > 0.19 and p.z > 1.3:
        if ax < 0.27:
            t = smooth(0.19, 0.27, ax)
            return {"clavicle_" + sd: 0.6 * (1 - t), "upperarm_" + sd: 0.4 + 0.6 * t}
        if ax < 0.34:
            return {"upperarm_" + sd: 1.0}
        if ax < 0.42:
            t = smooth(0.34, 0.42, ax)
            return {"upperarm_" + sd: 1 - t, "lowerarm_" + sd: t}
        if ax < 0.61:
            return {"lowerarm_" + sd: 1.0}
        return {"lowerarm_" + sd: 0.7, "hand_" + sd: 0.3}
    out = spine_weights(p.z)
    k = smooth(0.09, 0.17, ax) * smooth(1.33, 1.43, p.z) * (1 - smooth(1.46, 1.50, p.z)) * 0.55
    if k > 0:
        out = {bn: wt * (1 - k) for bn, wt in out.items()}
        out["clavicle_" + sd] = out.get("clavicle_" + sd, 0) + k
    return out


def leg_tube_weights(p):
    sd = "l" if p.x >= 0 else "r"
    z = p.z
    if z > 0.96:
        t = smooth(0.96, 1.03, z)
        return {"thigh_" + sd: 1 - t, "pelvis": t}
    if z > 0.56:
        return {"thigh_" + sd: 1.0}
    if z > 0.46:
        t = smooth(0.56, 0.46, z)
        return {"thigh_" + sd: 1 - t, "calf_" + sd: t}
    if z > 0.12:
        return {"calf_" + sd: 1.0}
    t = smooth(0.12, 0.06, z)
    return {"calf_" + sd: 1 - t, "foot_" + sd: t}


def piece_top(body, ease, sleeve_ease, z_top=COLLAR_Z, hem_z=0.93, flare=0.035):
    """Long blouse: fitted above the waist, A-line over the hips to `hem_z`, a stand collar
    under the jaw, sleeves to the wrist with a small cuff. Clean Bitmoji-like silhouette."""
    b = Builder()
    secs = torso_sections(body, hem_z, z_top, ease=ease)
    # A-line: the ease grows from the waist (z 1.12) down to the hem.
    secs = [(z, rx + flare * smooth(1.12, hem_z, z), ry + flare * 0.7 * smooth(1.12, hem_z, z), cy) for z, rx, ry, cy in secs]
    # Stand collar: two rings just under the jaw, a little wider than the neck.
    zt, rxt, ryt, cyt = secs[-1]
    neck = [s for s in secs if s[0] > zt - 0.06]
    rn = min(s[1] for s in neck) if neck else rxt
    secs += [(zt + 0.005, rn + 0.015, rn + 0.015, cyt), (zt + 0.022, rn + 0.016, rn + 0.016, cyt)]
    loft_torso(b, secs)
    for sgn in (1, -1):
        arm = lambda p, sgn=sgn: sgn * p.x > 0.17 and sgn * p.x < 0.645 and p.z > 1.28
        ss = limb_sections(body, arm, "x", sgn * 0.19, sgn * 0.655, ease=sleeve_ease)
        # Cuff: the last two stations flare 6 mm.
        ss = ss[:-2] + [(a, c, r + 0.006) for a, c, r in ss[-2:]]
        loft_limb(b, ss, "x", cap_start=True)
    return b, top_weights


def piece_vest_fitted(body):
    b = Builder()
    secs = torso_sections(body, HIP_Z + 0.02, 1.46, ease=0.034)
    loft_torso(b, secs, n=28)
    # Open front and arm holes.
    keep = []
    for f in b.faces:
        vs = [b.verts[i] for i in f]
        if all(v.y < -0.1 and abs(v.x) < 0.03 for v in vs):
            continue
        if all(abs(v.x) > 0.13 and v.z > 1.30 for v in vs):
            continue
        keep.append(f)
    b.faces = keep
    return b, lambda p: spine_weights(p.z)


def piece_tunic_fitted(body):
    """Hip tunic: from the waist down to mid-thigh, flaring a little."""
    b = Builder()
    base = torso_sections(body, 0.98, 1.08, ease=0.06)
    z0, rx0, ry0, cy0 = base[0]
    secs = []
    for i in range(11):
        z = 1.08 - i * 0.045
        f = 0.05 * (1.08 - z) / 0.45
        secs.append((z, rx0 + f * 1.2, ry0 + f, cy0))
    secs.reverse()
    loft_torso(b, secs)
    table = [(z, rx, ry) for z, rx, ry, _ in secs]
    return b, lambda p: leg_weights(p, _at(table, p.z, 1), hip_z=1.0, hem_z=0.66, strength=0.7, ry=_at(table, p.z, 2))


# Leg radius by fraction of the way down (0 = hip joint, 1 = ankle), UBC female.
LEG_RADIUS = [(0.0, 0.108), (0.25, 0.092), (0.5, 0.072), (0.75, 0.066), (1.0, 0.052)]


def piece_legs_fitted(arm, ease, flare=0.0):
    """Two smooth tubes along the leg bones (hip -> knee -> ankle); `flare` widens below the knee (wide trousers)."""
    b = Builder()
    bones = arm.data.bones
    for sd in ("l", "r"):
        hip, knee, ankle = (Vector(bones[n + "_" + sd].head_local) for n in ("thigh", "calf", "foot"))
        # The tube starts a little above the hip joint (under the top / tunic) and ends at the ankle.
        top = hip + Vector((0, 0, 0.06))
        path = [(top, 0.0), (hip, 0.08), (knee, 0.55), (ankle, 1.0)]
        rings = []
        for i in range(len(path) - 1):
            (p0, t0), (p1, t1) = path[i], path[i + 1]
            n = 6 if i < 2 else 8
            for k in range(n):
                f = k / n
                c = p0.lerp(p1, f)
                t = lerp(t0, t1, f)
                # Under the tunic / top hem (upper thigh) the tube stays snug so it never pokes through them.
                r = _at([(x, y) for x, y in LEG_RADIUS], t, 1) * lerp(0.9, 1.0, smooth(0.3, 0.5, t)) + ease * smooth(0.3, 0.5, t) + flare * smooth(0.5, 1.0, t)
                rings.append((c, r))
        rings.append((ankle, LEG_RADIUS[-1][1] + ease + flare))
        # Rings run bottom-up so the loft's normals face outward.
        rings.reverse()
        loft = [ellipse(c, (1, 0, 0), (0, 1, 0), r, r * 0.96, 12) for c, r in rings]
        b.loft(loft)
    return b, leg_tube_weights


# ---------------------------------------------------------------- scene


def import_gltf(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    return [o for o in bpy.data.objects if o not in before]


def load_skeleton():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=UAL)
    arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
    for o in list(bpy.data.objects):
        if o.type != "ARMATURE":
            bpy.data.objects.remove(o, do_unlink=True)
    arm.name = "Armature"
    arm.animation_data_clear()
    keep = {}
    for ac in list(bpy.data.actions):
        name = ac.name.replace("_Armature", "").split(".")[0]
        if name in CLIPS and name not in keep:
            ac.name = name
            keep[name] = ac
            ac.use_fake_user = True
        else:
            bpy.data.actions.remove(ac)
    for ac in keep.values():
        for fc in list(ac.fcurves):
            dp = fc.data_path
            bone = dp.split('"')[1] if '"' in dp else ""
            prop = dp.rsplit(".", 1)[-1]
            if prop == "scale" or any(f in bone for f in FINGERS) or (prop == "location" and bone not in ("root", "pelvis")):
                ac.fcurves.remove(fc)
    add_skirt_bones(arm)
    keep["Walk_Modest"] = modest_walk(keep["Walk_Loop"], "Walk_Modest")
    keep["Jog_Modest"] = modest_walk(keep["Jog_Fwd_Loop"], "Jog_Modest")
    return arm, keep


def add_skirt_bones(arm):
    """Front and back skirt panels hinge at the hips. No clip animates them: the
    runtime swings them with whichever leg is furthest forward / back, so a
    striding shin never pokes through a long skirt."""
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")
    eb = arm.data.edit_bones
    for name, y in (("skirt_f", -0.10), ("skirt_b", 0.14)):
        b = eb.new(name)
        b.head = (0.0, 0.04, SKIRT_PIVOT_Z)
        b.tail = (0.0, y, 0.45)
        b.parent = eb["pelvis"]
        b.use_deform = True
    bpy.ops.object.mode_set(mode="OBJECT")


# Calmer gait for long skirts: a slightly shorter stride, steadier hips, arms and head.
MODEST_DAMP = {"thigh": 0.85, "calf": 0.85, "foot": 0.85, "ball": 0.85, "pelvis": 0.7, "upperarm": 0.75, "neck": 0.35, "Head": 0.35, "spine": 0.6}


def modest_walk(src, name):
    ac = src.copy()
    ac.name = name
    ac.use_fake_user = True
    for fc in ac.fcurves:
        dp = fc.data_path
        if not dp.endswith("rotation_quaternion") or fc.array_index == 0:
            continue
        bone = dp.split('"')[1]
        k = next((v for key, v in MODEST_DAMP.items() if bone.startswith(key)), None)
        if k is None:
            continue
        for kp in fc.keyframe_points:
            kp.co.y *= k
            kp.handle_left.y *= k
            kp.handle_right.y *= k
    return ac


def adopt(objects, arm):
    """Re-parent imported skinned meshes (same bone names) to our armature and drop theirs."""
    out = []
    for o in objects:
        if o.type != "MESH":
            continue
        o.parent = arm
        o.matrix_parent_inverse.identity()
        for m in o.modifiers:
            if m.type == "ARMATURE":
                m.object = arm
        out.append(o)
    for o in objects:
        if o.type == "ARMATURE":
            bpy.data.objects.remove(o, do_unlink=True)
    return out


def clean_mesh(ob):
    """One UV map, no colour attributes: every exported piece must carry the same attributes (merged at runtime)."""
    me = ob.data
    # Removing a layer renumbers the rest: look the next extra one up by name each time.
    while len(me.uv_layers) > 1:
        extra = next((uv for uv in me.uv_layers if uv.name != "UVMap"), None)
        if extra is None:
            break
        me.uv_layers.remove(extra)
    if "UVMap" in me.uv_layers:
        me.uv_layers.active = me.uv_layers["UVMap"]
    while len(me.color_attributes):
        me.color_attributes.remove(me.color_attributes[0])


# ---------------------------------------------------------------- body regions

GROUP_CACHE = {}


def dominant(ob):
    """vertex index -> name of its heaviest bone."""
    key = ob.name
    if key not in GROUP_CACHE:
        names = {g.index: g.name for g in ob.vertex_groups}
        dom = {}
        for v in ob.data.vertices:
            if v.groups:
                g = max(v.groups, key=lambda g: g.weight)
                dom[v.index] = names[g.group]
        GROUP_CACHE[key] = dom
    return GROUP_CACHE[key]


def cut(src, keep, name, part):
    """A copy of `src` keeping only the faces whose vertices all pass `keep(vertex, dominant_bone)`."""
    ob = src.copy()
    ob.data = src.data.copy()
    ob.name = name
    ob.data.name = name
    bpy.context.scene.collection.objects.link(ob)
    dom = dominant(src)
    ok = {v.index: bool(keep(v, dom.get(v.index, ""))) for v in ob.data.vertices}
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bm.verts.ensure_lookup_table()
    dead = [f for f in bm.faces if not all(ok[v.index] for v in f.verts)]
    bmesh.ops.delete(bm, geom=dead, context="FACES")
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    bm.to_mesh(ob.data)
    bm.free()
    ob["part"] = part
    for m in list(ob.modifiers):
        if m.type != "ARMATURE":
            ob.modifiers.remove(m)
    return ob


def offset(ob, d):
    """Push every vertex along its normal by d (a number or a function of the position)."""
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bm.normal_update()
    for v in bm.verts:
        k = d(v.co) if callable(d) else d
        v.co += v.normal * k
    bm.to_mesh(ob.data)
    bm.free()


def relax(ob, iterations=6, factor=0.5, pin=None):
    """Smooth the shell so the garment drapes over the body instead of tracing every muscle.
    `pin(co)` keeps vertices in place (hems, cuffs, collar edges)."""
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    verts = [v for v in bm.verts if not (pin and pin(v.co))]
    for _ in range(iterations):
        bmesh.ops.smooth_vert(bm, verts=verts, factor=factor, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    bm.to_mesh(ob.data)
    bm.free()


def loosen_chest(ob, amount=0.03):
    """A modest top hangs straight from the bust: below it, the front falls as a flat panel
    (per 2 cm column, nothing sits behind the bust's most forward point), plus `amount` of ease."""
    front = {}
    for v in ob.data.vertices:
        p = v.co
        if p.y < -0.05 and 1.24 < p.z < 1.42 and abs(p.x) < 0.17:
            col = round(p.x / 0.02)
            front[col] = min(front.get(col, 0.0), p.y)
    for v in ob.data.vertices:
        p = v.co
        if p.y < -0.05 and 1.02 < p.z < 1.42 and abs(p.x) < 0.17:
            col = round(p.x / 0.02)
            line = front.get(col)
            if line is None:
                continue
            k = smooth(1.02, 1.10, p.z) * (1 - smooth(1.34, 1.42, p.z)) * (1 - smooth(0.11, 0.17, abs(p.x)))
            target = line - amount
            if p.y > target:
                v.co.y = lerp(p.y, target, k)


def scale_head(ob, s=HEAD_SCALE, pivot=HEAD_PIVOT, z_from=1.50):
    for v in ob.data.vertices:
        if v.co.z > z_from:
            k = smooth(z_from, z_from + 0.05, v.co.z)
            v.co = pivot + (v.co - pivot) * lerp(1.0, s, k)


def is_hand(bone):
    return bone.startswith("hand_") or bone.startswith(FINGERS)


def is_head(bone):
    return bone in ("Head", "neck_01")


def is_leg(bone):
    return bone.startswith(("thigh_", "calf_"))


def is_foot(bone):
    return bone.startswith(("foot_", "ball_"))


def face_zone(p):
    """The open face in the hijab: in front of the ears, between chin and hairline."""
    return p.y < -0.025 and 1.575 < p.z < 1.735 and abs(p.x) < 0.076


# ---------------------------------------------------------------- lofted pieces (skirts, drape, bands)


def make_object(name, b, weight_fn, arm, part):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in b.verts], [], b.faces)
    me.validate()
    uv = me.uv_layers.new(name="UVMap")
    for poly in me.polygons:
        for li in poly.loop_indices:
            uv.data[li].uv = b.uvs[me.loops[li].vertex_index]
    for poly in me.polygons:
        poly.use_smooth = True
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    groups = {}
    for i, v in enumerate(me.vertices):
        ws = weight_fn(Vector(v.co))
        ws = {k: x for k, x in ws.items() if x > 0.002}
        top = sorted(ws.items(), key=lambda kv: -kv[1])[:4]
        tot = sum(x for _, x in top) or 1.0
        for bn, x in top:
            if bn not in arm.data.bones:
                raise ValueError(f"{name}: unknown bone {bn}")
            g = groups.get(bn) or ob.vertex_groups.new(name=bn)
            groups[bn] = g
            g.add([i], x / tot, "REPLACE")
    ob.parent = arm
    mod = ob.modifiers.new("Armature", "ARMATURE")
    mod.object = arm
    ob["part"] = part
    return ob


# Hip ring of the body (z, rx, ry) measured on the UBC female; the skirts start just under the top's hem.
SKIRT_FLARE = [(1.06, 0.182, 0.136), (0.95, 0.205, 0.150), (0.80, 0.225, 0.165), (0.52, 0.262, 0.195), (0.25, 0.292, 0.222), (0.02, 0.318, 0.246)]
SKIRT_STRAIGHT = [(1.06, 0.182, 0.136), (0.95, 0.200, 0.146), (0.80, 0.214, 0.156), (0.52, 0.226, 0.168), (0.25, 0.236, 0.178), (0.03, 0.246, 0.188)]
SKIRT_Y = 0.04  # the hips sit a little behind the origin


def _at(sections, z, k):
    """Linear interpolation of column k of (key, ...) rows at key z (clamped at the ends)."""
    s = sorted(sections, key=lambda r: r[0])
    for a, b in zip(s, s[1:]):
        if a[0] <= z <= b[0]:
            return lerp(a[k], b[k], (z - a[0]) / (b[0] - a[0]))
    return s[0][k] if z < s[0][0] else s[-1][k]


def piece_skirt(sections, hem_z=0.06):
    b = Builder()
    s = sorted(sections)
    zs = []
    for (z0, _, _), (z1, _, _) in zip(s, s[1:]):
        zs += [lerp(z0, z1, t / 3) for t in range(3)]
    zs.append(s[-1][0])
    z_top = max(z for z, _, _ in sections)
    rings = []
    for z in zs:
        ring = ellipse((0, SKIRT_Y, z), (1, 0, 0), (0, 1, 0), _at(sections, z, 1), _at(sections, z, 2), 56)
        # Drape folds: 9 soft vertical pleats, flat at the waist, ~1.5 cm deep at the hem.
        depth = 0.011 * smooth(z_top, z_top - 0.45, z) ** 1.2
        for i, v in enumerate(ring):
            a = 2 * math.pi * i / 56
            k = 1 + (depth / max(_at(sections, z, 1), 1e-3)) * math.sin(9 * a + 0.4 * math.sin(3 * a))
            ring[i] = Vector((v.x * k, SKIRT_Y + (v.y - SKIRT_Y) * k, v.z))
        rings.append(ring)
    b.loft(rings)
    return b, lambda p: leg_weights(p, _at(sections, p.z, 1), hem_z=hem_z, ry=_at(sections, p.z, 2))


def piece_belt():
    b = Builder()
    rings = [ellipse((0, SKIRT_Y, z), (1, 0, 0), (0, 1, 0), 0.172, 0.128, 24) for z in (1.08, 1.125)]
    b.loft(rings)
    return b, lambda p: {"spine_01": 0.6, "pelvis": 0.4}


def piece_cuffs():
    """Contrast trim at the abaya sleeve ends (the wrist is at x = 0.64)."""
    b = Builder()
    for s in (1, -1):
        u, v = Vector((0, 1, 0)), Vector((0, 0, 1)) * s
        rr = [ellipse((s * x, 0.052, 1.418), u, v, r, r * 0.95, 16) for x, r in ((0.618, 0.079), (0.66, 0.085))]
        b.loft(rr)
    return b, lambda p: {side_bone("lowerarm_l", p.x): 0.8, side_bone("hand_l", p.x): 0.2}


def piece_abaya_trim():
    """Vertical front band of the abaya (collar to hem)."""
    b = Builder()
    pts = [(1.50, -0.085), (1.42, -0.145), (1.33, -0.168), (1.22, -0.160), (1.10, -0.140), (1.06, -0.135)]
    pts += [(z, SKIRT_Y - _at(SKIRT_FLARE, z, 2) - 0.008) for z in (0.95, 0.80, 0.52, 0.25, 0.05)]
    left, right = [], []
    for z, y in pts:
        left.append(b.add_ring([Vector((0.024, y, z))])[0])
        right.append(b.add_ring([Vector((-0.024, y, z))])[0])
    for k in range(len(pts) - 1):
        b.faces.append((right[k + 1], left[k + 1], left[k], right[k]))
    return b, lambda p: spine_weights(p.z) if p.z > 1.06 else leg_weights(p, _at(SKIRT_FLARE, p.z, 1), ry=_at(SKIRT_FLARE, p.z, 2))


def piece_logo():
    """Logo patch on the vest's left chest (uv 0..1 -> the brand logo texture)."""
    b = Builder()
    y = -0.19
    x0, x1, z0, z1 = 0.035, 0.115, 1.318, 1.350
    ids = b.add_ring([Vector((x0, y, z0)), Vector((x1, y + 0.014, z0)), Vector((x1, y + 0.014, z1)), Vector((x0, y, z1))])
    b.uvs[ids[0]], b.uvs[ids[1]], b.uvs[ids[2]], b.uvs[ids[3]] = (0, 0), (1, 0), (1, 1), (0, 1)
    b.faces.append((ids[0], ids[1], ids[2], ids[3]))
    return b, lambda p: {"spine_03": 0.6, "spine_02": 0.4}


def tube(b, path, radius, n=8, closed=False):
    """Loft a thin tube along a polyline (metres)."""
    pts = [Vector(p) for p in path]
    if closed:
        pts = pts + [pts[0]]
    rings = []
    for i, c in enumerate(pts):
        d = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        u = d.cross(Vector((0, 0, 1)))
        if u.length < 1e-4:
            u = d.cross(Vector((1, 0, 0)))
        u.normalize()
        v = d.cross(u).normalized()
        rings.append(ellipse(c, u, v, radius, radius, n))
    b.loft(rings, cap_start=not closed, cap_end=not closed)


def piece_glasses(style):
    """Glasses in front of the eyes (head space after HEAD_SCALE): two rims, a bridge, two temples to the ears."""
    b = Builder()
    cx, cz, y = 0.037, 1.672, -0.108
    r = 0.0024
    for sgn in (1, -1):
        rim = []
        for i in range(28):
            a = 2 * math.pi * i / 28
            if style == "round":
                rx, rz = 0.027, 0.025
                rim.append((sgn * cx + math.cos(a) * rx, y, cz + math.sin(a) * rz))
            else:
                # Rounded square: superellipse.
                rx, rz = 0.03, 0.023
                c, s_ = math.cos(a), math.sin(a)
                k = 0.6
                rim.append((sgn * cx + math.copysign(abs(c) ** k, c) * rx, y, cz + math.copysign(abs(s_) ** k, s_) * rz))
        tube(b, rim, r, closed=True)
        # Temple: from the rim's outer edge back along the head to above the ear.
        ox = sgn * (cx + (0.027 if style == "round" else 0.03))
        tube(b, [(ox, y, cz + 0.004), (sgn * 0.086, -0.07, cz + 0.006), (sgn * 0.098, 0.0, cz + 0.004), (sgn * 0.1, 0.035, cz - 0.004)], r * 0.9)
    # Bridge.
    tube(b, [(-(cx - (0.027 if style == "round" else 0.03)), y, cz + 0.006), (0, y - 0.002, cz + 0.01), (cx - (0.027 if style == "round" else 0.03), y, cz + 0.006)], r)
    return b, lambda p: {"Head": 1.0}


def piece_shoes_fitted(arm):
    """Closed flat shoes: a rounded tube from the heel to the toe along each foot bone, plus an ankle cuff."""
    b = Builder()
    bones = arm.data.bones
    for sd in ("l", "r"):
        ankle = Vector(bones["foot_" + sd].head_local)
        toe = Vector(bones["ball_" + sd].head_local)
        heel = Vector((ankle.x, ankle.y + 0.06, 0.012))
        tip = Vector((toe.x, toe.y - 0.055, 0.012))
        # Stations heel -> toe: (point, half-width, height).
        path = [(heel, 0.028, 0.03), (Vector((ankle.x, ankle.y + 0.02, 0.012)), 0.038, 0.05), (Vector((ankle.x, ankle.y - 0.03, 0.012)), 0.042, 0.052), (toe, 0.042, 0.04), (Vector((toe.x, toe.y - 0.03, 0.012)), 0.036, 0.028), (tip, 0.018, 0.014)]
        rings = []
        for c, hw, hh in path:
            rings.append([Vector((c.x + math.cos(a) * hw, c.y, c.z + 0.012 + math.sin(a) * hh)) for a in [2 * math.pi * i / 14 for i in range(14)]])
        # Rings progress along -Y (forward): reverse for outward normals.
        b.loft(rings[::-1], cap_start=True, cap_end=True)
        # Ankle cuff.
        b.loft([ellipse((ankle.x, ankle.y - 0.004, z), (1, 0, 0), (0, 1, 0), 0.046, 0.052, 14) for z in (0.055, 0.09)])

    def w(p):
        sd = "l" if p.x >= 0 else "r"
        t = smooth(0.09, 0.0, p.y)  # towards the toe
        return {"foot_" + sd: 1 - t * 0.6, "ball_" + sd: t * 0.6}

    return b, w


def piece_hijab_band():
    """Thin band along the face opening (the hijab's accent colour)."""
    b = Builder()
    c = Vector((0.0, 0.0, 1.655))
    r = Vector((0.100, 0.118, 0.125))

    def on_head(a, k):
        # Point on the (enlarged) head ellipsoid at the face-opening edge, k scales the opening.
        x = math.cos(a) * 0.080 * k
        z = 1.655 + math.sin(a) * 0.084 * k
        ex = (x / r.x) ** 2 + ((z - c.z) / r.z) ** 2
        y = -r.y * math.sqrt(max(0.0, 1 - ex)) + 0.016
        return Vector((x, y, z))

    n = 28
    rings = [[on_head(-math.pi / 2 + 2 * math.pi * i / n, k) for i in range(n)] for k in (0.98, 1.10)]
    ids = [b.add_ring(rg) for rg in rings]
    for i in range(n):
        j = (i + 1) % n
        b.faces.append((ids[0][i], ids[0][j], ids[1][j], ids[1][i]))
    return b, lambda p: {"Head": 1.0}


def drape(b, long):
    """Chin wrap + drape over the shoulders, hanging longer at the front and back than over the arms."""
    z_front, z_side = (1.02, 1.20) if long else (1.27, 1.33)
    n = 32

    def profile(z):
        if z >= 1.50:
            t = smooth(1.50, 1.575, z)
            return lerp(0.094, 0.112, t), lerp(0.094, 0.126, t), lerp(0.03, 0.0, t)
        if z >= 1.38:
            t = (1.50 - z) / 0.12
            k = math.sin(t * math.pi / 2)
            # Wide enough to clear the loosened tops underneath (they hang ~3 cm proud of the chest).
            return lerp(0.094, 0.236, k), lerp(0.094, 0.178, k), lerp(0.03, 0.03, t)
        t = smooth(1.38, 1.15, z)
        return lerp(0.236, 0.222, t), lerp(0.178, 0.172, t), 0.03

    def hem(a):
        return z_side + (z_front - z_side) * abs(math.sin(a)) ** 1.6

    zs = [1.578 - i * 0.025 for i in range(int((1.578 - z_front) / 0.025) + 2)][::-1]
    rings = []
    for z in zs:
        rx, ry, y0 = profile(max(z, z_front - 0.03))
        ring = ellipse((0, y0, z), (1, 0, 0), (0, 1, 0), rx, ry, n, -math.pi / 2)
        # Pleats from the shoulders down (none at the chin wrap), 7 mm deep at the hem.
        depth = 0.005 * smooth(1.46, 1.2, z)
        for i, v in enumerate(ring):
            a = -math.pi / 2 + 2 * math.pi * i / n
            k = 1 + (depth / rx) * math.sin(7 * a)
            ring[i] = Vector((v.x * k, y0 + (v.y - y0) * k, v.z))
        rings.append(ring)
    ids = b.loft(rings)
    snapped = set()
    for ring in ids:
        for i, vi in enumerate(ring):
            a = -math.pi / 2 + 2 * math.pi * i / n
            hz = hem(a)
            if b.verts[vi].z < hz:
                rx, ry, y0 = profile(hz)
                b.verts[vi] = Vector((math.cos(a) * rx, y0 + math.sin(a) * ry, hz))
                snapped.add(vi)
    b.faces = [f for f in b.faces if not all(i in snapped for i in f)]


def drape_weights(p):
    if p.z > 1.54:
        return {"Head": 1.0}
    if p.z > 1.46:
        t = smooth(1.46, 1.54, p.z)
        return {"Head": 0.5 * t, "neck_01": 0.5, "spine_03": 0.5 * (1 - t)}
    out = spine_weights(min(p.z, 1.40)) if p.z < 1.30 else {"spine_03": 1.0}
    sd = "l" if p.x >= 0 else "r"
    k = smooth(0.12, 0.21, abs(p.x)) * 0.45
    if k > 0:
        out = {bn: wt * (1 - k) for bn, wt in out.items()}
        out["clavicle_" + sd] = out.get("clavicle_" + sd, 0) + k * 0.5
        out["upperarm_" + sd] = out.get("upperarm_" + sd, 0) + k * 0.5
    return out


# ---------------------------------------------------------------- build


def join(a, b):
    """Join object b into a (keeps both vertex groups), returns a."""
    bpy.ops.object.select_all(action="DESELECT")
    a.select_set(True)
    b.select_set(True)
    bpy.context.view_layer.objects.active = a
    bpy.ops.object.join()
    return a


class PluginCtx:
    """What a garment plug-in gets (see scripts/blender/garments/__init__.py)."""

    def __init__(self, arm, body):
        self.arm, self.body = arm, body
        self.bones = arm.data.bones
        self.make_object = lambda name, b, w, part: make_object(name, b, w, arm, part)
        self.cut = lambda keep, name, part: cut(body, keep, name, part)
        self.offset, self.relax, self.Builder, self.ellipse = offset, relax, Builder, ellipse
        self.smooth, self.lerp, self.Vector, self.scale_head = smooth, lerp, Vector, scale_head
        self.HEAD_PIVOT, self.HEAD_SCALE, self.COLLAR_Z, self.HIP_Z, self.SKIRT_Y = HEAD_PIVOT, HEAD_SCALE, COLLAR_Z, HIP_Z, SKIRT_Y
        self.spine_weights, self.leg_weights, self.top_weights, self.leg_tube_weights, self.drape_weights = spine_weights, leg_weights, top_weights, leg_tube_weights, drape_weights
        self.torso_sections = lambda z0, z1, **kw: torso_sections(body, z0, z1, **kw)
        self.limb_sections = lambda pred, axis, a0, a1, **kw: limb_sections(body, pred, axis, a0, a1, **kw)
        self.loft_torso, self.loft_limb = loft_torso, loft_limb
        self.face_zone, self.is_hand, self.is_head, self.is_leg, self.is_foot = face_zone, is_hand, is_head, is_leg, is_foot
        self.join = join


def apply_plugins(objs, arm, body):
    import glob
    import importlib.util

    ctx = PluginCtx(arm, body)
    folder = os.path.join(os.path.dirname(os.path.abspath(__file__)), "garments")
    for path in sorted(glob.glob(os.path.join(folder, "*.py"))):
        if os.path.basename(path).startswith("_"):
            continue
        spec = importlib.util.spec_from_file_location("garment_" + os.path.basename(path)[:-3], path)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        for name, (factory, part) in getattr(mod, "PIECES", {}).items():
            # Free the name first: Blender would otherwise export the new piece as "<name>.001",
            # which the runtime (kit.ts, PIECE_PART by exact name) never finds.
            old = objs.get(name)
            if old is not None:
                old.name = name + "_default"
                if old.data:
                    old.data.name = name + "_default"
            ob = factory(ctx)
            if old is not None and old is not ob:
                bpy.data.objects.remove(old, do_unlink=True)
            ob.name = name
            if ob.data:
                ob.data.name = name
            ob["part"] = part
            objs[name] = ob
            print("PLUGIN", os.path.basename(path), "->", name)


def open_front(ob):
    """Open-front vest: drop the faces down the chest centre line."""
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    dead = [f for f in bm.faces if all(v.co.y < -0.09 and abs(v.co.x) < 0.028 for v in f.verts)]
    bmesh.ops.delete(bm, geom=dead, context="FACES")
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    bm.to_mesh(ob.data)
    bm.free()


def build():
    arm, clips = load_skeleton()
    body_objs = adopt(import_gltf(BODY), arm)
    body = next(o for o in body_objs if o.name.startswith("Superhero"))
    eyes = next(o for o in body_objs if o.name.startswith("Eyes"))
    brows = next(o for o in body_objs if o.name.startswith("Eyebrows"))
    for o in body_objs:
        if o not in (body, eyes, brows):
            bpy.data.objects.remove(o, do_unlink=True)
    for o in (body, eyes, brows):
        clean_mesh(o)
    objs = {}

    # Head + neck and the hands keep the body's UVs (skin atlas).
    objs["head"] = cut(body, lambda v, d: is_head(d), "head", "face")
    objs["hands"] = cut(body, lambda v, d: is_hand(d), "hands", "skin")
    eyes.name, brows.name = "eyes", "brows"
    eyes["part"], brows["part"] = "eyes", "brows"
    objs["eyes"], objs["brows"] = eyes, brows

    # Garments: offset shells of the body (fit + skin weights for free).
    # Garments: smooth tubes fitted to the body's measurements (never its surface detail).
    objs["upper"] = make_object("upper", *piece_top(body, 0.022, 0.014), arm, "top")
    objs["upper_abaya"] = make_object("upper_abaya", *piece_top(body, 0.036, 0.028, hem_z=1.0, flare=0.02), arm, "top")
    objs["vest"] = make_object("vest", *piece_vest_fitted(body), arm, "vest")
    objs["tunic"] = make_object("tunic", *piece_tunic_fitted(body), arm, "top")
    objs["leggings"] = make_object("leggings", *piece_legs_fitted(arm, 0.006), arm, "bottom")
    objs["trousers"] = make_object("trousers", *piece_legs_fitted(arm, 0.024, flare=0.055), arm, "bottom")
    objs["shoes"] = make_object("shoes", *piece_shoes_fitted(arm), arm, "shoes")

    # Hijab: head shell with the face open, then the chin wrap and drape.
    for name, long in (("hijab_classic", False), ("hijab_long", True)):
        shell = cut(body, lambda v, d: d == "Head" and v.co.z >= 1.555 and not face_zone(v.co), name, "hijab")
        relax(shell, 6, factor=0.4, pin=lambda p: face_zone(Vector((p.x, p.y - 0.03, p.z))))
        offset(shell, 0.014)
        scale_head(shell)
        b = Builder()
        drape(b, long)
        d = make_object(name + "_drape", b, drape_weights, arm, "hijab")
        objs[name] = join(shell, d)
    objs["hijab_band"] = make_object("hijab_band", *piece_hijab_band(), arm, "accent")
    objs["glasses_round"] = make_object("glasses_round", *piece_glasses("round"), arm, "glasses")
    objs["glasses_square"] = make_object("glasses_square", *piece_glasses("square"), arm, "glasses")

    # Hair: Quaternius styles, rigged to the Head bone.
    for name, src in (("hair_long", "Hair_Long"), ("hair_bun", "Hair_Buns"), ("hair_ponytail", "Hair_Long"), ("hair_bob", "Hair_Buns")):
        h = adopt(import_gltf(os.path.join(HAIR_DIR, src + ".gltf")), arm)
        hair = next(o for o in h if o.type == "MESH")
        for o in h:
            if o is not hair:
                bpy.data.objects.remove(o, do_unlink=True)
        hair.name = name
        hair["part"] = "hair"
        clean_mesh(hair)
        objs[name] = hair

    # Lofted pieces.
    objs["skirt_flare"] = make_object("skirt_flare", *piece_skirt(SKIRT_FLARE), arm, "bottom")
    objs["skirt_straight"] = make_object("skirt_straight", *piece_skirt(SKIRT_STRAIGHT), arm, "bottom")
    objs["belt"] = make_object("belt", *piece_belt(), arm, "trim")
    objs["cuffs"] = make_object("cuffs", *piece_cuffs(), arm, "trim")
    objs["abaya_trim"] = make_object("abaya_trim", *piece_abaya_trim(), arm, "trim")
    objs["logo"] = make_object("logo", *piece_logo(), arm, "logo")

    # Garment plug-ins (scripts/blender/garments/*.py) replace default pieces by name.
    apply_plugins(objs, arm, body)

    # Stylised head: everything attached to it grows about the neck.
    for n in ("head", "eyes", "brows", "hair_long", "hair_bun", "hair_ponytail", "hair_bob", "hijab_band"):
        scale_head(objs[n])
    for o in objs.values():
        for p in o.data.polygons:
            p.use_smooth = True
    # The body itself is never exported.
    bpy.data.objects.remove(body, do_unlink=True)
    tris = {n: sum(len(p.vertices) - 2 for p in o.data.polygons) for n, o in objs.items()}
    print("TRIS", tris, "total", sum(tris.values()))
    return arm, clips, objs


# ---------------------------------------------------------------- textures


def save_image(img, path, size):
    im = img.copy()
    im.scale(size, size)
    im.filepath_raw = path
    im.file_format = "PNG"
    im.save()
    bpy.data.images.remove(im)


def export_textures(objs):
    os.makedirs(OUT_DIR, exist_ok=True)
    imgs = {i.name.split(".png")[0]: i for i in bpy.data.images if i.size[0] > 0}
    for key, out, size in (
        ("T_Superhero_Female_Dark_BaseColor", "skin.png", 1024),
        ("T_Superhero_Female_Normal", "skin_n.png", 1024),
        ("T_Hair_2_BaseColor", "hair.png", 1024),
        ("T_Hair_2_Normal", "hair_n.png", 1024),
        ("T_Eye_Brown", "eyes.png", 256),
    ):
        img = imgs.get(key)
        if img is None:
            raise RuntimeError(f"texture missing: {key} (have {sorted(imgs)})")
        save_image(img, os.path.join(OUT_DIR, out), size)
    # Reference skin colour (the runtime tints the atlas by palette / reference): the cheeks' average.
    img = imgs["T_Superhero_Female_Dark_BaseColor"]
    head = objs["head"]
    uv = head.data.uv_layers.active.data
    w, h = img.size
    px = img.pixels[:]
    acc, n = [0.0, 0.0, 0.0], 0
    for poly in head.data.polygons:
        for li in poly.loop_indices:
            v = head.data.vertices[head.data.loops[li].vertex_index].co
            if v.y < -0.07 and 1.60 < v.z < 1.70 and 0.03 < abs(v.x) < 0.07:
                u, vv = uv[li].uv
                i = (int(vv * h) % h) * w + (int(u * w) % w)
                acc[0] += px[i * 4]
                acc[1] += px[i * 4 + 1]
                acc[2] += px[i * 4 + 2]
                n += 1
    ref = [c / max(n, 1) for c in acc]
    print("SKIN_REF", "#" + "".join(f"{int(c ** (1 / 2.2) * 255 + 0.5):02x}" for c in ref), n)


def export_face_mask(objs, size=512):
    """face_mask.png in the head's UV space: R = lips, G = cheeks (blush), B = eyelids. The runtime
    tints these regions (selfie / editor colours) over the skin atlas."""
    import numpy as np

    head = objs["head"]
    me = head.data
    uv = me.uv_layers.active.data
    img = np.zeros((size, size, 3), dtype=np.float32)

    def weight(p):
        # Regions in head space (after HEAD_SCALE), front of the face only.
        if p.y > -0.03:
            return (0.0, 0.0, 0.0)
        lips = smooth(0.034, 0.012, abs(p.x)) * smooth(0.022, 0.008, abs(p.z - 1.627))
        cheek = smooth(0.022, 0.048, abs(p.x)) * (1 - smooth(0.085, 0.11, abs(p.x))) * smooth(0.03, 0.012, abs(p.z - 1.66))
        lid = smooth(0.012, 0.03, abs(p.x)) * (1 - smooth(0.07, 0.085, abs(p.x))) * smooth(0.012, 0.004, abs(p.z - 1.70))
        return (min(1.0, lips), min(1.0, cheek * 0.9), min(1.0, lid))

    vw = {v.index: weight(v.co) for v in me.vertices}
    for poly in me.polygons:
        li = list(poly.loop_indices)
        if len(li) < 3:
            continue
        pts = [(uv[l].uv.x * size, (1 - uv[l].uv.y) * size) for l in li]
        ws = [vw[me.loops[l].vertex_index] for l in li]
        if max(max(w) for w in ws) < 0.01:
            continue
        # Fan-triangulate, rasterise with barycentric weights.
        for k in range(1, len(li) - 1):
            (x0, y0), (x1, y1), (x2, y2) = pts[0], pts[k], pts[k + 1]
            w0, w1, w2 = ws[0], ws[k], ws[k + 1]
            xs = range(max(0, int(min(x0, x1, x2)) - 1), min(size - 1, int(max(x0, x1, x2)) + 1) + 1)
            ys = range(max(0, int(min(y0, y1, y2)) - 1), min(size - 1, int(max(y0, y1, y2)) + 1) + 1)
            det = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2)
            if abs(det) < 1e-9:
                continue
            for py in ys:
                for px in xs:
                    l0 = ((y1 - y2) * (px + 0.5 - x2) + (x2 - x1) * (py + 0.5 - y2)) / det
                    l1 = ((y2 - y0) * (px + 0.5 - x2) + (x0 - x2) * (py + 0.5 - y2)) / det
                    l2 = 1 - l0 - l1
                    if l0 < -0.02 or l1 < -0.02 or l2 < -0.02:
                        continue
                    for c in range(3):
                        img[py, px, c] = max(img[py, px, c], l0 * w0[c] + l1 * w1[c] + l2 * w2[c])
    out = bpy.data.images.new("face_mask", size, size, alpha=True)
    rgba = np.concatenate([img, np.ones((size, size, 1), dtype=np.float32)], axis=2)
    out.pixels = rgba[::-1].ravel().tolist()
    out.filepath_raw = os.path.join(OUT_DIR, "face_mask.png")
    out.file_format = "PNG"
    out.save()
    print("FACE_MASK", os.path.join(OUT_DIR, "face_mask.png"), "lips px", int((img[:, :, 0] > 0.3).sum()), "cheek px", int((img[:, :, 1] > 0.3).sum()))


# ---------------------------------------------------------------- export


def export(arm, objs, clips):
    os.makedirs(OUT_DIR, exist_ok=True)
    ad = arm.animation_data or arm.animation_data_create()
    ad.action = None
    for t in list(ad.nla_tracks):
        ad.nla_tracks.remove(t)
    for name, ac in clips.items():
        tr = ad.nla_tracks.new()
        tr.name = name
        tr.strips.new(name, int(ac.frame_range[0]), ac)
        tr.mute = True
    bpy.ops.object.select_all(action="DESELECT")
    arm.select_set(True)
    for o in objs.values():
        o.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.export_scene.gltf(
        filepath=OUT,
        export_format="GLB",
        use_selection=True,
        export_extras=True,
        export_materials="NONE",
        export_skins=True,
        export_def_bones=True,
        export_animations=True,
        export_animation_mode="NLA_TRACKS",
        export_force_sampling=False,
        export_optimize_animation_size=True,
        export_frame_step=2,
        export_apply=False,
        export_yup=True,
        export_normals=True,
        export_texcoords=True,
    )
    print("EXPORTED", OUT, os.path.getsize(OUT))


# ---------------------------------------------------------------- preview

LOOKS = {
    "abaya_hijab": ["head", "hands", "eyes", "brows", "upper_abaya", "skirt_flare", "leggings", "shoes", "hijab_classic", "hijab_band", "cuffs", "abaya_trim"],
    "skirt_long_hijab": ["head", "hands", "eyes", "brows", "upper", "skirt_straight", "leggings", "shoes", "hijab_long"],
    "trousers_hair": ["head", "hands", "eyes", "brows", "upper", "trousers", "shoes", "hair_long", "glasses_round"],
    "staff_bun": ["head", "hands", "eyes", "brows", "upper", "skirt_straight", "leggings", "shoes", "hair_bun", "vest", "logo"],
}
PART_COLORS = {"skin": (0.91, 0.73, 0.58), "face": (0.91, 0.73, 0.58), "top": (0.93, 0.90, 0.86), "bottom": (0.36, 0.30, 0.38), "shoes": (0.22, 0.18, 0.2), "hijab": (0.79, 0.6, 0.68), "accent": (1, 1, 1), "hair": (0.2, 0.13, 0.1), "brows": (0.2, 0.13, 0.1), "eyes": (1, 1, 1), "vest": (0.36, 0.17, 0.51), "logo": (1, 1, 1), "trim": (0.78, 0.64, 0.43), "glasses": (0.12, 0.1, 0.1)}


PREVIEW_TEX = {"face": "T_Superhero_Female_Dark_BaseColor", "skin": "T_Superhero_Female_Dark_BaseColor", "hair": "T_Hair_2_BaseColor", "brows": "T_Hair_2_BaseColor", "eyes": "T_Eye_Brown"}


def preview_materials(objs):
    """Garments get flat colours; the textured parts get a plain image material on the exported UVs."""
    imgs = {i.name.split(".png")[0].split(".0")[0]: i for i in bpy.data.images if i.size[0] > 0}
    for n, o in objs.items():
        part = o["part"]
        mat = bpy.data.materials.new(n + "_m")
        mat.use_nodes = True
        nt = mat.node_tree
        bsdf = nt.nodes.get("Principled BSDF")
        bsdf.inputs["Roughness"].default_value = 0.85
        tex = PREVIEW_TEX.get(part)
        if tex and tex in imgs:
            node = nt.nodes.new("ShaderNodeTexImage")
            node.image = imgs[tex]
            nt.links.new(node.outputs["Color"], bsdf.inputs["Base Color"])
        else:
            bsdf.inputs["Base Color"].default_value = (*PART_COLORS[part], 1)
        o.data.materials.clear()
        o.data.materials.append(mat)


def preview(arm, objs, out_dir, clips):
    sc = bpy.context.scene
    engines = {i.identifier for i in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items}
    sc.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in engines else "BLENDER_EEVEE"
    sc.eevee.taa_render_samples = 24
    sc.render.resolution_x, sc.render.resolution_y = 560, 760
    sc.render.film_transparent = False
    world = bpy.data.worlds.new("w")
    sc.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    bg.inputs[0].default_value = (0.92, 0.89, 0.86, 1)
    bg.inputs[1].default_value = 1.0
    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
    sun.data.energy = 3.0
    sun.rotation_euler = (math.radians(55), 0, math.radians(-35))
    sc.collection.objects.link(sun)
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    sc.collection.objects.link(cam)
    sc.camera = cam
    cam.data.lens = 60
    preview_materials(objs)
    arm.animation_data_create()
    os.makedirs(out_dir, exist_ok=True)
    for look, pieces in LOOKS.items():
        for n, o in objs.items():
            o.hide_render = n not in pieces
        for clip, frame, view in (("Idle_Loop", 10, "front"), ("Walk_Modest", 8, "side"), ("Walk_Modest", 8, "q"), ("Idle_Loop", 10, "face"), ("Idle_Loop", 10, "back")):
            arm.animation_data.action = clips[clip]
            sc.frame_set(frame)
            if view == "front":
                cam.location, cam.rotation_euler = (0, -4.4, 0.95), (math.radians(90), 0, 0)
            elif view == "side":
                cam.location, cam.rotation_euler = (4.4, 0, 0.95), (math.radians(90), 0, math.radians(90))
            elif view == "back":
                cam.location, cam.rotation_euler = (-1.6, 2.6, 1.45), (math.radians(82), 0, math.radians(212))
            elif view == "face":
                cam.location, cam.rotation_euler = (0.3, -1.05, 1.68), (math.radians(88), 0, math.radians(16))
            else:
                cam.location, cam.rotation_euler = (2.6, -3.6, 1.15), (math.radians(84), 0, math.radians(34))
            sc.render.filepath = os.path.join(out_dir, f"{look}_{clip}_{view}.png")
            bpy.ops.render.render(write_still=True)


arm, clips, objs = build()
export_textures(objs)
export_face_mask(objs)
export(arm, objs, clips)
if PREVIEW:
    for t in list(arm.animation_data.nla_tracks):
        arm.animation_data.nla_tracks.remove(t)
    preview(arm, objs, PREVIEW, clips)
