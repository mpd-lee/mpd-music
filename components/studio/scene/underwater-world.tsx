'use client'

import type { ThreeEvent } from '@react-three/fiber'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, type MutableRefObject } from 'react'
import { useTexture } from '@react-three/drei'
import * as THREE from 'three'
import type { GraphicsTier } from '@/lib/graphics-quality'
import { UNDERWATER_FLOOR_Y } from '@/lib/world-depth'

const noRaycast = () => null

function blendCanvasSeams(ctx: CanvasRenderingContext2D, width: number, height: number, band: number, vertical = false) {
  const image = ctx.getImageData(0, 0, width, height)
  const data = image.data
  const mix = (a: number, b: number, t: number) => a + (b - a) * t
  const size = Math.max(2, Math.min(band, Math.floor(width / 8)))

  // Blend the left/right edges over a narrow band so the 360° texture closes cleanly.
  for (let y = 0; y < height; y += 1) {
    const leftStart = (y * width) * 4
    const rightStart = (y * width + width - 1) * 4
    const average = [0, 1, 2, 3].map((channel) => (data[leftStart + channel] + data[rightStart + channel]) * 0.5)
    const leftOriginal = new Uint8ClampedArray(size * 4)
    const rightOriginal = new Uint8ClampedArray(size * 4)
    for (let x = 0; x < size; x += 1) {
      for (let channel = 0; channel < 4; channel += 1) {
        leftOriginal[x * 4 + channel] = data[(y * width + x) * 4 + channel]
        rightOriginal[x * 4 + channel] = data[(y * width + width - size + x) * 4 + channel]
      }
    }
    for (let x = 0; x < size; x += 1) {
      const t = x / (size - 1)
      for (let channel = 0; channel < 4; channel += 1) {
        data[(y * width + x) * 4 + channel] = mix(average[channel], leftOriginal[x * 4 + channel], t)
        data[(y * width + width - size + x) * 4 + channel] = mix(rightOriginal[x * 4 + channel], average[channel], t)
      }
    }
  }

  if (vertical) {
    const verticalBand = Math.max(2, Math.min(band, Math.floor(height / 8)))
    const rowAverage = new Float32Array(width * 4)
    const topOriginal = new Uint8ClampedArray(verticalBand * width * 4)
    const bottomOriginal = new Uint8ClampedArray(verticalBand * width * 4)
    for (let x = 0; x < width; x += 1) {
      for (let channel = 0; channel < 4; channel += 1) {
        rowAverage[x * 4 + channel] = (data[x * 4 + channel] + data[((height - 1) * width + x) * 4 + channel]) * 0.5
      }
    }
    for (let y = 0; y < verticalBand; y += 1) {
      for (let x = 0; x < width; x += 1) {
        for (let channel = 0; channel < 4; channel += 1) {
          topOriginal[(y * width + x) * 4 + channel] = data[(y * width + x) * 4 + channel]
          bottomOriginal[(y * width + x) * 4 + channel] = data[((height - verticalBand + y) * width + x) * 4 + channel]
        }
      }
    }
    for (let y = 0; y < verticalBand; y += 1) {
      const t = y / (verticalBand - 1)
      for (let x = 0; x < width; x += 1) {
        for (let channel = 0; channel < 4; channel += 1) {
          const average = rowAverage[x * 4 + channel]
          data[(y * width + x) * 4 + channel] = mix(average, topOriginal[(y * width + x) * 4 + channel], t)
          data[((height - verticalBand + y) * width + x) * 4 + channel] = mix(bottomOriginal[(y * width + x) * 4 + channel], average, t)
        }
      }
    }
  }
  ctx.putImageData(image, 0, 0)
}

function createSeabedTexture(quality: GraphicsTier) {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  const textureSize = quality === 'mobile' ? 768 : quality === 'balanced' ? 1536 : 2048
  canvas.width = textureSize
  canvas.height = textureSize
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height)
  gradient.addColorStop(0, '#718d83')
  gradient.addColorStop(0.20, '#b8b49a')
  gradient.addColorStop(0.53, '#d0c6a5')
  gradient.addColorStop(0.82, '#a7a58d')
  gradient.addColorStop(1, '#637d75')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  let seed = 19871031
  const random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646 }
  const size = canvas.width
  const grainCount = quality === 'mobile' ? 12000 : quality === 'balanced' ? 36000 : 68000
  for (let i = 0; i < grainCount; i += 1) {
    const x = random() * size
    const y = random() * size
    const r = 0.35 + random() * 2.4
    const shade = Math.round(112 + random() * 105)
    ctx.fillStyle = `rgba(${shade - 4},${shade + 1},${shade - 2},${0.035 + random() * 0.11})`
    ctx.beginPath(); ctx.ellipse(x, y, r * 1.55, r, random() * Math.PI, 0, Math.PI * 2); ctx.fill()
  }
  for (let i = 0; i < 150; i += 1) {
    const x = random() * size
    const y = random() * size
    const r = 1.2 + random() * 5.5
    ctx.fillStyle = `rgba(${70 + Math.round(random() * 50)},${78 + Math.round(random() * 42)},${62 + Math.round(random() * 32)},${0.12 + random() * 0.2})`
    ctx.beginPath(); ctx.ellipse(x, y, r, r * (0.45 + random() * 0.6), random() * Math.PI, 0, Math.PI * 2); ctx.fill()
  }
  // Fine, low-contrast current marks make the sand read as a seabed rather than a flat plane.
  for (let i = 0; i < 52; i += 1) {
    const y = random() * size
    ctx.strokeStyle = `rgba(239,244,222,${0.045 + random() * 0.065})`
    ctx.lineWidth = Math.max(1, size / 512) * (1 + random() * 1.6)
    ctx.beginPath(); ctx.moveTo(0, y); ctx.bezierCurveTo(size * 0.25, y - 8 + random() * 16, size * 0.68, y + 8 - random() * 16, size, y + random() * 8); ctx.stroke()
  }
  // Organic, low-contrast reef detritus and algae patches break up the sand without a tiled look.
  for (let i = 0; i < 110; i += 1) {
    const x = random() * size, y = random() * size
    const rx = size * (0.006 + random() * 0.014), ry = rx * (0.25 + random() * 0.45)
    ctx.fillStyle = `rgba(${38 + Math.floor(random() * 28)},${76 + Math.floor(random() * 36)},${67 + Math.floor(random() * 25)},${0.045 + random() * 0.075})`
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, random() * Math.PI, 0, Math.PI * 2); ctx.fill()
  }
  blendCanvasSeams(ctx, canvas.width, canvas.height, 26, true)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(quality === 'mobile' ? 2.4 : quality === 'balanced' ? 2.8 : 3.2, quality === 'mobile' ? 2.4 : quality === 'balanced' ? 2.8 : 3.2)
  texture.anisotropy = quality === 'mobile' ? 2 : quality === 'balanced' ? 8 : 16
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.generateMipmaps = true
  return texture
}

type FishProps = { index: number; quality: GraphicsTier; school?: number; baseDepth?: number }

