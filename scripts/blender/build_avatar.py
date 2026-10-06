"""District 122 avatar builder.

Builds the stylized base character (big head, slim body) as separate garment
pieces skinned to the Quaternius UAL skeleton (CC0), keeps a few animation
clips and exports one GLB: public/models/avatar/avatar.glb.

MODESTY RULE: there is NO body mesh. A character is made only of garment pieces
plus the head (face) and hands, so it can never render unclothed. Every outfit
covers neck to ankles and shoulders to wrists; legs always carry leggings or
trousers in the bottom colour.

Run:  tools/blender-4.2.23-windows-x64/blender.exe -b -P scripts/blender/build_avatar.py -- [--preview DIR]

Pieces are named <piece>; the runtime (src/actors/avatar/) picks a subset per
look, merges them into one skinned geometry and colours each piece through a
`part` attribute (see PIECES below for the part of each).
Coordinates while building: Blender Z-up, character faces -Y, its left is +X.
"""

import math
import os
import sys

import bpy
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
UAL = os.path.join(ROOT, "tools", "quaternius", "UAL", "Universal Animation Library[Standard]", "Unreal-Godot", "UAL1_Standard.glb")
OUT = os.path.join(ROOT, "public", "models", "avatar", "avatar.glb")

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
PREVIEW = argv[argv.index("--preview") + 1] if "--preview" in argv else None

# Clips kept from the library (renamed without the "_Armature" suffix).
CLIPS = ["Idle_Loop", "Idle_Talking_Loop", "Walk_Loop", "Walk_Formal_Loop", "Jog_Fwd_Loop", "Interact", "Sitting_Idle_Loop", "Dance_Loop", "PickUp_Table"]
FINGERS = ("index", "middle", "ring", "pinky", "thumb")

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
    """Collects vertices/faces/weights/uvs for one piece."""

    def __init__(self):
        self.verts, self.faces, self.uvs, self.tags = [], [], [], []
        self.tag = None

    def add_ring(self, ring):
        i0 = len(self.verts)
        self.verts.extend(ring)
        self.uvs.extend([(0.0, 0.0)] * len(ring))
        self.tags.extend([self.tag] * len(ring))
        return list(range(i0, i0 + len(ring)))

    def loft(self, rings, cap_start=False, cap_end=False, closed=True):
        """Rings progress along the axis; each ring runs CCW about it -> outward normals."""
        ids = [self.add_ring(r) for r in rings]
        n = len(rings[0])
        last = n if closed else n - 1
        for k in range(len(ids) - 1):
            a, b = ids[k], ids[k + 1]
            for i in range(last):
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


def mirror_x(p):
    return Vector((-p.x, p.y, p.z))


def side_bone(name, s):
    return name.replace("_l", "_r") if s < 0 else name


# ---------------------------------------------------------------- body landmarks (UAL rest pose, metres)
HEAD_C = Vector((0.0, -0.014, 1.778))
HEAD_R = Vector((0.182, 0.176, 0.206))
ARM_Z, ARM_Y = 1.441, 0.066
SHOULDER_X, ELBOW_X, WRIST_X = 0.192, 0.466, 0.739
HIP_X, KNEE_Z, ANKLE_Z = 0.089, 0.532, 0.104

# Torso sections: z, rx, ry, y offset (front is -Y).
TORSO = [
    (0.90, 0.162, 0.118, 0.010),
    (1.00, 0.152, 0.110, 0.008),
    (1.12, 0.124, 0.088, 0.010),
    (1.25, 0.136, 0.094, 0.004),
    (1.35, 0.150, 0.102, 0.000),
    (1.42, 0.156, 0.094, 0.010),
    (1.47, 0.112, 0.078, 0.012),
    (1.505, 0.060, 0.054, 0.012),
    (1.62, 0.052, 0.050, 0.004),
]
SEG = 16


def torso_at(z):
    for (z0, rx0, ry0, y0), (z1, rx1, ry1, y1) in zip(TORSO, TORSO[1:]):
        if z0 <= z <= z1:
            t = (z - z0) / (z1 - z0)
            return lerp(rx0, rx1, t), lerp(ry0, ry1, t), lerp(y0, y1, t)
    return TORSO[0][1:] if z < TORSO[0][0] else TORSO[-1][1:]


