'use client'

import type { ThreeEvent } from '@react-three/fiber'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { GraphicsTier } from '@/lib/graphics-quality'

const noRaycast = () => null

function createSeabedTexture() {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 512
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const gradient = ctx.createLinearGradient(0, 0, 512, 512)
  gradient.addColorStop(0, '#b9ad8b')
  gradient.addColorStop(0.48, '#d0c19a')
  gradient.addColorStop(1, '#938b70')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 512, 512)
  let seed = 19871031
  const random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646 }
  for (let i = 0; i < 18000; i += 1) {
    const x = random() * 512
    const y = random() * 512
    const r = 0.35 + random() * 2.4
    const shade = Math.round(112 + random() * 105)
    ctx.fillStyle = `rgba(${shade},${shade - 4},${shade - 16},${0.035 + random() * 0.11})`
    ctx.beginPath(); ctx.ellipse(x, y, r * 1.55, r, random() * Math.PI, 0, Math.PI * 2); ctx.fill()
  }
  for (let i = 0; i < 95; i += 1) {
    const x = random() * 512
    const y = random() * 512
    const r = 1.2 + random() * 5.5
    ctx.fillStyle = `rgba(${70 + Math.round(random() * 50)},${78 + Math.round(random() * 42)},${62 + Math.round(random() * 32)},${0.12 + random() * 0.2})`
    ctx.beginPath(); ctx.ellipse(x, y, r, r * (0.45 + random() * 0.6), random() * Math.PI, 0, Math.PI * 2); ctx.fill()
  }
  // Fine, low-contrast current marks make the sand read as a seabed rather than a flat plane.
  for (let i = 0; i < 38; i += 1) {
    const y = random() * 512
    ctx.strokeStyle = `rgba(244,232,194,${0.045 + random() * 0.07})`
    ctx.lineWidth = 1 + random() * 2
    ctx.beginPath(); ctx.moveTo(0, y); ctx.bezierCurveTo(130, y - 8 + random() * 16, 350, y + 8 - random() * 16, 512, y + random() * 8); ctx.stroke()
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(14, 14)
  texture.anisotropy = 4
  return texture
}