function createUnderwaterPanorama(quality: GraphicsTier) {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = quality === 'mobile' ? 1024 : 2048
  canvas.height = canvas.width / 2
  const width = canvas.width
  const height = canvas.height
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  const water = ctx.createLinearGradient(0, 0, 0, height)
  water.addColorStop(0, '#70c4d7')
  water.addColorStop(0.08, '#2787a8')
  water.addColorStop(0.22, '#096486')
  water.addColorStop(0.42, '#064667')
  water.addColorStop(0.66, '#03314e')
  water.addColorStop(0.86, '#021f38')
  water.addColorStop(1, '#011326')
  ctx.fillStyle = water
  ctx.fillRect(0, 0, width, height)

  // Soft surface light fans, kept broad and low-contrast so they read as water volume.
  const shafts = quality === 'mobile' ? 3 : quality === 'balanced' ? 6 : 9
  for (let i = 0; i < shafts; i += 1) {
    const x = (i + 0.5) / shafts * width + Math.sin(i * 2.3) * width * 0.025
    const spread = width * (0.025 + (i % 3) * 0.009)
    const beam = ctx.createLinearGradient(x, 0, x + spread * 1.5, height * 0.72)
    beam.addColorStop(0, 'rgba(206,244,255,0.20)')
    beam.addColorStop(0.42, 'rgba(95,190,225,0.075)')
    beam.addColorStop(1, 'rgba(32,112,160,0)')
    ctx.fillStyle = beam
    ctx.beginPath()
    ctx.moveTo(x - spread * 0.35, 0)
    ctx.lineTo(x + spread * 0.35, 0)
    ctx.lineTo(x + spread * 2.2, height * 0.78)
    ctx.lineTo(x - spread * 1.5, height * 0.78)
    ctx.closePath()
    ctx.fill()
  }

  // Subtle caustic filaments near the bright upper water, not high-frequency noise.
  ctx.lineWidth = Math.max(1, width / 1400)
  for (let i = 0; i < 42; i += 1) {
    const y = height * (0.06 + (i % 12) * 0.027)
    const amp = height * (0.004 + (i % 4) * 0.0015)
    ctx.strokeStyle = `rgba(190,248,255,${0.025 + (i % 5) * 0.009})`
    ctx.beginPath()
    for (let x = 0; x <= width; x += width / 96) {
      const yy = y + Math.sin(x / width * Math.PI * (5 + i % 4) + i * 0.7) * amp
      if (x === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy)
    }
    ctx.stroke()
  }

  // Broad, broken caustic patches give the upper water a shallow sunlit-water texture.
  const caustics = quality === 'mobile' ? 34 : 74
  for (let i = 0; i < caustics; i += 1) {
    const x = ((i * 67) % 997) / 997 * width
    const y = height * (0.10 + ((i * 29) % 430) / 1000)
    const rx = width * (0.006 + (i % 5) * 0.0018)
    const ry = height * (0.0025 + (i % 4) * 0.0012)
    ctx.strokeStyle = `rgba(195,250,255,${0.025 + (i % 4) * 0.012})`
    ctx.lineWidth = Math.max(1, width / 1800)
    ctx.beginPath()
    ctx.ellipse(x, y, rx, ry, (i % 7) * 0.18, 0, Math.PI * 2)
    ctx.stroke()
  }

  // Distant reef shelves span the entire panorama; trigonometric silhouettes meet seamlessly at both edges.
  const horizon = height * 0.49
  const drawRidge = (base: number, amplitude: number, phase: number, color: string) => {
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.moveTo(0, height)
    for (let x = 0; x <= width; x += width / 160) {
      const u = x / width * Math.PI * 2
      const y = base + Math.sin(u * 3 + phase) * amplitude + Math.sin(u * 7 - phase * 0.6) * amplitude * 0.24 + Math.cos(u * 11 + phase) * amplitude * 0.1
      ctx.lineTo(x, y)
    }
    ctx.lineTo(width, height)
    ctx.closePath()
    ctx.fill()
  }
  drawRidge(horizon - height * 0.125, height * 0.072, 0.7, '#477f84')
  drawRidge(horizon - height * 0.035, height * 0.085, 1.8, '#286976')
  drawRidge(horizon + height * 0.045, height * 0.095, 2.5, '#155267')
  drawRidge(horizon + height * 0.125, height * 0.105, 3.15, '#093b56')
  drawRidge(horizon + height * 0.205, height * 0.115, 4.05, '#052b43')
  // A distant broken pinnacle line gives the horizon a reef/island profile in every direction.
  ctx.fillStyle = '#0b5263'
  ctx.beginPath()
  ctx.moveTo(0, height)
  for (let x = 0; x <= width; x += width / 180) {
    const u = x / width * Math.PI * 2
    const ridge = horizon + height * (0.19 + 0.045 * Math.sin(u * 5 + 0.8) + 0.022 * Math.sin(u * 13 - 1.1))
    const pinnacle = Math.pow(Math.max(0, Math.sin(u * 9 + 0.42)), 8) * height * 0.11
    ctx.lineTo(x, ridge - pinnacle)
  }
  ctx.lineTo(width, height)
  ctx.closePath()
  ctx.fill()

  // Far coral silhouettes add a readable reef line without competing with the near 3D coral models.
  const coralPalette = ['#174c5b', '#1e5361', '#285768', '#335f68']
  const count = quality === 'mobile' ? 64 : quality === 'balanced' ? 112 : 148
  for (let i = 0; i < count; i += 1) {
    const x = width * (0.025 + (i / Math.max(1, count - 1)) * 0.95)
    const baseY = height * (0.59 + (i % 5) * 0.032)
    const scale = height * (0.055 + (i % 7) * 0.008)
    ctx.strokeStyle = coralPalette[i % coralPalette.length]
    ctx.lineWidth = Math.max(2, width / 700)
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(x, baseY)
    ctx.lineTo(x + Math.sin(i * 1.7) * scale * 0.15, baseY - scale)
    ctx.lineTo(x + Math.sin(i * 1.7 + 0.8) * scale * 0.36, baseY - scale * 1.7)
    ctx.moveTo(x, baseY - scale * 0.48)
    ctx.lineTo(x - scale * 0.46, baseY - scale * 0.92)
    ctx.moveTo(x + Math.sin(i * 1.7) * scale * 0.15, baseY - scale)
    ctx.lineTo(x + scale * 0.52, baseY - scale * 1.35)
    ctx.stroke()
  }

  // Marine snow and tiny suspended particles.
  let seed = 7631
  const random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646 }
  const particles = quality === 'mobile' ? 150 : quality === 'balanced' ? 340 : 520
  for (let i = 0; i < particles; i += 1) {
    const x = random() * width
    const y = random() * height * 0.88
    const radius = 0.45 + random() * (quality === 'mobile' ? 1 : 1.5)
    ctx.fillStyle = `rgba(204,245,248,${0.08 + random() * 0.18})`
    ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill()
  }

  blendCanvasSeams(ctx, canvas.width, canvas.height, Math.max(18, Math.floor(width * 0.018)), false)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.generateMipmaps = true
  texture.anisotropy = quality === 'mobile' ? 2 : 6
  return texture
}

