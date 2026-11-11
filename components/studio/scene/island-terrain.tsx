'use client'

import { useTexture } from '@react-three/drei'
import { useMemo } from 'react'
import * as THREE from 'three'
import type { ThreeEvent } from '@react-three/fiber'
import type { GraphicsTier } from '@/lib/graphics-quality'
import { getIslandEdgeRadius, getIslandGroundHeight } from '@/lib/island-terrain'

const noRaycast = () => null

type ClickHandler = (event: ThreeEvent<MouseEvent>) => void

function buildIslandSurface(quality: GraphicsTier) {
  const segments = quality === 'mobile' ? 64 : quality === 'balanced' ? 88 : 128
  const rings = quality === 'mobile' ? 28 : quality === 'balanced' ? 36 : 48
  const positions: number[] = [0, getIslandGroundHeight(0, 0), 0]
  const uvs: number[] = [0.5, 0.5]
  const colors: number[] = [0.93, 0.96, 0.88]
  const indices: number[] = []
  const ringRanges: { start: number; count: number; material: number }[] = []

  for (let ring = 1; ring <= rings; ring += 1) {
    const t = ring / rings
    for (let segment = 0; segment < segments; segment += 1) {
      const angle = (segment / segments) * Math.PI * 2
      const edge = getIslandEdgeRadius(angle)
      const radius = t * edge
      const x = Math.cos(angle) * radius
      const z = Math.sin(angle) * radius
      const y = getIslandGroundHeight(x, z)
      positions.push(x, y, z)
      uvs.push((x + 100) / 200, (z + 100) / 200)

      // Keep the whole upper island meadow continuous: no pale circular sand/stone band
      // that can read as an artificial white road from a distance.
      const edgeShade = THREE.MathUtils.smoothstep(radius, 66, 86)
      const variation = 0.965 + 0.035 * Math.sin(angle * 8.3 + radius * 0.19) * Math.cos(radius * 0.11)
      const red = (0.91 - edgeShade * 0.12) * variation
      const green = (0.98 - edgeShade * 0.15) * variation
      const blue = (0.82 - edgeShade * 0.12) * variation
      colors.push(red, green, blue)
    }
  }

  // Fan from the center to the first ring, then stitch every subsequent ring.
  const firstStart = indices.length
  for (let s = 0; s < segments; s += 1) {
    const a = 1 + s
    const b = 1 + ((s + 1) % segments)
    indices.push(0, b, a)
  }
  ringRanges.push({ start: firstStart, count: indices.length - firstStart, material: 0 })

  for (let ring = 1; ring < rings; ring += 1) {
    const start = indices.length
    const inner = 1 + (ring - 1) * segments
    const outer = 1 + ring * segments
    for (let s = 0; s < segments; s += 1) {
      const next = (s + 1) % segments
      const a = inner + s
      const b = inner + next
      const c = outer + s
      const d = outer + next
      indices.push(a, b, c, b, d, c)
    }
    // Every upper ring uses the same grass material, so no white/sand strip forms at the edge.
    ringRanges.push({ start, count: indices.length - start, material: 0 })
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geometry.setIndex(indices)
  ringRanges.forEach((range) => geometry.addGroup(range.start, range.count, range.material))
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()
  return geometry
}

function buildIslandCliff(quality: GraphicsTier) {
  const segments = quality === 'mobile' ? 64 : quality === 'balanced' ? 88 : 128
  // A stepped-in, tapering bedrock shell ties the island top to a deep solid mass.
  // The bottom closes well below the visible coast so the studio never reads as a floating bowl.
  const levels = quality === 'mobile'
    ? [{ drop: 0, inset: 0 }, { drop: -3.2, inset: -0.6 }, { drop: -8.5, inset: -2.4 }, { drop: -17, inset: -6.5 }, { drop: -29, inset: -15 }, { drop: -43, inset: -27 }, { drop: -56, inset: -42 }]
    : [{ drop: 0, inset: 0 }, { drop: -2.8, inset: -0.45 }, { drop: -6.8, inset: -1.8 }, { drop: -13.5, inset: -4.5 }, { drop: -22, inset: -9.5 }, { drop: -33, inset: -18 }, { drop: -46, inset: -30 }, { drop: -60, inset: -45 }]
  const positions: number[] = []
  const uvs: number[] = []
  const colors: number[] = []
  const indices: number[] = []

  levels.forEach((level, levelIndex) => {
    for (let segment = 0; segment < segments; segment += 1) {
      const angle = (segment / segments) * Math.PI * 2
      const edge = getIslandEdgeRadius(angle)
      const irregular = Math.sin(angle * 17.0 + levelIndex * 1.7) * 0.55 + Math.cos(angle * 9.0 - levelIndex) * 0.28
      const radius = Math.max(2, edge + level.inset + irregular * (levelIndex === 0 ? 0.15 : 0.65))
      const x = Math.cos(angle) * radius
      const z = Math.sin(angle) * radius
      const y = getIslandGroundHeight(Math.cos(angle) * edge, Math.sin(angle) * edge) + level.drop
      positions.push(x, y, z)
      uvs.push(segment / segments * 8, levelIndex / Math.max(1, levels.length - 1) * 4)
      const strata = 0.82 + 0.12 * Math.sin(angle * 18 + levelIndex * 1.8) + 0.06 * Math.cos(angle * 31 - levelIndex)
      const warmth = levelIndex % 2 === 0 ? 1 : 0.92
      const depthShade = 1 - levelIndex * 0.035
      colors.push(0.78 * strata * warmth * depthShade, 0.76 * strata * warmth * depthShade, 0.69 * strata * depthShade)
    }
  })

  for (let level = 0; level < levels.length - 1; level += 1) {
    for (let segment = 0; segment < segments; segment += 1) {
      const next = (segment + 1) % segments
      const a = level * segments + segment
      const b = level * segments + next
      const c = (level + 1) * segments + segment
      const d = (level + 1) * segments + next
      indices.push(a, c, b, b, c, d)
    }
  }

  // Close the lower shell with a triangular cap below the visible ocean line.
  const capIndex = positions.length / 3
  positions.push(0, -63, 0)
  uvs.push(0.5, 0.5)
  colors.push(0.42, 0.42, 0.4)
  const lastRing = (levels.length - 1) * segments
  for (let segment = 0; segment < segments; segment += 1) {
    const next = (segment + 1) % segments
    indices.push(lastRing + segment, capIndex, lastRing + next)
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()
  return geometry
}

function buildCliffTexture() {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 512
  const context = canvas.getContext('2d')
  if (!context) return null
  context.fillStyle = '#8a8173'
  context.fillRect(0, 0, 512, 512)
  let seed = 1731
  const random = () => {
    seed = (seed * 16807) % 2147483647
    return (seed - 1) / 2147483646
  }
  for (let i = 0; i < 12000; i += 1) {
    const x = random() * 512
    const y = random() * 512
    const shade = Math.round(92 + random() * 95)
    const alpha = 0.06 + random() * 0.2
    context.fillStyle = `rgba(${shade},${shade - 5},${shade - 13},${alpha})`
    context.fillRect(x, y, 1 + random() * 6, 1 + random() * 3)
  }
  for (let i = 0; i < 70; i += 1) {
    const x = random() * 512
    const y = random() * 512
    context.strokeStyle = `rgba(45,42,37,${0.05 + random() * 0.12})`
    context.lineWidth = 1 + random() * 2
    context.beginPath()
    context.moveTo(x, y)
    context.lineTo(x + (random() - 0.5) * 35, y + 4 + random() * 22)
    context.stroke()
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.colorSpace = THREE.SRGBColorSpace
  texture.repeat.set(5, 2)
  texture.anisotropy = 4
  return texture
}

export function IslandTerrain({ quality, onPathClick }: { quality: GraphicsTier; onPathClick: ClickHandler }) {
  const grass = useTexture(quality === 'mobile' ? '/images/mpd-natural-grass-mobile.webp' : '/images/mpd-natural-grass.webp')
  const topGeometry = useMemo(() => buildIslandSurface(quality), [quality])
  const cliffGeometry = useMemo(() => buildIslandCliff(quality), [quality])
  const cliffTexture = useMemo(() => buildCliffTexture(), [])

  grass.colorSpace = THREE.SRGBColorSpace
  grass.wrapS = THREE.RepeatWrapping
  grass.wrapT = THREE.RepeatWrapping
  grass.repeat.set(quality === 'mobile' ? 13 : 18, quality === 'mobile' ? 13 : 18)
  grass.anisotropy = quality === 'mobile' ? 2 : quality === 'balanced' ? 4 : 8
  grass.needsUpdate = true

  const materials = useMemo(() => [
    new THREE.MeshStandardMaterial({ map: grass, roughness: 1, metalness: 0, vertexColors: true }),
  ], [grass])
  const cliffMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    map: cliffTexture ?? undefined,
    color: '#ffffff',
    roughness: 0.98,
    metalness: 0,
    vertexColors: true,
    side: THREE.DoubleSide,
  }), [cliffTexture])

  return (
    <group>
      {/* The island is one continuous radial landform, not a rectangular grass plane. */}
      <mesh geometry={topGeometry} material={materials} receiveShadow onClick={onPathClick} />
      <mesh geometry={cliffGeometry} material={cliffMaterial} raycast={noRaycast} receiveShadow />
      {/* Ocean occupies only the forward 180-degree coast. The rear hemisphere remains land/forest. */}
      <mesh position={[0, -25.2, 0]} rotation-x={-Math.PI / 2} raycast={noRaycast}>
        <circleGeometry args={[1600, quality === 'mobile' ? 48 : 96, Math.PI, Math.PI]} />
        <meshBasicMaterial color="#286f8a" toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}