type FishProps = { index: number; quality: GraphicsTier; school?: number }

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
  water.addColorStop(0, '#72c7c8')
  water.addColorStop(0.12, '#238eaa')
  water.addColorStop(0.38, '#0b617f')
  water.addColorStop(0.70, '#06435f')
  water.addColorStop(1, '#03283f')
  ctx.fillStyle = water
  ctx.fillRect(0, 0, width, height)

  // Soft surface light fans, kept broad and low-contrast so they read as water volume.
  const shafts = quality === 'mobile' ? 5 : 9
  for (let i = 0; i < shafts; i += 1) {
    const x = (i + 0.5) / shafts * width + Math.sin(i * 2.3) * width * 0.025
    const spread = width * (0.025 + (i % 3) * 0.009)
    const beam = ctx.createLinearGradient(x, 0, x + spread * 1.5, height * 0.72)
    beam.addColorStop(0, 'rgba(190,250,255,0.16)')
    beam.addColorStop(0.42, 'rgba(120,225,242,0.055)')
    beam.addColorStop(1, 'rgba(70,190,220,0)')
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

  // Distant reef shelves span the entire panorama; trigonometric silhouettes meet seamlessly at both edges.
  const horizon = height * 0.66
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
  drawRidge(horizon - height * 0.015, height * 0.048, 0.7, '#176c78')
  drawRidge(horizon + height * 0.045, height * 0.064, 1.8, '#0c4d62')
  drawRidge(horizon + height * 0.12, height * 0.075, 2.5, '#07364f')

  // Far coral silhouettes add a readable reef line without competing with the near 3D coral models.
  const coralPalette = ['#1b6870', '#205c67', '#285e68', '#3d6a68']
  const count = quality === 'mobile' ? 42 : 82
  for (let i = 0; i < count; i += 1) {
    const x = (i / count) * width
    const baseY = height * (0.80 + (i % 5) * 0.018)
    const scale = height * (0.025 + (i % 7) * 0.004)
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
  const particles = quality === 'mobile' ? 280 : 620
  for (let i = 0; i < particles; i += 1) {
    const x = random() * width
    const y = random() * height * 0.88
    const radius = 0.45 + random() * (quality === 'mobile' ? 1 : 1.5)
    ctx.fillStyle = `rgba(204,245,248,${0.08 + random() * 0.18})`
    ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill()
  }

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

function UnderwaterDome({ quality }: { quality: GraphicsTier }) {
  const texture = useMemo(() => createUnderwaterPanorama(quality), [quality])
  const geometry = useMemo(() => new THREE.SphereGeometry(150, quality === 'mobile' ? 32 : 48, quality === 'mobile' ? 20 : 32), [quality])
  useEffect(() => () => { texture?.dispose() }, [texture])
  useEffect(() => () => geometry.dispose(), [geometry])
  return (
    <mesh geometry={geometry} raycast={noRaycast} renderOrder={-10} rotation-y={Math.PI * 0.5}>
      <meshBasicMaterial map={texture ?? undefined} side={THREE.BackSide} fog={false} depthWrite={false} toneMapped={false} />
    </mesh>
  )
}

function TropicalFish({ index, quality, school = 0 }: FishProps) {
  const root = useRef<THREE.Group>(null)
  const tail = useRef<THREE.Group>(null)
  const pectorals = useRef<THREE.Group>(null)
  const phase = index * 1.73 + school * 2.1
  const colors = ['#d98c3f', '#2695a8', '#d66f4d', '#77a96a', '#c2a64a', '#6489b6', '#b47da6', '#d5c8aa']
  const color = colors[(index + school * 3) % colors.length]
  const isClownfish = (index + school) % 5 === 0
  const segments = quality === 'mobile' ? 18 : quality === 'balanced' ? 28 : 36
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
    const y = -1.15 + Math.sin(t * 1.8 + school) * 1.9 - (index % 3) * 0.42
    const dx = Math.cos(t) * radiusX
    const dz = -Math.sin(t * 0.72) * radiusZ * 0.72
    group.position.set(x, y, z)
    group.rotation.y = Math.atan2(dx, dz)
    if (tail.current) tail.current.rotation.y = Math.sin(state.clock.elapsedTime * 5 + phase) * 0.48
    if (pectorals.current) pectorals.current.rotation.z = Math.sin(state.clock.elapsedTime * 4 + phase) * 0.12
  })

  return (
    <group ref={root} scale={0.94 + (index % 5) * 0.14} raycast={noRaycast}>
      {/* A tapered, laterally compressed body with a defined tail peduncle and snout. */}
      <mesh geometry={bodyGeometry} castShadow={quality !== 'mobile'}>
        <meshPhysicalMaterial color={color} roughness={0.42} metalness={0.015} clearcoat={0.38} clearcoatRoughness={0.32} />
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
            <meshPhysicalMaterial color={color} roughness={0.38} clearcoat={0.3} side={THREE.DoubleSide} />
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

function SeaTurtle({ position, scale = 1 }: { position: [number, number, number]; scale?: number }) {
  const root = useRef<THREE.Group>(null)
  const flippers = useRef<THREE.Group>(null)
  useFrame((state) => {
    const group = root.current
    if (!group) return
    const t = state.clock.elapsedTime * 0.16
    group.position.set(position[0] + Math.sin(t) * 8, -2.45 + Math.sin(t * 2.2) * 0.18, position[2] + Math.cos(t * 0.8) * 6)
    group.rotation.y = Math.sin(t) * 0.45 + Math.PI * 0.4
    if (flippers.current) flippers.current.rotation.x = Math.sin(state.clock.elapsedTime * 2.3) * 0.16
  })
  return (
    <group ref={root} scale={scale} raycast={noRaycast}>
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

function MantaRay({ position }: { position: [number, number, number] }) {
  const root = useRef<THREE.Group>(null)
  const wings = useRef<THREE.Group>(null)
  useFrame((state) => {
    if (!root.current) return
    const t = state.clock.elapsedTime * 0.15
    root.current.position.set(position[0] + Math.sin(t) * 10, 1.15 + Math.sin(t * 2) * 0.35, position[2] + Math.cos(t * 0.75) * 8)
    root.current.rotation.y = Math.PI * 0.5 + Math.cos(t) * 0.32
    if (wings.current) wings.current.rotation.z = Math.sin(state.clock.elapsedTime * 1.8) * 0.18
  })
  return (
    <group ref={root} raycast={noRaycast}>
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

function CavePassage() {
  return (
    <group position={[0, -3.5, -29]} raycast={noRaycast}>
      {/* An open arch, not a solid wall: divers can swim through the cave mouth. */}
      <mesh position={[-5.0, 0, 0]} scale={[2.0, 4.6, 3.6]} castShadow><dodecahedronGeometry args={[1, 2]} /><meshStandardMaterial color="#435f60" roughness={0.97} metalness={0.01} /></mesh>
      <mesh position={[5.0, 0, 0]} scale={[2.0, 4.6, 3.6]} castShadow><dodecahedronGeometry args={[1, 2]} /><meshStandardMaterial color="#435f60" roughness={0.97} metalness={0.01} /></mesh>
      <mesh position={[0, 3.25, 0]} scale={[5.5, 1.7, 3.6]} castShadow><sphereGeometry args={[1, 20, 12]} /><meshStandardMaterial color="#435f60" roughness={0.97} metalness={0.01} /></mesh>
      <mesh position={[0, -3.35, -0.7]} scale={[5.8, 1.1, 4.0]}><sphereGeometry args={[1, 18, 12]} /><meshStandardMaterial color="#314d52" roughness={0.98} /></mesh>
      <mesh position={[0, -0.6, -1.8]} scale={[3.1, 2.3, 0.18]}><sphereGeometry args={[1, 24, 16]} /><meshBasicMaterial color="#031f30" transparent opacity={0.52} /></mesh>
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
        <meshStandardMaterial color="#625f55" roughness={0.96} />
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
    <group position={position} ref={stalk} raycast={noRaycast}>
      {[0, 1, 2].map((i) => (
        <mesh key={i} position={[Math.sin(seed + i) * 0.15, 0.65 + i * 0.48, Math.cos(seed * 1.4 + i) * 0.1]} rotation-z={Math.sin(seed + i) * 0.16}>
          <coneGeometry args={[0.12 - i * 0.018, 1.35, 7]} />
          <meshStandardMaterial color={i % 2 ? '#398a70' : '#286e63'} roughness={0.72} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  )
}

function BubbleColumn({ index }: { index: number }) {
  const refs = useRef<(THREE.Mesh | null)[]>([])
  useFrame((state) => {
    const time = state.clock.elapsedTime
    refs.current.forEach((mesh, i) => {
      if (!mesh) return
      const t = (time * (0.34 + (index % 3) * 0.08) + i * 0.72 + index * 0.4) % 8
      mesh.position.y = -4.5 + t * 1.35
      mesh.position.x = Math.sin(time * 1.25 + i + index) * 0.17
      const scale = 0.045 + ((i + index) % 3) * 0.018
      mesh.scale.setScalar(scale * (0.6 + t * 0.08))
    })
  })
  return (
    <group position={[(index % 5) * 5.7 - 11.4, 0, (Math.floor(index / 5) - 1) * 7.5]} raycast={noRaycast}>
      {Array.from({ length: 5 }, (_, i) => <mesh key={i} ref={(mesh) => { refs.current[i] = mesh }} position={[0, -3, 0]}>
        <sphereGeometry args={[1, 10, 8]} />
        <meshPhysicalMaterial color="#c9fbff" transparent opacity={0.3} roughness={0.08} metalness={0.02} clearcoat={1} />
      </mesh>)}
    </group>
  )
}

function LightShafts({ quality }: { quality: GraphicsTier }) {
  const count = quality === 'mobile' ? 4 : quality === 'balanced' ? 7 : 11
  return (
    <group raycast={noRaycast}>
      {Array.from({ length: count }, (_, i) => {
        const x = (i - (count - 1) / 2) * 4.4
        const depth = -12 + (i % 3) * 8
        return (
          <mesh key={i} position={[x, 4.7, depth]} rotation-z={Math.sin(i * 2.1) * 0.14}>
            <coneGeometry args={[1.25 + (i % 3) * 0.35, 16, 12, 1, true]} />
            <meshBasicMaterial color={i % 2 ? '#70e4ee' : '#b0f7ef'} transparent opacity={0.045} depthWrite={false} side={THREE.DoubleSide} />
          </mesh>
        )
      })}
    </group>
  )
}

function Seabed({ quality, onPathClick }: { quality: GraphicsTier; onPathClick: (event: ThreeEvent<MouseEvent>) => void }) {
  const texture = useMemo(() => createSeabedTexture(), [])
  useEffect(() => () => { texture?.dispose() }, [texture])
  useEffect(() => {
    if (texture) {
      texture.anisotropy = quality === 'mobile' ? 2 : quality === 'balanced' ? 6 : 10
      texture.needsUpdate = true
    }
  }, [texture, quality])
  const geometry = useMemo(() => {
    const segments = quality === 'mobile' ? 18 : quality === 'balanced' ? 28 : 40
    const plane = new THREE.PlaneGeometry(240, 220, segments * 2, segments * 2)
    const positions = plane.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < positions.count; i += 1) {
      const x = positions.getX(i)
      const z = positions.getY(i)
      positions.setZ(i, Math.sin(x * 0.16) * 0.055 + Math.cos(z * 0.13) * 0.045 + Math.sin((x + z) * 0.08) * 0.035)
    }
    positions.needsUpdate = true
    plane.computeVertexNormals()
    return plane
  }, [quality])
  useEffect(() => () => geometry.dispose(), [geometry])
  return (
    <mesh geometry={geometry} position={[0, -5.35, 0]} rotation-x={-Math.PI / 2} onClick={onPathClick} receiveShadow>
      <meshStandardMaterial map={texture ?? undefined} color="#ffffff" roughness={0.98} metalness={0} />
    </mesh>
  )
}

export function UnderwaterWorld({ onPathClick, quality = 'high' }: {
  onPathClick: (event: ThreeEvent<MouseEvent>) => void
  quality?: GraphicsTier
}) {
  const coralCount = quality === 'mobile' ? 16 : quality === 'balanced' ? 26 : 38
  const kelpCount = quality === 'mobile' ? 8 : quality === 'balanced' ? 16 : 24
  const fishCount = quality === 'mobile' ? 12 : quality === 'balanced' ? 22 : 34
  const reefRockCount = quality === 'mobile' ? 9 : 13
  const coralTints = ['#ef7fa2', '#f29c64', '#a987e8', '#f0c96f', '#53b9aa', '#e887bd']
  const coralPositions = useMemo(() => Array.from({ length: coralCount }, (_, i) => {
    const angle = i * 2.399963
    const radius = 8.5 + (i % 6) * 3.4
    return {
      position: [Math.cos(angle) * radius, -5.18, Math.sin(angle) * radius - 2] as [number, number, number],
      tint: coralTints[i % coralTints.length],
      seed: i * 17 + 3,
    }
  }), [coralCount])
  const kelpPositions = useMemo(() => Array.from({ length: kelpCount }, (_, i) => {
    const angle = i * 2.4 + 0.3
    const radius = 8 + (i % 4) * 4.6
    return [Math.cos(angle) * radius, -5.15, Math.sin(angle) * radius + 2] as [number, number, number]
  }), [kelpCount])

  return (
    <group position={[0, 0, 17]}>
      <ambientLight color="#70d5e9" intensity={quality === 'mobile' ? 1.05 : 1.25} />
      <hemisphereLight args={['#b8f5ff', '#153d52', 1.0]} />
      <directionalLight position={[-10, 18, 8]} color="#9cf0ff" intensity={2.1} />
      <pointLight position={[0, 4.8, -5]} color="#55dcf0" intensity={quality === 'mobile' ? 22 : 36} distance={48} decay={2} />
      <LightShafts quality={quality} />

      {/* The transparent pick shell allows 3D click-to-swim targets anywhere in the water column. */}
      <mesh onClick={onPathClick} renderOrder={-5}>
        <sphereGeometry args={[66, 36, 24]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0} colorWrite={false} depthWrite={false} side={THREE.BackSide} />
      </mesh>
      {/* Textured seabed: subtle sand grains, small pebbles and current marks instead of a flat beige slab. */}
      <Seabed quality={quality} onPathClick={onPathClick} />
      <UnderwaterDome quality={quality} />

      {/* A natural reef escarpment with rounded rock shelves and a swim-through cave. */}
      {Array.from({ length: reefRockCount }, (_, i) => {
        // Keep the center opening clear so the cave remains a real swim-through.
        if (i === Math.floor(reefRockCount / 2)) return null
        const spacing = i % 2 === 0 ? 7.7 : 6.4
        const x = (i - (quality === 'mobile' ? 4 : 6)) * spacing + Math.sin(i * 1.7) * 1.1
        const z = -27 - (i % 3) * 3.6
        const height = 7.2 + (i % 4) * 1.8
        const depth = 3.4 + (i % 3) * 1.0
        return <mesh key={`reef-rock-${i}`} position={[x, -5.15 + height * 0.5, z]} rotation-z={Math.sin(i * 2.1) * 0.11} scale={[3.2 + (i % 3) * 0.7, height, depth]} raycast={noRaycast} castShadow={quality !== 'mobile'}>
          <sphereGeometry args={[1, quality === 'mobile' ? 16 : 24, quality === 'mobile' ? 10 : 16]} />
          <meshStandardMaterial color={['#345d5d', '#496c66', '#33545d', '#61796d'][i % 4]} roughness={0.98} />
        </mesh>
      })}
      <CavePassage />
      {/* Low, irregular reef shoulders close the side horizons while leaving broad swim lanes open. */}
      {[-1, 1].flatMap((side) => Array.from({ length: quality === 'mobile' ? 3 : 5 }, (_, i) => (
        <mesh
          key={`side-reef-${side}-${i}`}
          position={[side * (26 + (i % 2) * 4.5), -2.05 + (i % 3) * 0.35, -20 + i * 10.5]}
          rotation-z={side * (0.06 + i * 0.025)}
          scale={[5.4 + (i % 2), 4.1 + (i % 3) * 0.8, 8.0 + (i % 2) * 1.6]}
          raycast={noRaycast}
        >
          <icosahedronGeometry args={[1, 2]} />
          <meshStandardMaterial color={['#315e61', '#446b67', '#536c66'][i % 3]} roughness={0.96} metalness={0.01} />
        </mesh>
      )))}

      {coralPositions.map((coral) => <CoralBranch key={coral.seed} {...coral} />)}
      {[
        { position: [-16, -4.95, -10] as [number, number, number], tint: '#c77aa4' },
        { position: [16, -4.95, -14] as [number, number, number], tint: '#d58b65' },
        { position: [-22, -4.95, -25] as [number, number, number], tint: '#9d86c8' },
        { position: [22, -4.95, -27] as [number, number, number], tint: '#d5b36f' },
      ].slice(0, quality === 'mobile' ? 2 : 4).map((fan, i) => <SeaFan key={i} {...fan} seed={i * 17 + 4} />)}
      {kelpPositions.map((position, i) => <Kelp key={i} position={position} seed={i * 2.1} />)}
      {Array.from({ length: fishCount }, (_, i) => <TropicalFish key={`school-a-${i}`} index={i} quality={quality} school={i % 4} />)}
      {Array.from({ length: Math.max(7, Math.floor(fishCount * 0.55)) }, (_, i) => <TropicalFish key={`school-b-${i}`} index={i + 11} quality={quality} school={i % 4 + 4} />)}
      <SeaTurtle position={[-5, -2.4, -4]} scale={1.05} />
      <SeaTurtle position={[13, -2.1, 9]} scale={0.72} />
      <MantaRay position={[-7, 1, 4]} />
      {Array.from({ length: quality === 'mobile' ? 4 : quality === 'balanced' ? 6 : 9 }, (_, i) => <BubbleColumn key={i} index={i} />)}

      {/* Small reef stones and shells add detail to the foreground seabed. */}
      {Array.from({ length: quality === 'mobile' ? 18 : quality === 'balanced' ? 26 : 34 }, (_, i) => {
        const angle = i * 2.399963
        const radius = 4 + (i % 7) * 3.1
        return <group key={`shell-${i}`} position={[Math.cos(angle) * radius, -5.0, Math.sin(angle) * radius + 3]} rotation-y={angle} raycast={noRaycast}>
          <mesh scale={[0.34, 0.13, 0.25]}>
            <sphereGeometry args={[1, 12, 8]} />
            <meshStandardMaterial color={i % 3 ? '#e4d7b9' : '#d9a9a0'} roughness={0.8} />
          </mesh>
          {i % 4 === 0 && <mesh position={[0.45, 0.08, 0]} scale={[0.16, 0.08, 0.12]}><sphereGeometry args={[1, 10, 8]} /><meshStandardMaterial color="#f6df9b" roughness={0.6} /></mesh>}
        </group>
      })}

      <mesh position={[0, -5.28, 0]} rotation-x={-Math.PI / 2} raycast={noRaycast}>
        <ringGeometry args={[36, 39, 72]} />
        <meshBasicMaterial color="#d0f6eb" transparent opacity={0.08} side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}