function createCleanUnderwaterTexture(source: THREE.Texture, quality: GraphicsTier) {
  if (typeof document === 'undefined') return source
  const image = source.image as HTMLImageElement
  const sourceWidth = image?.naturalWidth || image?.width || 0
  const sourceHeight = image?.naturalHeight || image?.height || 0
  if (!sourceWidth || !sourceHeight) return source
  const maxWidth = quality === 'mobile' ? 1024 : 2048
  const width = Math.min(sourceWidth, maxWidth)
  const height = Math.max(1, Math.round(width * sourceHeight / sourceWidth))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return source

  // Preserve the V20 framing: the user approved this underwater field of view.
  // Only feather the 360 seam; the central blur is removed by omitting artificial light cones.
  const crop = Math.round(sourceWidth * 0.065)
  ctx.filter = quality === 'mobile' ? 'contrast(1.025) saturate(1.025)' : 'contrast(1.055) saturate(1.04)';
  ctx.drawImage(image, crop, 0, sourceWidth - crop * 2, sourceHeight, 0, 0, width, height)
  ctx.filter = 'none'
  const frame = ctx.getImageData(0, 0, width, height)
  const pixels = frame.data
  const band = Math.max(3, Math.floor(width * 0.010))
  for (let y = 0; y < height; y += 1) {
    const li = y * width * 4
    const ri = (y * width + width - 1) * 4
    const average = [0, 1, 2].map((c) => (pixels[li + c] + pixels[ri + c]) * 0.5)
    for (let x = 0; x < band; x += 1) {
      const t = x / Math.max(1, band - 1)
      const left = (y * width + x) * 4
      const right = (y * width + width - band + x) * 4
      for (let c = 0; c < 3; c += 1) {
        const a = pixels[left + c]
        const b = pixels[right + c]
        pixels[left + c] = Math.round(average[c] * (1 - t) + a * t)
        pixels[right + c] = Math.round(b * (1 - t) + average[c] * t)
      }
    }
  }
  ctx.putImageData(frame, 0, 0)
  const cleaned = new THREE.CanvasTexture(canvas)
  cleaned.colorSpace = THREE.SRGBColorSpace
  cleaned.wrapS = THREE.RepeatWrapping
  cleaned.wrapT = THREE.ClampToEdgeWrapping
  cleaned.repeat.set(1, 1)
  cleaned.anisotropy = quality === 'mobile' ? 2 : quality === 'balanced' ? 10 : 16
  cleaned.minFilter = THREE.LinearMipmapLinearFilter
  cleaned.magFilter = THREE.LinearFilter
  cleaned.generateMipmaps = true
  cleaned.needsUpdate = true
  return cleaned
}

function UnderwaterDome({ quality }: { quality: GraphicsTier }) {
  const dome = useRef<THREE.Mesh>(null)
  const source = useTexture(quality === 'mobile' ? '/images/mpd-underwater-real-panorama-mobile.webp' : '/images/mpd-underwater-real-panorama.webp')
  const texture = useMemo(() => createCleanUnderwaterTexture(source, quality), [source, quality])
  const geometry = useMemo(() => new THREE.SphereGeometry(252, quality === 'mobile' ? 48 : quality === 'balanced' ? 72 : 88, quality === 'mobile' ? 28 : quality === 'balanced' ? 44 : 52), [quality])
  useEffect(() => () => {
    if (texture !== source) texture.dispose()
    geometry.dispose()
  }, [texture, source, geometry])
  useFrame((_, delta) => {
    if (dome.current) dome.current.rotation.y += Math.min(delta, 0.05) * 0.00055
  })
  return (
    <mesh ref={dome} geometry={geometry} raycast={noRaycast} renderOrder={-10} rotation-y={Math.PI} frustumCulled={false}>
      <meshBasicMaterial map={texture} side={THREE.BackSide} fog={false} depthWrite={false} toneMapped={false} />
    </mesh>
  )
}

function TropicalFish({ index, quality, school = 0, baseDepth = -1.15 }: FishProps) {
  const root = useRef<THREE.Group>(null)
  const tail = useRef<THREE.Group>(null)
  const pectorals = useRef<THREE.Group>(null)
  const phase = index * 1.73 + school * 2.1
  const colors = ['#a99a70', '#66868c', '#a97860', '#789078', '#b2a16e', '#728596', '#928087', '#aaa595']
  const isClownfish = index % 7 === 0
  const color = isClownfish ? '#ed8738' : colors[(index + school * 3) % colors.length]
  const segments = quality === 'mobile' ? 18 : quality === 'balanced' ? 26 : 32
  const bodyGeometry = useMemo(() => {
    const profile = [
      new THREE.Vector2(0, -0.58),
      new THREE.Vector2(0.055, -0.54),
      new THREE.Vector2(0.115, -0.43),
      new THREE.Vector2(0.17, -0.24),
      new THREE.Vector2(0.205, -0.02),
      new THREE.Vector2(0.19, 0.18),
      new THREE.Vector2(0.145, 0.34),
      new THREE.Vector2(0.075, 0.47),
      new THREE.Vector2(0.025, 0.54),
      new THREE.Vector2(0, 0.56),
    ]
    const geometry = new THREE.LatheGeometry(profile, segments)
    geometry.rotateX(Math.PI / 2)
    return geometry
  }, [segments])
  useEffect(() => () => bodyGeometry.dispose(), [bodyGeometry])

  useFrame((state) => {
    const group = root.current
    if (!group) return
    const t = state.clock.elapsedTime * (0.19 + (index % 4) * 0.025) + phase
    const radiusX = 7.5 + (school % 3) * 4.5
    const radiusZ = 5 + (school % 4) * 3.0
    const x = Math.sin(t) * radiusX + Math.sin(t * 0.31 + school) * 4
    const z = Math.cos(t * 0.72) * radiusZ + (school - 1.5) * 7
    const y = baseDepth + Math.sin(t * 1.8 + school) * 1.25 - (index % 3) * 0.36
    const dx = Math.cos(t) * radiusX
    const dz = -Math.sin(t * 0.72) * radiusZ * 0.72
    group.position.set(x, y, z)
    group.rotation.y = Math.atan2(dx, dz)
    if (tail.current) tail.current.rotation.y = Math.sin(state.clock.elapsedTime * 5 + phase) * 0.48
    if (pectorals.current) pectorals.current.rotation.z = Math.sin(state.clock.elapsedTime * 4 + phase) * 0.12
  })

  return (
    <group ref={root} scale={0.62 + (index % 4) * 0.075} raycast={noRaycast} userData={{ mpdNoCollision: true }}>
      {/* A tapered, laterally compressed body with a defined tail peduncle and snout. */}
      <mesh geometry={bodyGeometry} castShadow={quality !== 'mobile'}>
        <meshPhysicalMaterial color={color} roughness={0.64} metalness={0.0} clearcoat={0.10} clearcoatRoughness={0.62} />
      </mesh>
      <mesh position={[0, -0.018, 0.535]} scale={[0.055, 0.042, 0.065]}>
        <sphereGeometry args={[1, 12, 9]} />
        <meshStandardMaterial color={color} roughness={0.48} />
      </mesh>
      <mesh position={[0, -0.015, 0.586]}>
        <sphereGeometry args={[0.012, 8, 6]} />
        <meshBasicMaterial color="#17212a" />
      </mesh>
      {/* Both eyes, with a pale iris glint. */}
      {[-1, 1].map((side) => (
        <group key={side} position={[side * 0.176, 0.036, 0.285]} rotation-y={side * 0.58}>
          <mesh scale={[0.032, 0.032, 0.018]}><sphereGeometry args={[1, 12, 10]} /><meshBasicMaterial color="#fff4d8" /></mesh>
          <mesh position={[side * 0.012, 0, 0.018]} scale={[0.016, 0.018, 0.01]}><sphereGeometry args={[1, 10, 8]} /><meshBasicMaterial color="#13222c" /></mesh>
          <mesh position={[-0.008, 0.012, 0.028]} scale={0.007}><sphereGeometry args={[1, 8, 6]} /><meshBasicMaterial color="#ffffff" /></mesh>
        </group>
      ))}
      {/* Forked tail and top/bottom fins. */}
      <group ref={tail} position={[0, 0, -0.43]}>
        {[-1, 1].map((side) => (
          <mesh key={side} position={[0, side * 0.105, -0.19]} rotation-x={side * 0.12} scale={[0.24, 0.20, 0.08]}>
            <coneGeometry args={[1, 1, 3]} />
            <meshPhysicalMaterial color={color} roughness={0.66} clearcoat={0.08} side={THREE.DoubleSide} />
          </mesh>
        ))}
      </group>
      <mesh position={[0, 0.155, -0.06]} rotation-x={Math.PI * 0.5} scale={[0.12, 0.25, 0.045]}>
        <coneGeometry args={[1, 1, 4]} />
        <meshStandardMaterial color={color} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, -0.135, -0.1]} rotation-x={-Math.PI * 0.5} scale={[0.09, 0.18, 0.04]}>
        <coneGeometry args={[1, 1, 4]} />
        <meshStandardMaterial color={color} side={THREE.DoubleSide} />
      </mesh>
      <group ref={pectorals}>
        {[-1, 1].map((side) => (
          <mesh key={side} position={[side * 0.175, -0.015, 0.035]} rotation={[0.2, side * 0.25, side * -0.42]} scale={[0.12, 0.035, 0.23]}>
            <sphereGeometry args={[1, 12, 8]} />
            <meshStandardMaterial color={isClownfish ? '#ffc16a' : color} roughness={0.45} side={THREE.DoubleSide} />
          </mesh>
        ))}
      </group>
      {/* Clownfish-like pale bands make a few familiar Nemo-inspired fish recognizable. */}
      {isClownfish && [-0.22, 0.08, 0.32].map((z, band) => (
        <group key={z} position={[0, 0, z]}>
          <mesh scale={[band === 1 ? 0.18 : 0.145, band === 1 ? 0.19 : 0.15, 1]}>
            <torusGeometry args={[1, 0.018, 6, 28]} />
            <meshStandardMaterial color="#26333a" roughness={0.62} />
          </mesh>
          <mesh scale={[band === 1 ? 0.18 : 0.145, band === 1 ? 0.19 : 0.15, 1]}>
            <torusGeometry args={[1, 0.043, 7, 32]} />
            <meshPhysicalMaterial color="#f4e9d2" roughness={0.55} clearcoat={0.12} />
          </mesh>
        </group>
      ))}
      {/* Gill detail on both sides. */}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * 0.225, 0, 0.13]} rotation-y={side * 0.6} scale={[0.012, 0.072, 0.014]}>
          <sphereGeometry args={[1, 8, 8]} />
          <meshStandardMaterial color={isClownfish ? '#b96634' : '#d1d9d6'} roughness={0.7} />
        </mesh>
      ))}
    </group>
  )
}


