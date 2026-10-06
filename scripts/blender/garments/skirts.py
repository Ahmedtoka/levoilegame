"""Pleated maxi skirts (garment plug-in, style "pleated").

    skirt_flare    full maxi skirt, 8 crisp box pleats growing from the waist to the hem
    skirt_straight long A-line skirt, 6 softer pleats

Both start at the waist (z 1.06, under the blouse / abaya hem) with a 3 cm elastic
waistband (slightly gathered: the pleats begin as 1.5 mm notches in the band) and end
2 cm above the shoe soles, over the leggings. The pleats are geometry: each pleat is an
outer box face flush with the skirt's silhouette and an inner face recessed by the pleat
depth, which grows from the band down to the hem. The silhouette of skirt_flare is the
default SKIRT_FLARE one, so the abaya's front band (abaya_trim, 8 mm proud of it) stays
clear of the front box face.

Skinning is ctx.leg_weights: the sides follow the legs, the front / back panels follow
the skirt_f / skirt_b hinge bones that the runtime swings with the leading / trailing
thigh (character.ts driveSkirt).

Note: every clip holds the pelvis 4-5 cm lower than the rest pose (knees slightly
bent), so the whole skirt rides that much lower in the game than in the build frame.
"""
import math

import bpy
from mathutils import Vector

WAIST_Z = 1.06  # band top, under the blouse hem (0.93) and the abaya hem (1.00)
BAND_Z = 1.03  # band bottom (3 cm band)
BAND_PROUD = 0.004  # the elastic band stands a little proud of the skirt
HEM_Z = 0.03  # 2 cm above the shoe soles (the shoes sit at z 0.012)
NOTCH = 0.0015  # pleat depth at the waistband (gathers)

# Outer silhouette (z, rx, ry) of the pleat faces. The flare table is the default
# SKIRT_FLARE one (abaya_trim is lofted 8 mm in front of it); the A-line widens a
# little more than the default straight skirt towards the hem.
FLARE = [(1.06, 0.182, 0.136), (0.95, 0.205, 0.150), (0.80, 0.225, 0.165), (0.52, 0.262, 0.195), (0.25, 0.292, 0.222), (0.02, 0.318, 0.246)]
ALINE = [(1.06, 0.182, 0.136), (0.95, 0.200, 0.146), (0.80, 0.214, 0.156), (0.52, 0.230, 0.172), (0.25, 0.248, 0.190), (0.02, 0.266, 0.208)]

# Ring heights, hem first (the loft runs upwards for outward normals).
BODY_ZS = [HEM_Z, 0.11, 0.20, 0.30, 0.40, 0.50, 0.60, 0.70, 0.80, 0.90, 0.98, BAND_Z - 0.003]
BAND_ZS = [BAND_Z, WAIST_Z]


def _at(table, z, k):
    s = sorted(table, key=lambda r: r[0])
    for a, b in zip(s, s[1:]):
        if a[0] <= z <= b[0]:
            t = (z - a[0]) / (b[0] - a[0])
            return a[k] + (b[k] - a[k]) * t
    return s[0][k] if z < s[0][0] else s[-1][k]


def _slots(n, crisp):
    """Angular layout of one ring: 6 vertices per pleat, (angle, outer?).

    crisp: outer face 0..P/2, a radial step, inner face P/2..P (box pleat).
    soft:  the faces are narrower and the folds are bevels over 8 % of the period."""
    period = 2 * math.pi / n
    a0 = -math.pi / 2 - period / 4  # a box face is centred on the front (and the back)
    offs = [(0.0, True), (0.25, True), (0.5, True), (0.5, False), (0.75, False), (1.0, False)] if crisp else [(0.04, True), (0.25, True), (0.46, True), (0.54, False), (0.75, False), (0.96, False)]
    return [(a0 + (k + f) * period, outer) for k in range(n) for f, outer in offs]


def _ring(ctx, table, z, depth, slots, proud=0.0, flat_front=False):
    """One ring: the pleats straddle the silhouette (outer faces +depth/2, inner faces
    -depth/2). With flat_front the box face on the centre front stays ON the silhouette
    (the abaya trim is lofted 8 mm in front of it), the offset easing in towards the sides."""
    rx, ry = _at(table, z, 1) + proud, _at(table, z, 2) + proud
    ring = []
    for a, outer in slots:
        r = Vector((math.cos(a) * rx, math.sin(a) * ry))
        bump = depth / 2
        if flat_front:
            bump *= 1.0 - max(0.0, -math.sin(a)) ** 2
        off = bump if outer else bump - depth
        r *= max(0.2, 1.0 + off / r.length)
        ring.append(Vector((r.x, ctx.SKIRT_Y + r.y, z)))
    return ring


def _pleat_depth(z, d_max):
    """0 at the band, d_max at the hem, growing a little faster near the top."""
    t = max(0.0, min(1.0, (BAND_Z - z) / (BAND_Z - HEM_Z)))
    return NOTCH + (d_max - NOTCH) * t ** 0.85


def _mark_sharp(ob, min_angle_deg):
    """Crisp folds: edges whose faces meet at more than min_angle get split normals."""
    me = ob.data
    me.calc_normals_split() if hasattr(me, "calc_normals_split") else None
    import bmesh

    bm = bmesh.new()
    bm.from_mesh(me)
    lim = math.radians(min_angle_deg)
    n = 0
    for e in bm.edges:
        if len(e.link_faces) == 2:
            try:
                ang = e.calc_face_angle()
            except ValueError:
                continue
            if ang > lim:
                e.smooth = False
                n += 1
    bm.to_mesh(me)
    bm.free()
    return n


def _build(ctx, name, table, n_pleats, d_max, crisp, flat_front):
    b = ctx.Builder()
    slots = _slots(n_pleats, crisp)
    rings = [_ring(ctx, table, z, _pleat_depth(z, d_max), slots, flat_front=flat_front) for z in BODY_ZS]
    rings += [_ring(ctx, table, z, NOTCH, slots, proud=BAND_PROUD, flat_front=flat_front) for z in BAND_ZS]
    b.loft(rings)
    ob = ctx.make_object(name, b, lambda p: ctx.leg_weights(p, _at(table, p.z, 1), hem_z=HEM_Z, ry=_at(table, p.z, 2)), "bottom")
    # Crisp box pleats: split normals at the radial steps (90 deg) and the band ledge.
    # Soft pleats: the bevels (~45 deg) are split too, so the folds read; the facets stay smooth.
    sharp = _mark_sharp(ob, 40 if crisp else 30)
    print(f"SKIRT {name}: {n_pleats} pleats, depth {d_max * 1000:.0f} mm, {len(rings)} rings x {len(slots)} verts, {sharp} sharp edges")
    return ob


def build_flare(ctx):
    return _build(ctx, "skirt_flare", FLARE, 8, 0.024, crisp=True, flat_front=True)


def build_straight(ctx):
    return _build(ctx, "skirt_straight", ALINE, 6, 0.02, crisp=False, flat_front=False)


PIECES = {"skirt_flare": (build_flare, "bottom"), "skirt_straight": (build_straight, "bottom")}
