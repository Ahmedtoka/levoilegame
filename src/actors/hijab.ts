// Procedural headwear. Split into a "cap" (follows the head bone) and a
// "drape" (follows the neck/chest) so it works on the procedural rig and on
// any skinned GLB that has Head / Neck bones.

import {
  BoxGeometry,
  CapsuleGeometry,
  DoubleSide,
  Group,
  LatheGeometry,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  Vector2,
} from 'three'

export type HijabStyle = 'classic' | 'long' | 'wrap'
export type HairStyle = 'bun' | 'ponytail' | 'long' | 'bob'

const FACE_HALF = 0.95 // half-width of the face opening (radians)
const PHI0 = Math.PI / 2 + FACE_HALF
const PHI_LEN = Math.PI * 2 - FACE_HALF * 2

// Shared geometries (head-local units; head sphere radius ≈ 0.105).
const G = {
  capTop: new SphereGeometry(0.124, 22, 10, 0, Math.PI * 2, 0, 1.22),
  capSides: new SphereGeometry(0.124, 22, 12, PHI0, PHI_LEN, 1.18, 1.62),
  band: new SphereGeometry(0.1215, 22, 3, 0, Math.PI * 2, 1.08, 0.16),
  drapeClassic: lathe([
    [0.075, 0.2],
    [0.085, 0.12],
    [0.11, 0.05],
    [0.17, 0.0],
    [0.235, -0.05],
    [0.255, -0.11],
    [0.24, -0.14],
  ]),
  drapeLong: lathe([
    [0.075, 0.2],
    [0.085, 0.12],
    [0.12, 0.05],
    [0.19, 0.0],
    [0.245, -0.07],
    [0.255, -0.2],
    [0.245, -0.36],
    [0.235, -0.46],
  ]),
  tail: new BoxGeometry(0.11, 0.42, 0.025),
  hairTop: new SphereGeometry(0.113, 20, 10, 0, Math.PI * 2, 0, 1.45),
  hairBack: new SphereGeometry(0.113, 20, 8, PHI0 + 0.25, PHI_LEN - 0.5, 1.4, 0.9),
  hairBob: new SphereGeometry(0.118, 20, 10, PHI0 + 0.1, PHI_LEN - 0.2, 1.3, 1.0),
  bun: new SphereGeometry(0.058, 12, 10),
  pony: new CapsuleGeometry(0.035, 0.2, 4, 8),
  longHair: new CapsuleGeometry(0.1, 0.24, 4, 10),
}

function lathe(pts: [number, number][]): LatheGeometry {
  return new LatheGeometry(
    pts.map(([r, y]) => new Vector2(r, y)),
    24,
  )
}

const fabricCache = new Map<string, MeshStandardMaterial>()
export function fabric(color: string, roughness = 0.9): MeshStandardMaterial {
  const key = `${color}|${roughness}`
  let m = fabricCache.get(key)
  if (!m) {
    m = new MeshStandardMaterial({ color, roughness, side: DoubleSide })
    fabricCache.set(key, m)
  }
  return m
}

export interface Headwear {
  /** Attach to the head bone; origin = head centre. */
  cap: Group
  /** Attach to the neck base / upper chest; origin = base of the neck. */
  drape: Group
}

export function buildHijab(color: string, style: HijabStyle, accent?: string): Headwear {
  const mat = fabric(color)
  const cap = new Group()
  const top = new Mesh(G.capTop, mat)
  const sides = new Mesh(G.capSides, mat)
  for (const m of [top, sides]) {
    m.scale.set(0.97, 1.12, 1.04)
    cap.add(m)
  }
  if (accent) {
    const band = new Mesh(G.band, fabric(accent))
    band.scale.set(0.97, 1.12, 1.04)
    cap.add(band)
  }

  const drape = new Group()
  const body = new Mesh(style === 'long' ? G.drapeLong : G.drapeClassic, mat)
  body.scale.set(1, 1, 0.78)
  drape.add(body)
  if (style === 'wrap') {
    const tail = new Mesh(G.tail, mat)
    tail.position.set(-0.11, -0.16, 0.16)
    tail.rotation.set(-0.25, 0, 0.18)
    drape.add(tail)
  }
  return { cap, drape }
}

export function buildHair(color: string, style: HairStyle): Headwear {
  const mat = fabric(color, 0.7)
  const cap = new Group()
  const top = new Mesh(G.hairTop, mat)
  top.scale.set(0.97, 1.1, 1.04)
  top.position.y = 0.006
  cap.add(top)
  if (style === 'bob') {
    const bob = new Mesh(G.hairBob, mat)
    bob.scale.set(1, 1.1, 1.04)
    cap.add(bob)
  } else {
    const back = new Mesh(G.hairBack, mat)
    back.scale.set(0.98, 1.1, 1.05)
    cap.add(back)
  }
  if (style === 'bun') {
    const bun = new Mesh(G.bun, mat)
    bun.position.set(0, 0.1, -0.1)
    cap.add(bun)
  } else if (style === 'ponytail') {
    const p = new Mesh(G.pony, mat)
    p.position.set(0, 0.0, -0.15)
    p.rotation.x = 0.35
    cap.add(p)
  } else if (style === 'long') {
    const l = new Mesh(G.longHair, mat)
    l.scale.set(1.15, 1, 0.45)
    l.position.set(0, -0.12, -0.07)
    cap.add(l)
  }
  return { cap, drape: new Group() }
}
