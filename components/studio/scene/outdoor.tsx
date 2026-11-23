'use client'

import { Html, RoundedBox, useTexture } from '@react-three/drei'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { createBarkTexture } from '@/lib/textures'
import { getIslandEdgeRadius, getIslandGroundHeight, ISLAND_SEA_LEVEL } from '@/lib/island-terrain'
import { IslandTerrain } from './island-terrain'
import type { GraphicsTier } from '@/lib/graphics-quality'
import { CLICK_DRAG_TOLERANCE, Interactive } from './interactive'
import type { FitnessKind } from '@/lib/studio-interactions'

export const SUN_POSITION: [number, number, number] = [70, 45, 90]
const noRaycast = () => null
const UP = new THREE.Vector3(0, 1, 0)

// The front photo and forest panorama share one measured backdrop frame.
// Their equal height/centre prevents a visible vertical ledge at the photo edge.
const BACKDROP_WIDTH = 430
const BACKDROP_HEIGHT = 215
const BACKDROP_CENTER_Y = 22
const BACKDROP_RADIUS = 210
const FRONT_BAY_HALF_ANGLE = Math.PI / 4


type SeatHandler = (position: [number, number, number], rotationY: number) => void

/**
 * A 3D water shelf fills the space between the irregular island coast and the
 * panoramic backdrop. Its inner edge follows the exact same shoreline
 * function as the land mesh, so the grass does not end at a raised cliff.
 */
function createCoastalWaterRingGeometry(quality: GraphicsTier) {
  // Outdoor is rotated by 180 degrees, so local -Z is the visitor-facing coastline.
  // Water occupies only this front bay; the other 260+ degrees remain green land/forest.
  const around = quality === 'mobile' ? 72 : quality === 'balanced' ? 112 : 144
  const radial = quality === 'mobile' ? 4 : 6
  const outerRadius = 202
  const halfAngle = 0.70
  const centerAngle = -Math.PI / 2
  const positions: number[] = []
  const colors: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  const shallow = new THREE.Color('#57c4cb')
  const lagoon = new THREE.Color('#1689a3')
  const deep = new THREE.Color('#075071')
  const smooth = (a: number, b: number, x: number) => {
    const v = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1)
    return v * v * (3 - 2 * v)
  }

  for (let ring = 0; ring <= radial; ring += 1) {
    const t = ring / radial
    for (let segment = 0; segment <= around; segment += 1) {
      const offset = (segment / around) * 2 * halfAngle - halfAngle
      const angle = centerAngle + offset
      const shore = getIslandEdgeRadius(angle) + 0.42
      // Taper the two ends of the bay into rocky headlands instead of leaving a straight water cut.
      const edgeFade = smooth(halfAngle - 0.23, halfAngle, Math.abs(offset))
      const localFarRadius = THREE.MathUtils.lerp(outerRadius, shore + 18, edgeFade)
      const radius = shore + (localFarRadius - shore) * t
      const x = Math.cos(angle) * radius
      const z = Math.sin(angle) * radius
      const wave = Math.sin(angle * 6.0 + radius * 0.045) * 0.014
        + Math.cos(angle * 11.0 - radius * 0.025) * 0.009
      positions.push(x, wave, z)
      const color = t < 0.28
        ? shallow.clone().lerp(lagoon, t / 0.28)
        : lagoon.clone().lerp(deep, (t - 0.28) / 0.72)
      const glint = (Math.sin(angle * 13 + radius * 0.11) + Math.cos(angle * 7 - radius * 0.07)) * 0.012
      color.offsetHSL(0, 0, glint)
      colors.push(color.r, color.g, color.b)
      uvs.push(t, segment / around)
    }
  }

  for (let ring = 0; ring < radial; ring += 1) {
    for (let segment = 0; segment < around; segment += 1) {
      const a = ring * (around + 1) + segment
      const b = a + 1
      const c = (ring + 1) * (around + 1) + segment
      const d = c + 1
      indices.push(a, b, c, b, d, c)
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  geometry.userData.basePositions = new Float32Array(positions)
  return geometry
}

function createCoastEdgeBlend(source: THREE.Texture, quality: GraphicsTier) {
  if (typeof document === 'undefined') return source
  const image = source.image as HTMLImageElement
  const sourceWidth = image?.naturalWidth || image?.width || 0
  const sourceHeight = image?.naturalHeight || image?.height || 0
  if (!sourceWidth || !sourceHeight) return source

  // Keep the original photo framing and resolution on desktop. On mobile,
  // downsample once to keep the entry scene light.
  const width = Math.min(sourceWidth, quality === 'mobile' ? 1024 : sourceWidth)
  const height = Math.max(1, Math.round(width * sourceHeight / sourceWidth))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) return source
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(image, 0, 0, width, height)

  // The coastal photo now sits on a curved 90-degree bay segment that shares
  // the forest shell's cylindrical projection. A transparent alpha feather blends
  // the two photographs at the same radius; it does not blur or repaint either image.
  const fadeWidth = 0.045
  const alpha = context.createLinearGradient(0, 0, width, 0)
  alpha.addColorStop(0, 'rgba(0,0,0,0)')
  alpha.addColorStop(fadeWidth * 0.22, 'rgba(0,0,0,0.12)')
  alpha.addColorStop(fadeWidth * 0.62, 'rgba(0,0,0,0.76)')
  alpha.addColorStop(fadeWidth, 'rgba(0,0,0,1)')
  alpha.addColorStop(1 - fadeWidth, 'rgba(0,0,0,1)')
  alpha.addColorStop(1 - fadeWidth * 0.62, 'rgba(0,0,0,0.76)')
  alpha.addColorStop(1 - fadeWidth * 0.22, 'rgba(0,0,0,0.12)')
  alpha.addColorStop(1, 'rgba(0,0,0,0)')
  context.globalCompositeOperation = 'destination-in'
  context.fillStyle = alpha
  context.fillRect(0, 0, width, height)

  const blended = new THREE.CanvasTexture(canvas)
  blended.colorSpace = THREE.SRGBColorSpace
  blended.wrapS = THREE.ClampToEdgeWrapping
  blended.wrapT = THREE.ClampToEdgeWrapping
  // CylinderGeometry's theta increases from the screen-right edge to screen-left.
  // Mirror U so the original coastal photograph keeps its natural left-to-right order.
  blended.repeat.x = -1
  blended.offset.x = 1
  blended.anisotropy = quality === 'mobile' ? 2 : 12
  blended.minFilter = THREE.LinearMipmapLinearFilter
  blended.magFilter = THREE.LinearFilter
  blended.generateMipmaps = true
  blended.needsUpdate = true
  return blended
}

function PhotoSeaRipple({ quality }: { quality: GraphicsTier }) {
  // Moving specular highlights follow the same curved bay as the photo.
  // The original photograph remains unchanged underneath this transparent shader.
  const uniforms = useMemo(() => ({ uTime: { value: 0 } }), [])
  const geometry = useMemo(() => new THREE.CylinderGeometry(
    BACKDROP_RADIUS - 1.12,
    BACKDROP_RADIUS - 1.12,
    BACKDROP_HEIGHT,
    quality === 'mobile' ? 48 : 88,
    1,
    true,
    Math.PI - FRONT_BAY_HALF_ANGLE,
    FRONT_BAY_HALF_ANGLE * 2,
  ), [quality])
  useEffect(() => () => geometry.dispose(), [geometry])
  useFrame((state) => { uniforms.uTime.value = state.clock.elapsedTime })
  return (
    <mesh geometry={geometry} position={[0, BACKDROP_CENTER_Y, 0]} raycast={noRaycast} renderOrder={-89} frustumCulled={false}>
      <shaderMaterial
        transparent
        depthWrite={false}
        toneMapped={false}
        side={THREE.DoubleSide}
        uniforms={uniforms}
        vertexShader={`
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `}
        fragmentShader={`
          uniform float uTime;
          varying vec2 vUv;
          void main() {
            float imageY = 1.0 - vUv.y;
            float waterBand = smoothstep(0.485, 0.515, imageY) * (1.0 - smoothstep(0.695, 0.755, imageY));
            float openWater = smoothstep(0.16, 0.25, vUv.x) * (1.0 - smoothstep(0.76, 0.86, vUv.x));
            float waveA = sin(vUv.y * 510.0 + sin(vUv.x * 34.0 + uTime * 0.18) * 1.7 + uTime * 0.62);
            float waveB = sin(vUv.y * 285.0 - vUv.x * 17.0 - uTime * 0.27);
            float crest = pow(max(0.0, waveA), 17.0) * 0.060 + pow(max(0.0, waveB), 23.0) * 0.026;
            float shimmer = 0.007 + 0.0045 * (0.5 + 0.5 * sin(uTime * 0.22 + vUv.x * 8.0 + vUv.y * 24.0));
            float alpha = (crest + shimmer) * waterBand * openWater;
            gl_FragColor = vec4(vec3(0.76, 0.93, 0.98), alpha);
          }
        `}
      />
    </mesh>
  )
}

function FrontCoastalBackdrop({ quality }: { quality: GraphicsTier }) {
  const source = useTexture(quality === 'mobile' ? '/images/mpd-front-coastal-bay-mobile.webp' : '/images/mpd-front-coastal-bay.webp')
  const image = useMemo(() => createCoastEdgeBlend(source, quality), [source, quality])
  const geometry = useMemo(() => new THREE.CylinderGeometry(
    BACKDROP_RADIUS - 0.82,
    BACKDROP_RADIUS - 0.82,
    BACKDROP_HEIGHT,
    quality === 'mobile' ? 48 : 88,
    1,
    true,
    Math.PI - FRONT_BAY_HALF_ANGLE,
    FRONT_BAY_HALF_ANGLE * 2,
  ), [quality])
  useEffect(() => () => {
    if (image !== source) image.dispose()
    geometry.dispose()
  }, [image, source, geometry])
  return (
    <>
      <mesh geometry={geometry} position={[0, BACKDROP_CENTER_Y, 0]} raycast={noRaycast} renderOrder={-90} frustumCulled={false}>
        <meshBasicMaterial map={image} transparent toneMapped={false} fog={false} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <PhotoSeaRipple quality={quality} />
    </>
  )
}