type InstancedFishSchoolProps = {
  count: number
  school?: number
  baseDepth?: number
  spreadX?: number
  spreadZ?: number
}

/**
 * Dense distant schools use two InstancedMeshes instead of dozens of individual
 * React meshes. This provides a much richer reef without multiplying draw calls
 * on phones and mid-range PCs.
 */
function InstancedFishSchool({ count, school = 0, baseDepth = -4, spreadX = 28, spreadZ = 24 }: InstancedFishSchoolProps) {
  const bodies = useRef<THREE.InstancedMesh>(null)
  const tails = useRef<THREE.InstancedMesh>(null)
  const bodyDummy = useMemo(() => new THREE.Object3D(), [])
  const tailDummy = useMemo(() => new THREE.Object3D(), [])
  const segments = 16
  const bodyMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.57, metalness: 0.025 }), [])
  const tailMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.62, side: THREE.DoubleSide }), [])
  const bodyGeometry = useMemo(() => {
    const profile = [
      new THREE.Vector2(0, -0.52),
      new THREE.Vector2(0.07, -0.43),
      new THREE.Vector2(0.15, -0.22),
      new THREE.Vector2(0.18, 0.02),
      new THREE.Vector2(0.13, 0.27),
      new THREE.Vector2(0.04, 0.46),
      new THREE.Vector2(0, 0.52),
    ]
    const geometry = new THREE.LatheGeometry(profile, segments)
    geometry.rotateX(Math.PI / 2)
    return geometry
  }, [])
  const tailGeometry = useMemo(() => {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([
      -0.19, -0.17, -0.43,
       0.19, -0.17, -0.43,
       0.00,  0.20, -0.43,
    ], 3))
    geometry.setIndex([0, 1, 2])
    geometry.computeVertexNormals()
    return geometry
  }, [])

  useEffect(() => {
    const palette = ['#a7a18a', '#6d9295', '#8b9c87', '#b5a16e', '#788b9c', '#c18b66', '#ed8738']
    const body = bodies.current
    const tail = tails.current
    if (!body || !tail) return
    for (let i = 0; i < count; i += 1) {
      const color = new THREE.Color(palette[(i * 3 + school * 2) % palette.length])
      body.setColorAt(i, color)
      tail.setColorAt(i, color.clone().multiplyScalar(0.82))
    }
    if (body.instanceColor) body.instanceColor.needsUpdate = true
    if (tail.instanceColor) tail.instanceColor.needsUpdate = true
  }, [count, school])

  useEffect(() => () => {
    bodyGeometry.dispose()
    tailGeometry.dispose()
    bodyMaterial.dispose()
    tailMaterial.dispose()
  }, [bodyGeometry, tailGeometry, bodyMaterial, tailMaterial])

  useFrame((state) => {
    const body = bodies.current
    const tail = tails.current
    if (!body || !tail) return
    const time = state.clock.elapsedTime
    for (let i = 0; i < count; i += 1) {
      const phase = i * 2.399963 + school * 1.71
      const speed = 0.105 + (i % 5) * 0.012
      const angle = time * speed + phase
      const radiusX = spreadX * (0.44 + (i % 6) * 0.105)
      const radiusZ = spreadZ * (0.42 + (i % 5) * 0.12)
      const x = Math.sin(angle) * radiusX + Math.sin(angle * 0.37 + phase) * 2.6
      const z = Math.cos(angle * 0.78) * radiusZ + Math.cos(angle * 0.31 + phase) * 2.2
      const y = baseDepth + Math.sin(angle * 1.45 + school) * (1.1 + (i % 4) * 0.22) - (i % 5) * 0.24
      const dx = Math.cos(angle) * radiusX * speed
      const dz = -Math.sin(angle * 0.78) * radiusZ * speed * 0.78
      const heading = Math.atan2(dx, dz)
      const scale = 0.46 + (i % 5) * 0.055

      bodyDummy.position.set(x, y, z)
      bodyDummy.rotation.set(0, heading, Math.sin(angle * 1.9) * 0.025)
      bodyDummy.scale.set(scale, scale * 0.92, scale * 1.12)
      bodyDummy.updateMatrix()
      body.setMatrixAt(i, bodyDummy.matrix)

      tailDummy.position.set(x, y, z)
      tailDummy.rotation.set(0, heading + Math.sin(time * 4.3 + phase) * 0.34, 0)
      tailDummy.scale.setScalar(scale)
      tailDummy.updateMatrix()
      tail.setMatrixAt(i, tailDummy.matrix)
    }
    body.instanceMatrix.needsUpdate = true
    tail.instanceMatrix.needsUpdate = true
  })

  return (
    <group raycast={noRaycast} userData={{ mpdNoCollision: true }}>
      <instancedMesh ref={bodies} args={[bodyGeometry, bodyMaterial, count]} frustumCulled={false} raycast={noRaycast} />
      <instancedMesh ref={tails} args={[tailGeometry, tailMaterial, count]} frustumCulled={false} raycast={noRaycast} />
    </group>
  )
}

