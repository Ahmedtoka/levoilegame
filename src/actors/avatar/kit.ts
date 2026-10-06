// Loads public/models/avatar/avatar.glb once (garment pieces skinned to one
// skeleton + animation clips) and hands out per-look merged geometry and fresh
// skeleton copies. One merged geometry per distinct set of pieces is cached and
// shared by every character wearing that set.

import { AnimationMixer, BufferAttribute, Group, SRGBColorSpace, TextureLoader, Vector3, type AnimationClip, type Bone, type BufferGeometry, type Matrix4, type SkinnedMesh } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { PARTS, PIECE_PART } from './pieces'
import type { AvatarTextures } from './material'

export const AVATAR_URL = '/models/avatar/avatar.glb'
const TEX_DIR = '/models/avatar/'

export interface AvatarKit {
  pieces: Map<string, BufferGeometry>
  clips: Map<string, AnimationClip>
  /** Template bone hierarchy (cloned per character) and its bind data. */
  rootBone: Bone
  boneNames: string[]
  boneInverses: Matrix4[]
  bindMatrix: Matrix4
  /** Shared atlases (skin, hair, eyes); they stream in behind the first draw. */
  tex: AvatarTextures
}

let kit: AvatarKit | null = null
let loading: Promise<AvatarKit | null> | null = null
const merged = new Map<string, BufferGeometry>()

/** Load once; resolves null (and logs) if the model is missing, so boot never blocks on it. */
export function loadAvatarKit(): Promise<AvatarKit | null> {
  loading ??= new GLTFLoader()
    .loadAsync(AVATAR_URL)
    .then((gltf) => {
      const pieces = new Map<string, BufferGeometry>()
      let template: SkinnedMesh | null = null
      gltf.scene.traverse((o) => {
        const m = o as SkinnedMesh
        if (!m.isSkinnedMesh) return
        template ??= m
        const part = PIECE_PART[m.name]
        if (part === undefined) return
        const g = m.geometry
        const n = g.attributes.position.count
        g.setAttribute('part', new BufferAttribute(new Float32Array(n).fill(PARTS.indexOf(part)), 1))
        pieces.set(m.name, g)
      })
      if (!template) throw new Error('avatar.glb has no skinned meshes')
      const t = template as SkinnedMesh
      let rootBone = t.skeleton.bones[0]
      while (rootBone.parent && (rootBone.parent as Bone).isBone) rootBone = rootBone.parent as Bone
      kit = {
        tex: loadTextures(),
        pieces,
        clips: new Map(gltf.animations.map((c) => [c.name, c])),
        rootBone,
        boneNames: t.skeleton.bones.map((b) => b.name),
        boneInverses: t.skeleton.boneInverses,
        bindMatrix: t.bindMatrix.clone(),
      }
      return kit
    })
    .catch((err) => {
      console.error('Avatar model failed to load', err)
      return null
    })
  return loading
}

/** The atlases load in the background: a character drawn before they arrive gets them on the next frame. */
function loadTextures(): AvatarTextures {
  const loader = new TextureLoader()
  const load = (file: string, srgb: boolean) => {
    const t = loader.load(TEX_DIR + file)
    if (srgb) t.colorSpace = SRGBColorSpace
    // glTF UVs have their origin at the top-left (v flipped vs Blender): don't flip again.
    t.flipY = false
    t.anisotropy = 4
    return t
  }
  return { skin: load('skin.png', true), skinNormal: load('skin_n.png', false), hair: load('hair.png', true), hairNormal: load('hair_n.png', false), eyes: load('eyes.png', true) }
}

export function avatarKit(): AvatarKit | null {
  return kit
}

/** Merged geometry of a piece list (cached by the list). */
export function mergedGeometry(k: AvatarKit, pieces: readonly string[]): BufferGeometry {
  const key = pieces.join('+')
  let g = merged.get(key)
  if (!g) {
    const parts = pieces.map((p) => {
      const geo = k.pieces.get(p)
      if (!geo) throw new Error(`avatar piece missing: ${p}`)
      return geo
    })
    const m = mergeGeometries(parts, false)
    if (!m) throw new Error(`avatar pieces could not be merged: ${key}`)
    g = m
    merged.set(key, g)
  }
  return g
}

/** Fresh copy of the skeleton's bones, in the skin's joint order. */
export function cloneBones(k: AvatarKit): { root: Bone; bones: Bone[]; byName: Map<string, Bone> } {
  const root = k.rootBone.clone(true) as Bone
  const byName = new Map<string, Bone>()
  root.traverse((o) => {
    if ((o as Bone).isBone) byName.set(o.name, o as Bone)
  })
  const bones = k.boneNames.map((n) => {
    const b = byName.get(n)
    if (!b) throw new Error(`avatar bone missing: ${n}`)
    return b
  })
  return { root, bones, byName }
}

const strides = new Map<string, number>()

/**
 * Ground distance one loop of a locomotion clip covers (metres, skeleton scale),
 * measured from how far a foot travels back and forth (a loop is ~2.2× that range:
 * two steps, each a little longer than the foot's sweep under the body).
 */
export function clipStride(k: AvatarKit, clip: AnimationClip): number {
  let d = strides.get(clip.name)
  if (d === undefined) {
    const holder = new Group()
    const { root, byName } = cloneBones(k)
    holder.add(root)
    const mixer = new AnimationMixer(holder)
    const action = mixer.clipAction(clip)
    action.play()
    const foot = byName.get('foot_l')
    let lo = Infinity
    let hi = -Infinity
    const v = new Vector3()
    for (let i = 0; i <= 32; i++) {
      action.time = (clip.duration * i) / 32
      mixer.update(0)
      holder.updateMatrixWorld(true)
      foot?.getWorldPosition(v)
      lo = Math.min(lo, v.z)
      hi = Math.max(hi, v.z)
    }
    mixer.stopAllAction()
    d = Math.max(0.3, (hi - lo) * 2.2)
    strides.set(clip.name, d)
  }
  return d
}
