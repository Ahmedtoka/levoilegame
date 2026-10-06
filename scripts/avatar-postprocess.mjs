// Shrinks public/models/avatar/avatar.glb after the Blender export
// (scripts/blender/build_avatar.py). The exporter bakes every channel of every
// bone; the runtime only needs rotations (plus the pelvis translation for the
// walk bob), and the hands are mittens, so finger channels go too.
//
//   node scripts/avatar-postprocess.mjs

import { NodeIO } from '@gltf-transform/core'
import { KHRONOS_EXTENSIONS } from '@gltf-transform/extensions'
import { dedup, prune, resample } from '@gltf-transform/functions'

const FILE = 'public/models/avatar/avatar.glb'
const FINGERS = /^(index|middle|ring|pinky|thumb)_|_leaf_/

const io = new NodeIO().registerExtensions(KHRONOS_EXTENSIONS)
const doc = await io.read(FILE)
let dropped = 0
for (const anim of doc.getRoot().listAnimations()) {
  for (const ch of anim.listChannels()) {
    const name = ch.getTargetNode()?.getName() ?? ''
    const path = ch.getTargetPath()
    const keep = path === 'rotation' ? !FINGERS.test(name) : path === 'translation' && name === 'pelvis'
    if (!keep) {
      ch.getSampler()?.dispose()
      ch.dispose()
      dropped++
    }
  }
}
await doc.transform(resample({ tolerance: 1e-4 }), dedup(), prune())
await io.write(FILE, doc)
const { statSync } = await import('node:fs')
console.log(`dropped ${dropped} channels -> ${(statSync(FILE).size / 1024).toFixed(0)} KB`)