function createGreenForestTexture(source: THREE.Texture, coastSource: THREE.Texture, quality: GraphicsTier) {
  if (typeof document === 'undefined') return source
  const image = source.image as HTMLImageElement
  const coastImage = coastSource.image as HTMLImageElement
  const sourceWidth = image?.naturalWidth || image?.width || 0
  const sourceHeight = image?.naturalHeight || image?.height || 0
  const coastWidth = coastImage?.naturalWidth || coastImage?.width || 0
  const coastHeight = coastImage?.naturalHeight || coastImage?.height || 0
  if (!sourceWidth || !sourceHeight || !coastWidth || !coastHeight) return source

  const maxWidth = quality === 'mobile' ? 1024 : 2048
  const width = Math.min(sourceWidth, maxWidth)
  // Both backdrops use a 2:1 frame. Match that frame exactly instead of
  // stretching the 1.79:1 forest original vertically to fit the cylinder.
  const height = Math.max(1, Math.round(width / 2))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return source

  // Crop only the narrow damaged side pixels, then centre-crop vertically to
  // the exact 2:1 projection used by the front bay. This prevents the forest
  // panorama from being stretched wider than its source photograph.
  const cropX = Math.round(sourceWidth * 0.105)
  const sourceRectWidth = sourceWidth - cropX * 2
  const sourceRectHeight = Math.min(sourceHeight, sourceRectWidth / 2)
  const cropY = Math.max(0, (sourceHeight - sourceRectHeight) * 0.5)
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.filter = 'saturate(0.94) contrast(1.025) brightness(1.01)'
  context.drawImage(image, cropX, cropY, sourceRectWidth, sourceRectHeight, 0, 0, width, height)
  context.filter = 'none'

  const frame = context.getImageData(0, 0, width, height)
  const pixels = frame.data

  // Bring warm yellow foliage into the same fresh-green family as the coastal photo.
  // Trunks, shadows, sky, and already-green leaves retain their natural variation.
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i] / 255
    const g = pixels[i + 1] / 255
    const b = pixels[i + 2] / 255
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const delta = max - min
    if (delta < 0.035 || max < 0.12) continue
    let hue = 0
    if (max === r) hue = ((g - b) / delta) % 6
    else if (max === g) hue = (b - r) / delta + 2
    else hue = (r - g) / delta + 4
    hue *= 60
    if (hue < 0) hue += 360
    const saturation = max <= 0 ? 0 : delta / max
    if (hue < 28 || hue > 96 || saturation < 0.22 || max < 0.30 || g < b * 1.06) continue

    const targetHue = 86 + Math.min(9, (hue - 28) * 0.13)
    const targetSaturation = Math.min(0.66, saturation * 0.75 + 0.055)
    const value = Math.min(1, max * 1.025)
    const chroma = value * targetSaturation
    const h = targetHue / 60
    const x = chroma * (1 - Math.abs((h % 2) - 1))
    let rr = 0, gg = 0, bb = 0
    if (h < 1) { rr = chroma; gg = x }
    else if (h < 2) { rr = x; gg = chroma }
    else if (h < 3) { gg = chroma; bb = x }
    else if (h < 4) { gg = x; bb = chroma }
    else if (h < 5) { rr = x; bb = chroma }
    else { rr = chroma; bb = x }
    const m = value - chroma
    pixels[i] = Math.round((rr + m) * 255)
    pixels[i + 1] = Math.round((gg + m) * 255)
    pixels[i + 2] = Math.round((bb + m) * 255)
  }

  // Match each end of the cylindrical forest to the corresponding edge of the
  // front coastal photograph. This is a restrained, row-by-row colour grade:
  // it changes only the outer blend band, preserves detail, and fades to zero
  // before reaching the main forest image. No network or per-frame work is used.
  try {
    const referenceWidth = 256
    const referenceCanvas = document.createElement('canvas')
    referenceCanvas.width = referenceWidth
    referenceCanvas.height = height
    const referenceContext = referenceCanvas.getContext('2d', { willReadFrequently: true })
    if (referenceContext) {
      referenceContext.imageSmoothingEnabled = true
      referenceContext.imageSmoothingQuality = 'high'
      referenceContext.drawImage(coastImage, 0, 0, coastWidth, coastHeight, 0, 0, referenceWidth, height)
      const reference = referenceContext.getImageData(0, 0, referenceWidth, height).data
      const sampleWidth = Math.max(3, Math.round(width * 0.035))
      const referenceSampleWidth = Math.max(3, Math.round(referenceWidth * 0.035))
      const blendBand = Math.max(sampleWidth + 2, Math.round(width * 0.072))
      const verticalRadius = Math.max(2, Math.round(height * 0.006))
      const correctionLimit = 54
      const edgeOffsets = [new Float32Array(height * 3), new Float32Array(height * 3)]

      const clampOffset = (value: number) => Math.max(-correctionLimit, Math.min(correctionLimit, value))
      const smoothstep = (value: number) => {
        const t = THREE.MathUtils.clamp(value, 0, 1)
        return t * t * (3 - 2 * t)
      }

      for (let y = 0; y < height; y += 1) {
        const yStart = Math.max(0, y - verticalRadius)
        const yEnd = Math.min(height - 1, y + verticalRadius)
        for (let side = 0; side < 2; side += 1) {
          const forestSum = [0, 0, 0]
          const coastSum = [0, 0, 0]
          let forestSamples = 0
          let coastSamples = 0
          for (let sy = yStart; sy <= yEnd; sy += 1) {
            for (let x = 0; x < sampleWidth; x += 1) {
              const sx = side === 0 ? x : width - 1 - x
              const offset = (sy * width + sx) * 4
              forestSum[0] += pixels[offset]
              forestSum[1] += pixels[offset + 1]
              forestSum[2] += pixels[offset + 2]
              forestSamples += 1
            }
            for (let x = 0; x < referenceSampleWidth; x += 1) {
              const sx = side === 0 ? x : referenceWidth - 1 - x
              const offset = (sy * referenceWidth + sx) * 4
              coastSum[0] += reference[offset]
              coastSum[1] += reference[offset + 1]
              coastSum[2] += reference[offset + 2]
              coastSamples += 1
            }
          }
          for (let channel = 0; channel < 3; channel += 1) {
            const forestMean = forestSum[channel] / Math.max(1, forestSamples)
            const coastMean = coastSum[channel] / Math.max(1, coastSamples)
            edgeOffsets[side][y * 3 + channel] = clampOffset(coastMean - forestMean)
          }
        }
      }

      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < blendBand; x += 1) {
          const fromEdge = x / Math.max(1, blendBand - 1)
          const strength = (1 - smoothstep(fromEdge)) * 0.96
          if (strength <= 0.001) continue
          const leftIndex = (y * width + x) * 4
          const rightIndex = (y * width + (width - 1 - x)) * 4
          for (let channel = 0; channel < 3; channel += 1) {
            const leftOffset = edgeOffsets[0][y * 3 + channel]
            const rightOffset = edgeOffsets[1][y * 3 + channel]
            pixels[leftIndex + channel] = Math.max(0, Math.min(255, Math.round(pixels[leftIndex + channel] + leftOffset * strength)))
            pixels[rightIndex + channel] = Math.max(0, Math.min(255, Math.round(pixels[rightIndex + channel] + rightOffset * strength)))
          }
        }
      }
    }
  } catch {
    // The normal forest grade remains usable if a browser blocks canvas pixel reads.
  }

  // Keep the left and right edge grades independent: the panorama has a deliberate rear opening.
  context.putImageData(frame, 0, 0)

  const corrected = new THREE.CanvasTexture(canvas)
  corrected.colorSpace = THREE.SRGBColorSpace
  corrected.wrapS = THREE.ClampToEdgeWrapping
  corrected.wrapT = THREE.ClampToEdgeWrapping
  corrected.repeat.set(1, 1)
  corrected.anisotropy = quality === 'mobile' ? 2 : quality === 'balanced' ? 10 : 16
  corrected.minFilter = THREE.LinearMipmapLinearFilter
  corrected.magFilter = THREE.LinearFilter
  corrected.generateMipmaps = true
  corrected.needsUpdate = true
  return corrected
}

function ForestPanorama({ quality }: { quality: GraphicsTier }) {
  const forestPath = quality === 'mobile' ? '/images/mpd-forest-photo-mobile.webp' : '/images/mpd-forest-photo.webp'
  const coastPath = quality === 'mobile' ? '/images/mpd-front-coastal-bay-mobile.webp' : '/images/mpd-front-coastal-bay.webp'
  const [source, coastSource] = useTexture([forestPath, coastPath])
  const texture = useMemo(() => createGreenForestTexture(source, coastSource, quality), [source, coastSource, quality])
  // Extend the forest shell a few degrees behind the transparent coastal-photo
  // edges. This closes the narrow blue-sky slits caused by the plane/cylinder seam.
  const forestOverlap = 0.145
  const geometry = useMemo(() => new THREE.CylinderGeometry(
    BACKDROP_RADIUS,
    BACKDROP_RADIUS,
    BACKDROP_HEIGHT,
    quality === 'mobile' ? 48 : 80,
    1,
    true,
    Math.PI + FRONT_BAY_HALF_ANGLE - forestOverlap,
    Math.PI * 2 - FRONT_BAY_HALF_ANGLE * 2 + forestOverlap * 2,
  ), [quality])
  useEffect(() => () => {
    if (texture !== source) texture.dispose()
    geometry.dispose()
  }, [texture, source, geometry])
  return (
    <mesh geometry={geometry} position={[0, BACKDROP_CENTER_Y, 0]} raycast={noRaycast} renderOrder={-95} frustumCulled={false}>
      <meshBasicMaterial map={texture} side={THREE.BackSide} toneMapped={false} fog={false} depthWrite={false} />
    </mesh>
  )
}

function FrontBeachDune({ quality }: { quality: GraphicsTier }) {
  const count = quality === 'mobile' ? 9 : quality === 'balanced' ? 16 : 24
  return (
    <group raycast={noRaycast}>
      {Array.from({ length: count }, (_, index) => {
        const side = index % 2 === 0 ? -1 : 1
        const row = Math.floor(index / 2)
        const x = side * (38 + row * 3.9)
        const z = -78 - (row % 4) * 7
        const size = 1.4 + (row % 4) * 0.45
        return (
          <group key={index} position={[x, getIslandGroundHeight(x, z), z]} rotation-y={side * (0.25 + row * 0.11)}>
            <mesh position={[0, size * 0.35, 0]} scale={[size * 1.35, size * 0.72, size]} castShadow>
              <dodecahedronGeometry args={[1, 1]} />
              <meshStandardMaterial color={row % 3 === 0 ? '#827b6d' : '#9b907a'} roughness={0.98} flatShading />
            </mesh>
            {quality !== 'mobile' && <mesh position={[0.18, size * 0.78, -0.1]} scale={[size * 0.8, size * 0.42, size * 0.65]} castShadow><sphereGeometry args={[1, 12, 8]} /><meshStandardMaterial color="#315f36" roughness={0.98} /></mesh>}
          </group>
        )
      })}
    </group>
  )
}

