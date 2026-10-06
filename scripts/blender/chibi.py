"""Bitmoji-proportion base body for build_avatar.py.

The UAL skeleton's bone POSITIONS are fixed (every clip is keyed on them), so the
chibi look is made by the MESH, not the bones: a big head (x HEAD_SCALE about the
neck), a short snug torso, short thick arms and legs lofted around the real bones,
chunky hands and feet. The body is the template every garment is cut on and is
never exported (modesty rule).

Proportions (Bitmoji 3D): head about 1/3.4 of the standing height, short neck,
narrow sloping shoulders, little waist, hips as wide as the shoulders. The skeleton
stands 1.83 m to the Head tip; after HEAD_SCALE the figure reads about 2.1 m in
bind space and the runtime scales it to 1.66 m (BASE_SCALE), which keeps doors and
counters at human size.
"""

import math

import bmesh
import bpy
from mathutils import Vector

HEAD_SCALE = 1.6
# Torso loft: (z, rx, ry, y-centre). Pelvis 0.917, waist 1.05, chest 1.30, shoulders 1.46, neck 1.50.
TORSO = [
    (0.86, 0.156, 0.122, 0.035),
    (0.92, 0.166, 0.128, 0.035),
    (1.00, 0.160, 0.120, 0.030),
    (1.08, 0.146, 0.110, 0.022),
    (1.16, 0.144, 0.108, 0.018),
    (1.24, 0.152, 0.114, 0.012),
    (1.32, 0.164, 0.118, 0.008),
    (1.40, 0.178, 0.116, 0.006),
    (1.45, 0.190, 0.108, 0.006),  # shoulder shelf: the arms sit on this ring
    (1.48, 0.150, 0.096, 0.006),
    (1.51, 0.078, 0.072, 0.006),
    (1.55, 0.064, 0.064, 0.006),
]
ARM = [(0.0, 0.062), (0.12, 0.058), (0.27, 0.052), (0.42, 0.050), (0.55, 0.046), (0.62, 0.044)]
LEG = [(0.0, 0.098), (0.3, 0.084), (0.5, 0.074), (0.8, 0.066), (1.0, 0.058)]
SEG = 24


