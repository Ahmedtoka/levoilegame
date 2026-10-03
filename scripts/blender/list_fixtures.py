"""Dump fixture groups (by name prefix) with world bounds, plus hidden objects.

    blender -b EL_REBAT_Render.blend -P scripts/blender/list_fixtures.py -- <out.json>
"""

import collections
import json
import re
import sys

import bpy
from mathutils import Vector

out = sys.argv[sys.argv.index("--") + 1]
groups = collections.defaultdict(list)
hidden = collections.Counter()
by_collection = {}

for ob in bpy.context.scene.objects:
    base = re.sub(r"\.\d+$", "", ob.name)
    if ob.hide_render or ob.hide_get():
        hidden[base] += 1
    if ob.type != "MESH":
        continue
    pts = [ob.matrix_world @ Vector(c) for c in ob.bound_box]
    mn = [min(p[i] for p in pts) for i in range(3)]
    mx = [max(p[i] for p in pts) for i in range(3)]
    groups[base].append({"name": ob.name, "min": [round(v, 2) for v in mn], "max": [round(v, 2) for v in mx],
                         "mats": [s.material.name for s in ob.material_slots if s.material][:3],
                         "coll": [c.name for c in ob.users_collection]})

summary = {}
for base, items in groups.items():
    mn = [min(i["min"][k] for i in items) for k in range(3)]
    mx = [max(i["max"][k] for i in items) for k in range(3)]
    summary[base] = {"count": len(items), "min": mn, "max": mx, "mats": items[0]["mats"], "coll": items[0]["coll"],
                     "items": items if len(items) <= 12 else items[:12]}

json.dump({"groups": summary, "hidden": dict(hidden)}, open(out, "w"), indent=1)
print("FIXTURES_WRITTEN", len(summary))
