'use client'

import { RoundedBox, Sky, useTexture } from '@react-three/drei'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { createBarkTexture } from '@/lib/textures'
import { Interactive } from './interactive'

export const SUN_POSITION: [number, number, number] = [70, 45, 90]
const noRaycast = () => null
const UP = new THREE.Vector3(0, 1, 0)

type SeatHandler = (position: [number, number, number], rotationY: number) => void

function seeded(seed: number) {
  let s = seed % 2147483647
  if (s <= 0) s += 2147483646
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

export function createLawnTexture() {
  const size = 1024
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D
  const rand = seeded(48172)
  const base = ctx.createLinearGradient(0, 0, size, size)
  base.addColorStop(0, '#47743a')
  base.addColorStop(0.45, '#527e3e')
  base.addColorStop(1, '#355f32')
  ctx.fillStyle = base
  ctx.fillRect(0, 0, size, size)

  for (let i = 0; i < 46000; i++) {
    const x = rand() * size
    const y = rand() * size
    const h = 1 + rand() * 8
    const hue = 82 + rand() * 34
    const light = 24 + rand() * 30
    ctx.strokeStyle = `hsla(${hue}, ${30 + rand() * 35}%, ${light}%, ${0.13 + rand() * 0.42})`
    ctx.lineWidth = 0.45 + rand() * 1.1
    ctx.beginPath()
    ctx.moveTo(x, y + h)
    ctx.quadraticCurveTo(x + (rand() - 0.5) * 3, y + h * 0.4, x + (rand() - 0.5) * 3, y)
    ctx.stroke()
  }
  for (let i = 0; i < 4200; i++) {
    const x = rand() * size
    const y = rand() * size
    ctx.fillStyle = rand() > 0.5 ? 'rgba(205,190,118,0.13)' : 'rgba(18,48,21,0.14)'
    ctx.beginPath()
    ctx.ellipse(x, y, 1.5 + rand() * 4, 0.8 + rand() * 2.4, rand() * Math.PI, 0, Math.PI * 2)
    ctx.fill()
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(15, 20)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 16
  texture.needsUpdate = true
  return texture
}

function Branch({ start, end, radius, bark }: { start: [number, number, number]; end: [number, number, number]; radius: number; bark: THREE.Texture }) {
  const a = new THREE.Vector3(...start)
  const b = new THREE.Vector3(...end)
  const direction = b.clone().sub(a)
  const length = direction.length()
  const quaternion = new THREE.Quaternion().setFromUnitVectors(UP, direction.normalize())
  const mid = a.clone().add(b).multiplyScalar(0.5)
  return (
    <mesh position={mid} quaternion={quaternion} castShadow receiveShadow>
      <cylinderGeometry args={[radius * 0.34, radius, length, 9, 3]} />
      <meshStandardMaterial map={bark} bumpMap={bark} bumpScale={0.09} roughness={0.98} />
    </mesh>
  )
}

function LeafCanopy({ seed, height }: { seed: number; height: number }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const leaves = useMemo(() => {
    const rand = seeded(seed)
    return Array.from({ length: 900 }, () => {
      // Filled, irregular canopy with a gently flattened crown and visible gaps.
      const a = rand() * Math.PI * 2
      const r = Math.sqrt(rand())
      const vertical = (rand() - 0.5) * 3.1
      const x = Math.cos(a) * r * 2.7
      const z = Math.sin(a) * r * 2.45
      const y = height + vertical - r * 0.42
      return {
        position: [x, y, z] as [number, number, number],
        rotation: [rand() * Math.PI, rand() * Math.PI * 2, rand() * Math.PI] as [number, number, number],
        scale: [0.07 + rand() * 0.07, 0.018 + rand() * 0.026, 0.035 + rand() * 0.05] as [number, number, number],
        color: new THREE.Color().setHSL(0.245 + rand() * 0.045, 0.32 + rand() * 0.3, 0.19 + rand() * 0.22),
      }
    })
  }, [seed, height])

  useLayoutEffect(() => {
    if (!ref.current) return
    const object = new THREE.Object3D()
    leaves.forEach((leaf, index) => {
      object.position.set(...leaf.position)
      object.rotation.set(...leaf.rotation)
      object.scale.set(...leaf.scale)
      object.updateMatrix()
      ref.current!.setMatrixAt(index, object.matrix)
      ref.current!.setColorAt(index, leaf.color)
    })
    ref.current.instanceMatrix.needsUpdate = true
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true
  }, [leaves])

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, leaves.length]} frustumCulled={false}>
      <sphereGeometry args={[1, 7, 5]} />
      <meshStandardMaterial roughness={0.92} vertexColors />
    </instancedMesh>
  )
}