function SeaTurtle({ position, scale = 1, depthY = -2.45 }: { position: [number, number, number]; scale?: number; depthY?: number }) {
  const root = useRef<THREE.Group>(null)
  const flippers = useRef<THREE.Group>(null)
  useFrame((state) => {
    const group = root.current
    if (!group) return
    const t = state.clock.elapsedTime * 0.16
    group.position.set(position[0] + Math.sin(t) * 8, depthY + Math.sin(t * 2.2) * 0.18, position[2] + Math.cos(t * 0.8) * 6)
    group.rotation.y = Math.sin(t) * 0.45 + Math.PI * 0.4
    if (flippers.current) flippers.current.rotation.x = Math.sin(state.clock.elapsedTime * 2.3) * 0.16
  })
  return (
    <group ref={root} scale={scale} raycast={noRaycast} userData={{ mpdNoCollision: true }}>
      <mesh scale={[0.76, 0.27, 1.05]} castShadow>
        <sphereGeometry args={[1, 24, 16]} />
        <meshPhysicalMaterial color="#47794d" roughness={0.42} clearcoat={0.3} />
      </mesh>
      <mesh position={[0, 0.19, 0]} scale={[0.68, 0.28, 0.86]} castShadow>
        <sphereGeometry args={[1, 24, 16]} />
        <meshPhysicalMaterial color="#aa884b" roughness={0.48} clearcoat={0.16} />
      </mesh>
      {[
        [0, 0.405, 0] as [number, number, number],
        [-0.29, 0.34, 0.02] as [number, number, number],
        [0.29, 0.34, 0.02] as [number, number, number],
        [0, 0.34, 0.37] as [number, number, number],
        [0, 0.34, -0.37] as [number, number, number],
      ].map((position, index) => (
        <mesh key={index} position={position} scale={index === 0 ? [0.24, 0.018, 0.28] : [0.17, 0.014, 0.22]}>
          <sphereGeometry args={[1, 12, 8]} />
          <meshStandardMaterial color={index % 2 ? '#927343' : '#b18a4d'} roughness={0.72} metalness={0.02} />
        </mesh>
      ))}
      <mesh position={[0, 0.03, 1.0]} scale={[0.27, 0.23, 0.36]}>
        <sphereGeometry args={[1, 16, 12]} />
        <meshStandardMaterial color="#6a9b59" roughness={0.5} />
      </mesh>
      <group ref={flippers}>
        {[[-0.72, 0, 0.58], [0.72, 0, 0.58], [-0.7, 0, -0.55], [0.7, 0, -0.55]].map(([x, y, z], i) => (
          <mesh key={i} position={[x, y, z]} rotation-z={(i % 2 ? -1 : 1) * 0.38} scale={[0.2, 0.075, 0.58]} castShadow>
            <sphereGeometry args={[1, 14, 10]} />
            <meshStandardMaterial color="#568655" roughness={0.53} />
          </mesh>
        ))}
      </group>
    </group>
  )
}

function MantaRay({ position, depthY = 1.15 }: { position: [number, number, number]; depthY?: number }) {
  const root = useRef<THREE.Group>(null)
  const wings = useRef<THREE.Group>(null)
  useFrame((state) => {
    if (!root.current) return
    const t = state.clock.elapsedTime * 0.15
    root.current.position.set(position[0] + Math.sin(t) * 10, depthY + Math.sin(t * 2) * 0.35, position[2] + Math.cos(t * 0.75) * 8)
    root.current.rotation.y = Math.PI * 0.5 + Math.cos(t) * 0.32
    if (wings.current) wings.current.rotation.z = Math.sin(state.clock.elapsedTime * 1.8) * 0.18
  })
  return (
    <group ref={root} raycast={noRaycast} userData={{ mpdNoCollision: true }}>
      <mesh scale={[0.56, 0.11, 0.9]}>
        <sphereGeometry args={[1, 24, 14]} />
        <meshStandardMaterial color="#253e55" roughness={0.44} />
      </mesh>
      <group ref={wings}>
        {[-1, 1].map((side) => (
          <mesh key={side} position={[side * 0.85, 0, -0.05]} rotation-y={side * -0.12} scale={[0.95, 0.035, 0.58]}>
            <sphereGeometry args={[1, 20, 12]} />
            <meshStandardMaterial color="#314f68" roughness={0.52} side={THREE.DoubleSide} />
          </mesh>
        ))}
      </group>
      <mesh position={[0, -0.03, -1.12]} rotation-x={Math.PI / 2}>
        <cylinderGeometry args={[0.015, 0.005, 1.8, 6]} />
        <meshStandardMaterial color="#253e55" />
      </mesh>
    </group>
  )
}

function LargeMarineAnimal({ kind, position, scale = 1, phase = 0 }: {
  kind: 'whale' | 'whale-shark' | 'reef-shark'
  position: [number, number, number]
  scale?: number
  phase?: number
}) {
  const root = useRef<THREE.Group>(null)
  const tail = useRef<THREE.Group>(null)
  const pectorals = useRef<THREE.Group>(null)
  const length = kind === 'whale' ? 5.7 : kind === 'whale-shark' ? 4.9 : 3.7
  const bodyColor = kind === 'whale' ? '#334d5d' : kind === 'whale-shark' ? '#647d83' : '#536b78'
  useFrame((state) => {
    if (!root.current) return
    const t = state.clock.elapsedTime * (kind === 'whale' ? 0.11 : 0.18) + phase
    root.current.position.set(position[0] + Math.sin(t) * 8, position[1] + Math.sin(t * 1.8) * 0.35, position[2] + Math.cos(t * 0.72) * 7)
    root.current.rotation.y = Math.PI + Math.sin(t) * 0.2
    if (tail.current) tail.current.rotation.y = Math.sin(state.clock.elapsedTime * 1.25 + phase) * 0.28
    if (pectorals.current) pectorals.current.rotation.z = Math.sin(state.clock.elapsedTime * 1.3 + phase) * 0.055
  })
  return (
    <group ref={root} scale={scale} raycast={noRaycast} userData={{ mpdNoCollision: true }}>
      <mesh scale={[kind === 'whale' ? 1.28 : 0.92, kind === 'whale' ? 1.02 : 0.72, length]} castShadow={false}>
        <sphereGeometry args={[1, 32, 22]} />
        <meshStandardMaterial color={bodyColor} roughness={0.62} metalness={0.03} />
      </mesh>
      <mesh position={[0, -0.25, 0.2]} scale={[0.78, 0.31, length * 0.86]}>
        <sphereGeometry args={[1, 26, 18]} />
        <meshStandardMaterial color={kind === 'whale' ? '#b9c5c4' : '#a9b9b5'} roughness={0.78} />
      </mesh>
      <mesh position={[0, kind === 'whale' ? 0.95 : 0.68, -length * 0.05]} rotation-x={-0.12}>
        <coneGeometry args={[kind === 'whale' ? 0.82 : 0.56, 1.55, 3]} />
        <meshStandardMaterial color={bodyColor} roughness={0.58} />
      </mesh>
      <group ref={tail} position={[0, 0.05, -length * 0.92]}>
        <mesh rotation-y={0.12} position={[-0.52, 0, -0.18]} scale={[0.72, 0.12, 0.42]} rotation-z={-0.22}>
          <sphereGeometry args={[1, 18, 12]} /><meshStandardMaterial color={bodyColor} roughness={0.58} />
        </mesh>
        <mesh position={[0.52, 0, -0.18]} scale={[0.72, 0.12, 0.42]} rotation-z={0.22}>
          <sphereGeometry args={[1, 18, 12]} /><meshStandardMaterial color={bodyColor} roughness={0.58} />
        </mesh>
      </group>
      <group ref={pectorals}>
        {[-1, 1].map((side) => (
          <mesh key={side} position={[side * 0.82, -0.22, length * 0.04]} rotation-z={side * 0.12} scale={[1.18, 0.09, 0.42]}>
            <sphereGeometry args={[1, 18, 12]} /><meshStandardMaterial color={bodyColor} roughness={0.62} side={THREE.DoubleSide} />
          </mesh>
        ))}
      </group>
      {kind === 'whale-shark' && Array.from({ length: 28 }, (_, i) => {
        const x = ((i % 7) - 3) * 0.19
        const y = 0.37 + Math.floor(i / 7) * 0.105
        const z = 0.85 - (i % 4) * 0.56
        return <mesh key={i} position={[x, y, z]} scale={0.035}><sphereGeometry args={[1, 7, 5]} /><meshBasicMaterial color="#dce4d7" /></mesh>
      })}
      <mesh position={[0, 0.02, length * 0.79]} scale={[0.16, 0.12, 0.32]}>
        <sphereGeometry args={[1, 16, 10]} /><meshStandardMaterial color={kind === 'whale' ? '#b9c5c4' : bodyColor} roughness={0.72} />
      </mesh>
    </group>
  )
}

