"""Pleated maxi skirts (garment plug-in, style "pleated"), fitted on the chibi body.

    skirt_flare    full maxi skirt, 8 crisp box pleats growing from the hips to the hem
    skirt_straight long A-line skirt, 6 softer (bevelled) pleats

Fit: the waist and hips are MEASURED from ctx.body (ctx.torso_sections(0.90, 1.08)):
the 3 cm elastic band (z 1.03-1.06, under the blouse hem at 1.06 and its tucked tail)
is the body + 1.2 cm, the hip ring (z 0.92, thigh tops included) the body + 1.5 cm,
with a smooth shell between. The pleats are 1.5 mm gathers down to the hips and grow
from there to the hem; the hem is a level ring at z 0.03 (2 cm above the shoe soles).
Each pleat is an outer face + depth/2 and an inner face - depth/2 about the silhouette,
so the mean surface is the silhouette; fold edges carry split normals.

Skinning is ctx.leg_weights (sides follow the legs, front / back panels follow the
skirt_f / skirt_b hinges the runtime swings), evaluated on the UN-PLEATED silhouette
point at each vertex's angle: an outer and an inner pleat face at the same angle get
the same weights, so the pleats never split. Below the knee the leg share tapers to
HEM_FOLLOW (the rest to the pelvis): the clips hold the pelvis 4-5 cm under the rest
pose, and sides pinned to the calves would otherwise hang higher than the panels and
scallop the hem; this keeps the hem one level line in Idle.

Note: every clip holds the pelvis 4-5 cm lower than the rest pose (knees slightly
bent), so the whole skirt rides that much lower in the game than in the build frame.
"""
import math

import bmesh
from mathutils import Vector

WAIST_Z = 1.06  # band top (the blouse hem is at 1.06, its tucked tail reaches 0.96 inside)
BAND_Z = 1.03  # band bottom (3 cm band)
BAND_PROUD = 0.004  # the elastic band stands a little proud of the skirt
HIP_Z = 0.92  # widest body ring (thigh tops); the pleats grow from here
HEM_Z = 0.03  # 2 cm above the shoe soles (z 0.012)
NOTCH = 0.0015  # pleat depth above the hips (gathers)
EASE_WAIST, EASE_HIP = 0.012, 0.015

# Growth of the silhouette below the hips: (z, +rx, +ry, +y-centre) added to the measured
# hip ring. It opens quickly under the hips (the chibi thighs are thick and bend forward in
# Idle) and the centre drifts back so the hem is fuller behind (the planted / trailing heel).
FLARE_GROWTH = [(HIP_Z, 0.0, 0.0, 0.0), (0.80, 0.024, 0.022, 0.006), (0.52, 0.060, 0.054, 0.016), (0.25, 0.088, 0.084, 0.026), (HEM_Z, 0.112, 0.110, 0.035)]
ALINE_GROWTH = [(HIP_Z, 0.0, 0.0, 0.0), (0.80, 0.016, 0.016, 0.006), (0.52, 0.028, 0.030, 0.016), (0.25, 0.044, 0.048, 0.026), (HEM_Z, 0.062, 0.068, 0.035)]
# Leg-follow below the knee: the sides keep following the thigh / calf at the knee (a bent
# knee pushes the cloth) but only this much of it at the hem, the rest going to the pelvis,
# so the hem drops with the pelvis as one line instead of scalloping between the legs.
HEM_FOLLOW = 0.35
KNEE_Z = 0.53

# Ring heights, hem first (the loft runs upwards for outward normals).
BODY_ZS = [HEM_Z, 0.11, 0.20, 0.30, 0.40, 0.50, 0.60, 0.70, 0.80, 0.86, HIP_Z, 0.98, BAND_Z - 0.003]
BAND_ZS = [BAND_Z, WAIST_Z]


def _at(rows, z, k):
    """Linear interpolation of column k of (z, ...) rows at z (clamped)."""
    s = sorted(rows, key=lambda r: r[0])
    for a, b in zip(s, s[1:]):
        if a[0] <= z <= b[0]:
            t = (z - a[0]) / (b[0] - a[0])
            return a[k] + (b[k] - a[k]) * t
    return s[0][k] if z < s[0][0] else s[-1][k]


def _silhouette(ctx, growth):
    """(z, rx, ry, cy) rows of the skirt: body + ease from the band to the hips, then the growth."""
    body = ctx.torso_sections(0.90, 1.08)  # sparse on the chibi loft: interpolate between the rows found
    rows = []
    for z in (WAIST_Z, 1.04, BAND_Z, 1.00, 0.98, 0.95, HIP_Z):
        ease = EASE_HIP + (EASE_WAIST - EASE_HIP) * max(0.0, min(1.0, (z - HIP_Z) / (WAIST_Z - HIP_Z)))
        rows.append((z, _at(body, z, 1) + ease, _at(body, z, 2) + ease, _at(body, z, 3)))
    hz, hrx, hry, hcy = rows[-1]
    for z, drx, dry, dcy in growth[1:]:
        rows.append((z, hrx + drx, hry + dry, hcy + dcy))
    return rows


