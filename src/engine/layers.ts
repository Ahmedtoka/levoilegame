/**
 * Render layer for floor-level overlays (AO strips, light pools, contact
 * shadows). The main camera enables it; the floor Reflector's virtual camera
 * only sees layer 0, so the mirror pass skips these draws.
 */
export const FLOOR_FX_LAYER = 1