function CavePassage({ position = [0, -3.5, -29], rotationY = 0, scale = 1, detailed = false }: { position?: [number, number, number]; rotationY?: number; scale?: number; detailed?: boolean }) {
  return (
    <group position={position} rotation-y={rotationY} scale={scale} raycast={noRaycast} userData={{ mpdNoCollision: true }}>
      {/* An open arch, not a solid wall: divers can swim through the cave mouth. */}
      <mesh position={[-4.7, -0.8, 0]} scale={[1.8, 2.9, 3.2]} rotation-z={0.08} castShadow><dodecahedronGeometry args={[1, 2]} /><meshStandardMaterial color="#697d76" roughness={0.97} metalness={0.01} /></mesh>
      <mesh position={[4.7, -0.55, -0.25]} scale={[1.9, 3.15, 3.1]} rotation-z={-0.07} castShadow><dodecahedronGeometry args={[1, 2]} /><meshStandardMaterial color="#697d76" roughness={0.97} metalness={0.01} /></mesh>
      <mesh position={[0, 1.15, 0]} scale={[6.3, 1.45, 4.0]} rotation-z={0.035} castShadow><dodecahedronGeometry args={[1, 2]} /><meshStandardMaterial color="#5f756e" roughness={0.99} metalness={0.01} flatShading /></mesh>
      {detailed && Array.from({ length: 13 }, (_, index) => {
        const angle = Math.PI + (index / 12) * Math.PI
        const x = Math.cos(angle) * 5.1
        const y = 1.15 + Math.sin(angle) * 1.18
        return <mesh key={`cave-ridge-${index}`} position={[x, y, -0.12 + Math.sin(index * 1.9) * 0.32]} rotation-z={-Math.cos(angle) * 0.34} scale={[0.66 + (index % 3) * 0.12, 0.72 + (index % 4) * 0.16, 0.82]} castShadow><icosahedronGeometry args={[1, 1]} /><meshStandardMaterial color={index % 2 ? '#61776f' : '#748579'} roughness={1} flatShading /></mesh>
      })}
      {detailed && Array.from({ length: 5 }, (_, index) => (
        <mesh key={`cave-stalactite-${index}`} position={[-3.6 + index * 1.8, 1.65 + (index % 2) * 0.2, 0.48]} rotation-z={Math.PI} scale={[0.25, 0.85 + (index % 3) * 0.18, 0.25]} castShadow><coneGeometry args={[1, 2.0, 7]} /><meshStandardMaterial color="#667b72" roughness={1} flatShading /></mesh>
      ))}
      <mesh position={[0, -3.85, -0.7]} scale={[5.2, 0.72, 3.7]}><dodecahedronGeometry args={[1, 2]} /><meshStandardMaterial color="#314d52" roughness={0.98} /></mesh>
      <mesh position={[0, -0.6, -1.8]} scale={[3.1, 2.3, 0.18]}><sphereGeometry args={[1, 24, 16]} /><meshBasicMaterial color="#031f30" transparent opacity={0.52} /></mesh>
    </group>
  )
}

function makeReefRockGeometry(seed: number, quality: GraphicsTier) {
  const geometry = new THREE.SphereGeometry(1, quality === 'mobile' ? 14 : quality === 'balanced' ? 24 : 34, quality === 'mobile' ? 10 : quality === 'balanced' ? 17 : 24)
  const position = geometry.attributes.position as THREE.BufferAttribute
  const colors: number[] = []
  const stone = new THREE.Color('#718982')
  const limestone = new THREE.Color('#b5b49a')
  const algae = new THREE.Color('#64845d')
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i)
    const y = position.getY(i)
    const z = position.getZ(i)
    const detail = Math.sin(x * 8.7 + seed * 0.17) * Math.cos(y * 7.8 - seed * 0.11) * 0.052
      + Math.sin(z * 11.9 + x * 4.2 + seed * 0.07) * 0.033
      + Math.cos(y * 13.1 + z * 5.6 - seed * 0.13) * 0.024
      + Math.sin((x + z) * 17 + seed) * 0.012
    const noise = 1 + detail
    position.setXYZ(i, x * noise, y * noise, z * noise)

    const upperWetStone = THREE.MathUtils.clamp((y + 0.34) * 0.66 + detail * 2.2, 0, 0.58)
    const mossAmount = THREE.MathUtils.clamp((y + 0.18) * 0.34 + Math.sin(seed * 0.3 + x * 5 + z * 4) * 0.13, 0, 0.32)
    const color = stone.clone().lerp(limestone, upperWetStone * 0.48).lerp(algae, mossAmount)
    color.multiplyScalar(1.015 + detail * 1.15)
    colors.push(color.r, color.g, color.b)
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  position.needsUpdate = true
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()
  return geometry
}

