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
COLLAR_Z = 1.578  # the tops reach up under the jaw (high collar); the chin front is left out
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
SKIRT_FLARE = [(1.06, 0.182, 0.136), (0.95, 0.205, 0.150), (0.80, 0.225, 0.165), (0.52, 0.262, 0.195), (0.25, 0.292, 0.222), (0.05, 0.315, 0.242)]
SKIRT_STRAIGHT = [(1.06, 0.182, 0.136), (0.95, 0.200, 0.146), (0.80, 0.214, 0.156), (0.52, 0.226, 0.168), (0.25, 0.236, 0.178), (0.06, 0.244, 0.186)]
SKIRT_Y = 0.04  # the hips sit a little behind the origin


def _at(sections, z, k):
    s = sorted(sections)
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
    rings = [ellipse((0, SKIRT_Y, z), (1, 0, 0), (0, 1, 0), _at(sections, z, 1), _at(sections, z, 2), 28) for z in zs]
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
        rr = [ellipse((s * x, 0.052, 1.418), u, v, r, r * 0.95, 14) for x, r in ((0.595, 0.058), (0.645, 0.066))]
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
    z_front, z_side = (0.98, 1.18) if long else (1.22, 1.32)
    n = 32

    def profile(z):
        if z >= 1.50:
            t = smooth(1.50, 1.575, z)
            return lerp(0.094, 0.112, t), lerp(0.094, 0.126, t), lerp(0.03, 0.0, t)
        if z >= 1.38:
            t = (1.50 - z) / 0.12
            k = math.sin(t * math.pi / 2)
            return lerp(0.094, 0.215, k), lerp(0.094, 0.165, k), lerp(0.03, 0.035, t)
        t = smooth(1.38, 1.15, z)
        return lerp(0.215, 0.205, t), lerp(0.165, 0.160, t), 0.035

    def hem(a):
        return z_side + (z_front - z_side) * abs(math.sin(a)) ** 1.6

    zs = [1.578 - i * 0.025 for i in range(int((1.578 - z_front) / 0.025) + 2)][::-1]
    rings = []
    for z in zs:
        rx, ry, y0 = profile(max(z, z_front - 0.03))
        rings.append(ellipse((0, y0, z), (1, 0, 0), (0, 1, 0), rx, ry, n, -math.pi / 2))
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
    chin_front = lambda p: p.y < -0.03 and p.z > 1.552
    torso = lambda v, d: (not is_hand(d)) and (not is_foot(d)) and HIP_Z - 0.02 <= v.co.z <= COLLAR_Z and not chin_front(v.co)
    edges = lambda p: p.z < HIP_Z + 0.01 or abs(p.x) > 0.62  # hem and cuffs stay put
    objs["upper"] = cut(body, torso, "upper", "top")
    relax(objs["upper"], 8, pin=edges)
    loosen_chest(objs["upper"], 0.025)
    offset(objs["upper"], 0.02)
    objs["upper_abaya"] = cut(body, torso, "upper_abaya", "top")
    relax(objs["upper_abaya"], 12, pin=edges)
    loosen_chest(objs["upper_abaya"], 0.04)
    offset(objs["upper_abaya"], lambda p: 0.03 + 0.025 * smooth(0.25, 0.6, abs(p.x)))
    objs["vest"] = cut(body, lambda v, d: (not is_hand(d)) and abs(v.co.x) < 0.185 and HIP_Z + 0.02 <= v.co.z <= 1.47, "vest", "vest")
    relax(objs["vest"], 8)
    loosen_chest(objs["vest"], 0.03)
    offset(objs["vest"], 0.032)
    open_front(objs["vest"])
    objs["tunic"] = cut(body, lambda v, d: (not is_hand(d)) and 0.66 <= v.co.z <= 1.06 and abs(v.co.x) < 0.24, "tunic", "top")
    relax(objs["tunic"], 8)
    offset(objs["tunic"], lambda p: 0.026 + 0.05 * smooth(1.06, 0.66, p.z))
    legs = lambda v, d: (is_leg(d) or d == "pelvis") and v.co.z <= 1.03
    objs["leggings"] = cut(body, legs, "leggings", "bottom")
    relax(objs["leggings"], 4)
    offset(objs["leggings"], 0.006)
    objs["trousers"] = cut(body, legs, "trousers", "bottom")
    relax(objs["trousers"], 10)
    offset(objs["trousers"], lambda p: 0.022 + 0.05 * smooth(0.75, 0.12, p.z))
    objs["shoes"] = cut(body, lambda v, d: is_foot(d) or (is_leg(d) and v.co.z < 0.1), "shoes", "shoes")
    relax(objs["shoes"], 10)
    offset(objs["shoes"], 0.012)

    # Hijab: head shell with the face open, then the chin wrap and drape.
    for name, long in (("hijab_classic", False), ("hijab_long", True)):
        shell = cut(body, lambda v, d: d == "Head" and v.co.z >= 1.555 and not face_zone(v.co), name, "hijab")
        offset(shell, 0.013)
        scale_head(shell)
        b = Builder()
        drape(b, long)
        d = make_object(name + "_drape", b, drape_weights, arm, "hijab")
        objs[name] = join(shell, d)
    objs["hijab_band"] = make_object("hijab_band", *piece_hijab_band(), arm, "accent")

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
    "skirt_long_hijab": ["head", "hands", "eyes", "brows", "upper", "tunic", "skirt_straight", "leggings", "shoes", "hijab_long"],
    "trousers_hair": ["head", "hands", "eyes", "brows", "upper", "tunic", "trousers", "shoes", "hair_long"],
    "staff_bun": ["head", "hands", "eyes", "brows", "upper", "skirt_straight", "leggings", "shoes", "hair_bun", "vest", "logo"],
}
PART_COLORS = {"skin": (0.91, 0.73, 0.58), "face": (0.91, 0.73, 0.58), "top": (0.93, 0.90, 0.86), "bottom": (0.36, 0.30, 0.38), "shoes": (0.22, 0.18, 0.2), "hijab": (0.79, 0.6, 0.68), "accent": (1, 1, 1), "hair": (0.2, 0.13, 0.1), "brows": (0.2, 0.13, 0.1), "eyes": (1, 1, 1), "vest": (0.36, 0.17, 0.51), "logo": (1, 1, 1), "trim": (0.78, 0.64, 0.43)}


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
export(arm, objs, clips)
if PREVIEW:
    for t in list(arm.animation_data.nla_tracks):
        arm.animation_data.nla_tracks.remove(t)
    preview(arm, objs, PREVIEW, clips)