function CoastalSea({ quality }: { quality: GraphicsTier }) {
  const geometry = useMemo(() => createCoastalWaterRingGeometry(quality), [quality])
  useEffect(() => () => geometry.dispose(), [geometry])
  useFrame((state) => {
    const position = geometry.attributes.position as THREE.BufferAttribute
    const base = geometry.userData.basePositions as Float32Array
    const time = state.clock.elapsedTime
    for (let i = 0; i < position.count; i += 1) {
      const x = base[i * 3]
      const z = base[i * 3 + 2]
      const radius = Math.hypot(x, z)
      const angle = Math.atan2(z, x)
      const swell = Math.sin(radius * 0.052 - time * 0.72 + angle * 2.2) * 0.018
        + Math.cos(radius * 0.095 + time * 0.48 - angle * 3.1) * 0.009
      position.setY(i, swell)
    }
    position.needsUpdate = true
  })

  return (
    <mesh geometry={geometry} position={[0, ISLAND_SEA_LEVEL, 0]} raycast={noRaycast} renderOrder={-2}>
      <meshPhysicalMaterial
        vertexColors
        color="#ffffff"
        roughness={0.24}
        metalness={0.055}
        clearcoat={0.58}
        clearcoatRoughness={0.22}
        transparent
        opacity={0.94}
        depthWrite={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  )
}


function seeded(seed: number) {
  let s = seed % 2147483647
  if (s <= 0) s += 2147483646
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

function Branch({ start, end, radius, bark }: { start: [number, number, number]; end: [number, number, number]; radius: number; bark: THREE.Texture }) {
  const a = new THREE.Vector3(...start)
  const b = new THREE.Vector3(...end)
  const direction = b.clone().sub(a)
  const length = direction.length()
  const quaternion = new THREE.Quaternion().setFromUnitVectors(UP, direction.normalize())
  const mid = a.clone().add(b).multiplyScalar(0.5)
  return (
    <mesh position={mid} quaternion={quaternion} raycast={noRaycast} castShadow={false} userData={{ mpdNoCollision: true }}>
      <cylinderGeometry args={[radius * 0.34, radius, length, 9, 3]} />
      <meshStandardMaterial map={bark} bumpMap={bark} bumpScale={0.09} roughness={0.98} />
    </mesh>
  )
}

function createLeafGeometry() {
  // A narrow, pointed, slightly cupped leaf silhouette reads more naturally than
  // a stretched sphere when thousands of leaves overlap in the distant canopy.
  const shape = new THREE.Shape()
  shape.moveTo(0, -0.58)
  shape.quadraticCurveTo(-0.34, -0.18, -0.25, 0.2)
  shape.quadraticCurveTo(-0.12, 0.49, 0, 0.62)
  shape.quadraticCurveTo(0.12, 0.49, 0.25, 0.2)
  shape.quadraticCurveTo(0.34, -0.18, 0, -0.58)
  const geometry = new THREE.ShapeGeometry(shape, 8)
  geometry.rotateX(Math.PI / 2)
  const position = geometry.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i)
    const z = position.getZ(i)
    position.setY(i, 0.035 * (1 - Math.min(1, Math.abs(x) * 2.5)) * Math.sin((z + 0.58) * Math.PI))
  }
  position.needsUpdate = true
  // This material uses both geometry vertexColors and InstancedMesh instanceColor.
  // Supply neutral white vertex colors so the per-tree green instance colors are
  // multiplied correctly on every GPU/browser (missing color attributes can render black).
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(
    new Float32Array(position.count * 3).fill(1),
    3,
  ))
  geometry.computeVertexNormals()
  return geometry
}

let sharedBarkTexture: THREE.Texture | null = null
function getSharedBarkTexture() {
  if (!sharedBarkTexture) sharedBarkTexture = createBarkTexture()
  return sharedBarkTexture
}

function LeafCanopy({ seed, height, quality }: { seed: number; height: number; quality: GraphicsTier }) {
  const leavesRef = useRef<THREE.InstancedMesh>(null)
  const leafGeometry = useMemo(() => createLeafGeometry(), [])
  const leafCount = quality === 'mobile' ? 54 : quality === 'balanced' ? 104 : 148
  const leaves = useMemo(() => {
    const rand = seeded(seed)
    return Array.from({ length: leafCount }, () => {
      const angle = rand() * Math.PI * 2
      const radial = Math.sqrt(rand()) * (2.8 + rand() * 1.65)
      const vertical = (rand() - 0.5) * 4.25
      const x = Math.cos(angle) * radial
      const z = Math.sin(angle) * radial * 0.88
      const y = height + vertical - radial * 0.1
      return {
        position: [x, y, z] as [number, number, number],
        rotation: [
          (rand() - 0.5) * 1.25,
          angle + (rand() - 0.5) * 1.7,
          (rand() - 0.5) * 0.9,
        ] as [number, number, number],
        scale: [0.58 + rand() * 0.24, 0.075 + rand() * 0.035, 0.78 + rand() * 0.34] as [number, number, number],
        color: (() => {
          const palette = seed % 6
          // Keep every canopy in the same fresh spring-green family; no autumn gold.
          const hueBase = palette === 0 ? 0.265 : palette === 1 ? 0.285 : palette === 2 ? 0.305 : 0.275
          const saturation = 0.42 + rand() * 0.16
          const lightness = 0.46 + rand() * 0.13
          return new THREE.Color().setHSL(hueBase + rand() * 0.035, saturation, lightness)
        })(),
      }
    })
  }, [seed, height, leafCount])

  useLayoutEffect(() => {
    if (!leavesRef.current) return
    const object = new THREE.Object3D()
    leaves.forEach((leaf, index) => {
      object.position.set(...leaf.position)
      object.rotation.set(...leaf.rotation)
      object.scale.set(...leaf.scale)
      object.updateMatrix()
      leavesRef.current!.setMatrixAt(index, object.matrix)
      leavesRef.current!.setColorAt(index, leaf.color)
    })
    leavesRef.current.instanceMatrix.needsUpdate = true
    if (leavesRef.current.instanceColor) leavesRef.current.instanceColor.needsUpdate = true
    leavesRef.current.computeBoundingSphere()
  }, [leaves])

  return (
    <instancedMesh ref={leavesRef} args={[leafGeometry, undefined, leaves.length]} raycast={noRaycast} castShadow={false}>
      <meshStandardMaterial color="#ffffff" roughness={0.88} vertexColors side={THREE.DoubleSide} emissive="#203d14" emissiveIntensity={0.035} />
    </instancedMesh>
  )
}

export function NaturalTree({ position, scale = 1, seed, quality = 'high' }: { position: [number, number, number]; scale?: number; seed: number; quality?: GraphicsTier }) {
  const treeRef = useRef<THREE.Group>(null)
  const bark = useMemo(() => getSharedBarkTexture(), [])
  const treeShape = useMemo(() => {
    const rand = seeded(seed)
    return { height: 7.8 + rand() * 2.4, lean: (rand() - 0.5) * 0.34 }
  }, [seed])
  const { height, lean } = treeShape
  // Trees stay static: the ocean, water, fish and avatar retain the meaningful motion.
  const branchCount = quality === 'mobile' ? 3 : quality === 'balanced' ? 5 : 7
  const branches = useMemo(() => {
    const r = seeded(seed + 88)
    return Array.from({ length: branchCount }, (_, i) => {
      const y = 3.2 + r() * 4.1
      const a = (i / branchCount) * Math.PI * 2 + r() * 0.6
      const reach = 1.45 + r() * 1.5
      return {
        start: [Math.sin(a) * 0.22, y, Math.cos(a) * 0.22] as [number, number, number],
        end: [Math.sin(a) * reach, y + 0.55 + r() * 1.05, Math.cos(a) * reach] as [number, number, number],
        radius: 0.145 - (i % 3) * 0.016,
      }
    })
  }, [seed, branchCount])

  return (
    <group ref={treeRef} position={position} scale={scale}>
      <mesh position={[lean, height * 0.48, 0]} rotation-z={lean * 0.18} castShadow={quality === 'high'} receiveShadow={quality === 'high'} raycast={noRaycast}>
        <cylinderGeometry args={[0.17, 0.72, height, quality === 'mobile' ? 10 : 16, 8]} />
        <meshStandardMaterial map={bark} bumpMap={quality === 'high' ? bark : undefined} bumpScale={0.07} roughness={1} />
      </mesh>
      {branches.map((branch, i) => <Branch key={i} {...branch} bark={bark} />)}
      <LeafCanopy seed={seed} height={height} quality={quality} />
    </group>
  )
}


