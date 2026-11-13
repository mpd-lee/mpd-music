import * as THREE from 'three'

/**
 * A small one-dimensional alpha map. Three.js alphaMap reads its green channel.
 * Both ends fade smoothly to zero so photo-backed horizon arcs blend into the
 * procedural sky and nearby 3D foliage instead of producing a visible seam.
 */
export function createHorizontalEdgeFadeTexture(width = 256, fadeFraction = 0.13): THREE.DataTexture {
  const safeWidth = Math.max(16, Math.floor(width))
  const data = new Uint8Array(safeWidth * 4)
  for (let x = 0; x < safeWidth; x += 1) {
    const u = x / (safeWidth - 1)
    const edgeDistance = Math.min(u, 1 - u)
    const t = Math.max(0, Math.min(1, edgeDistance / Math.max(0.001, fadeFraction)))
    const fade = t * t * (3 - 2 * t)
    const value = Math.round(fade * 255)
    const offset = x * 4
    data[offset] = value
    data[offset + 1] = value
    data[offset + 2] = value
    data[offset + 3] = 255
  }
  const texture = new THREE.DataTexture(data, safeWidth, 1, THREE.RGBAFormat)
  texture.wrapS = THREE.ClampToEdgeWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  texture.magFilter = THREE.LinearFilter
  texture.minFilter = THREE.LinearFilter
  texture.generateMipmaps = false
  texture.needsUpdate = true
  return texture
}