export function NaturalTree({ position, scale = 1, seed }: { position: [number, number, number]; scale?: number; seed: number }) {
  const bark = useMemo(() => createBarkTexture(), [])
  const treeShape = useMemo(() => {
    const rand = seeded(seed)
    return { height: 7.8 + rand() * 2.4, lean: (rand() - 0.5) * 0.34 }
  }, [seed])
  const { height, lean } = treeShape
  const branches = useMemo(() => {
    const r = seeded(seed + 88)
    return Array.from({ length: 9 }, (_, i) => {
      const y = 3.7 + r() * 3.6
      const a = (i / 9) * Math.PI * 2 + r() * 0.6
      const reach = 1.35 + r() * 1.15
      return {
        start: [Math.sin(a) * 0.22, y, Math.cos(a) * 0.22] as [number, number, number],
        end: [Math.sin(a) * reach, y + 0.55 + r() * 1.05, Math.cos(a) * reach] as [number, number, number],
        radius: 0.13 - (i % 3) * 0.018,
      }
    })
  }, [seed])

  return (
    <group position={position} scale={scale}>
      {/* Deeply textured, tapered trunk with irregular roots. */}
      <mesh position={[lean, height * 0.48, 0]} rotation-z={lean * 0.18} castShadow receiveShadow>
        <cylinderGeometry args={[0.17, 0.72, height, 18, 12]} />
        <meshStandardMaterial map={bark} bumpMap={bark} bumpScale={0.13} roughness={1} />
      </mesh>
      {Array.from({ length: 6 }, (_, i) => {
        const a = (i / 6) * Math.PI * 2
        const rootStart: [number, number, number] = [0, 0.22, 0]
        const rootEnd: [number, number, number] = [Math.sin(a) * (0.9 + (i % 2) * 0.18), 0.025, Math.cos(a) * (0.9 + (i % 2) * 0.18)]
        return <Branch key={`root-${i}`} start={rootStart} end={rootEnd} radius={0.22} bark={bark} />
      })}
      {branches.map((branch, i) => <Branch key={i} {...branch} bark={bark} />)}
      <LeafCanopy seed={seed} height={height} />
    </group>
  )
}