def spine_weights(z):
    """Torso column weights by height."""
    bands = [("pelvis", 0.95), ("spine_01", 1.11), ("spine_02", 1.24), ("spine_03", 1.40), ("neck_01", 1.53), ("Head", 1.61)]
    if z <= bands[0][1]:
        return {"pelvis": 1.0}
    for (b0, z0), (b1, z1) in zip(bands, bands[1:]):
        if z <= z1:
            t = smooth(z0, z1, z)
            return {b0: 1 - t, b1: t}
    return {"Head": 1.0}


def leg_weights(p, rx, hip_z=1.0, hem_z=0.06, strength=0.78):
    """Skirt/tunic: centre front/back stay on the pelvis, the sides follow the legs."""
    s = max(-1.0, min(1.0, p.x / max(rx, 1e-4)))
    t = max(0.0, min(1.0, (hip_z - p.z) / (hip_z - hem_z)))
    w = abs(s) ** 1.4 * min(1.0, t * 1.4) * strength
    calf = smooth(0.5, 1.0, t) * 0.55
    side = "l" if s >= 0 else "r"
    out = {"pelvis": 1.0 - w}
    if w > 0:
        out["thigh_" + side] = w * (1 - calf)
        out["calf_" + side] = w * calf
    return out


# ---------------------------------------------------------------- pieces
# Each returns (Builder, weight_fn(vertex)->dict).

def piece_head():
    b = Builder()
    rings = []
    lat = 14
    for k in range(1, lat):
        th = -math.pi / 2 + math.pi * k / lat
        z = HEAD_C.z + math.sin(th) * HEAD_R.z
        below = max(0.0, -math.sin(th))
        taper = 1 - 0.30 * below ** 1.6  # chin
        rx, ry = HEAD_R.x * math.cos(th) * taper, HEAD_R.y * math.cos(th) * taper
        rings.append(ellipse((HEAD_C.x, HEAD_C.y - 0.014 * below, z), (1, 0, 0), (0, 1, 0), rx, ry, 22, -math.pi / 2))
    ids = b.loft(rings)
    b.cap(ids[0], rings[0], flip=True, point=HEAD_C - Vector((0, 0.02, HEAD_R.z * 0.97)))
    b.cap(ids[-1], rings[-1], flip=False, point=HEAD_C + Vector((0, 0, HEAD_R.z)))
    # Face UVs: orthographic from the front into the face atlas cell; the back maps to the
    # (transparent) top edge so the face never repeats behind.
    for i, p in enumerate(b.verts):
        u = 0.5 + (p.x - HEAD_C.x) / (2 * HEAD_R.x)
        v = 0.5 + (p.z - HEAD_C.z) / (2 * HEAD_R.z)
        b.uvs[i] = (u, v) if p.y < HEAD_C.y + 0.01 else (u, 1.0)
    return b, lambda p, tag=None: {"Head": 1.0} if p.z > 1.62 else {"Head": 0.7, "neck_01": 0.3}


def piece_hands():
    b = Builder()
    for s in (1, -1):
        ax = Vector((s, 0, 0))
        u, v = Vector((0, 1, 0)), Vector((0, 0, 1)) * s
        secs = [(WRIST_X - 0.01, 0.034, 0.027), (WRIST_X + 0.04, 0.048, 0.024), (WRIST_X + 0.095, 0.049, 0.019), (WRIST_X + 0.132, 0.034, 0.014)]
        rings = [ellipse((s * x, ARM_Y - 0.004, ARM_Z - 0.004), u, v, ry, rz, 10) for x, ry, rz in secs]
        b.loft(rings, cap_start=True, cap_end=True)
        # Thumb, angled forward (-Y) and down.
        base = Vector((s * (WRIST_X + 0.03), ARM_Y - 0.035, ARM_Z - 0.008))
        d = Vector((s * 0.35, -1, -0.25)).normalized()
        uu = d.cross(Vector((0, 0, 1))).normalized()
        vv = d.cross(uu).normalized() * -1
        if uu.cross(vv).dot(d) < 0:
            vv = -vv
        rings = [ellipse(base + d * t, uu, vv, r, r * 0.85, 8) for t, r in ((0.0, 0.016), (0.03, 0.014), (0.05, 0.010))]
        b.loft(rings, cap_end=True)
    return b, lambda p, tag=None: {side_bone("hand_l", p.x): 1.0}


