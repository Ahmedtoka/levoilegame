// Distance gates with hysteresis, so things near a cut-off distance don't pop
// in and out every frame as the player (or they) move a few centimetres.

/**
 * Inside a distance gate: entering needs `d < limit`, leaving needs `d >= limit + margin`.
 * `wasIn` is the previous result for the same object.
 */
export function withinGate(wasIn: boolean, d: number, limit: number, margin: number): boolean {
  return d < (wasIn ? limit + margin : limit)
}

/**
 * Picks up to `max` nearest items that are also within `limit`, preferring the ones
 * already picked (they keep their slot until `margin` metres further or until
 * someone `margin` metres closer comes along). Returns a parallel array of flags.
 */
export function pickNearest(dist: readonly number[], was: readonly boolean[], max: number, limit: number, margin: number): boolean[] {
  const order = dist.map((_, i) => i).sort((a, b) => dist[a] - (was[a] ? margin : 0) - (dist[b] - (was[b] ? margin : 0)))
  const out = dist.map(() => false)
  let n = 0
  for (const i of order) {
    if (n >= max) break
    if (withinGate(was[i], dist[i], limit, margin)) {
      out[i] = true
      n++
    }
  }
  return out
}
