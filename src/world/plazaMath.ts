// Pure layout maths for the plaza stage area (no DOM, unit-tested).

export interface SeatPose {
  x: number
  z: number
  /** Yaw that turns local +z towards the focus point. */
  yaw: number
}

const facing = (x: number, z: number, cx: number, cz: number) => Math.atan2(cx - x, cz - z)

/**
 * Bench segments along concentric arcs in front of a focus (the stage screen).
 * The arc opens towards +z (the entrance); a centre aisle of `aisle` metres stays clear.
 */
export function arcSeats(cx: number, cz: number, radii: number[], halfArc: number, aisle: number, seg: number): SeatPose[] {
  const out: SeatPose[] = []
  for (const r of radii) {
    const aisleAng = aisle / 2 / r
    const n = Math.floor(((halfArc - aisleAng) * r) / seg)
    for (const side of [-1, 1])
      for (let i = 0; i < n; i++) {
        const a = side * (aisleAng + ((i + 0.5) * seg) / r)
        const x = cx + Math.sin(a) * r
        const z = cz + Math.cos(a) * r
        out.push({ x, z, yaw: facing(x, z, cx, cz) })
      }
  }
  return out
}

/** Standing spots for shoppers watching the stage, spread over ±spread radians. */
export function stageWatchSpots(cx: number, cz: number, r: number, n: number, spread: number): SeatPose[] {
  const out: SeatPose[] = []
  for (let i = 0; i < n; i++) {
    const a = n === 1 ? 0 : -spread + (2 * spread * i) / (n - 1)
    const x = cx + Math.sin(a) * r
    const z = cz + Math.cos(a) * r
    out.push({ x, z, yaw: facing(x, z, cx, cz) })
  }
  return out
}