def piece_upper(cuff=0.0):
    """Long-sleeved top: torso (hem at hips), high neck, sleeves to the wrist."""
    b = Builder()
    rings = []
    for z, rx, ry, y0 in TORSO:
        rings.append(ellipse((0, y0, z), (1, 0, 0), (0, 1, 0), rx, ry, SEG))
    b.loft(rings)
    sleeve = [(0.11, 0.064), (0.20, 0.064), (0.32, 0.057), (ELBOW_X, 0.050), (0.60, 0.046), (WRIST_X - 0.04, 0.046 + cuff * 0.5), (WRIST_X + 0.008, 0.050 + cuff)]
    b.tag = "sleeve"
    for s in (1, -1):
        u, v = Vector((0, 1, 0)), Vector((0, 0, 1)) * s
        rr = [ellipse((s * x, ARM_Y - 0.004, ARM_Z), u, v, r, r * 0.95, 12) for x, r in sleeve]
        # Closed at the shoulder: when the arm drops, the sleeve top shows above the torso.
        b.loft(rr, cap_start=True)

    def w(p, tag=None):
        ax = abs(p.x)
        sd = "l" if p.x >= 0 else "r"
        if tag == "sleeve":
            if ax < 0.17:
                return {"spine_03": 0.35, "clavicle_" + sd: 0.35, "upperarm_" + sd: 0.30}
            if ax < 0.26:
                t = smooth(0.17, 0.26, ax)
                return {"clavicle_" + sd: 0.6 * (1 - t), "upperarm_" + sd: 0.4 + 0.6 * t}
            if ax < 0.42:
                return {"upperarm_" + sd: 1.0}
            if ax < 0.52:
                t = smooth(0.42, 0.52, ax)
                return {"upperarm_" + sd: 1 - t, "lowerarm_" + sd: t}
            if ax < WRIST_X - 0.02:
                return {"lowerarm_" + sd: 1.0}
            return {"lowerarm_" + sd: 0.75, "hand_" + sd: 0.25}
        out = spine_weights(p.z)
        # Shoulder caps lean on the clavicles so the armpit doesn't tear when arms drop.
        k = smooth(0.07, 0.15, ax) * smooth(1.33, 1.43, p.z) * (1 - smooth(1.46, 1.50, p.z)) * 0.55
        if k > 0:
            out = {bn: wt * (1 - k) for bn, wt in out.items()}
            out["clavicle_" + sd] = out.get("clavicle_" + sd, 0) + k
        return out

    return b, w


def piece_skirt(sections, hem_z=0.06):
    """Long skirt (abaya / dress / skirt). sections: z, rx, ry."""
    b = Builder()
    s = sorted(sections)
    zs = []
    for (z0, _, _), (z1, _, _) in zip(s, s[1:]):
        zs += [lerp(z0, z1, t / 3) for t in range(3)]
    zs.append(s[-1][0])
    rings = [ellipse((0, 0.012, z), (1, 0, 0), (0, 1, 0), _rx_at(sections, z), _ry_at(sections, z), 24) for z in zs]
    b.loft(rings)
    def w(p, tag=None):
        return leg_weights(p, _rx_at(sections, p.z), hem_z=hem_z)

    return b, w


def _rx_at(sections, z):
    s = sorted(sections)
    for (z0, rx0, _), (z1, rx1, _) in zip(s, s[1:]):
        if z0 <= z <= z1:
            return lerp(rx0, rx1, (z - z0) / (z1 - z0))
    return s[0][1] if z < s[0][0] else s[-1][1]


SKIRT_FLARE = [(1.13, 0.130, 0.094), (1.02, 0.160, 0.118), (0.82, 0.196, 0.150), (0.52, 0.240, 0.185), (0.25, 0.276, 0.212), (0.05, 0.300, 0.232)]
SKIRT_STRAIGHT = [(1.13, 0.130, 0.094), (1.02, 0.156, 0.114), (0.82, 0.184, 0.140), (0.52, 0.214, 0.164), (0.25, 0.232, 0.178), (0.06, 0.246, 0.190)]
TUNIC = [(0.97, 0.168, 0.124), (0.86, 0.200, 0.150), (0.70, 0.226, 0.172)]


def piece_tunic():
    b, _ = piece_skirt(TUNIC)
    return b, lambda p, tag=None: leg_weights(p, _rx_at(TUNIC, p.z), hip_z=0.98, hem_z=0.70, strength=0.55)


