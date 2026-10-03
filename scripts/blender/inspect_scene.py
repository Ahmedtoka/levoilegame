"""Inspect the boutique .blend and render camera previews.

    tools/blender/blender.exe -b EL_REBAT_Render.blend -P scripts/blender/inspect_scene.py -- <out_dir> [cycles_samples]
"""

import collections
import json
import re
import sys

import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
out_dir = argv[0] if argv else "."
samples = int(argv[1]) if len(argv) > 1 else 0

scene = bpy.context.scene
info = {
    "engine": scene.render.engine,
    "resolution": [scene.render.resolution_x, scene.render.resolution_y],
    "unit_scale": scene.unit_settings.scale_length,
    "frame": scene.frame_current,
    "cameras": {},
    "lights": {},
    "collections": {},
    "prefixes": {},
    "bounds": None,
    "materials": {},
}

mins = Vector((1e9, 1e9, 1e9))
maxs = Vector((-1e9, -1e9, -1e9))
prefixes = collections.Counter()
for ob in scene.objects:
    prefixes[re.sub(r"\.\d+$", "", ob.name)] += 1
    if ob.type == "MESH" and ob.visible_get():
        for corner in ob.bound_box:
            w = ob.matrix_world @ Vector(corner)
            mins = Vector(map(min, mins, w))
            maxs = Vector(map(max, maxs, w))
    if ob.type == "CAMERA":
        info["cameras"][ob.name] = {"loc": list(ob.location), "rot": list(ob.rotation_euler), "lens": ob.data.lens}
    if ob.type == "LIGHT":
        d = ob.data
        info["lights"][ob.name] = {
            "type": d.type,
            "energy": d.energy,
            "color": list(d.color),
            "loc": [round(v, 2) for v in ob.location],
            "size": getattr(d, "size", None),
        }
info["bounds"] = {"min": [round(v, 2) for v in mins], "max": [round(v, 2) for v in maxs]}
info["prefixes"] = dict(prefixes.most_common(80))
for c in bpy.data.collections:
    info["collections"][c.name] = len(c.objects)
for m in bpy.data.materials:
    node_types = []
    if m.use_nodes and m.node_tree:
        node_types = sorted({n.type for n in m.node_tree.nodes})
    info["materials"][m.name] = {"users": m.users, "nodes": node_types, "color": list(m.diffuse_color)}

world = scene.world
if world and world.use_nodes:
    info["world_nodes"] = [n.type for n in world.node_tree.nodes]

with open(f"{out_dir}/scene_info.json", "w", encoding="utf8") as f:
    json.dump(info, f, indent=1, default=str)
print("SCENE_INFO_WRITTEN")

# Preview renders from every camera.
scene.render.resolution_x = 1280
scene.render.resolution_y = 720
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "JPEG"
if samples > 0:
    scene.render.engine = "CYCLES"
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    prefs = bpy.context.preferences.addons["cycles"].preferences
    for backend in ("OPTIX", "CUDA", "HIP", "ONEAPI"):
        try:
            prefs.compute_device_type = backend
            prefs.get_devices()
            if any(d.type == backend for d in prefs.devices):
                for d in prefs.devices:
                    d.use = d.type == backend
                scene.cycles.device = "GPU"
                print("CYCLES_DEVICE", backend)
                break
        except Exception:
            continue
else:
    scene.render.engine = "BLENDER_EEVEE_NEXT"

for ob in [o for o in scene.objects if o.type == "CAMERA"]:
    scene.camera = ob
    scene.render.filepath = f"{out_dir}/render_{ob.name}_{'cycles' if samples else 'eevee'}.jpg"
    bpy.ops.render.render(write_still=True)
    print("RENDERED", scene.render.filepath)