function PalmTree({ position, scale = 1, seed, quality }: { position: [number, number, number]; scale: number; seed: number; quality: GraphicsTier }) {
  const fronds = quality === 'mobile' ? 5 : 8
  const height = 7.1 + (seed % 4) * 0.55
  const frondGeometry = useMemo(() => new THREE.SphereGeometry(1, 9, 6), [])
  const frondData = useMemo(() => Array.from({ length: fronds }, (_, index) => {
    const angle = (index / fronds) * Math.PI * 2 + (seed % 13) * 0.11
    const dip = 0.65 + (index % 3) * 0.22
    const reach = 2.9 + (index % 2) * 0.45
    return { angle, dip, reach }
  }), [fronds, seed])
  return (
    <group position={position} scale={scale}>
      {[0, 1, 2, 3, 4].map((part) => (
        <mesh key={part} position={[(part * part * 0.012) * (seed % 2 ? 1 : -1), height * (part + 0.5) / 5, 0]} rotation-z={(seed % 2 ? 1 : -1) * part * 0.012} raycast={noRaycast} castShadow={quality === 'high'}>
          <cylinderGeometry args={[0.22 - part * 0.025, 0.3 - part * 0.025, height / 5 + 0.04, 11, 1]} />
          <meshStandardMaterial color={part % 2 ? '#805c3c' : '#9a7048'} roughness={0.98} />
        </mesh>
      ))}
      {frondData.map((frond, index) => (
        <group key={index} position={[0, height, 0]} rotation-y={frond.angle} rotation-x={-0.08 - frond.dip * 0.12}>
          <mesh geometry={frondGeometry} position={[0, -frond.dip * 0.62, -frond.reach * 0.53]} scale={[0.16, 0.085, frond.reach * 0.72]} rotation-x={0.16} raycast={noRaycast} userData={{ mpdNoCollision: true }}>
            <meshStandardMaterial color={index % 3 === 0 ? '#4f853f' : '#397543'} roughness={0.9} side={THREE.DoubleSide} />
          </mesh>
          {quality !== 'mobile' && Array.from({ length: 5 }, (_, leaflet) => (
            <mesh key={leaflet} position={[0, -0.1 - leaflet * 0.055, -0.45 - leaflet * 0.48]} scale={[0.08, 0.035, 0.38]} rotation-x={0.15} raycast={noRaycast}>
              <sphereGeometry args={[1, 7, 5]} />
              <meshStandardMaterial color={leaflet % 2 ? '#2e6d3c' : '#5a9648'} roughness={0.92} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  )
}

function ForestTree({ position, scale, seed, quality }: { position: [number, number, number]; scale: number; seed: number; quality: GraphicsTier }) {
  // Use branching broadleaf trees for the forest mass. Only a few palms break the skyline;
  // the old stacked-sphere pine cones were removed because they looked like toy scenery.
  const species = seed % 9
  if (species === 0 || species === 5) return <PalmTree position={position} scale={scale} seed={seed} quality={quality} />
  return <NaturalTree position={position} scale={scale} seed={seed} quality={quality} />
}

function Understory({ position, seed, quality }: { position: [number, number, number]; seed: number; quality: GraphicsTier }) {
  const colors = ['#315f39', '#477744', '#668c4e', '#7f9e5b']
  const count = quality === 'mobile' ? 3 : 5
  return (
    <group position={position} userData={{ mpdNoCollision: true }}>
      {Array.from({ length: count }, (_, index) => {
        const angle = (index / count) * Math.PI * 2 + seed * 0.17
        const size = 0.5 + ((seed + index * 11) % 5) * 0.12
        return (
          <group key={index} position={[Math.cos(angle) * 0.45, size * 0.42, Math.sin(angle) * 0.45]} rotation-y={angle}>
            <mesh raycast={noRaycast}>
              <sphereGeometry args={[size, 10, 7]} />
              <meshStandardMaterial color={colors[(seed + index) % colors.length]} roughness={0.96} />
            </mesh>
            {quality !== 'mobile' && index === 0 && (
              <mesh position={[0.12, size * 0.9, 0.06]} raycast={noRaycast}>
                <sphereGeometry args={[0.16, 8, 6]} />
                <meshStandardMaterial color={seed % 2 ? '#d98b9f' : '#f0d3a2'} roughness={0.9} />
              </mesh>
            )}
          </group>
        )
      })}
    </group>
  )
}

function FitnessStation({
  position, kind, label, onSeat, onRest, onStand,
}: {
  position: [number, number, number]
  kind: FitnessKind
  label: string
  onSeat: SeatHandler
  onRest: SeatHandler
  onStand: SeatHandler
}) {
  const [active, setActive] = useState(false)
  const pendingStart = useRef(false)
  const moving = useRef<THREE.Group>(null)
  useEffect(() => {
    const stop = () => {
      pendingStart.current = false
      setActive(false)
    }
    const arrived = (event: Event) => {
      const detail = (event as CustomEvent<{ kind?: FitnessKind }>).detail
      if (pendingStart.current && detail?.kind === kind) {
        pendingStart.current = false
        setActive(true)
      }
    }
    window.addEventListener('mpd-stop-fitness-machines', stop)
    window.addEventListener('mpd-fitness-arrived', arrived)
    return () => {
      window.removeEventListener('mpd-stop-fitness-machines', stop)
      window.removeEventListener('mpd-fitness-arrived', arrived)
    }
  }, [kind])
  const wheel = useRef<THREE.Mesh>(null)
  const pedal = useRef<THREE.Group>(null)
  const seat = useRef<THREE.Group>(null)
  const bar = useRef<THREE.Group>(null)
  const arms = useRef<THREE.Group>(null)
  const bag = useRef<THREE.Group>(null)
  const plate = useRef<THREE.Group>(null)
  const breath = useRef<THREE.Group>(null)

  useFrame((state, delta) => {
    const time = state.clock.elapsedTime
    const speed = Math.min(delta, 0.05)
    if (active) {
      if (kind === 'treadmill' && wheel.current) wheel.current.rotation.x -= speed * 7
      if ((kind === 'bike' || kind === 'stepper') && pedal.current) pedal.current.rotation.z -= speed * (kind === 'bike' ? 5.2 : 3.8)
      if (kind === 'elliptical' && pedal.current) pedal.current.rotation.z = Math.sin(time * 4.8) * 0.22
      if ((kind === 'rower' || kind === 'lat-pulldown') && seat.current) seat.current.position.z = (kind === 'rower' ? 0 : 0) + Math.sin(time * (kind === 'rower' ? 2.8 : 2.1)) * (kind === 'rower' ? 0.32 : 0.02)
      if ((kind === 'lat-pulldown' || kind === 'bench-press') && bar.current) bar.current.position.y = (kind === 'lat-pulldown' ? 1.9 : 2.2) + Math.sin(time * 2.8) * (kind === 'lat-pulldown' ? 0.28 : 0.22)
      if (kind === 'chest-press' && arms.current) arms.current.rotation.x = Math.sin(time * 2.7) * 0.22
      if (kind === 'leg-press' && plate.current) plate.current.position.z = -0.42 + Math.sin(time * 2.6) * 0.28
      if (kind === 'punching-bag' && bag.current) bag.current.rotation.x = Math.sin(time * 3.1) * 0.24
      if (kind === 'yoga-mat' && breath.current) breath.current.scale.y = 1 + Math.sin(time * 1.7) * 0.025
      if (moving.current) moving.current.rotation.y = Math.sin(time * 2.1) * (kind === 'rower' ? 0.018 : 0.008)
    } else {
      if (kind === 'rower' && seat.current) seat.current.position.z = 0
      if (kind === 'lat-pulldown' && bar.current) bar.current.position.y = 1.9
      if (kind === 'bench-press' && bar.current) bar.current.position.y = 2.2
      if (kind === 'chest-press' && arms.current) arms.current.rotation.x = 0
      if (kind === 'leg-press' && plate.current) plate.current.position.z = -0.42
      if (kind === 'punching-bag' && bag.current) bag.current.rotation.x = THREE.MathUtils.damp(bag.current.rotation.x, 0, 4, delta)
      if (kind === 'yoga-mat' && breath.current) breath.current.scale.y = THREE.MathUtils.damp(breath.current.scale.y, 1, 4, delta)
    }
  })

  const activate = () => {
    // Toggle off if this station is already running or the avatar is still walking to it.
    const wasActive = active || pendingStart.current
    // Each avatar target is placed on the actual working surface/seat, not a generic
    // 1.25m away point. Local +Z is the front of the station after the garden rotation.
    const approachByKind: Record<FitnessKind, number> = {
      treadmill: 0.12,
      bike: 0.16,
      elliptical: 0.10,
      rower: 0.12,
      stepper: 0.92,
      'chest-press': 0.16,
      'lat-pulldown': 0.08,
      'leg-press': 0.12,
      'punching-bag': 0.58,
      'bench-press': 0.05,
      'yoga-mat': 0,
    }
    const liftByKind: Record<FitnessKind, number> = {
      treadmill: 0.38,
      bike: 0.66,
      elliptical: 0.30,
      rower: 0.22,
      stepper: 0.0,
      'chest-press': 0.20,
      'lat-pulldown': 0.24,
      'leg-press': 0.22,
      'punching-bag': 0,
      'bench-press': 0.34,
      'yoga-mat': 0.02,
    }
    const usePosition: [number, number, number] = [position[0], position[1] + liftByKind[kind], position[2] + approachByKind[kind]]
    // Machines face local +Z in the avatar coordinate system. Outdoor rotates 180°,
    // so the wrapper converts this to the correct world-facing heading.
    const machineFacing = Math.PI
    window.dispatchEvent(new Event('mpd-stop-fitness-machines'))
    if (wasActive) {
      onStand(usePosition, machineFacing)
      return
    }
    // Start the machine only after the avatar arrives at its exact working position.
    if (kind === 'bench-press' || kind === 'yoga-mat') onRest(usePosition, machineFacing)
    else if (kind === 'treadmill' || kind === 'elliptical' || kind === 'stepper' || kind === 'punching-bag') onStand(usePosition, machineFacing)
    else onSeat(usePosition, machineFacing)
    pendingStart.current = true
    window.dispatchEvent(new CustomEvent('mpd-start-fitness', { detail: { kind } }))
  }

  const handleStationClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation()
    // R3F versions may omit delta on synthetic/touch clicks; only reject a
    // click when a numeric drag distance clearly exceeds the tap threshold.
    if (typeof event.delta !== 'number' || event.delta <= CLICK_DRAG_TOLERANCE + 8) activate()
  }

  return (
    <Interactive
      label={`${label} ${active ? '운동 중 · 다시 누르면 정지' : '클릭하면 이동해 운동 시작'}`}
      labelOffset={[0, kind === 'punching-bag' ? 3 : 2.55, 0]}
      position={position}
      onActivate={activate}
    >
      {/* A dedicated invisible hit volume makes every station clickable even when
          its decorative meshes intentionally disable raycasting for performance. */}
      <mesh
        onClick={handleStationClick}
        position={((): [number, number, number] => {
          const hitCenters: Record<FitnessKind, [number, number, number]> = {
            treadmill: [0, 1.18, -0.05], bike: [0, 1.25, 0.05], elliptical: [0, 1.25, 0],
            rower: [0, 0.95, -0.18], stepper: [0, 1.1, 0.02], 'chest-press': [0, 1.25, 0],
            'lat-pulldown': [0, 1.42, -0.12], 'leg-press': [0, 1.2, -0.22],
            'punching-bag': [0, 1.85, 0], 'bench-press': [0, 1.42, 0], 'yoga-mat': [0, 0.32, 0],
          }
          return hitCenters[kind]
        })()}
      >
        <boxGeometry args={((): [number, number, number] => {
          const hitSizes: Record<FitnessKind, [number, number, number]> = {
            treadmill: [2.12, 1.95, 1.08], bike: [1.28, 2.16, 1.08], elliptical: [1.48, 2.18, 1.18],
            rower: [2.35, 1.28, 1.18], stepper: [1.28, 2.28, 1.02], 'chest-press': [1.78, 2.10, 1.16],
            'lat-pulldown': [1.52, 2.42, 1.12], 'leg-press': [1.48, 2.10, 1.34],
            'punching-bag': [1.18, 3.02, 1.12], 'bench-press': [1.58, 2.36, 1.34], 'yoga-mat': [1.72, 0.48, 2.20],
          }
          return hitSizes[kind]
        })()} />
        <meshBasicMaterial transparent opacity={0.001} colorWrite={false} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      <Html position={[0, kind === 'punching-bag' ? 3.25 : 2.95, 0]} center distanceFactor={10} style={{ pointerEvents: 'none' }} zIndexRange={[12, 0]}>
        <div className="whitespace-nowrap rounded-full border border-amber-200/35 bg-slate-950/80 px-3 py-1.5 text-[11px] font-semibold tracking-wide text-amber-100 shadow-lg backdrop-blur-sm">
          {label}
        </div>
      </Html>
      <group ref={moving}>
        {(kind === 'treadmill' || kind === 'bike' || kind === 'elliptical' || kind === 'rower') && (
          <>
            {kind === 'treadmill' && <>
              <RoundedBox args={[2.25, 0.18, 0.88]} radius={0.1} smoothness={5} position={[0, 0.48, 0]} castShadow><meshStandardMaterial color="#20262a" metalness={0.55} roughness={0.42} /></RoundedBox>
              <mesh ref={wheel} position={[0, 0.59, 0]} rotation-x={Math.PI / 2} raycast={noRaycast}><cylinderGeometry args={[0.37, 0.37, 0.08, 20]} /><meshStandardMaterial color={active ? '#f2b34c' : '#3d464c'} metalness={0.55} roughness={0.35} /></mesh>
              {[-0.74, 0.74].map((x) => <mesh key={x} position={[x, 1.2, -0.32]} rotation-x={-0.28} raycast={noRaycast} castShadow><cylinderGeometry args={[0.055, 0.07, 1.4, 12]} /><meshStandardMaterial color="#3c454b" metalness={0.72} roughness={0.34} /></mesh>)}
              <RoundedBox args={[0.7, 0.12, 0.28]} radius={0.05} smoothness={4} position={[0, 1.92, -0.63]} raycast={noRaycast}><meshStandardMaterial color="#202a31" metalness={0.38} roughness={0.45} /></RoundedBox>
            </>}
            {kind === 'bike' && <>
              <mesh position={[0, 0.8, 0]} rotation-z={-0.12} raycast={noRaycast} castShadow><cylinderGeometry args={[0.065, 0.09, 1.25, 14]} /><meshStandardMaterial color="#313a40" metalness={0.72} roughness={0.34} /></mesh>
              <mesh position={[0, 0.48, 0.08]} raycast={noRaycast}><cylinderGeometry args={[0.52, 0.52, 0.12, 24]} /><meshStandardMaterial color="#252a2f" metalness={0.58} roughness={0.4} /></mesh>
              <group ref={pedal} position={[0, 0.55, 0.42]}>{[0, Math.PI].map((angle) => <group key={angle} rotation-z={angle}><mesh position={[0, 0.52, 0]} raycast={noRaycast}><boxGeometry args={[0.08, 0.95, 0.08]} /><meshStandardMaterial color="#737b80" metalness={0.72} roughness={0.3} /></mesh><RoundedBox args={[0.36, 0.09, 0.18]} radius={0.03} smoothness={3} position={[0, 1.03, 0]} raycast={noRaycast}><meshStandardMaterial color="#222a31" /></RoundedBox></group>)}</group>
              <mesh position={[0, 1.62, -0.05]} raycast={noRaycast}><boxGeometry args={[0.72, 0.16, 0.28]} /><meshStandardMaterial color="#272d32" /></mesh>
              <mesh position={[0, 2.02, 0.05]} raycast={noRaycast}><boxGeometry args={[0.38, 0.12, 0.12]} /><meshStandardMaterial color="#a8b2b7" metalness={0.6} /></mesh>
              <RoundedBox args={[0.6, 0.14, 0.42]} radius={0.06} smoothness={4} position={[0, 1.35, 0.35]} raycast={noRaycast}><meshStandardMaterial color="#242b30" /></RoundedBox>
            </>}
            {kind === 'elliptical' && <>
              <RoundedBox args={[1.2, 0.22, 0.7]} radius={0.1} smoothness={4} position={[0, 0.38, 0]} raycast={noRaycast}><meshStandardMaterial color="#283036" metalness={0.55} /></RoundedBox>
              <mesh position={[0, 1.2, -0.22]} rotation-x={0.12} raycast={noRaycast}><cylinderGeometry args={[0.06, 0.09, 1.9, 12]} /><meshStandardMaterial color="#58656a" metalness={0.7} /></mesh>
              <group ref={pedal}>{[-0.34, 0.34].map((x, index) => <group key={x} position={[x, 0.48, 0]}><mesh position={[0, 0.62, index === 0 ? -0.24 : 0.24]} raycast={noRaycast}><boxGeometry args={[0.1, 1.2, 0.1]} /><meshStandardMaterial color="#717d82" metalness={0.7} /></mesh><RoundedBox args={[0.3, 0.08, 0.85]} radius={0.04} smoothness={4} position={[0, 0.12, 0]} raycast={noRaycast}><meshStandardMaterial color="#303a40" /></RoundedBox></group>)}</group>
            </>}
            {kind === 'rower' && <>
              <RoundedBox args={[2.5, 0.12, 0.34]} radius={0.06} smoothness={4} position={[0, 0.32, 0]} raycast={noRaycast}><meshStandardMaterial color="#394248" metalness={0.58} /></RoundedBox>
              <group ref={seat}><RoundedBox args={[0.62, 0.17, 0.5]} radius={0.07} smoothness={5} position={[0, 0.63, 0]} raycast={noRaycast}><meshStandardMaterial color="#242b30" /></RoundedBox></group>
              <mesh position={[0, 0.8, -0.68]} rotation-x={Math.PI / 2} raycast={noRaycast}><cylinderGeometry args={[0.33, 0.33, 0.14, 20]} /><meshStandardMaterial color="#20272c" metalness={0.6} /></mesh>
              <mesh position={[0, 1.08, -0.75]} raycast={noRaycast}><cylinderGeometry args={[0.035, 0.035, 0.84, 8]} /><meshStandardMaterial color="#a7afb3" metalness={0.76} /></mesh>
            </>}
          </>
        )}

        {kind === 'stepper' && <>
          <mesh position={[0, 0.12, 0]} onClick={handleStationClick}><boxGeometry args={[1.4, 0.22, 1.1]} /><meshStandardMaterial color="#29363c" metalness={0.52} /></mesh>
          <mesh position={[0, 1.25, -0.33]} raycast={noRaycast}><cylinderGeometry args={[0.07, 0.09, 2.2, 12]} /><meshStandardMaterial color="#64747a" metalness={0.72} /></mesh>
          <group ref={pedal} position={[0, 0.58, 0.22]}>{[-0.34, 0.34].map((x, i) => <group key={x} position={[x, 0, 0]} rotation-z={i ? Math.PI : 0}><mesh position={[0, 0.12, 0]}><boxGeometry args={[0.42, 0.12, 0.68]} /><meshStandardMaterial color="#d49b45" roughness={0.48} /></mesh></group>)}</group>
          <mesh position={[0, 2.28, -0.33]} onClick={handleStationClick}><boxGeometry args={[1.15, 0.12, 0.22]} /><meshStandardMaterial color="#202a31" metalness={0.55} /></mesh>
        </>}

        {kind === 'chest-press' && <>
          <RoundedBox args={[1.4, 0.22, 0.75]} radius={0.08} smoothness={4} position={[0, 0.42, 0.2]} raycast={noRaycast}><meshStandardMaterial color="#26343c" /></RoundedBox>
          <mesh position={[0, 0.72, 0.42]} raycast={noRaycast}><boxGeometry args={[0.72, 0.18, 0.42]} /><meshStandardMaterial color="#20272c" /></mesh>
          <mesh position={[0, 1.35, -0.36]} rotation-x={0.12} raycast={noRaycast}><cylinderGeometry args={[0.07, 0.09, 1.75, 12]} /><meshStandardMaterial color="#68777c" metalness={0.7} /></mesh>
          <group ref={arms} position={[0, 1.42, -0.2]}>{[-1, 1].map((side) => <group key={side} position={[side * 0.68, 0, 0]}><mesh position={[0, 0, 0]} rotation-z={side * 0.3}><cylinderGeometry args={[0.055, 0.055, 0.95, 10]} /><meshStandardMaterial color="#9aa7a9" metalness={0.78} /></mesh><mesh position={[side * 0.34, 0.35, 0.18]}><sphereGeometry args={[0.13, 12, 10]} /><meshStandardMaterial color="#e1b25d" metalness={0.24} /></mesh></group>)}</group>
        </>}

        {kind === 'lat-pulldown' && <>
          <mesh position={[-0.8, 1.25, -0.25]} raycast={noRaycast}><boxGeometry args={[0.12, 2.5, 0.12]} /><meshStandardMaterial color="#66747a" metalness={0.75} /></mesh>
          <mesh position={[0.8, 1.25, -0.25]} raycast={noRaycast}><boxGeometry args={[0.12, 2.5, 0.12]} /><meshStandardMaterial color="#66747a" metalness={0.75} /></mesh>
          <mesh position={[0, 2.48, -0.25]} raycast={noRaycast}><boxGeometry args={[1.8, 0.12, 0.16]} /><meshStandardMaterial color="#7e8b8e" metalness={0.72} /></mesh>
          <mesh position={[0, 0.42, 0.12]} raycast={noRaycast}><boxGeometry args={[1.25, 0.16, 0.72]} /><meshStandardMaterial color="#29343a" /></mesh>
          <group ref={seat}><mesh position={[0, 0.8, 0.1]}><boxGeometry args={[0.62, 0.15, 0.52]} /><meshStandardMaterial color="#20272c" /></mesh></group>
          <group ref={bar} position={[0, 1.9, -0.1]}><mesh><cylinderGeometry args={[0.035, 0.035, 1.6, 10]} /><meshStandardMaterial color="#c2ccd0" metalness={0.85} /></mesh><mesh position={[-0.75, 0, 0]}><sphereGeometry args={[0.055, 10, 8]} /><meshStandardMaterial color="#e0b45f" /></mesh><mesh position={[0.75, 0, 0]}><sphereGeometry args={[0.055, 10, 8]} /><meshStandardMaterial color="#e0b45f" /></mesh></group>
        </>}

        {kind === 'leg-press' && <>
          <mesh position={[0, 0.42, 0.2]} rotation-x={-0.18} raycast={noRaycast}><boxGeometry args={[1.15, 0.2, 1.35]} /><meshStandardMaterial color="#27363e" /></mesh>
          <mesh position={[0, 0.9, -0.58]} rotation-x={-0.48} raycast={noRaycast}><boxGeometry args={[1.0, 0.16, 0.32]} /><meshStandardMaterial color="#202a31" /></mesh>
          <group ref={plate} position={[0, 0.95, -0.42]}><mesh rotation-x={-0.46}><boxGeometry args={[1.35, 0.12, 0.82]} /><meshStandardMaterial color="#a3afb3" metalness={0.72} roughness={0.32} /></mesh><mesh position={[0, 0.16, -0.25]}><boxGeometry args={[0.9, 0.08, 0.08]} /><meshStandardMaterial color="#e0b25d" /></mesh></group>
          {[-0.55, 0.55].map((x) => <mesh key={x} position={[x, 1.05, -0.5]} rotation-x={-0.46} raycast={noRaycast}><cylinderGeometry args={[0.045, 0.045, 1.25, 10]} /><meshStandardMaterial color="#66747a" metalness={0.78} /></mesh>)}
        </>}

        {kind === 'punching-bag' && <>
          <mesh position={[0, 2.8, 0]} raycast={noRaycast}><cylinderGeometry args={[0.035, 0.035, 1.2, 8]} /><meshStandardMaterial color="#b7c1c4" metalness={0.8} /></mesh>
          <group ref={bag} position={[0, 2.1, 0]}><mesh castShadow><capsuleGeometry args={[0.36, 1.05, 8, 14]} /><meshPhysicalMaterial color="#8e2630" roughness={0.34} clearcoat={0.45} /></mesh><mesh position={[0, 0.68, 0]}><torusGeometry args={[0.34, 0.035, 8, 24]} /><meshStandardMaterial color="#d6b06b" metalness={0.52} /></mesh></group>
          <mesh position={[0, 0.08, 0]}><cylinderGeometry args={[0.66, 0.8, 0.16, 24]} /><meshStandardMaterial color="#32383b" metalness={0.48} /></mesh>
        </>}

        {kind === 'bench-press' && <>
          <mesh position={[0, 0.52, 0.18]} raycast={noRaycast}><boxGeometry args={[0.85, 0.22, 1.65]} /><meshStandardMaterial color="#202b31" /></mesh>
          <mesh position={[0, 0.23, 0.18]} raycast={noRaycast}><boxGeometry args={[0.12, 0.45, 0.12]} /><meshStandardMaterial color="#66747a" metalness={0.75} /></mesh>
          {[-0.86, 0.86].map((x) => <mesh key={x} position={[x, 1.6, -0.42]} raycast={noRaycast}><boxGeometry args={[0.11, 2.7, 0.11]} /><meshStandardMaterial color="#65767c" metalness={0.75} /></mesh>)}
          <group ref={bar} position={[0, 2.2, -0.42]}><mesh><cylinderGeometry args={[0.04, 0.04, 2.2, 12]} /><meshStandardMaterial color="#c9d3d6" metalness={0.9} /></mesh>{[-0.9, 0.9].map((x) => <mesh key={x} position={[x, 0, 0]}><cylinderGeometry args={[0.28, 0.28, 0.16, 20]} /><meshStandardMaterial color="#20272d" metalness={0.5} /></mesh>)}</group>
        </>}

        {kind === 'yoga-mat' && <>
          <group ref={breath}>
            <RoundedBox args={[1.65, 0.12, 2.55]} radius={0.16} smoothness={8} position={[0, 0.11, 0]} receiveShadow><meshPhysicalMaterial color="#4f9c91" roughness={0.78} /></RoundedBox>
            <mesh position={[0, 0.19, 0]} raycast={noRaycast}><boxGeometry args={[1.3, 0.018, 2.2]} /><meshStandardMaterial color="#cce7d6" roughness={0.88} /></mesh>
            <mesh position={[0, 0.24, -0.76]} raycast={noRaycast}><sphereGeometry args={[0.23, 14, 10]} /><meshStandardMaterial color="#e3bd8a" roughness={0.8} /></mesh>
          </group>
        </>}

        <mesh position={[0, 0.08, 0]} raycast={noRaycast}><boxGeometry args={[2.5, 0.08, 1.15]} /><meshStandardMaterial color="#3d342c" roughness={0.88} /></mesh>
        {active && <mesh position={[0, 2.75, 0]} raycast={noRaycast}><sphereGeometry args={[0.07, 10, 8]} /><meshBasicMaterial color="#69e5a4" toneMapped={false} /></mesh>}
      </group>
    </Interactive>
  )
}

function PoolWater({ onPoolClick, quality }: { onPoolClick: (e: ThreeEvent<MouseEvent>) => void; quality: GraphicsTier }) {
  const waterRef = useRef<THREE.Mesh>(null)
  const frameCounter = useRef(0)
  const waterSegments: [number, number] = quality === 'mobile' ? [10, 6] : quality === 'balanced' ? [22, 12] : [42, 22]

  useFrame((state) => {
    const mesh = waterRef.current
    if (!mesh) return
    frameCounter.current += 1
    const updateEvery = quality === 'mobile' ? 6 : quality === 'balanced' ? 3 : 1
    if (frameCounter.current % updateEvery !== 0) return
    const geometry = mesh.geometry as THREE.BufferGeometry
    const positions = geometry.attributes.position as THREE.BufferAttribute
    const time = state.clock.elapsedTime

    // Gentle but clearly visible overlapping ripples across the full pool surface.
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i)
      const z = positions.getY(i)
      const waveA = Math.sin(x * 0.82 + time * 0.72) * Math.cos(z * 1.08 - time * 0.58)
      const waveB = Math.sin((x + z) * 1.35 + time * 0.92)
      const waveC = Math.cos((x * 0.48 - z * 0.72) - time * 0.46)
      positions.setZ(i, waveA * 0.032 + waveB * 0.014 + waveC * 0.009)
    }
    positions.needsUpdate = true
    if (quality !== 'mobile') geometry.computeVertexNormals()
  })

  return (
    <mesh
      ref={waterRef}
      rotation-x={-Math.PI / 2}
      position={[0, 0.045, 0]}
      onClick={onPoolClick}
      receiveShadow
    >
      <planeGeometry args={[15.4, 7.65, ...waterSegments]} />
      <meshPhysicalMaterial
        color="#00a8d2"
        roughness={0.075}
        metalness={0.08}
        clearcoat={1}
        clearcoatRoughness={0.025}
        emissive="#003a55"
        emissiveIntensity={0.11}
        transparent={false}
        opacity={1}
        ior={1.333}
        side={THREE.DoubleSide}
      />
    </mesh>
  )
}

function PoolFish({ index, quality }: { index: number; quality: GraphicsTier }) {
  const rootRef = useRef<THREE.Group>(null)
  const tailRef = useRef<THREE.Group>(null)
  const phase = index * 1.73
  const colors = ['#ffb547', '#38b7c5', '#f28c59', '#86c86a', '#e8d26a', '#6e9ee8']
  useFrame((state) => {
    const group = rootRef.current
    if (!group) return
    const t = state.clock.elapsedTime * (0.28 + (index % 4) * 0.035) + phase
    const x = Math.sin(t) * (3.7 + (index % 3) * 0.72)
    const z = Math.cos(t * 0.73) * (1.55 + (index % 2) * 0.55)
    const dx = Math.cos(t)
    const dz = -Math.sin(t * 0.73) * 0.73
    group.position.set(x, -0.78 - (index % 5) * 0.25 + Math.sin(t * 1.8) * 0.075, z)
    group.rotation.y = Math.atan2(dx, dz)
    if (tailRef.current) tailRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 5.5 + phase) * 0.42
  })
  const color = colors[index % colors.length]
  return (
    <group ref={rootRef} raycast={noRaycast}>
      <mesh scale={[0.2, 0.14, 0.42]}>
        <sphereGeometry args={[1, quality === 'mobile' ? 10 : 16, quality === 'mobile' ? 8 : 12]} />
        <meshStandardMaterial color={color} roughness={0.38} metalness={0.06} />
      </mesh>
      <group ref={tailRef} position={[0, 0, -0.34]}>
        <mesh rotation-y={Math.PI / 2} position={[0, 0, -0.14]}>
          <coneGeometry args={[0.19, 0.34, 3]} />
          <meshStandardMaterial color={color} roughness={0.5} side={THREE.DoubleSide} />
        </mesh>
      </group>
      <mesh position={[0.08, 0.045, 0.2]}>
        <sphereGeometry args={[0.025, 8, 8]} />
        <meshBasicMaterial color="#10222a" />
      </mesh>
      <mesh position={[0, 0.12, -0.02]} rotation-x={0.3}>
        <coneGeometry args={[0.11, 0.22, 4]} />
        <meshStandardMaterial color={color} roughness={0.5} />
      </mesh>
    </group>
  )
}

function PoolTurtle({ quality }: { quality: GraphicsTier }) {
  const rootRef = useRef<THREE.Group>(null)
  const flippersRef = useRef<THREE.Group>(null)
  useFrame((state) => {
    const group = rootRef.current
    if (!group) return
    const t = state.clock.elapsedTime * 0.22
    group.position.set(Math.sin(t) * 2.1, -1.62 + Math.sin(t * 2.2) * 0.06, Math.cos(t * 0.82) * 1.05)
    group.rotation.y = t + Math.PI * 0.5
    if (flippersRef.current) flippersRef.current.rotation.z = Math.sin(state.clock.elapsedTime * 2.6) * 0.12
  })
  return (
    <group ref={rootRef} raycast={noRaycast}>
      <mesh position={[0, 0, 0]} scale={[0.56, 0.22, 0.76]}>
        <sphereGeometry args={[1, quality === 'mobile' ? 12 : 20, quality === 'mobile' ? 8 : 14]} />
        <meshStandardMaterial color="#6b7650" roughness={0.72} />
      </mesh>
      <mesh position={[0, -0.02, 0]} scale={[0.48, 0.11, 0.66]}>
        <sphereGeometry args={[1, 16, 10]} />
        <meshStandardMaterial color="#b6a77c" roughness={0.88} />
      </mesh>
      <mesh position={[0, 0.02, 0.65]}>
        <sphereGeometry args={[0.22, 14, 10]} />
        <meshStandardMaterial color="#718b50" roughness={0.68} />
      </mesh>
      <group ref={flippersRef}>
        {[-1, 1].flatMap((side) => [-1, 1].map((front) => (
          <mesh key={`${side}-${front}`} position={[side * 0.52, -0.025, front * 0.43]} rotation-y={side * 0.25} rotation-z={side * 0.16}>
            <capsuleGeometry args={[0.12, 0.38, 4, 8]} />
            <meshStandardMaterial color="#728b50" roughness={0.7} />
          </mesh>
        )))}
      </group>
      <mesh position={[0.075, 0.085, 0.82]}>
        <sphereGeometry args={[0.027, 8, 8]} />
        <meshBasicMaterial color="#101b12" />
      </mesh>
    </group>
  )
}

function PoolHabitat({ quality }: { quality: GraphicsTier }) {
  const fishCount = quality === 'mobile' ? 4 : quality === 'balanced' ? 7 : 10
  return (
    <group>
      <mesh position={[0, -1.26, 0]} raycast={noRaycast}>
        <boxGeometry args={[15.7, 2.38, 8.0]} />
        <meshBasicMaterial color="#168eb0" transparent opacity={0.075} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      {Array.from({ length: fishCount }, (_, index) => <PoolFish key={`fish-${index}`} index={index} quality={quality} />)}
      <PoolTurtle quality={quality} />
      {quality !== 'mobile' && [-5.8, 5.8].map((x, index) => (
        <group key={x} position={[x, -1.55, index === 0 ? -2.6 : 2.6]} raycast={noRaycast}>
          <mesh position={[0, 0.22, 0]}><coneGeometry args={[0.3, 0.62, 7]} /><meshStandardMaterial color={index ? '#d47a62' : '#d5a45f'} roughness={0.9} /></mesh>
          <mesh position={[0.28, 0.3, 0.16]}><coneGeometry args={[0.22, 0.48, 7]} /><meshStandardMaterial color={index ? '#e1ad6b' : '#7ea66e'} roughness={0.9} /></mesh>
        </group>
      ))}
    </group>
  )
}

function Pool({ position = [34, 0, -14], onPathClick, onPoolClick, quality }: { position?: [number, number, number]; onPathClick: (e: ThreeEvent<MouseEvent>) => void; onPoolClick: (e: ThreeEvent<MouseEvent>) => void; quality: GraphicsTier }) {
  return (
    <group position={position}>
      {/* Four separate travertine deck slabs leave a true open basin in the middle for visible water. */}
      <group>
        <mesh position={[-8.86, 0.015, 0]} receiveShadow onClick={onPathClick}>
          <boxGeometry args={[1.05, 0.14, 10.45]} />
          <meshStandardMaterial color="#a88e6c" roughness={0.94} />
        </mesh>
        <mesh position={[8.86, 0.015, 0]} receiveShadow onClick={onPathClick}>
          <boxGeometry args={[1.05, 0.14, 10.45]} />
          <meshStandardMaterial color="#a88e6c" roughness={0.94} />
        </mesh>
        <mesh position={[0, 0.015, -4.72]} receiveShadow onClick={onPathClick}>
          <boxGeometry args={[18.75, 0.14, 1.05]} />
          <meshStandardMaterial color="#a88e6c" roughness={0.94} />
        </mesh>
        <mesh position={[0, 0.015, 4.72]} receiveShadow onClick={onPathClick}>
          <boxGeometry args={[18.75, 0.14, 1.05]} />
          <meshStandardMaterial color="#a88e6c" roughness={0.94} />
        </mesh>
      </group>
      <mesh position={[0, -1.26, 0]} receiveShadow raycast={noRaycast}>
        <boxGeometry args={[16.65, 2.48, 9.15]} />
        <meshStandardMaterial color="#147e9b" roughness={0.26} metalness={0.08} />
      </mesh>
      {[
        { p: [0, 0.105, -4.72] as [number, number, number], s: [18.85, 0.12, 0.12] as [number, number, number] },
        { p: [0, 0.105, 4.72] as [number, number, number], s: [18.85, 0.12, 0.12] as [number, number, number] },
        { p: [-8.86, 0.105, 0] as [number, number, number], s: [0.12, 0.12, 10.55] as [number, number, number] },
        { p: [8.86, 0.105, 0] as [number, number, number], s: [0.12, 0.12, 10.55] as [number, number, number] },
      ].map((edge, i) => (
        <mesh key={i} position={edge.p} castShadow receiveShadow raycast={noRaycast}>
          <boxGeometry args={edge.s} />
          <meshStandardMaterial color="#907654" roughness={0.78} />
        </mesh>
      ))}
      {/* Clear, bright turquoise water surface with animated ripples. */}
      <PoolWater onPoolClick={onPoolClick} quality={quality} />
      <mesh position={[0, -2.55, 0]} receiveShadow raycast={noRaycast}>
        <boxGeometry args={[15.8, 0.12, 8.1]} />
        <meshStandardMaterial color="#0a6e8c" roughness={0.48} metalness={0.04} />
      </mesh>
      <PoolHabitat quality={quality} />
      {/* Three wide submerged steps at the shallow end. */}
      {[0, 1, 2].map((i) => (
        <mesh key={i} position={[-5.15 + i * 0.62, 0.0 + i * 0.035, 4.0 - i * 0.58]} receiveShadow raycast={noRaycast}>
          <boxGeometry args={[0.62, 0.09, 0.95]} />
          <meshStandardMaterial color="#e6dfce" roughness={0.45} />
        </mesh>
      ))}
      {/* Fine waterline light and stainless ladder. */}
      <mesh position={[0, 0.27, -4.12]} raycast={noRaycast}>
        <boxGeometry args={[15.8, 0.055, 0.06]} />
        <meshStandardMaterial color="#f4f0e6" emissive="#c4f1f0" emissiveIntensity={0.2} />
      </mesh>
      {[-6.3, -5.8].map((x) => (
        <mesh key={x} position={[x, 0.55, -4.15]} rotation-x={Math.PI / 2} raycast={noRaycast}>
          <torusGeometry args={[0.5, 0.035, 10, 28, Math.PI]} />
          <meshStandardMaterial color="#d7dadd" metalness={0.92} roughness={0.18} />
        </mesh>
      ))}
    </group>
  )
}

function GardenChair({ position, worldOffset = [0, 0, 0], rotationY, onSeat, label }: { position: [number, number, number]; worldOffset?: [number, number, number]; rotationY: number; onSeat: SeatHandler; label: string }) {
  const offset = new THREE.Vector3(0, 0, 0.38).applyAxisAngle(UP, rotationY)
  return (
    <Interactive
      label={`${label}에 앉기`}
      labelOffset={[0, 1.35, 0]}
      position={position}
      rotation={[0, rotationY, 0]}
      onActivate={() => onSeat([position[0] + worldOffset[0] + offset.x, position[1] + worldOffset[1] + 0.035, position[2] + worldOffset[2] + offset.z], rotationY)}
    >
      {/* Solid teak frame with thick outdoor cushions and rounded arm rests. */}
      <RoundedBox args={[0.78, 0.14, 0.76]} radius={0.055} smoothness={5} position={[0, 0.45, 0.03]} castShadow receiveShadow>
        <meshStandardMaterial color="#6e5035" roughness={0.48} />
      </RoundedBox>
      <RoundedBox args={[0.72, 0.14, 0.69]} radius={0.085} smoothness={7} position={[0, 0.56, 0.05]} castShadow>
        <meshPhysicalMaterial color="#e3d7c5" roughness={0.98} />
      </RoundedBox>
      <RoundedBox args={[0.76, 0.88, 0.16]} radius={0.065} smoothness={6} position={[0, 0.91, -0.27]} rotation-x={-0.12} castShadow>
        <meshStandardMaterial color="#79583a" roughness={0.48} />
      </RoundedBox>
      <RoundedBox args={[0.68, 0.75, 0.095]} radius={0.085} smoothness={7} position={[0, 0.96, -0.17]} rotation-x={-0.12}>
        <meshPhysicalMaterial color="#e3d7c5" roughness={0.98} />
      </RoundedBox>
      {[-0.43, 0.43].map((x) => (
        <group key={x} position={[x, 0.72, 0.03]}>
          <RoundedBox args={[0.13, 0.13, 0.78]} radius={0.055} smoothness={5} position={[0, 0, 0]}>
            <meshStandardMaterial color="#79583a" roughness={0.48} />
          </RoundedBox>
          <mesh position={[0, -0.35, 0.03]} castShadow>
            <cylinderGeometry args={[0.038, 0.046, 0.68, 12]} />
            <meshStandardMaterial color="#61462f" roughness={0.48} />
          </mesh>
        </group>
      ))}
      {[-0.3, 0.3].map((x) => [-0.23, 0.31].map((z) => (
        <mesh key={`${x}-${z}`} position={[x, 0.22, z]} castShadow>
          <cylinderGeometry args={[0.035, 0.045, 0.42, 12]} />
          <meshStandardMaterial color="#65482f" roughness={0.48} />
        </mesh>
      )))}
    </Interactive>
  )
}

function DiningTable({ position, index, onSeat }: { position: [number, number, number]; index: number; onSeat: SeatHandler }) {
  const chairs: { position: [number, number, number]; rotation: number }[] = [
    { position: [-1.65, 0, 0], rotation: Math.PI / 2 },
    { position: [1.65, 0, 0], rotation: -Math.PI / 2 },
    { position: [0, 0, 1.03], rotation: Math.PI },
    { position: [0, 0, -1.03], rotation: 0 },
  ]
  return (
    <group position={position}>
      <group>
        <RoundedBox args={[2.9, 0.16, 1.45]} radius={0.065} smoothness={6} position={[0, 0.83, 0]} castShadow receiveShadow raycast={noRaycast}>
          <meshPhysicalMaterial color={index % 2 ? '#725039' : '#826044'} roughness={0.38} clearcoat={0.2} />
        </RoundedBox>
        <mesh position={[0, 0.735, 0]} raycast={noRaycast}>
          <boxGeometry args={[2.72, 0.035, 1.27]} />
          <meshStandardMaterial color="#b18a5e" roughness={0.52} />
        </mesh>
        {[-1.18, 1.18].map((x) => [-0.5, 0.5].map((z) => (
          <mesh key={`${x}-${z}`} position={[x, 0.39, z]} castShadow raycast={noRaycast}>
            <boxGeometry args={[0.11, 0.74, 0.11]} />
            <meshStandardMaterial color="#493727" roughness={0.48} />
          </mesh>
        )))}
        <mesh position={[0, 0.925, 0]} raycast={noRaycast}>
          <boxGeometry args={[0.3, 0.015, 0.3]} />
          <meshStandardMaterial color="#c5a06b" metalness={0.55} roughness={0.3} />
        </mesh>
        <mesh position={[0, 2.55, 0]} castShadow raycast={noRaycast}>
          <cylinderGeometry args={[0.045, 0.06, 3.2, 16]} />
          <meshStandardMaterial color="#654a31" metalness={0.08} roughness={0.55} />
        </mesh>
        <mesh position={[0, 2.83, 0]} castShadow raycast={noRaycast}>
          <cylinderGeometry args={[0.16, 1.48, 0.48, 48, 1, true]} />
          <meshPhysicalMaterial color={index % 2 ? '#e7ddc9' : '#d9c8ad'} roughness={0.92} side={THREE.DoubleSide} />
        </mesh>
        <mesh position={[0, 2.91, 0]} raycast={noRaycast}>
          <torusGeometry args={[0.18, 0.035, 8, 24]} />
          <meshStandardMaterial color="#8b6b45" metalness={0.25} roughness={0.4} />
        </mesh>
      </group>
      {chairs.map((chair, i) => (
        <GardenChair key={i} position={chair.position} worldOffset={position} rotationY={chair.rotation} onSeat={onSeat} label={`정원 테이블 ${index + 1} 의자`} />
      ))}
    </group>
  )
}

function SunLounger({ position, rotationY, onRest, index }: { position: [number, number, number]; rotationY: number; onRest: SeatHandler; index: number }) {
  const offset = new THREE.Vector3(0, 0, 0.28).applyAxisAngle(UP, rotationY)
  return (
    <Interactive
      label={`비치베드 ${index + 1}에 누워 쉬기`}
      labelOffset={[0, 1.3, 0]}
      position={position}
      rotation={[0, rotationY, 0]}
      onActivate={() => onRest([position[0] + offset.x, position[1] + 0.035, position[2] + offset.z], rotationY)}
    >
      {/* Teak pool lounger with a thick linen mattress, adjustable back and small head pillow. */}
      <mesh position={[0, 0.25, 0]} castShadow>
        <boxGeometry args={[0.98, 0.12, 2.18]} />
        <meshStandardMaterial color="#745336" roughness={0.5} />
      </mesh>
      <RoundedBox args={[0.9, 0.16, 2.05]} radius={0.09} smoothness={6} position={[0, 0.39, 0.02]} castShadow>
        <meshPhysicalMaterial color={index % 2 ? '#e7dfd0' : '#f3eddf'} roughness={0.98} />
      </RoundedBox>
      <RoundedBox args={[0.84, 0.13, 0.84]} radius={0.075} smoothness={6} position={[0, 0.59, -0.62]} rotation-x={-0.44} castShadow>
        <meshPhysicalMaterial color={index % 2 ? '#e7dfd0' : '#f3eddf'} roughness={0.98} />
      </RoundedBox>
      <RoundedBox args={[0.5, 0.1, 0.28]} radius={0.08} smoothness={6} position={[0, 0.52, 0.78]}>
        <meshPhysicalMaterial color="#d3c4ad" roughness={0.98} />
      </RoundedBox>
      {[-0.43, 0.43].map((x) => (
        <group key={x} position={[x, 0.2, 0]}>
          <mesh castShadow><boxGeometry args={[0.055, 0.32, 2.0]} /><meshStandardMaterial color="#67482d" roughness={0.48} /></mesh>
          {[-0.84, 0.84].map((z) => (
            <mesh key={z} position={[0, -0.1, z]} castShadow>
              <boxGeometry args={[0.065, 0.25, 0.065]} />
              <meshStandardMaterial color="#67482d" roughness={0.48} />
            </mesh>
          ))}
        </group>
      ))}
    </Interactive>
  )
}

function ShoreBoulder({ position, scale, tint }: { position: [number, number, number]; scale: [number, number, number]; tint: string }) {
  return (
    <mesh position={position} scale={scale} rotation-y={position[0] * 0.03} castShadow receiveShadow raycast={noRaycast}>
      <icosahedronGeometry args={[1, 1]} />
      <meshStandardMaterial color={tint} roughness={0.96} flatShading />
    </mesh>
  )
}

export function Outdoor({ onPathClick, onPoolClick, onSeat, onRest, onStand, quality = 'high' }: { onPathClick: (e: ThreeEvent<MouseEvent>) => void; onPoolClick: (e: ThreeEvent<MouseEvent>) => void; onSeat: SeatHandler; onRest: SeatHandler; onStand: SeatHandler; quality?: GraphicsTier }) {
  // The coast photograph in the front bay is intentionally preserved unchanged.
  // Close trees are reduced by about half; the distant seeded forest remains as a continuous skyline.
  const frontAngle = -Math.PI / 2
  const clearBayHalfAngle = 0.72
  const outsideBay = (angle: number) => {
    const d = Math.atan2(Math.sin(angle - frontAngle), Math.cos(angle - frontAngle))
    return Math.abs(d) > clearBayHalfAngle
  }
  const poolCenter: [number, number] = [34, -14]
  const inPoolClearance = (x: number, z: number) => Math.hypot(x - poolCenter[0], z - poolCenter[1]) < 20.5
  // A rectangular hard exclusion also covers the full pool deck and its four corners.
  const inPoolFootprint = (x: number, z: number) => Math.abs(x - poolCenter[0]) < 13.4 && Math.abs(z - poolCenter[1]) < 9.2
  // Behind the pavilion is now an open lawn with tables and loungers, not a wall of trunks.
  const inRearLoungeZone = (x: number, z: number) => Math.abs(x) < 25 && z >= 17 && z <= 50
  const inNoTreeZone = (x: number, z: number) => inPoolClearance(x, z) || inPoolFootprint(x, z) || inRearLoungeZone(x, z)

  const treeCount = quality === 'mobile' ? 36 : quality === 'balanced' ? 82 : 115
  const forestRandom = seeded(20261117)
  const trees: { position: [number, number, number]; scale: number; seed: number }[] = []
  let attempts = 0
  while (trees.length < treeCount && attempts < treeCount * 35) {
    attempts += 1
    const angle = forestRandom() * Math.PI * 2
    if (!outsideBay(angle)) continue
    const radius = Math.min(56 + forestRandom() * 76 + Math.sin(trees.length * 2.17) * 1.1, getIslandEdgeRadius(angle) - 5.5)
    const x = Math.cos(angle) * radius
    const z = Math.sin(angle) * radius
    if (inNoTreeZone(x, z)) continue
    trees.push({
      position: [x, getIslandGroundHeight(x, z), z],
      scale: 0.88 + forestRandom() * 0.84,
      seed: 520 + trees.length * 31 + Math.floor(forestRandom() * 17),
    })
  }

  // Side forest rows are more widely spaced. Broader leafy canopies overlap to hide empty blue-sky wedges.
  // Keep the center-front bay clear and preserve natural forest coverage beyond the lounge area.
  const nearForest: { position: [number, number, number]; scale: number; seed: number }[] = []
  const sideStep = quality === 'mobile' ? 13.2 : quality === 'balanced' ? 11.8 : 10.8
  // One near row instead of two cuts the visible trunks around the pavilion roughly in half.
  const sideRows = quality === 'mobile' ? [35] : [32]
  for (const side of [-1, 1]) {
    for (const rowX of sideRows) {
      let rowIndex = 0
      for (let z = -62; z <= 72; z += sideStep) {
        const staggeredZ = z + ((rowIndex + (side > 0 ? 1 : 0)) % 2) * (sideStep * 0.34)
        const x = side * (rowX + Math.sin(rowIndex * 1.7 + rowX) * 1.25)
        if (inNoTreeZone(x, staggeredZ)) { rowIndex += 1; continue }
        nearForest.push({
          position: [x, getIslandGroundHeight(x, staggeredZ), staggeredZ],
          scale: 1.0 + ((rowIndex * 7 + rowX) % 5) * 0.12,
          seed: 9100 + nearForest.length * 17 + (side > 0 ? 3 : 0),
        })
        rowIndex += 1
      }
    }
  }

  const rearForest: { position: [number, number, number]; scale: number; seed: number }[] = []
  const rearTreeXs = quality === 'mobile' ? [-42, -24, 0, 24, 42] : [-48, -34, -20, -7, 7, 20, 34, 48]
  ;[58, 73].forEach((z, row) => rearTreeXs.forEach((x, index) => {
    if (inNoTreeZone(x, z)) return
    rearForest.push({
      position: [x, getIslandGroundHeight(x, z), z],
      scale: 0.92 + ((row * 3 + index) % 4) * 0.13,
      seed: 12600 + row * 101 + index * 13,
    })
  }))

  const undergrowthCount = quality === 'mobile' ? 28 : quality === 'balanced' ? 52 : 73
  const undergrowth: { position: [number, number, number]; seed: number }[] = []
  attempts = 0
  while (undergrowth.length < undergrowthCount && attempts < undergrowthCount * 30) {
    attempts += 1
    const angle = forestRandom() * Math.PI * 2
    if (!outsideBay(angle)) continue
    const radius = Math.min(52 + forestRandom() * 76, getIslandEdgeRadius(angle) - 3.8)
    const x = Math.cos(angle) * radius
    const z = Math.sin(angle) * radius
    if (inNoTreeZone(x, z)) continue
    undergrowth.push({ position: [x, getIslandGroundHeight(x, z), z], seed: 1800 + undergrowth.length * 29 })
  }

  const tablePositions: [number, number, number][] = [
    [-13, getIslandGroundHeight(-13, -13), -13],
    [13, getIslandGroundHeight(13, -13), -13],
    [-13, getIslandGroundHeight(-13, -29), -29],
    [13, getIslandGroundHeight(13, -29), -29],
    [0, getIslandGroundHeight(0, -30), -30],
    // Back garden dining sets replace the close rear tree wall.
    [-14, getIslandGroundHeight(-14, 22), 22],
    [14, getIslandGroundHeight(14, 22), 22],
    [0, getIslandGroundHeight(0, 36), 36],
  ]
  const beds = [
    { position: [-10.2, getIslandGroundHeight(-10.2, -24), -24] as [number, number, number], rotationY: Math.PI / 2 },
    { position: [-10.2, getIslandGroundHeight(-10.2, -30), -30] as [number, number, number], rotationY: Math.PI / 2 },
    { position: [-10.2, getIslandGroundHeight(-10.2, -36), -36] as [number, number, number], rotationY: Math.PI / 2 },
    { position: [10.2, getIslandGroundHeight(10.2, -24), -24] as [number, number, number], rotationY: -Math.PI / 2 },
    { position: [10.2, getIslandGroundHeight(10.2, -30), -30] as [number, number, number], rotationY: -Math.PI / 2 },
    { position: [10.2, getIslandGroundHeight(10.2, -36), -36] as [number, number, number], rotationY: -Math.PI / 2 },
    ...Array.from({ length: 10 }, (_, i) => {
      const x = -7.8 + (i % 5) * 3.9
      const z = -33 - Math.floor(i / 5) * 4.2
      return { position: [x, getIslandGroundHeight(x, z), z] as [number, number, number], rotationY: 0 }
    }),
    // Matching loungers and click-to-lie spots in the rear garden.
    ...Array.from({ length: 8 }, (_, i) => {
      const x = i % 2 === 0 ? -22.0 : 22.0
      const z = 21.5 + Math.floor(i / 2) * 4.6
      return { position: [x, getIslandGroundHeight(x, z), z] as [number, number, number], rotationY: i % 2 === 0 ? Math.PI / 2 : -Math.PI / 2 }
    }),
  ]

  const boulderCount = quality === 'mobile' ? 5 : quality === 'balanced' ? 8 : 12
  const boulders = Array.from({ length: boulderCount }, (_, index) => {
    const side = index % 2 === 0 ? -1 : 1
    const row = Math.floor(index / 2)
    const angle = frontAngle + side * (0.92 + row * 0.075 + Math.sin(index * 4.7) * 0.035)
    const radius = getIslandEdgeRadius(angle) - 2.8 - (index % 3) * 1.2
    const x = Math.cos(angle) * radius
    const z = Math.sin(angle) * radius
    const size = 1.1 + (index % 5) * 0.34
    const colors = ['#817b70', '#9a9282', '#68675f', '#aaa08e']
    return { position: [x, getIslandGroundHeight(x, z) - 0.2, z] as [number, number, number], scale: [size * 1.3, size * 0.78, size] as [number, number, number], tint: colors[index % colors.length] }
  })

  const toWorldPosition = (position: [number, number, number]): [number, number, number] => [
    -position[0], position[1], -position[2],
  ]
  // Keep the requested body action intact while converting garden-local coordinates
  // through the 180-degree Outdoor group rotation.
  const worldSeat = (position: [number, number, number], rotationY: number) =>
    onSeat(toWorldPosition(position), rotationY + Math.PI)
  const worldRest = (position: [number, number, number], rotationY: number) =>
    onRest(toWorldPosition(position), rotationY + Math.PI)
  const worldStand = (position: [number, number, number], rotationY: number) =>
    onStand(toWorldPosition(position), rotationY + Math.PI)

  return (
    <group rotation-y={Math.PI}>
      {/* Front-only coast photo and 3D bay; the sides and rear are backed by the forest belt. */}
      <IslandTerrain quality={quality} onPathClick={onPathClick} />
      <ForestPanorama quality={quality} />
      <CoastalSea quality={quality} />
      <FrontCoastalBackdrop quality={quality} />
      <FrontBeachDune quality={quality} />
      <Pool position={[34, 0, -14]} onPathClick={onPathClick} onPoolClick={onPoolClick} quality={quality} />
      {tablePositions.map((position, index) => <DiningTable key={index} position={position} index={index} onSeat={worldSeat} />)}
      {beds.map((bed, index) => <SunLounger key={index} {...bed} index={index} onRest={worldRest} />)}
      {trees.map((tree) => <ForestTree key={tree.seed} {...tree} quality={quality} />)}
      {nearForest.map((tree) => <ForestTree key={`near-${tree.seed}`} {...tree} quality={quality} />)}
      {rearForest.map((tree) => <ForestTree key={`rear-${tree.seed}`} {...tree} quality={quality} />)}
      {undergrowth.map((plant) => <Understory key={plant.seed} {...plant} quality={quality} />)}
      {boulders.map((rock, index) => <ShoreBoulder key={`shore-rock-${index}`} {...rock} />)}
      <FitnessStation position={[-17.5, getIslandGroundHeight(-17.5, -3.5), -3.5]} kind="treadmill" label="러닝머신" onSeat={worldSeat} onRest={worldRest} onStand={worldStand} />
      <FitnessStation position={[17.5, getIslandGroundHeight(17.5, -3.5), -3.5]} kind="bike" label="실내 자전거" onSeat={worldSeat} onRest={worldRest} onStand={worldStand} />
      <FitnessStation position={[-20.5, getIslandGroundHeight(-20.5, 5), 5]} kind="elliptical" label="일립티컬" onSeat={worldSeat} onRest={worldRest} onStand={worldStand} />
      <FitnessStation position={[20.5, getIslandGroundHeight(20.5, 5), 5]} kind="rower" label="로잉 머신" onSeat={worldSeat} onRest={worldRest} onStand={worldStand} />
      {/* 추가 운동기구 7종: 선택하면 해당 위치로 이동한 뒤 기구와 캐릭터 동작이 함께 시작합니다. */}
      <FitnessStation position={[-25.5, getIslandGroundHeight(-25.5, -10), -10]} kind="stepper" label="스텝퍼" onSeat={worldSeat} onRest={worldRest} onStand={worldStand} />
      <FitnessStation position={[-34, getIslandGroundHeight(-34, -12), -12]} kind="chest-press" label="체스트 프레스" onSeat={worldSeat} onRest={worldRest} onStand={worldStand} />
      <FitnessStation position={[-28, getIslandGroundHeight(-28, 3), 3]} kind="lat-pulldown" label="랫 풀다운" onSeat={worldSeat} onRest={worldRest} onStand={worldStand} />
      <FitnessStation position={[28, getIslandGroundHeight(28, 3), 3]} kind="leg-press" label="레그 프레스" onSeat={worldSeat} onRest={worldRest} onStand={worldStand} />
      <FitnessStation position={[-25, getIslandGroundHeight(-25, 13), 13]} kind="punching-bag" label="샌드백 복싱" onSeat={worldSeat} onRest={worldRest} onStand={worldStand} />
      <FitnessStation position={[25, getIslandGroundHeight(25, 13), 13]} kind="bench-press" label="벤치 프레스" onSeat={worldSeat} onRest={worldRest} onStand={worldStand} />
      <FitnessStation position={[0, getIslandGroundHeight(0, 48), 48]} kind="yoga-mat" label="요가·스트레칭 매트" onSeat={worldSeat} onRest={worldRest} onStand={worldStand} />
    </group>
  )
}