def piece_legs(r_top, r_bot, z_top=0.96, z_bot=0.06, seg=10, hip_block=False):
    """Leg tubes (leggings under skirts, or wide trousers)."""
    b = Builder()
    for s in (1, -1):
        secs = [(z_top, r_top), (KNEE_Z + 0.06, lerp(r_top, r_bot, 0.5)), (KNEE_Z - 0.06, lerp(r_top, r_bot, 0.6)), (z_bot, r_bot)]
        secs = [q for q in secs if q[0] <= z_top]
        rings = [ellipse((s * HIP_X, 0.006 + (0.02 if z < 0.3 else 0.0) * (0.3 - z) / 0.3, z), (1, 0, 0), (0, 1, 0), r, r * 0.95, seg) for z, r in sorted(secs)]
        b.loft(rings)
    if hip_block:
        b.tag = "hip"
        secs = [(0.86, 0.160, 0.112), (1.00, 0.152, 0.110), (1.13, 0.128, 0.092)]
        b.loft([ellipse((0, 0.010, z), (1, 0, 0), (0, 1, 0), rx, ry, SEG) for z, rx, ry in secs])

    def w(p, tag=None):
        if tag == "hip":
            return leg_weights(p, 0.16, hip_z=1.0, hem_z=0.6, strength=0.6)
        sd = "l" if p.x >= 0 else "r"
        if p.z > 0.86:
            t = smooth(0.86, 0.98, p.z)
            return {"thigh_" + sd: 1 - t * 0.5, "pelvis": t * 0.5}
        t = smooth(KNEE_Z - 0.07, KNEE_Z + 0.07, p.z)
        return {"thigh_" + sd: t, "calf_" + sd: 1 - t}

    return b, w



def piece_shoes():
    b = Builder()
    for s in (1, -1):
        x = s * HIP_X
        secs = [(0.075, 0.040, 0.034, 0.048), (0.02, 0.048, 0.046, 0.048), (-0.09, 0.050, 0.040, 0.040), (-0.175, 0.040, 0.026, 0.026), (-0.205, 0.024, 0.014, 0.016)]
        # Axis -Y (toe direction): u x v must equal -Y.
        u, v = Vector((0, 0, 1)), Vector((1, 0, 0))
        rings = [ellipse((x, y, zc), u, v, rz, rx, 10) for y, rx, rz, zc in secs]
        b.loft(rings, cap_start=True, cap_end=True)
    return b, lambda p, tag=None: {side_bone("foot_l", p.x): 1.0} if p.y > -0.11 else {side_bone("foot_l", p.x): 0.4, side_bone("ball_l", p.x): 0.6}


def head_shell_point(scale, x, z):
    rx, ry, rz = HEAD_R.x * scale, HEAD_R.y * scale, HEAD_R.z * scale
    q = 1 - (x / rx) ** 2 - ((z - HEAD_C.z) / rz) ** 2
    return Vector((x, HEAD_C.y - ry * math.sqrt(max(q, 0.0)), z))


FACE_W, FACE_H, FACE_Z = 0.134, 0.150, HEAD_C.z - 0.006


def piece_hijab(long=False):
    """Head shell with a face opening, wrap under the chin, and a drape over the shoulders."""
    b = Builder()
    sc = 1.075
    rings = []
    lat = 14
    for k in range(1, lat):
        th = -math.pi / 2 + math.pi * k / lat
        z = HEAD_C.z + math.sin(th) * HEAD_R.z * sc
        rings.append(ellipse((HEAD_C.x, HEAD_C.y + 0.004, z), (1, 0, 0), (0, 1, 0), HEAD_R.x * sc * math.cos(th), HEAD_R.y * sc * math.cos(th), 26, -math.pi / 2))
    ids = b.loft(rings)
    b.cap(ids[-1], rings[-1], flip=False, point=HEAD_C + Vector((0, 0.004, HEAD_R.z * sc)))
    # Face opening: vertices inside the face ellipse are pushed out onto it (a smooth
    # edge), faces left fully on the edge are dropped.
    open_face(b, sc)
    # Chin wrap + drape: rings from the lower head down over the shoulders.
    secs = [
        (1.665, 0.150, 0.140, -0.004),
        (1.590, 0.122, 0.116, -0.006),
        (1.505, 0.150, 0.120, 0.004),
        (1.460, 0.222, 0.148, 0.010),
        (1.400, 0.246, 0.160, 0.010),
        (1.320, 0.236, 0.158, 0.008),
    ]
    if long:
        secs += [(1.20, 0.232, 0.150, 0.006), (1.06, 0.236, 0.150, 0.006)]
    drape = [ellipse((0, y0, z), (1, 0, 0), (0, 1, 0), rx, ry, 26, -math.pi / 2) for z, rx, ry, y0 in sorted(secs)]
    b.loft(drape)
    bottom = min(s[0] for s in secs)

    def w(p, tag=None):
        if p.z > 1.60:
            return {"Head": 1.0}
        if p.z > 1.50:
            t = smooth(1.50, 1.60, p.z)
            return {"Head": 0.5 * t, "neck_01": 0.5 + 0.0 * t, "spine_03": 0.5 * (1 - t)}
        out = spine_weights(min(p.z, 1.45)) if p.z < 1.35 else {"spine_03": 1.0}
        sd = "l" if p.x >= 0 else "r"
        k = smooth(0.15, 0.24, abs(p.x)) * 0.45
        if k > 0:
            out = {bn: wt * (1 - k) for bn, wt in out.items()}
            out["clavicle_" + sd] = out.get("clavicle_" + sd, 0) + k * 0.5
            out["upperarm_" + sd] = out.get("upperarm_" + sd, 0) + k * 0.5
        return out

    return b, w


