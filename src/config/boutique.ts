// Placement of sections, products and people inside the baked boutique
// (public/models/mall/store.glb, built by scripts/bake-store.mjs from
// EL_REBAT_Render.blend). Coordinates are three.js metres: the glass front is
// at z = +7.5, the back wall at z = -7.5, x runs -5 (left) .. +5 (right).
// Fixture positions come from store-anchors.json; edit here to rearrange.

import type { Pose, Rect } from './layout'

export type StationKind = 'stand' | 'easel'

export interface Station {
  section: string
  /** Area that counts as this section (zone banner, minimap). First match wins. */
  zone: Rect
  kind: StationKind
  /** stand: centre of the lookbook stand; easel: start of the row of cards. */
  x: number
  z: number
  /** Direction the display faces (yaw; 0 = facing +z / the entrance). */
  yaw: number
  /** Surface height for easels (table/gondola top). */
  surface?: number
  /** Easel row direction & spacing (local x of the row). */
  spacing?: number
  arrival: Pose
}

// Object yaw: the display's front (local +z) points to (sin yaw, 0, cos yaw).
const FACE_ENTRANCE = 0
const FACE_LEFT = -Math.PI / 2 // front points to -x
const FACE_RIGHT = Math.PI / 2 // front points to +x
// Player yaw: the player looks along (-sin yaw, 0, -cos yaw).
const LOOK_BACK = 0 // towards -z (into the store)
const LOOK_PX = -Math.PI / 2 // towards +x
const LOOK_NX = Math.PI / 2 // towards -x

export const BOUTIQUE = {
  modelUrl: '/models/mall/store.glb',
  anchorsUrl: '/models/mall/store-anchors.json',
  bounds: { x0: -5.2, z0: -7.7, x1: 5.2, z1: 9.6 } as Rect,
  /** Entrance area (zone "atrium" → labelled Entrance). */
  entrance: { x0: -5, z0: 4.7, x1: 5, z1: 9.6 } as Rect,
  spawn: { x: 0.2, z: 6.1, yaw: 0 } as Pose,
  cashier: {
    x: -0.3,
    z: -6.95,
    yaw: 0,
    zone: { x0: -2, z0: -7.5, x1: 1.4, z1: -5.55 } as Rect,
    approach: { x0: -1.9, z0: -5.5, x1: 1.35, z1: -4.1 } as Rect,
    arrival: { x: -0.3, z: -4.6, yaw: 0 } as Pose,
  },
  exit: {
    x: 0,
    z: 8.6,
    zone: { x0: -1.3, z0: 8.1, x1: 1.3, z1: 9.6 } as Rect,
    doors: { x0: -1.3, z0: 6.5, x1: 1.3, z1: 9.6 } as Rect,
    arrival: { x: 0, z: 5.6, yaw: Math.PI } as Pose,
  },
  /** Fitting rooms (zone only). */
  fitting: { x0: 1.4, z0: -7.5, x1: 5, z1: -4.6 } as Rect,
  stations: [
    {
      section: 'new-arrivals',
      zone: { x0: -2.7, z0: -2.1, x1: 0.15, z1: 0.2 },
      kind: 'easel',
      x: -0.12,
      z: -1.62,
      yaw: FACE_RIGHT,
      surface: 1.0,
      spacing: 0.33,
      arrival: { x: 0.75, z: -0.9, yaw: LOOK_NX },
    },
    {
      section: 'accessories',
      zone: { x0: -2.1, z0: 0.3, x1: -0.2, z1: 1.9 },
      kind: 'easel',
      x: -1.78,
      z: 1.62,
      yaw: FACE_ENTRANCE,
      surface: 0.96,
      spacing: 0.33,
      arrival: { x: -1.1, z: 3.0, yaw: LOOK_BACK },
    },
    {
      section: 'dresses',
      zone: { x0: 1.2, z0: 2.2, x1: 5, z1: 4.7 },
      kind: 'stand',
      x: 1.2,
      z: 3.5,
      yaw: FACE_LEFT,
      arrival: { x: -0.2, z: 3.4, yaw: LOOK_PX },
    },
    {
      section: 'sale',
      zone: { x0: 1.1, z0: -1.2, x1: 5, z1: 2.2 },
      kind: 'stand',
      x: 1.12,
      z: 0.15,
      yaw: FACE_LEFT,
      arrival: { x: -0.05, z: 0.3, yaw: LOOK_PX },
    },
    {
      section: 'denim',
      zone: { x0: 1.2, z0: -4.6, x1: 5, z1: -1.2 },
      kind: 'stand',
      x: 1.25,
      z: -3.1,
      yaw: FACE_LEFT,
      arrival: { x: 0.0, z: -3.0, yaw: LOOK_PX },
    },
    {
      section: 'everyday-wear',
      zone: { x0: -4.3, z0: 1.2, x1: -1.9, z1: 3.8 },
      kind: 'stand',
      x: -1.85,
      z: 2.55,
      yaw: FACE_RIGHT,
      arrival: { x: -0.4, z: 2.6, yaw: LOOK_NX },
    },
    {
      section: 'isdal',
      zone: { x0: -5, z0: -7.5, x1: -1.9, z1: -3.1 },
      kind: 'stand',
      x: -1.72,
      z: -4.55,
      yaw: FACE_RIGHT,
      arrival: { x: -0.4, z: -3.9, yaw: LOOK_NX - 0.35 },
    },
    {
      section: 'scarves',
      zone: { x0: -5, z0: 3.8, x1: -1.6, z1: 7.5 },
      kind: 'stand',
      x: -3.15,
      z: 4.7,
      yaw: FACE_RIGHT - 0.5,
      arrival: { x: -1.5, z: 5.3, yaw: LOOK_NX - 0.35 },
    },
    {
      section: 'inner-caps',
      zone: { x0: -5, z0: -3.1, x1: -2.7, z1: 1.2 },
      kind: 'stand',
      x: -3.45,
      z: -1.05,
      yaw: FACE_RIGHT - 0.35,
      arrival: { x: -2.0, z: -2.6, yaw: 2.39 },
    },
  ] as Station[],
  /** Spots for showcase models (products with modelOutfit), in priority order. */
  modelSpots: [
    { x: 4.05, z: 6.1, yaw: -0.9 }, // right window (replaces the baked mannequin)
    { x: -4.05, z: 6.08, yaw: 0.9 }, // left window
    { x: 2.55, z: 5.2, yaw: -0.5 },
    { x: -2.9, z: 5.95, yaw: 0.4 },
    { x: 2.0, z: -5.1, yaw: 0.2 },
    { x: 3.3, z: -5.1, yaw: -0.2 },
    { x: 3.85, z: 1.6, yaw: -1.4 },
    { x: -3.35, z: 0.45, yaw: 1.1 },
  ] as Pose[],
  staff: [
    { x: 1.75, z: 6.3, yaw: -0.6 }, // greeter by the door
    { x: -3.3, z: -2.4, yaw: 1.2 }, // left wall assistant
  ] as Pose[],
}
