// Night-mall theme (decided with the user on 2026-10-06, see
// docs/superpowers/specs/2026-10-06-mall-decor-swarm-brief.md):
// charcoal ceilings that vanish into darkness, cream walls washed by warm light,
// dark polished marble floors, bronze as the only metal, the 122 plum only as an accent.
//
// Every décor builder takes its colours from here. Agents may tune a value (and say so
// in their report); they must not add parallel hex literals for these roles elsewhere.

import { BRAND } from '../config/brand'

export const THEME = {
  // ---------------------------------------------------------------- surfaces
  /** Plaza, corridor and shop ceilings: matte charcoal. */
  ceiling: '#15120f',
  /** Recessed coffers / trays: a step darker than the ceiling. */
  ceilingCoffer: '#0f0d0b',
  /** Cream wall under the wall washes. */
  wall: '#e8dccb',
  /** Wall colour where it meets the ceiling (gradient / AO strip target). */
  wallShadow: '#5a4a3c',
  /** Dark oak wainscot and shop joinery. */
  oak: '#5b3f2a',
  /** Dark polished marble (Nero Marquina-like) floor base tone. */
  floor: '#1a1816',
  /** Floor veins (texture tint target). */
  floorVein: '#8c8580',
  /** Darker border band along the walls and around the medallion. */
  floorBorder: '#0f0e0d',
  /** Shop greige walls (slightly lighter than the mall walls, they are lit from closer). */
  shopWall: '#e3d8c8',

  // ------------------------------------------------------------------ metals
  /** The only metal: warm bronze. */
  bronze: '#8a6a3a',
  /** Bronze highlight / cap rails. */
  bronzeLight: '#b08a52',

  // ----------------------------------------------------------------- accents
  /** 122 plum, accent only: LED line under fascias, directory, medallion ring, seating. */
  plum: BRAND.magenta,
  plumDark: BRAND.magentaDark,

  // ------------------------------------------------------------------ lights
  /** Emissive light panels, slot lights, pendant globes (sRGB, pre-bloom). */
  warmLight: '#dcb98c',
  slotLight: '#e2c7a0',
  /** Floor light pools and wall washes (additive). */
  poolWarm: '#ffc98a',
  /** Night sky through the plaza skylight. */
  skyNight: '#0b1430',
  skyStar: '#dfe6ff',

  // ------------------------------------------------------------- atmosphere
  /** Scene background and fog: the far end of a corridor fades to this. */
  fog: '#0e0b09',
  fogNear: 30,
  fogFar: 95,

  // --------------------------------------------------------- material props
  roughness: { bronze: 0.35, floor: 0.18, wall: 0.9, oak: 0.55, ceiling: 0.95 },

  // ------------------------------------------------------------ light rig
  lighting: {
    /** scene.environment intensity (RoomEnvironment PMREM). */
    env: 0.18,
    hemiSky: '#ffd2a0',
    hemiGround: '#2a1f18',
    hemi: 0.45,
    sunColor: '#ffe0b8',
    sun: 0.28,
    exposure: 0.88,
  },
} as const

export type Theme = typeof THEME