def face_edge(scale, k, a):
    """Point on the head shell (scale) on the face ellipse scaled by k, angle a."""
    return head_shell_point(scale, math.cos(a) * FACE_W * k, FACE_Z + math.sin(a) * FACE_H * k)


def open_face(b, scale):
    snapped = set()
    for i, p in enumerate(b.verts):
        if p.y > HEAD_C.y - 0.02:
            continue
        ex, ez = p.x / FACE_W, (p.z - FACE_Z) / FACE_H
        e = math.hypot(ex, ez)
        if e >= 1.0:
            continue
        a = math.atan2(ez, ex) if e > 1e-6 else math.pi / 2
        q = face_edge(scale, 1.0, a)
        b.verts[i] = Vector((q.x, q.y + 0.004, q.z))
        snapped.add(i)
    b.faces = [f for f in b.faces if not all(i in snapped for i in f)]


def piece_hijab_band():
    """Accent underscarf band hugging the face opening of the hijab."""
    b = Builder()
    n = 40
    inner, outer = [], []
    for i in range(n):
        a = 2 * math.pi * i / n
        inner.append(b.add_ring([face_edge(1.083, 0.985, a)])[0])
        outer.append(b.add_ring([face_edge(1.083, 1.13, a)])[0])
    for i in range(n):
        j = (i + 1) % n
        b.faces.append((inner[i], outer[i], outer[j], inner[j]))
    return b, lambda p, tag=None: {"Head": 1.0}


def _shell_region(scale, floor, seg=30, lat=16):
    """Head-hugging shell whose lower edge follows floor(x, back) smoothly:
    vertices below it are snapped up onto it, fully-snapped faces are dropped."""
    b = Builder()
    rings = []
    for k in range(1, lat):
        th = -math.pi / 2 + math.pi * k / lat
        z = HEAD_C.z + math.sin(th) * HEAD_R.z * scale
        rings.append(ellipse((HEAD_C.x, HEAD_C.y + 0.006, z), (1, 0, 0), (0, 1, 0), HEAD_R.x * scale * math.cos(th), HEAD_R.y * scale * math.cos(th), seg, -math.pi / 2))
    ids = b.loft(rings)
    b.cap(ids[-1], rings[-1], flip=False, point=HEAD_C + Vector((0, 0.006, HEAD_R.z * scale)))
    c = HEAD_C + Vector((0, 0.006, 0))
    snapped = set()
    for i, p in enumerate(b.verts):
        zf = floor(p)
        if p.z < zf:
            # Keep the azimuth, move up the ellipsoid to the floor height.
            rx, ry, rz = HEAD_R.x * scale, HEAD_R.y * scale, HEAD_R.z * scale
            k = math.sqrt(max(0.0, 1 - ((zf - c.z) / rz) ** 2))
            d = Vector(((p.x - c.x) / rx, (p.y - c.y) / ry, 0))
            d = d.normalized() if d.length > 1e-6 else Vector((0, 1, 0))
            b.verts[i] = Vector((c.x + d.x * rx * k, c.y + d.y * ry * k, zf))
            snapped.add(i)
    b.faces = [f for f in b.faces if not all(i in snapped for i in f)]
    return b