def _slots(n, crisp):
    """Angular layout of one ring: 6 vertices per pleat, (angle, outer?).

    crisp: outer face 0..P/2, a radial step, inner face P/2..P (box pleat).
    soft:  the faces are narrower and the folds are bevels over 8 % of the period."""
    period = 2 * math.pi / n
    a0 = -math.pi / 2 - period / 4  # a box face is centred on the front (and the back)
    offs = [(0.0, True), (0.25, True), (0.5, True), (0.5, False), (0.75, False), (1.0, False)] if crisp else [(0.04, True), (0.25, True), (0.46, True), (0.54, False), (0.75, False), (0.96, False)]
    return [(a0 + (k + f) * period, outer) for k in range(n) for f, outer in offs]


def _ring(sil, z, depth, slots, proud=0.0):
    rx, ry, cy = _at(sil, z, 1) + proud, _at(sil, z, 2) + proud, _at(sil, z, 3)
    ring = []
    for a, outer in slots:
        r = Vector((math.cos(a) * rx, math.sin(a) * ry))
        off = depth / 2 if outer else -depth / 2
        r *= max(0.2, 1.0 + off / r.length)
        ring.append(Vector((r.x, cy + r.y, z)))
    return ring


def _pleat_depth(z, d_max):
    """Gathers (NOTCH) down to the hips, then growing to d_max at the hem."""
    t = max(0.0, min(1.0, (HIP_Z - z) / (HIP_Z - HEM_Z)))
    return NOTCH + (d_max - NOTCH) * t ** 0.9


def _weights(ctx, sil, p):
    """leg_weights on the un-pleated silhouette point at p's angle and height."""
    rx, ry, cy = _at(sil, p.z, 1), _at(sil, p.z, 2), _at(sil, p.z, 3)
    phi = math.atan2(p.y - cy, p.x)
    r = rx * ry / math.sqrt((ry * math.cos(phi)) ** 2 + (rx * math.sin(phi)) ** 2)
    ref = Vector((math.cos(phi) * r, cy + math.sin(phi) * r, p.z))
    w = ctx.leg_weights(ref, rx, hem_z=HEM_Z, ry=ry)
    g = 1.0 - (1.0 - HEM_FOLLOW) * ctx.smooth(KNEE_Z, HEM_Z, p.z)
    if g < 1.0:
        legs = {k: v for k, v in w.items() if k.startswith(("thigh_", "calf_"))}
        for k, v in legs.items():
            w[k] = v * g
        w["pelvis"] = w.get("pelvis", 0.0) + sum(legs.values()) * (1.0 - g)
    return w


def _mark_sharp(ob, min_angle_deg):
    """Crisp folds: edges whose faces meet at more than min_angle get split normals."""
    bm = bmesh.new()
    bm.from_mesh(ob.data)
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
    bm.to_mesh(ob.data)
    bm.free()
    return n


def _build(ctx, name, growth, n_pleats, d_max, crisp):
    sil = _silhouette(ctx, growth)
    b = ctx.Builder()
    slots = _slots(n_pleats, crisp)
    rings = [_ring(sil, z, _pleat_depth(z, d_max), slots) for z in BODY_ZS]
    rings += [_ring(sil, z, NOTCH, slots, proud=BAND_PROUD) for z in BAND_ZS]
    b.loft(rings)
    ob = ctx.make_object(name, b, lambda p: _weights(ctx, sil, p), "bottom")
    # Crisp box pleats: split normals at the radial steps (90 deg) and the band ledge.
    # Soft pleats: the bevels (~45 deg) are split too, so the folds read; the facets stay smooth.
    sharp = _mark_sharp(ob, 40 if crisp else 30)
    fit = ", ".join(f"z{z:.2f}: {rx:.3f}/{ry:.3f}" for z, rx, ry, _ in sil if z in (WAIST_Z, HIP_Z, HEM_Z))
    print(f"SKIRT {name}: {n_pleats} pleats, depth {d_max * 1000:.0f} mm, {len(rings)} rings x {len(slots)} verts, {sharp} sharp edges; {fit}")
    return ob


def build_flare(ctx):
    return _build(ctx, "skirt_flare", FLARE_GROWTH, 8, 0.024, crisp=True)


def build_straight(ctx):
    return _build(ctx, "skirt_straight", ALINE_GROWTH, 6, 0.02, crisp=False)


PIECES = {"skirt_flare": (build_flare, "bottom"), "skirt_straight": (build_straight, "bottom")}