function ReefEscarpmentRock({ index, quality, count, baseY = -15.05 }: { index: number; quality: GraphicsTier; count: number; baseY?: number }) {
  const geometry = useMemo(() => makeReefRockGeometry(index + 31, quality), [index, quality])
  const shoulderGeometry = useMemo(() => makeReefRockGeometry(index + 141, quality), [index, quality])
  useEffect(() => () => { geometry.dispose(); shoulderGeometry.dispose() }, [geometry, shoulderGeometry])
  // Broken clusters at a distance replace the close angular wall that previously
  // surrounded the diver like a tank. Golden-angle spacing avoids mirrored rows.
  const angle = index * 2.399963 + 0.24 + Math.sin(index * 1.73) * 0.28
  const radialBand = ((index * 7) % Math.max(1, count)) / Math.max(1, count - 1)
  const radius = 27 + radialBand * 20 + Math.sin(index * 2.2) * 2.4
  const x = Math.cos(angle) * radius
  const z = Math.sin(angle) * radius
  // Smaller, layered boulders read as a reef slope, not oversized floating blobs.
  const height = 2.15 + (index % 4) * 0.34
  const depth = 2.15 + (index % 3) * 0.32
  const palette = ['#63877b', '#78998a', '#587d78', '#8a9f83', '#527b78']
  return (
    <group position={[x, baseY + (index % 3) * 0.08, z]} rotation-y={-angle + index * 0.17} raycast={noRaycast}>
      <mesh geometry={geometry} position={[0, height * 0.34, 0]} rotation-z={Math.sin(index * 2.1) * 0.08} scale={[1.72 + (index % 3) * 0.24, height, depth]} castShadow={quality === 'high'} receiveShadow={quality === 'high'}>
        <meshStandardMaterial color="#ffffff" vertexColors roughness={1} metalness={0.01} />
      </mesh>
      <mesh geometry={shoulderGeometry} position={[-1.05 - (index % 2) * 0.18, 0.18, 0.58]} rotation={[0.08, 0.6, -0.05]} scale={[0.98, 0.62 + (index % 2) * 0.12, 1.18]}>
        <meshStandardMaterial color="#ffffff" vertexColors roughness={1} metalness={0.01} />
      </mesh>
      <mesh geometry={shoulderGeometry} position={[1.08 + (index % 3) * 0.12, 0.16, -0.48]} rotation={[-0.06, 1.4, 0.08]} scale={[0.9, 0.54 + (index % 2) * 0.1, 1.08]}>
        <meshStandardMaterial color="#ffffff" vertexColors roughness={1} metalness={0.01} />
      </mesh>
    </group>
  )
}

