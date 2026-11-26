/**
 * Shared coastal height field. The lawn stays close to studio floor level and
 * slopes gently to a low shoreline; the water plane then hides the lower rock
 * shell so the pavilion reads as part of a grounded coastal headland.
 */
export const ISLAND_WALK_RADIUS = 116.5
export const ISLAND_COAST_RADIUS = 146
export const ISLAND_SEA_LEVEL = -2.25

const smoothstep = (edge0: number, edge1: number, value: number) => {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

/** Irregular shoreline with broad natural bays rather than a perfect circle. */
export function getIslandEdgeRadius(angle: number) {
  // Local -Z is the ocean-facing front after Outdoor's 180-degree rotation.
  // Bring only the frontal shoreline closer to create one open beach bay;
  // left, right and rear remain continuous land backed by a forest belt.
  const frontAngle = -Math.PI / 2
  const delta = Math.atan2(Math.sin(angle - frontAngle), Math.cos(angle - frontAngle))
  const frontWeight = Math.exp(-Math.pow(delta / 0.78, 4))
  const naturalVariation = Math.sin(angle * 2.7 + 0.45) * 5.2
    + Math.sin(angle * 6.3 - 0.8) * 2.5
    + Math.sin(angle * 10.7 + 1.1) * 1.1
  return ISLAND_COAST_RADIUS - frontWeight * 29 + naturalVariation
}

export function getIslandGroundHeight(x: number, z: number) {
  const radius = Math.hypot(x, z)
  const angle = Math.atan2(z, x)
  const localCoastRadius = getIslandEdgeRadius(angle)
  const rolling = (
    Math.sin(x * 0.105 + Math.cos(z * 0.047)) * 0.035
    + Math.cos(z * 0.12 - x * 0.035) * 0.028
    + Math.sin((x + z) * 0.19) * 0.014
  )

  // The pavilion sits on the same broad landform as the surrounding meadow.
  // A wide, nearly level lawn delays the shoreline so the camera sees grass and
  // forest around the entire property instead of water immediately beyond it.
  const frontAngle = -Math.PI / 2
  const delta = Math.atan2(Math.sin(angle - frontAngle), Math.cos(angle - frontAngle))
  const frontWeight = Math.exp(-Math.pow(delta / 0.72, 4))
  const slopeStart = 82 - frontWeight * 7
  if (radius <= slopeStart) return -0.025 + rolling

  const coastT = smoothstep(slopeStart, localCoastRadius, radius)
  if (radius <= localCoastRadius + 0.5) {
    const longWave = Math.sin(x * 0.028 + z * 0.012) * 0.022
      + Math.cos(z * 0.031 - x * 0.019) * 0.018
    return -0.025 + (ISLAND_SEA_LEVEL + 0.025) * coastT + rolling * (1 - coastT) * 0.68 + longWave * coastT
  }

  return ISLAND_SEA_LEVEL
}
