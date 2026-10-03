// Optional GLB characters. If public/models/characters/base.glb exists (a
// rigged, CC0 humanoid with a "Head" bone, e.g. Quaternius Universal Base
// Characters exported with Draco), models use it with the procedural hijab /
// hair attached to the head bone. Otherwise the procedural Character is used.
// See README → "Characters".

import { AnimationMixer, Box3, Group, Vector3, type AnimationClip, type Bone, type Object3D } from 'three'
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js'
import { Character, type Look } from './character'
import { buildHair, buildHijab } from './hijab'

export const BASE_CHARACTER_URL = '/models/characters/base.glb'

interface BaseAsset {
  scene: Group
  clips: AnimationClip[]
  height: number
}

let base: BaseAsset | null = null

/** Try to load the base character; resolves to false (and stays procedural) if it's missing. */
export async function preloadCharacterAsset(): Promise<boolean> {
  try {
    const head = await fetch(BASE_CHARACTER_URL, { method: 'HEAD' })
    if (!head.ok || !(head.headers.get('content-type') ?? '').match(/model|octet|gltf/)) return false
    // Loaders are only fetched when a character model actually exists.
    const [{ GLTFLoader }, { DRACOLoader }] = await Promise.all([
      import('three/addons/loaders/GLTFLoader.js'),
      import('three/addons/loaders/DRACOLoader.js'),
    ])
    const loader = new GLTFLoader()
    const draco = new DRACOLoader()
    draco.setDecoderPath('/draco/')
    loader.setDRACOLoader(draco)
    const gltf = await loader.loadAsync(BASE_CHARACTER_URL)
    const size = new Box3().setFromObject(gltf.scene).getSize(new Vector3())
    base = { scene: gltf.scene, clips: gltf.animations, height: size.y || 1.7 }
    return true
  } catch (err) {
    console.info('[characters] base.glb not used:', err)
    return false
  }
}

/**
 * GLB-backed character that keeps the Character API the game uses
 * (root, hitbox, update, wave, lookTarget, setOutfitColors).
 */
class GlbCharacter extends Character {
  private readonly mixer: AnimationMixer

  constructor(look: Look, seed: number, asset: BaseAsset) {
    super(look, seed)
    // Hide the procedural body but keep the hitbox / shadow from the base class.
    for (const child of [...this.root.children]) {
      if (child !== this.hitbox && !(child as { isMesh?: boolean }).isMesh) child.visible = false
    }
    const model = cloneSkinned(asset.scene) as Object3D
    model.scale.setScalar((1.66 * (look.height ?? 1)) / asset.height)
    this.root.add(model)
    let headBone: Bone | null = null
    let neckBone: Bone | null = null
    model.traverse((o) => {
      const b = o as Bone
      if (!b.isBone) return
      if (!headBone && /head/i.test(b.name) && !/end|top/i.test(b.name)) headBone = b
      if (!neckBone && /neck/i.test(b.name)) neckBone = b
    })
    const wear = look.head.kind === 'hijab' ? buildHijab(look.head.color, look.head.style, look.head.accent) : buildHair(look.head.color, look.head.style)
    // Headwear is authored in metres; undo the bone's world scale.
    const attach = (bone: Bone | null, obj: Object3D) => {
      if (!bone) return
      model.updateMatrixWorld(true)
      const s = bone.getWorldScale(new Vector3()).x || 1
      obj.scale.setScalar(1 / s)
      bone.add(obj)
    }
    attach(headBone, wear.cap)
    attach(neckBone ?? headBone, wear.drape)
    this.mixer = new AnimationMixer(model)
    const idle = asset.clips.find((c) => /idle/i.test(c.name)) ?? asset.clips[0]
    if (idle) this.mixer.clipAction(idle).play().time = seed % (idle.duration || 1)
  }

  override update(dt: number, t: number): void {
    this.mixer.update(dt)
    void t
  }
}

export function createCharacter(look: Look, seed: number): Character {
  return base ? new GlbCharacter(look, seed, base) : new Character(look, seed)
}