function CoralBranch({ position, tint, seed }: { position: [number, number, number]; tint: string; seed: number }) {
  const branches = useMemo(() => Array.from({ length: 5 + (seed % 3) }, (_, i) => ({
    x: Math.sin(i * 2.31 + seed) * 0.38,
    z: Math.cos(i * 1.87 + seed) * 0.32,
    h: 0.55 + ((i * 7 + seed) % 5) * 0.17,
    lean: Math.sin(i * 4.1 + seed) * 0.22,
  })), [seed])
  return (
    <group position={position} raycast={noRaycast}>
      <mesh position={[0, 0.3, 0]}>
        <dodecahedronGeometry args={[0.42, 1]} />
        <meshStandardMaterial color="#7d8871" roughness={0.98} />
      </mesh>
      {branches.map((branch, i) => (
        <group key={i} position={[branch.x * 0.35, 0.45, branch.z * 0.35]} rotation-z={branch.lean}>
          <mesh position={[0, branch.h * 0.5, 0]} castShadow>
            <cylinderGeometry args={[0.035, 0.09, branch.h, 7]} />
            <meshStandardMaterial color={tint} roughness={0.62} />
          </mesh>
          {[0.56, 0.82].map((level) => (
            <mesh key={level} position={[branch.x * level, branch.h * level, branch.z * level]}>
              <sphereGeometry args={[0.12 + (i % 2) * 0.035, 9, 7]} />
              <meshStandardMaterial color={tint} roughness={0.56} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  )
}


function SeaFan({ position, tint, seed }: { position: [number, number, number]; tint: string; seed: number }) {
  const branches = useMemo(() => Array.from({ length: 9 }, (_, i) => {
    const t = i / 8
    return {
      x: (t - 0.5) * 1.55,
      h: 1.5 + Math.sin(t * Math.PI) * 1.2 + ((i + seed) % 3) * 0.08,
      lean: (t - 0.5) * 0.28,
    }
  }), [seed])
  return (
    <group position={position} raycast={noRaycast}>
      {branches.map((branch, i) => (
        <group key={i} position={[branch.x * 0.35, 0.18, 0]} rotation-z={branch.lean}>
          <mesh position={[0, branch.h * 0.5, 0]}>
            <cylinderGeometry args={[0.012, 0.035, branch.h, 6]} />
            <meshStandardMaterial color={tint} roughness={0.62} />
          </mesh>
          {[-1, 1].map((side) => (
            <mesh key={side} position={[side * 0.12, branch.h * 0.62, 0]} rotation-z={side * 0.6} scale={[0.08, 0.22, 0.025]}>
              <sphereGeometry args={[1, 8, 6]} />
              <meshStandardMaterial color={tint} roughness={0.58} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  )
}

function Kelp({ position, seed }: { position: [number, number, number]; seed: number }) {
  const stalk = useRef<THREE.Group>(null)
  useFrame((state) => {
    if (stalk.current) stalk.current.rotation.z = Math.sin(state.clock.elapsedTime * 0.8 + seed) * 0.1
  })
  return (
    <group position={position} ref={stalk} raycast={noRaycast} userData={{ mpdNoCollision: true }}>
      {[0, 1, 2].map((i) => (
        <mesh key={i} position={[Math.sin(seed + i) * 0.15, 0.65 + i * 0.48, Math.cos(seed * 1.4 + i) * 0.1]} rotation-z={Math.sin(seed + i) * 0.16}>
          <coneGeometry args={[0.12 - i * 0.018, 1.35, 7]} />
          <meshStandardMaterial color={i % 2 ? '#398a70' : '#286e63'} roughness={0.72} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  )
}

function DiverMarineEscort({ playerPositionRef, quality }: {
  playerPositionRef: MutableRefObject<THREE.Vector3>
  quality: GraphicsTier
}) {
  const group = useRef<THREE.Group>(null)
  useFrame((state, delta) => {
    const node = group.current
    if (!node) return
    // UnderwaterWorld is anchored at world [-34, -2.2, 14]. Convert the avatar's
    // world position into this fixed reef group's local coordinates, then let a
    // small escort school trail and orbit naturally rather than moving the reef.
    const player = playerPositionRef.current
    const time = state.clock.elapsedTime
    const localX = player.x + 34
    const localY = player.y + 2.2
    const localZ = player.z - 14
    const target = new THREE.Vector3(
      localX + Math.sin(time * 0.14) * 3.2,
      THREE.MathUtils.clamp(localY - 3.0 + Math.sin(time * 0.22) * 0.9, -54, -0.8),
      localZ - 7.5 + Math.cos(time * 0.14) * 3.8,
    )
    node.position.lerp(target, 1 - Math.exp(-Math.min(delta, 0.05) * 0.85))
    const dx = target.x - node.position.x
    const dz = target.z - node.position.z
    if (Math.hypot(dx, dz) > 0.015) node.rotation.y = Math.atan2(dx, dz)
  })
  const smallFish = quality === 'mobile' ? 5 : quality === 'balanced' ? 9 : 15
  return (
    <group ref={group} raycast={noRaycast} userData={{ mpdNoCollision: true }}>
      <InstancedFishSchool count={smallFish} school={41} baseDepth={-2.4} spreadX={7.5} spreadZ={6.5} />
      <SeaTurtle position={[-3.6, -2.2, 3.8]} scale={quality === 'mobile' ? 0.68 : 0.92} depthY={-2.2} />
      {quality !== 'mobile' && <MantaRay position={[4.4, -1.2, 2.6]} depthY={-1.2} />}
      {quality !== 'mobile' && <LargeMarineAnimal kind="whale" position={[-8.5, -5.8, -10]} scale={0.48} phase={1.6} />}
      {quality === 'high' && <LargeMarineAnimal kind="reef-shark" position={[8.5, -4.2, -5.5]} scale={0.9} phase={2.8} />}
      {quality === 'high' && <LargeMarineAnimal kind="whale-shark" position={[-12, -10.5, -18]} scale={0.88} phase={3.6} />}
      {quality === 'high' && <LargeMarineAnimal kind="whale" position={[-3.5, -8.5, -23]} scale={1.18} phase={5.1} />}
    </group>
  )
}

function BubbleColumn({ index, baseY = -4.5 }: { index: number; baseY?: number }) {
  const refs = useRef<(THREE.Mesh | null)[]>([])
  useFrame((state) => {
    const time = state.clock.elapsedTime
    refs.current.forEach((mesh, i) => {
      if (!mesh) return
      const t = (time * (0.34 + (index % 3) * 0.08) + i * 0.72 + index * 0.4) % 8
      mesh.position.y = baseY + t * 1.35
      mesh.position.x = Math.sin(time * 1.25 + i + index) * 0.17
      const scale = 0.045 + ((i + index) % 3) * 0.018
      mesh.scale.setScalar(scale * (0.6 + t * 0.08))
    })
  })
  return (
    <group position={[(index % 5) * 5.7 - 11.4, 0, (Math.floor(index / 5) - 1) * 7.5]} raycast={noRaycast} userData={{ mpdNoCollision: true }}>
      {Array.from({ length: 5 }, (_, i) => <mesh key={i} ref={(mesh) => { refs.current[i] = mesh }} position={[0, baseY, 0]}>
        <sphereGeometry args={[1, 10, 8]} />
        <meshPhysicalMaterial color="#c9fbff" transparent opacity={0.3} roughness={0.08} metalness={0.02} clearcoat={1} />
      </mesh>)}
    </group>
  )
}

function Seabed({ quality, onPathClick }: { quality: GraphicsTier; onPathClick: (event: ThreeEvent<MouseEvent>) => void }) {
  const texture = useMemo(() => createSeabedTexture(quality), [quality])
  useEffect(() => () => { texture?.dispose() }, [texture])
  useEffect(() => {
    if (texture) {
      texture.anisotropy = quality === 'mobile' ? 2 : quality === 'balanced' ? 6 : 10
      texture.needsUpdate = true
    }
  }, [texture, quality])
  const geometry = useMemo(() => {
    const segments = quality === 'mobile' ? 24 : quality === 'balanced' ? 38 : 56
    const plane = new THREE.PlaneGeometry(420, 420, segments * 2, segments * 2)
    const positions = plane.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < positions.count; i += 1) {
      const x = positions.getX(i)
      const z = positions.getY(i)
      const radial = Math.min(1, Math.hypot(x, z) / 300)
      const lowRoll = Math.sin(x * 0.045) * 0.14 + Math.cos(z * 0.052) * 0.12 + Math.sin((x + z) * 0.031) * 0.10
      const edgeRise = radial * radial * 1.45
      positions.setZ(i, lowRoll + edgeRise)
    }
    positions.needsUpdate = true
    plane.computeVertexNormals()
    plane.computeBoundingSphere()
    return plane
  }, [quality])
  useEffect(() => () => geometry.dispose(), [geometry])
  return (
    <mesh geometry={geometry} position={[0, UNDERWATER_FLOOR_Y + 2.2, 0]} rotation-x={-Math.PI / 2} onClick={onPathClick} receiveShadow>
      <meshStandardMaterial map={texture ?? undefined} color="#ffffff" roughness={0.98} metalness={0} />
    </mesh>
  )
}

export function UnderwaterWorld({ onPathClick, quality = 'high', playerPositionRef }: {
  onPathClick: (event: ThreeEvent<MouseEvent>) => void
  quality?: GraphicsTier
  playerPositionRef?: MutableRefObject<THREE.Vector3>
}) {
  // The 2:1 photographic panorama already contains one continuous 360-degree
  // reef, natural rock arch and real-looking seabed. Do not cover it with a
  // synthetic floor slab or duplicate procedural cave/rock walls.
  const heroFishCount = quality === 'mobile' ? 2 : quality === 'balanced' ? 3 : 4
  const schoolCounts = quality === 'mobile' ? [16, 8, 4] : quality === 'balanced' ? [28, 16, 8] : [44, 26, 14]
  const kelpCount = quality === 'mobile' ? 1 : quality === 'balanced' ? 3 : 4
  const coralCount = quality === 'mobile' ? 1 : quality === 'balanced' ? 3 : 4
  const coralPositions = useMemo(() => Array.from({ length: coralCount }, (_, i) => {
    const angle = i * 2.399963 + 0.25
    const radius = 11 + (i % 3) * 4.2
    return {
      position: [Math.cos(angle) * radius, -12.8 - (i % 2) * 1.2, Math.sin(angle) * radius - 1] as [number, number, number],
      tint: ['#958d78', '#8a9a89', '#a28b75'][i % 3],
      seed: i * 29 + 37,
    }
  }), [coralCount])
  const kelpPositions = useMemo(() => Array.from({ length: kelpCount }, (_, i) => {
    const angle = i * 2.399963 + 0.65
    const radius = 15 + (i % 3) * 5.5
    return [Math.cos(angle) * radius, -13.4, Math.sin(angle) * radius + 3] as [number, number, number]
  }), [kelpCount])

  return (
    <group position={[-34, -2.2, 14]}>
      <ambientLight color="#83c7d4" intensity={quality === 'mobile' ? 0.72 : 0.82} />
      <hemisphereLight args={['#c1edf3', '#27464b', 0.72]} />
      <directionalLight position={[-10, 18, 8]} color="#b7e8ed" intensity={1.0} />
      {/* Natural sunlight is already baked into the 360° photo. Avoid synthetic cones that read as blurry vertical bands. */}

      {/* Wide transparent click volume: movement remains free in all 360 degrees. */}
      <mesh onClick={onPathClick} renderOrder={-5}>
        <sphereGeometry args={[228, quality === 'mobile' ? 28 : 40, quality === 'mobile' ? 18 : 26]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0} colorWrite={false} depthWrite={false} side={THREE.BackSide} />
      </mesh>
      <UnderwaterDome quality={quality} />

      {/* Three broad schools create roughly five times the visible marine life.
          Instancing keeps the additional fish inexpensive on mobile and desktop. */}
      <InstancedFishSchool count={schoolCounts[0]} school={3} baseDepth={-3.5} spreadX={32} spreadZ={28} />
      <InstancedFishSchool count={schoolCounts[1]} school={8} baseDepth={-16.5} spreadX={48} spreadZ={42} />
      <InstancedFishSchool count={schoolCounts[2]} school={13} baseDepth={-36.0} spreadX={58} spreadZ={54} />
      {Array.from({ length: heroFishCount }, (_, i) => (
        <TropicalFish key={`hero-fish-${i}`} index={i % 2 === 0 ? i * 7 + 21 : i * 7 + 20} quality={quality} school={i % 3 + 1} baseDepth={-2.8 - (i % 3) * 1.0} />
      ))}
      {playerPositionRef && <DiverMarineEscort playerPositionRef={playerPositionRef} quality={quality} />}

      {/* Keep only a few restrained foreground plants; the 360° photograph carries the distant reef. */}
      {coralPositions.map((coral) => <CoralBranch key={coral.seed} {...coral} />)}
      {kelpPositions.map((position, i) => <Kelp key={`near-kelp-${i}`} position={position} seed={i * 7.7 + 91} />)}
    </group>
  )
}
