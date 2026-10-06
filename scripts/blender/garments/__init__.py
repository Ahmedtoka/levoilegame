"""Garment plug-ins for build_avatar.py.

Every module in this folder may define

    PIECES = {"<piece name>": (factory, "<part>"), ...}

where factory(ctx) returns an Object with an Armature modifier bound to ctx.arm
(use ctx.make_object(name, builder, weight_fn, part) for lofted geometry, or
ctx.cut / ctx.offset / ctx.relax on ctx.body for shells). A plug-in's entry
REPLACES the default piece of the same name, so the runtime (src/actors/avatar/
pieces.ts) needs no change as long as the names stay the same.

ctx fields: arm (armature), body (the UBC female body, NEVER exported), make_object,
cut, offset, relax, Builder, ellipse, smooth, lerp, Vector, bones (arm.data.bones),
constants HEAD_PIVOT, HEAD_SCALE, COLLAR_Z, HIP_Z, SKIRT_Y, spine_weights, leg_weights,
top_weights, leg_tube_weights, drape_weights, torso_sections, limb_sections,
loft_torso, loft_limb, scale_head, face_zone, is_hand, is_head, is_leg, is_foot.

Modesty rule applies to every piece: tops reach the wrists and up to the jaw,
bottoms reach the ankles, skirts are worn over leggings.
"""
