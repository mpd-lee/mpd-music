/** Shared height function for the coastal island surface and avatar ground alignment. */
export const ISLAND_WALK_RADIUS = 75
export const ISLAND_COAST_RADIUS = 86

const smoothstep = (edge0: number, edge1: number, value: number) => {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

export function getIslandEdgeRadius(angle: number) {
  return 86
    + Math.sin(angle * 3 + 0.45) * 4.1
    + Math.sin(angle * 7 - 0.8) * 2.0
    + Math.sin(angle * 11 + 1.1) * 0.85
}

export function getIslandGroundHeight(x: number, z: number) {
  const radius = Math.hypot(x, z)
  const rolling = (
    Math.sin(x * 0.105 + Math.cos(z * 0.047)) * 0.045
    + Math.cos(z * 0.12 - x * 0.035) * 0.035
    + Math.sin((x + z) * 0.19) * 0.018
  )

  // A broad walkable lawn surrounds the pavilion and pool; the final 10m rise into a rocky coast.
  if (radius <= 48) return -0.12 + rolling
  if (radius <= 62) {
    const t = smoothstep(48, 62, radius)
    return -0.12 - 0.25 * t + rolling
  }
  if (radius <= 76) {
    const t = smoothstep(62, 76, radius)
    return -0.37 - 2.0 * t + rolling * 1.5
  }
  if (radius <= ISLAND_COAST_RADIUS) {
    const t = smoothstep(76, ISLAND_COAST_RADIUS, radius)
    return -2.37 - 15.5 * t + rolling * 2.2
  }
  return -18
}
