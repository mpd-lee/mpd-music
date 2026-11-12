'use client'

import { useTexture } from '@react-three/drei'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import type { GraphicsTier } from '@/lib/graphics-quality'

/**
 * One continuous equirectangular 360-degree environment replaces the old
 * front/rear photo panels. The centre of the panorama is rotated toward the
 * studio's ocean-facing -Z side so its trees wrap around both flanks and rear.
 */
export function CoastalPanorama({ quality }: { quality: GraphicsTier }) {
  const texture = useTexture(
    quality === 'mobile'
      ? '/images/mpd-coastal-world-seamless-mobile.webp'
      : '/images/mpd-coastal-world-seamless.webp',
  )
  const geometry = useMemo(() => new THREE.SphereGeometry(420, 72, 48), [])

  useEffect(() => {
    texture.colorSpace = THREE.SRGBColorSpace
    texture.wrapS = THREE.RepeatWrapping
    texture.wrapT = THREE.ClampToEdgeWrapping
    texture.anisotropy = quality === 'mobile' ? 4 : quality === 'balanced' ? 8 : 12
    texture.generateMipmaps = true
    texture.minFilter = THREE.LinearMipmapLinearFilter
    texture.magFilter = THREE.LinearFilter
    texture.needsUpdate = true
  }, [texture, quality])

  return (
    <mesh
      geometry={geometry}
      rotation={[0, Math.PI / 2, 0]}
      renderOrder={-1000}
      frustumCulled={false}
      raycast={() => null}
    >
      <meshBasicMaterial
        map={texture}
        side={THREE.BackSide}
        toneMapped={false}
        depthWrite={false}
        fog={false}
      />
    </mesh>
  )
}