function ForestHorizon() {
  const texture = useTexture('/images/mpd-ocean-resort-backdrop.jpg')
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 16
  texture.wrapS = THREE.ClampToEdgeWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  return (
    <group>
      {/* Far sea horizon only. Real 3D trees remain in front of this panorama. */}
      <mesh position={[0, 12.5, -128]} raycast={noRaycast}>
        <planeGeometry args={[184, 23]} />
        <meshBasicMaterial map={texture} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}

function GardenPath({ onPathClick }: { onPathClick: (e: ThreeEvent<MouseEvent>) => void }) {
  const stones = useMemo(() => {
    const rand = seeded(109)
    return Array.from({ length: 27 }, (_, i) => ({
      x: Math.sin(i * 0.22) * 0.7 + (rand() - 0.5) * 0.4,
      z: -10.8 - i * 0.68,
      w: 2.0 + rand() * 1.1,
      d: 0.68 + rand() * 0.28,
      r: (rand() - 0.5) * 0.13,
      color: ['#b8b3a5', '#999486', '#c3bca9', '#a9a395'][i % 4],
    }))
  }, [])
  return (
    <group>
      {stones.map((stone, i) => (
        <mesh key={i} position={[stone.x, 0.035, stone.z]} rotation-y={stone.r} castShadow receiveShadow raycast={noRaycast}>
          <boxGeometry args={[stone.w, 0.09, stone.d, 2, 1, 2]} />
          <meshStandardMaterial color={stone.color} roughness={0.94} />
        </mesh>
      ))}
      <mesh position={[0, 0.08, -20]} rotation-x={-Math.PI / 2} onClick={onPathClick}>
        <planeGeometry args={[11, 22]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}

function PoolWater({ onPathClick }: { onPathClick: (e: ThreeEvent<MouseEvent>) => void }) {
  const waterRef = useRef<THREE.Mesh>(null)

  useFrame((state) => {
    const mesh = waterRef.current
    if (!mesh) return
    const geometry = mesh.geometry as THREE.BufferGeometry
    const positions = geometry.attributes.position as THREE.BufferAttribute
    const time = state.clock.elapsedTime

    // Very gentle overlapping wavelets, only a few centimetres high.
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i)
      const z = positions.getY(i)
      const waveA = Math.sin(x * 0.82 + time * 0.72) * Math.cos(z * 1.08 - time * 0.58)
      const waveB = Math.sin((x + z) * 1.35 + time * 0.92)
      const waveC = Math.cos((x * 0.48 - z * 0.72) - time * 0.46)
      positions.setZ(i, waveA * 0.018 + waveB * 0.007 + waveC * 0.004)
    }
    positions.needsUpdate = true
    geometry.computeVertexNormals()
  })

  return (
    <mesh
      ref={waterRef}
      rotation-x={-Math.PI / 2}
      position={[0, 0.045, 0]}
      onClick={onPathClick}
      receiveShadow
    >
      <planeGeometry args={[16.05, 8.35, 72, 38]} />
      <meshPhysicalMaterial
        color="#43b4c4"
        roughness={0.12}
        metalness={0.07}
        clearcoat={1}
        clearcoatRoughness={0.045}
        transmission={0.1}
        transparent
        opacity={0.86}
        ior={1.333}
        side={THREE.DoubleSide}
      />
    </mesh>
  )
}

function Pool({ onPathClick }: { onPathClick: (e: ThreeEvent<MouseEvent>) => void }) {
  return (
    <group position={[0, 0, -17]}>
      {/* Travertine pool terrace, recessed basin and raised pale-stone coping. */}
      <mesh position={[0, 0.015, 0]} receiveShadow onClick={onPathClick}>
        <boxGeometry args={[23, 0.18, 17]} />
        <meshStandardMaterial color="#c6b89d" roughness={0.88} />
      </mesh>
      <mesh position={[0, -0.045, 0]} receiveShadow raycast={noRaycast}>
        <boxGeometry args={[16.65, 0.22, 9.15]} />
        <meshStandardMaterial color="#24616c" roughness={0.3} metalness={0.08} />
      </mesh>
      {[
        { p: [0, 0.105, -4.62] as [number, number, number], s: [17.25, 0.16, 0.34] as [number, number, number] },
        { p: [0, 0.105, 4.62] as [number, number, number], s: [17.25, 0.16, 0.34] as [number, number, number] },
        { p: [-8.45, 0.105, 0] as [number, number, number], s: [0.34, 0.16, 9.3] as [number, number, number] },
        { p: [8.45, 0.105, 0] as [number, number, number], s: [0.34, 0.16, 9.3] as [number, number, number] },
      ].map((edge, i) => (
        <mesh key={i} position={edge.p} castShadow receiveShadow raycast={noRaycast}>
          <boxGeometry args={edge.s} />
          <meshStandardMaterial color="#ded5c3" roughness={0.62} />
        </mesh>
      ))}
      {/* Filled pool surface with subtle animated ripples and transparent turquoise depth. */}
      <PoolWater onPathClick={onPathClick} />
      <mesh position={[0, -0.12, 0]} raycast={noRaycast}>
        <boxGeometry args={[15.8, 0.12, 8.1]} />
        <meshStandardMaterial color="#1e5962" roughness={0.5} />
      </mesh>
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
      onActivate={() => onSeat([position[0] + worldOffset[0] + offset.x, 0, position[2] + worldOffset[2] + offset.z], rotationY)}
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
        <RoundedBox args={[2.9, 0.16, 1.45]} radius={0.065} smoothness={6} position={[0, 0.83, 0]} castShadow receiveShadow>
          <meshPhysicalMaterial color={index % 2 ? '#725039' : '#826044'} roughness={0.38} clearcoat={0.2} />
        </RoundedBox>
        <mesh position={[0, 0.735, 0]}>
          <boxGeometry args={[2.72, 0.035, 1.27]} />
          <meshStandardMaterial color="#b18a5e" roughness={0.52} />
        </mesh>
        {[-1.18, 1.18].map((x) => [-0.5, 0.5].map((z) => (
          <mesh key={`${x}-${z}`} position={[x, 0.39, z]} castShadow>
            <boxGeometry args={[0.11, 0.74, 0.11]} />
            <meshStandardMaterial color="#493727" roughness={0.48} />
          </mesh>
        )))}
        <mesh position={[0, 0.925, 0]}>
          <boxGeometry args={[0.3, 0.015, 0.3]} />
          <meshStandardMaterial color="#c5a06b" metalness={0.55} roughness={0.3} />
        </mesh>
        <mesh position={[0, 2.55, 0]} castShadow raycast={noRaycast}>
          <cylinderGeometry args={[0.045, 0.06, 3.2, 16]} />
          <meshStandardMaterial color="#654a31" metalness={0.08} roughness={0.55} />
        </mesh>
        <mesh position={[0, 2.98, 0]} scale={[1, 0.28, 1]} castShadow raycast={noRaycast}>
          <sphereGeometry args={[2.05, 40, 14, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshPhysicalMaterial color={index % 2 ? '#e8ddc5' : '#d8c6a8'} roughness={0.88} side={THREE.DoubleSide} />
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

function SunLounger({ position, rotationY, onSeat, index }: { position: [number, number, number]; rotationY: number; onSeat: SeatHandler; index: number }) {
  const offset = new THREE.Vector3(0, 0, 0.28).applyAxisAngle(UP, rotationY)
  return (
    <Interactive
      label={`비치베드 ${index + 1}에 누워 쉬기`}
      labelOffset={[0, 1.3, 0]}
      position={position}
      rotation={[0, rotationY, 0]}
      onActivate={() => onSeat([position[0] + offset.x, 0, position[2] + offset.z], rotationY)}
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

export function Outdoor({ onPathClick, onSeat }: { onPathClick: (e: ThreeEvent<MouseEvent>) => void; onSeat: SeatHandler }) {
  const grass = useMemo(() => createLawnTexture(), [])
  grass.colorSpace = THREE.SRGBColorSpace
  grass.wrapS = grass.wrapT = THREE.RepeatWrapping
  grass.repeat.set(15, 20)
  grass.anisotropy = 16
  const trees = [
    { position: [-24, 0, -17] as [number, number, number], scale: 1.12, seed: 11 },
    { position: [25, 0, -18] as [number, number, number], scale: 1.06, seed: 23 },
    { position: [-28, 0, -31] as [number, number, number], scale: 0.96, seed: 37 },
    { position: [29, 0, -34] as [number, number, number], scale: 1.14, seed: 41 },
    { position: [-27, 0, -47] as [number, number, number], scale: 1.08, seed: 53 },
    { position: [27, 0, -49] as [number, number, number], scale: 1.06, seed: 67 },
    { position: [-25, 0, -65] as [number, number, number], scale: 1.12, seed: 79 },
    { position: [24, 0, -66] as [number, number, number], scale: 1.08, seed: 83 },
    { position: [-13, 0, -79] as [number, number, number], scale: 0.98, seed: 97 },
    { position: [13, 0, -80] as [number, number, number], scale: 1.1, seed: 101 },
    { position: [-35, 0, -23] as [number, number, number], scale: 0.9, seed: 113 },
    { position: [35, 0, -25] as [number, number, number], scale: 0.92, seed: 127 },
    { position: [-35, 0, -57] as [number, number, number], scale: 0.94, seed: 131 },
    { position: [35, 0, -60] as [number, number, number], scale: 0.96, seed: 149 },
    { position: [-18, 0, -85] as [number, number, number], scale: 0.9, seed: 157 },
    { position: [19, 0, -86] as [number, number, number], scale: 0.92, seed: 163 },
  ]
  const tablePositions: [number, number, number][] = [
    [-13, 0, -13], [13, 0, -13], [-13, 0, -29], [13, 0, -29], [0, 0, -30],
  ]
  const beds = [
    { position: [-10.2, 0, -24] as [number, number, number], rotationY: Math.PI / 2 },
    { position: [-10.2, 0, -30] as [number, number, number], rotationY: Math.PI / 2 },
    { position: [-10.2, 0, -36] as [number, number, number], rotationY: Math.PI / 2 },
    { position: [10.2, 0, -24] as [number, number, number], rotationY: -Math.PI / 2 },
    { position: [10.2, 0, -30] as [number, number, number], rotationY: -Math.PI / 2 },
    { position: [10.2, 0, -36] as [number, number, number], rotationY: -Math.PI / 2 },
    ...Array.from({ length: 10 }, (_, i) => ({
      position: [-7.8 + (i % 5) * 3.9, 0, -33 - Math.floor(i / 5) * 4.2] as [number, number, number],
      rotationY: 0,
    })),
  ]

  const worldSeat = (position: [number, number, number], rotationY: number) => {
    // The resort is on the +Z side of the studio after the 180° room flip.
    onSeat([-position[0], position[1], -position[2]], rotationY + Math.PI)
  }

  return (
    <group rotation-y={Math.PI}>
      <Sky distance={4500} sunPosition={SUN_POSITION} turbidity={0.75} rayleigh={2.0} mieCoefficient={0.0018} mieDirectionalG={0.82} />
      {/* A broad resort lawn directly outside the open studio facade. */}
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.045, -87]} receiveShadow onClick={onPathClick}>
        <planeGeometry args={[150, 160]} />
        <meshStandardMaterial map={grass} bumpMap={grass} bumpScale={0.028} roughness={0.96} color="#ffffff" />
      </mesh>
      <GardenPath onPathClick={onPathClick} />
      <Pool onPathClick={onPathClick} />
      {tablePositions.map((position, index) => <DiningTable key={index} position={position} index={index} onSeat={worldSeat} />)}
      {beds.map((bed, index) => <SunLounger key={index} {...bed} index={index} onSeat={worldSeat} />)}
      {trees.map((tree) => <NaturalTree key={tree.seed} {...tree} />)}
      <ForestHorizon />
    </group>
  )
}