def smooth(e0, e1, x):
    t = max(0.0, min(1.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


def ring(c, u, v, ru, rv, n):
    c, u, v = Vector(c), Vector(u), Vector(v)
    return [c + u * (math.cos(2 * math.pi * i / n) * ru) + v * (math.sin(2 * math.pi * i / n) * rv) for i in range(n)]


class Loft:
    def __init__(self):
        self.verts, self.faces, self.groups = [], [], []

    def add(self, rings, weights, cap_start=False, cap_end=False):
        ids = []
        for r in rings:
            i0 = len(self.verts)
            self.verts.extend(r)
            self.groups.extend([weights(p) for p in r])
            ids.append(list(range(i0, i0 + len(r))))
        n = len(rings[0])
        for a, b in zip(ids, ids[1:]):
            for i in range(n):
                j = (i + 1) % n
                self.faces.append((a[i], a[j], b[j], b[i]))
        for cap, rid, rg, flip in ((cap_start, ids[0], rings[0], True), (cap_end, ids[-1], rings[-1], False)):
            if not cap:
                continue
            c = sum(rg, Vector()) / len(rg)
            ci = len(self.verts)
            self.verts.append(c)
            self.groups.append(weights(c))
            for i in range(n):
                j = (i + 1) % n
                self.faces.append((ci, rid[j], rid[i]) if flip else (ci, rid[i], rid[j]))


def spine_w(z):
    bands = [("pelvis", 0.95), ("spine_01", 1.10), ("spine_02", 1.24), ("spine_03", 1.40), ("neck_01", 1.52), ("Head", 1.58)]
    if z <= bands[0][1]:
        return {"pelvis": 1.0}
    for (b0, z0), (b1, z1) in zip(bands, bands[1:]):
        if z <= z1:
            t = smooth(z0, z1, z)
            return {b0: 1 - t, b1: t}
    return {"Head": 1.0}


def torso_w(p):
    out = spine_w(p.z)
    ax = abs(p.x)
    sd = "l" if p.x >= 0 else "r"
    k = smooth(0.08, 0.15, ax) * smooth(1.36, 1.44, p.z) * (1 - smooth(1.47, 1.51, p.z)) * 0.6
    if k > 0:
        out = {b: w * (1 - k) for b, w in out.items()}
        out["clavicle_" + sd] = k
    return out


def build_body(arm):
    """The chibi body mesh ('ChibiBody', bound to arm). Never exported."""
    bones = arm.data.bones
    L = Loft()
    rings = [ring((0, cy, z), (1, 0, 0), (0, 1, 0), rx, ry, SEG) for z, rx, ry, cy in TORSO]
    L.add(rings, torso_w, cap_start=True, cap_end=True)
    for sd, sgn in (("l", 1), ("r", -1)):
        sh = Vector(bones["upperarm_" + sd].head_local)
        el = Vector(bones["lowerarm_" + sd].head_local)
        wr = Vector(bones["hand_" + sd].head_local)
        pts = []
        for f, r in ARM:
            c = sh.lerp(el, f / 0.5) if f <= 0.5 else el.lerp(wr, (f - 0.5) / 0.5)
            pts.append((c, r))
        # Rounded shoulder cap: the arm starts a little inside the torso and swells at the deltoid.
        pts.insert(0, (sh - (wr - sh).normalized() * 0.03, 0.055))
        pts[1] = (pts[1][0], 0.070)
        rings = [ring(c, (0, 1, 0), (0, 0, 1), r, r, 12) for c, r in pts]
        if sgn < 0:
            rings = [list(reversed(r)) for r in rings]

        def aw(p, sd=sd, sh=sh, wr=wr):
            t = (p - sh).dot((wr - sh).normalized()) / (wr - sh).length
            if t < 0.42:
                return {"upperarm_" + sd: 1.0}
            if t < 0.58:
                k = smooth(0.42, 0.58, t)
                return {"upperarm_" + sd: 1 - k, "lowerarm_" + sd: k}
            return {"lowerarm_" + sd: 1.0}

        L.add(rings, aw, cap_start=True, cap_end=True)
    for sd in ("l", "r"):
        hip = Vector(bones["thigh_" + sd].head_local)
        knee = Vector(bones["calf_" + sd].head_local)
        ankle = Vector(bones["foot_" + sd].head_local)
        path = []
        for f, r in LEG:
            c = hip.lerp(knee, f / 0.5) if f <= 0.5 else knee.lerp(ankle, (f - 0.5) / 0.5)
            path.append((c, r))
        rings = [ring(c, (1, 0, 0), (0, 1, 0), r, r * 0.95, 14) for c, r in path][::-1]

        def lw(p, sd=sd, hip=hip, knee=knee, ankle=ankle):
            if p.z > knee.z + 0.05:
                k = smooth(hip.z - 0.02, hip.z + 0.03, p.z)
                return {"thigh_" + sd: 1 - k, "pelvis": k} if k > 0 else {"thigh_" + sd: 1.0}
            if p.z > knee.z - 0.05:
                k = smooth(knee.z + 0.05, knee.z - 0.05, p.z)
                return {"thigh_" + sd: 1 - k, "calf_" + sd: k}
            if p.z > ankle.z + 0.04:
                return {"calf_" + sd: 1.0}
            k = smooth(ankle.z + 0.04, ankle.z, p.z)
            return {"calf_" + sd: 1 - k, "foot_" + sd: k}

        L.add(rings, lw, cap_start=True, cap_end=True)
        toe = Vector(bones["ball_" + sd].head_local)
        heel = Vector((ankle.x, ankle.y + 0.05, 0.0))
        tip = Vector((toe.x, toe.y - 0.05, 0.0))
        secs = [(heel, 0.040, 0.030), (Vector((ankle.x, ankle.y, 0.0)), 0.050, 0.056), (toe, 0.050, 0.040), (tip, 0.030, 0.016)]
        frings = [[Vector((c.x + math.cos(a) * hw, c.y, c.z + 0.012 + math.sin(a) * hh)) for a in [2 * math.pi * i / 12 for i in range(12)]] for c, hw, hh in secs][::-1]
        L.add(frings, lambda p, sd=sd: {"foot_" + sd: 1.0}, cap_start=True, cap_end=True)

    me = bpy.data.meshes.new("ChibiBody")
    me.from_pydata([tuple(v) for v in L.verts], [], L.faces)
    me.validate()
    for p in me.polygons:
        p.use_smooth = True
    ob = bpy.data.objects.new("ChibiBody", me)
    bpy.context.scene.collection.objects.link(ob)
    groups = {}
    for i, ws in enumerate(L.groups):
        for bn, w in ws.items():
            if w < 0.002:
                continue
            g = groups.get(bn) or ob.vertex_groups.new(name=bn)
            groups[bn] = g
            g.add([i], w, "REPLACE")
    ob.parent = arm
    ob.modifiers.new("Armature", "ARMATURE").object = arm
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.002)
    bmesh.ops.smooth_vert(bm, verts=bm.verts, factor=0.3, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    bm.to_mesh(me)
    bm.free()
    return ob


def piece_tee(ctx, ease=0.018):
    """Reference white tee: snug chibi torso + short sleeves (part top)."""
    b = ctx.Builder()
    secs = [(z, rx + ease, ry + ease, cy) for z, rx, ry, cy in TORSO if 0.98 <= z <= 1.50]
    secs[-1] = (1.50, secs[-1][1] - 0.02, secs[-1][2] - 0.02, secs[-1][3])
    rings = [ctx.ellipse((0, cy, z), (1, 0, 0), (0, 1, 0), rx, ry, SEG) for z, rx, ry, cy in secs]
    b.loft(rings)
    bones = ctx.bones
    # Long sleeves to the wrist (modesty): no body is ever exported, so a sleeve IS the arm.
    for sd, sgn in (("l", 1), ("r", -1)):
        sh = Vector(bones["upperarm_" + sd].head_local)
        el = Vector(bones["lowerarm_" + sd].head_local)
        wr = Vector(bones["hand_" + sd].head_local)
        pts = []
        for f, r in ARM:
            c = sh.lerp(el, f / 0.5) if f <= 0.5 else el.lerp(wr, (f - 0.5) / 0.5)
            pts.append((c, r + ease + 0.004))
        pts.insert(0, (sh - (wr - sh).normalized() * 0.03, 0.055 + ease))
        pts[1] = (pts[1][0], 0.070 + ease)
        rr = [ctx.ellipse(c, (0, 1, 0), (0, 0, 1), r, r, 12) for c, r in pts]
        if sgn < 0:
            rr = [list(reversed(r)) for r in rr]
        b.loft(rr, cap_start=True)
    return b, lambda p: ctx.top_weights(p)
