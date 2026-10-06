"""Template for a garment plug-in (underscore-prefixed files are skipped). Copy it as
<area>.py, keep the piece NAMES below unchanged, and replace the bodies.

    PIECES = {"belt": (build_belt, "trim")}

    def build_belt(ctx):
        b = ctx.Builder()
        rings = [ctx.ellipse((0, ctx.SKIRT_Y, z), (1, 0, 0), (0, 1, 0), 0.172, 0.128, 24) for z in (1.08, 1.125)]
        b.loft(rings)
        return ctx.make_object("belt", b, lambda p: {"spine_01": 0.6, "pelvis": 0.4}, "trim")
"""