def hair_floor(p):
    """Hairline: a soft fringe over the forehead, lower at the sides and back."""
    rel_y = (p.y - HEAD_C.y) / HEAD_R.y  # -1 front .. 1 back
    rel_x = min(1.0, abs(p.x) / HEAD_R.x)
    front = max(0.0, -rel_y)
    fringe = HEAD_C.z + 0.09 - 0.075 * rel_x ** 2
    back = HEAD_C.z - 0.13
    return lerp(back, fringe, smooth(0.15, 0.75, front))


def piece_hair(style):
    b = _shell_region(1.05, hair_floor)
    if style == "long":
        secs = [(1.80, 0.172, 0.07), (1.64, 0.170, 0.07), (1.47, 0.160, 0.06), (1.33, 0.138, 0.048)]
        rings = [ellipse((0, 0.13 + (1.80 - z) * 0.06, z), (1, 0, 0), (0, 1, 0), rx, ry, 16) for z, rx, ry in sorted(secs)]
        b.loft(rings, cap_start=True)
    elif style == "bun":
        c = Vector((0, 0.15, 1.955))
        rings = []
        for k in range(1, 8):
            th = -math.pi / 2 + math.pi * k / 8
            rings.append(ellipse((c.x, c.y, c.z + math.sin(th) * 0.068), (1, 0, 0), (0, 1, 0), 0.075 * math.cos(th), 0.07 * math.cos(th), 12))
        ids = b.loft(rings)
        b.cap(ids[0], rings[0], flip=True, point=c - Vector((0, 0, 0.068)))
        b.cap(ids[-1], rings[-1], flip=False, point=c + Vector((0, 0, 0.068)))
    elif style == "ponytail":
        path = [Vector((0, 0.17, 1.86)), Vector((0, 0.23, 1.76)), Vector((0, 0.23, 1.60)), Vector((0, 0.20, 1.45))]
        radii = [0.045, 0.05, 0.042, 0.02]
        rings = [ellipse(pt, (1, 0, 0), (0, 1, 0), r, r, 10) for pt, r in zip(path, radii)]
        b.loft(rings[::-1], cap_start=True, cap_end=True)
    elif style == "bob":
        secs = [(1.74, 0.200, 0.194), (1.66, 0.205, 0.198), (1.62, 0.200, 0.192)]
        rings = [ellipse((0, HEAD_C.y + 0.02, z), (1, 0, 0), (0, 1, 0), rx, ry, 22, -math.pi / 2) for z, rx, ry in sorted(secs)]
        ids = b.loft(rings, closed=True)
        b.faces = b.faces[: len(b.faces)]
        # Open the front of the bob around the face.
        b.faces = [f for f in b.faces if not all(b.verts[i].y < HEAD_C.y - 0.08 and abs(b.verts[i].x) < 0.15 for i in f)]

    def w(p, tag=None):
        if p.z > 1.58:
            return {"Head": 1.0}
        t = smooth(1.32, 1.58, p.z)
        return {"Head": 0.4 + 0.6 * t, "spine_03": 0.6 * (1 - t)}

    return b, w


def piece_vest():
    """Open-front staff vest over the top."""
    b = Builder()
    secs = [(1.00, 1.07), (1.12, 1.09), (1.25, 1.08), (1.35, 1.07), (1.42, 1.06), (1.47, 1.05)]
    rings = []
    for z, sc in secs:
        rx, ry, y0 = torso_at(z)
        rings.append(ellipse((0, y0, z), (1, 0, 0), (0, 1, 0), rx * sc + 0.004, ry * sc + 0.004, 20, -math.pi / 2))
    b.loft(rings)
    b.faces = [f for f in b.faces if not all(b.verts[i].y < -0.05 and abs(b.verts[i].x) < 0.045 for i in f)]
    # Arm holes: drop the side faces at chest height.
    b.faces = [f for f in b.faces if not all(abs(b.verts[i].x) > 0.12 and b.verts[i].z > 1.30 for i in f)]
    return b, lambda p, tag=None: spine_weights(p.z)


def piece_logo():
    """Logo patch on the vest's left chest (uv -> logo cell of the atlas)."""
    b = Builder()
    rx, ry, y0 = torso_at(1.34)
    y = y0 - ry * 1.07 - 0.012
    x0, x1, z0, z1 = 0.035, 0.115, 1.318, 1.348
    ids = b.add_ring([Vector((x0, y, z0)), Vector((x1, y + 0.012, z0)), Vector((x1, y + 0.012, z1)), Vector((x0, y, z1))])
    b.uvs[ids[0]], b.uvs[ids[1]], b.uvs[ids[2]], b.uvs[ids[3]] = (0, 0), (1, 0), (1, 1), (0, 1)
    b.faces.append((ids[0], ids[1], ids[2], ids[3]))
    return b, lambda p, tag=None: {"spine_03": 0.6, "spine_02": 0.4}


def piece_belt():
    b = Builder()
    rings = [ellipse((0, 0.012, z), (1, 0, 0), (0, 1, 0), rx + 0.006, ry + 0.006, 20) for z, rx, ry in ((1.10, 0.128, 0.091), (1.15, 0.127, 0.090))]
    b.loft(rings)
    return b, lambda p, tag=None: {"spine_01": 0.6, "pelvis": 0.4}


def piece_cuffs():
    """Contrast trim at the abaya sleeve ends."""
    b = Builder()
    for s in (1, -1):
        u, v = Vector((0, 1, 0)), Vector((0, 0, 1)) * s
        rr = [ellipse((s * x, ARM_Y - 0.004, ARM_Z), u, v, r, r * 0.95, 12) for x, r in ((WRIST_X - 0.03, 0.062), (WRIST_X + 0.012, 0.072))]
        b.loft(rr)
    return b, lambda p, tag=None: {side_bone("lowerarm_l", p.x): 0.8, side_bone("hand_l", p.x): 0.2}


def piece_abaya_trim():
    """Vertical front band of the abaya (neck to hem)."""
    b = Builder()
    zs = [1.47, 1.35, 1.25, 1.13, 1.02, 0.82, 0.52, 0.25, 0.05]
    left, right = [], []
    for z in zs:
        if z > 1.12:
            rx, ry, y0 = torso_at(z)
        else:
            rx, ry = _rx_at(SKIRT_FLARE, z), [s[2] for s in sorted(SKIRT_FLARE) if True][0]
            ry = _ry_at(SKIRT_FLARE, z)
            y0 = 0.012
        y = y0 - ry - 0.006
        left.append(b.add_ring([Vector((0.022, y, z))])[0])
        right.append(b.add_ring([Vector((-0.022, y, z))])[0])
    for k in range(len(zs) - 1):
        b.faces.append((right[k + 1], left[k + 1], left[k], right[k]))
    return b, lambda p, tag=None: spine_weights(p.z) if p.z > 1.12 else leg_weights(p, 0.3)


def _ry_at(sections, z):
    s = sorted(sections)
    for (z0, _, ry0), (z1, _, ry1) in zip(s, s[1:]):
        if z0 <= z <= z1:
            return lerp(ry0, ry1, (z - z0) / (z1 - z0))
    return s[0][2] if z < s[0][0] else s[-1][2]


# name -> (factory, part). Parts are coloured by the runtime palette.
PIECES = {
    "head": (piece_head, "skin"),
    "hands": (piece_hands, "skin"),
    "upper": (lambda: piece_upper(0.0), "top"),
    "upper_abaya": (lambda: piece_upper(0.018), "top"),
    "skirt_flare": (lambda: piece_skirt(SKIRT_FLARE), "bottom"),
    "skirt_straight": (lambda: piece_skirt(SKIRT_STRAIGHT), "bottom"),
    "tunic": (piece_tunic, "top"),
    "leggings": (lambda: piece_legs(0.054, 0.046, z_top=0.50), "bottom"),
    "trousers": (lambda: piece_legs(0.092, 0.118, z_top=0.97, z_bot=0.05, seg=12, hip_block=True), "bottom"),
    "shoes": (piece_shoes, "shoes"),
    "hijab_classic": (lambda: piece_hijab(False), "hijab"),
    "hijab_long": (lambda: piece_hijab(True), "hijab"),
    "hijab_band": (piece_hijab_band, "accent"),
    "hair_long": (lambda: piece_hair("long"), "hair"),
    "hair_bun": (lambda: piece_hair("bun"), "hair"),
    "hair_ponytail": (lambda: piece_hair("ponytail"), "hair"),
    "hair_bob": (lambda: piece_hair("bob"), "hair"),
    "vest": (piece_vest, "vest"),
    "logo": (piece_logo, "logo"),
    "belt": (piece_belt, "trim"),
    "cuffs": (piece_cuffs, "trim"),
    "abaya_trim": (piece_abaya_trim, "trim"),
}

PART_COLORS = {"skin": (0.91, 0.73, 0.58), "top": (0.55, 0.36, 0.45), "bottom": (0.25, 0.23, 0.30), "shoes": (0.9, 0.88, 0.85), "hijab": (0.79, 0.6, 0.68), "accent": (1, 1, 1), "hair": (0.2, 0.13, 0.1), "vest": (0.55, 0.1, 0.35), "logo": (1, 1, 1), "trim": (0.75, 0.6, 0.4)}


# ---------------------------------------------------------------- scene

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
    keep["Walk_Modest"] = modest_walk(keep["Walk_Loop"])
    return arm, keep


# Shorter stride for long skirts: leg rotations pulled towards the rest pose.
MODEST_DAMP = {"thigh": 0.55, "calf": 0.6, "foot": 0.7, "ball": 0.7, "pelvis": 0.7, "upperarm": 0.75, "neck": 0.35, "Head": 0.35, "spine": 0.6}


def modest_walk(src):
    ac = src.copy()
    ac.name = "Walk_Modest"
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
        ws = weight_fn(Vector(v.co), b.tags[i])
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
    mat = bpy.data.materials.new(name + "_m")
    mat.diffuse_color = (*PART_COLORS[part], 1)
    me.materials.append(mat)
    return ob


def build():
    arm, clips = load_skeleton()
    objs = {}
    tris = {}
    for name, (fn, part) in PIECES.items():
        b, w = fn()
        objs[name] = make_object(name, b, w, arm, part)
        tris[name] = sum(len(p.vertices) - 2 for p in objs[name].data.polygons)
    print("TRIS", tris)
    return arm, clips, objs


def export(arm, objs, clips):
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    # One NLA track per clip: the exporter writes each track as a glTF animation.
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
    )
    print("EXPORTED", OUT, os.path.getsize(OUT))


LOOKS = {
    "abaya_hijab": ["head", "hands", "upper_abaya", "skirt_flare", "leggings", "shoes", "hijab_classic", "hijab_band", "cuffs", "abaya_trim"],
    "skirt_long_hijab": ["head", "hands", "upper", "tunic", "skirt_straight", "leggings", "shoes", "hijab_long"],
    "trousers_hair": ["head", "hands", "upper", "tunic", "trousers", "shoes", "hair_long"],
    "staff_bun": ["head", "hands", "upper", "skirt_straight", "leggings", "shoes", "hair_bun", "vest", "logo"],
}


def preview(arm, objs, out_dir, clips):
    import bpy as _b
    sc = _b.context.scene
    sc.render.engine = "BLENDER_WORKBENCH"
    sc.display.shading.light = "STUDIO"
    sc.display.shading.color_type = "MATERIAL"
    sc.display.shading.show_backface_culling = True
    sc.render.resolution_x, sc.render.resolution_y = 520, 720
    sc.render.film_transparent = False
    cam = _b.data.objects.new("cam", _b.data.cameras.new("cam"))
    sc.collection.objects.link(cam)
    sc.camera = cam
    cam.data.lens = 60
    arm.animation_data_create()
    for look, pieces in LOOKS.items():
        for n, o in objs.items():
            o.hide_render = n not in pieces
        for clip, frame, view in (("Idle_Loop", 10, "front"), ("Walk_Modest", 8, "side"), ("Walk_Modest", 8, "q"), ("Idle_Loop", 10, "face")):
            arm.animation_data.action = clips[clip]
            sc.frame_set(frame)
            if view == "front":
                cam.location, cam.rotation_euler = (0, -4.6, 1.0), (math.radians(90), 0, 0)
            elif view == "side":
                cam.location, cam.rotation_euler = (4.6, 0, 1.0), (math.radians(90), 0, math.radians(90))
            elif view == "face":
                cam.location, cam.rotation_euler = (0.35, -1.25, 1.85), (math.radians(88), 0, math.radians(16))
            else:
                cam.location, cam.rotation_euler = (2.6, -3.8, 1.25), (math.radians(84), 0, math.radians(34))
            sc.render.filepath = os.path.join(out_dir, f"{look}_{clip}_{view}.png")
            _b.ops.render.render(write_still=True)


arm, clips, objs = build()
export(arm, objs, clips)
if PREVIEW:
    for t in list(arm.animation_data.nla_tracks):
        arm.animation_data.nla_tracks.remove(t)
    preview(arm, objs, PREVIEW, clips)
