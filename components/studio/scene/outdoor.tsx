'use client'

import { RoundedBox } from '@react-three/drei'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { createBarkTexture } from '@/lib/textures'
import { getIslandGroundHeight } from '@/lib/island-terrain'
import { IslandTerrain } from './island-terrain'
import type { GraphicsTier } from '@/lib/graphics-quality'
import { Interactive } from './interactive'
import type { FitnessKind } from '@/lib/studio-interactions'

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

function Branch({ start, end, radius, bark }: { start: [number, number, number]; end: [number, number, number]; radius: number; bark: THREE.Texture }) {
  const a = new THREE.Vector3(...start)
  const b = new THREE.Vector3(...end)
  const direction = b.clone().sub(a)
  const length = direction.length()
  const quaternion = new THREE.Quaternion().setFromUnitVectors(UP, direction.normalize())
  const mid = a.clone().add(b).multiplyScalar(0.5)
  return (
    <mesh position={mid} quaternion={quaternion} raycast={noRaycast} castShadow={false}>
      <cylinderGeometry args={[radius * 0.34, radius, length, 9, 3]} />
      <meshStandardMaterial map={bark} bumpMap={bark} bumpScale={0.09} roughness={0.98} />
    </mesh>
  )
}

function createLeafGeometry() {
  // Smooth, narrow, slightly pointed-volume leaves avoid the old low-poly ball-canopy look.
  return new THREE.SphereGeometry(1, 10, 7)
}

let sharedBarkTexture: THREE.Texture | null = null
function getSharedBarkTexture() {
  if (!sharedBarkTexture) sharedBarkTexture = createBarkTexture()
  return sharedBarkTexture
}

function LeafCanopy({ seed, height, quality }: { seed: number; height: number; quality: GraphicsTier }) {
  const leavesRef = useRef<THREE.InstancedMesh>(null)
  const leafGeometry = useMemo(() => createLeafGeometry(), [])
  const leafCount = quality === 'mobile' ? 18 : quality === 'balanced' ? 48 : 96
  const leaves = useMemo(() => {
    const rand = seeded(seed)
    return Array.from({ length: leafCount }, () => {
      const angle = rand() * Math.PI * 2
      const radial = Math.sqrt(rand()) * (2.1 + rand() * 0.95)
      const vertical = (rand() - 0.5) * 3.2
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
        scale: [0.105 + rand() * 0.105, 0.035 + rand() * 0.035, 0.22 + rand() * 0.22] as [number, number, number],
        color: (() => {
          const palette = seed % 6
          const hueBase = palette === 0 ? 0.075 : palette === 1 ? 0.225 : palette === 2 ? 0.285 : palette === 3 ? 0.315 : 0.265
          const saturation = palette === 0 ? 0.52 : 0.42 + rand() * 0.2
          const lightness = palette === 0 ? 0.43 + rand() * 0.08 : 0.35 + rand() * 0.2
          return new THREE.Color().setHSL(hueBase + rand() * (palette === 0 ? 0.035 : 0.055), saturation, lightness)
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
    <instancedMesh ref={leavesRef} args={[leafGeometry, undefined, leaves.length]} raycast={noRaycast}>
      <meshStandardMaterial color="#ffffff" roughness={0.92} vertexColors side={THREE.DoubleSide} />
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
  const branchCount = quality === 'mobile' ? 2 : quality === 'balanced' ? 4 : 6
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
          <mesh geometry={frondGeometry} position={[0, -frond.dip * 0.62, -frond.reach * 0.53]} scale={[0.16, 0.085, frond.reach * 0.72]} rotation-x={0.16} raycast={noRaycast}>
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
  const species = seed % 7
  if (species === 0 || species === 4) return <PalmTree position={position} scale={scale} seed={seed} quality={quality} />
  // Keep the near-field planting to broadleaf trees; the continuous 360 panorama supplies distant forest.
  return <NaturalTree position={position} scale={scale} seed={seed} quality={quality} />
}

function Understory({ position, seed, quality }: { position: [number, number, number]; seed: number; quality: GraphicsTier }) {
  const colors = ['#315f39', '#477744', '#668c4e', '#7f9e5b']
  const count = quality === 'mobile' ? 3 : 5
  return (
    <group position={position}>
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
  const moving = useRef<THREE.Group>(null)
  useEffect(() => {
    const stop = () => setActive(false)
    window.addEventListener('mpd-stop-fitness-machines', stop)
    return () => window.removeEventListener('mpd-stop-fitness-machines', stop)
  }, [])
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
    // Stop every previously selected station first.
    window.dispatchEvent(new Event('mpd-stop-fitness-machines'))
    // The parent garden group performs the 180-degree world transform in worldSeat().
    const usePosition: [number, number, number] = [position[0], 0, position[2] + 1.25]
    if (active) {
      setActive(false)
      onStand(usePosition, 0)
      return
    }
    // Let the travel callback finish its stop/reset work before publishing the
    // new workout state; otherwise the seat callback would immediately cancel it.
    if (kind === 'bench-press' || kind === 'yoga-mat') onRest(usePosition, 0)
    else if (kind === 'treadmill' || kind === 'elliptical' || kind === 'stepper' || kind === 'punching-bag') onStand(usePosition, 0)
    else onSeat(usePosition, 0)
    setActive(true)
    window.dispatchEvent(new CustomEvent('mpd-start-fitness', { detail: { kind } }))
  }

  return (
    <Interactive
      label={`${label} ${active ? '운동 중 · 다시 누르면 정지' : '클릭하면 이동해 운동 시작'}`}
      labelOffset={[0, kind === 'punching-bag' ? 3 : 2.55, 0]}
      position={position}
      onActivate={activate}
    >
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
          <mesh position={[0, 0.12, 0]} raycast={noRaycast}><boxGeometry args={[1.4, 0.22, 1.1]} /><meshStandardMaterial color="#29363c" metalness={0.52} /></mesh>
          <mesh position={[0, 1.25, -0.33]} raycast={noRaycast}><cylinderGeometry args={[0.07, 0.09, 2.2, 12]} /><meshStandardMaterial color="#64747a" metalness={0.72} /></mesh>
          <group ref={pedal} position={[0, 0.58, 0.22]}>{[-0.34, 0.34].map((x, i) => <group key={x} position={[x, 0, 0]} rotation-z={i ? Math.PI : 0}><mesh position={[0, 0.12, 0]}><boxGeometry args={[0.42, 0.12, 0.68]} /><meshStandardMaterial color="#d49b45" roughness={0.48} /></mesh></group>)}</group>
          <mesh position={[0, 2.28, -0.33]} raycast={noRaycast}><boxGeometry args={[1.15, 0.12, 0.22]} /><meshStandardMaterial color="#202a31" metalness={0.55} /></mesh>
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

function PoolWater({ onPathClick, quality }: { onPathClick: (e: ThreeEvent<MouseEvent>) => void; quality: GraphicsTier }) {
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
      onClick={onPathClick}
      receiveShadow
    >
      <planeGeometry args={[16.05, 8.35, ...waterSegments]} />
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

function Pool({ onPathClick, quality }: { onPathClick: (e: ThreeEvent<MouseEvent>) => void; quality: GraphicsTier }) {
  return (
    <group position={[0, 0, -17]}>
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
      <PoolWater onPathClick={onPathClick} quality={quality} />
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

function ShoreBoulder({ position, scale, tint }: { position: [number, number, number]; scale: [number, number, number]; tint: string }) {
  return (
    <mesh position={position} scale={scale} rotation-y={position[0] * 0.03} castShadow receiveShadow raycast={noRaycast}>
      <icosahedronGeometry args={[1, 1]} />
      <meshStandardMaterial color={tint} roughness={0.96} flatShading />
    </mesh>
  )
}

export function Outdoor({ onPathClick, onSeat, onRest, onStand, quality = 'high' }: { onPathClick: (e: ThreeEvent<MouseEvent>) => void; onSeat: SeatHandler; onRest: SeatHandler; onStand: SeatHandler; quality?: GraphicsTier }) {
  // Dense mixed-species 3D forest. The front-center bay remains open for the ocean view;
  // the rear half and both side flanks are planted with broadleaf, pine and palm trees.
  const rearTreeCount = quality === 'mobile' ? 2 : quality === 'balanced' ? 4 : 6
  const flankTreeCount = quality === 'mobile' ? 1 : quality === 'balanced' ? 2 : 3
  const trees = [
    ...Array.from({ length: rearTreeCount }, (_, index) => {
      const t = (index + 0.5) / rearTreeCount
      const angle = Math.PI + t * Math.PI
      const jitter = Math.sin((index + 1) * 7.31) * 2.2
      const radius = 24 + ((index * 11) % 8) * 3.35 + jitter
      const x = Math.cos(angle) * radius
      const z = Math.sin(angle) * radius
      return {
        position: [x, getIslandGroundHeight(x, z), z] as [number, number, number],
        scale: 0.88 + ((index * 13) % 7) * 0.095,
        seed: 420 + index * 17,
      }
    }),
    ...Array.from({ length: flankTreeCount * 2 }, (_, index) => {
      const side = index < flankTreeCount ? -1 : 1
      const localIndex = index % flankTreeCount
      const x = side * (19.5 + localIndex * 0.92 + (localIndex % 2) * 0.55)
      const z = 22 - localIndex * 3.15
      return {
        position: [x, getIslandGroundHeight(x, z), z] as [number, number, number],
        scale: 0.82 + ((index * 7) % 6) * 0.1,
        seed: 980 + index * 19,
      }
    }),
  ]
  const undergrowthCount = quality === 'mobile' ? 2 : quality === 'balanced' ? 4 : 6
  const undergrowth = Array.from({ length: undergrowthCount }, (_, index) => {
    const angle = ((index * 2.399963) % (Math.PI * 2))
    const radius = 20 + ((index * 13) % 40)
    const x = Math.cos(angle) * radius
    const z = Math.sin(angle) * radius
    return { position: [x, getIslandGroundHeight(x, z), z] as [number, number, number], seed: 1600 + index * 23 }
  })
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

  const boulderCount = quality === 'mobile' ? 4 : quality === 'balanced' ? 7 : 11
  const boulders = Array.from({ length: boulderCount }, (_, index) => {
    const angle = Math.PI + ((index + 0.5) / boulderCount) * Math.PI + Math.sin(index * 4.7) * 0.09
    const radius = 72 + (index % 4) * 2.8
    const x = Math.cos(angle) * radius
    const z = Math.sin(angle) * radius
    const size = 0.9 + (index % 5) * 0.3
    const colors = ['#817b70', '#9a9282', '#68675f', '#aaa08e']
    return { position: [x, getIslandGroundHeight(x, z) - 0.2, z] as [number, number, number], scale: [size * 1.25, size * 0.7, size] as [number, number, number], tint: colors[index % colors.length] }
  })

  const worldSeat = (position: [number, number, number], rotationY: number) => {
    // The resort is on the +Z side of the studio after the 180° room flip.
    onSeat([-position[0], position[1], -position[2]], rotationY + Math.PI)
  }

  return (
    <group rotation-y={Math.PI}>
      <IslandTerrain quality={quality} onPathClick={onPathClick} />
      <Pool onPathClick={onPathClick} quality={quality} />
      {tablePositions.map((position, index) => <DiningTable key={index} position={position} index={index} onSeat={worldSeat} />)}
      {beds.map((bed, index) => <SunLounger key={index} {...bed} index={index} onSeat={worldSeat} />)}
      {trees.map((tree) => <ForestTree key={tree.seed} {...tree} quality={quality} />)}
      {undergrowth.map((plant) => <Understory key={plant.seed} {...plant} quality={quality} />)}
      {boulders.map((rock, index) => <ShoreBoulder key={`shore-rock-${index}`} {...rock} />)}
      <FitnessStation position={[-17.5, getIslandGroundHeight(-17.5, -3.5), -3.5]} kind="treadmill" label="러닝머신" onSeat={worldSeat} onRest={worldSeat} onStand={worldSeat} />
      <FitnessStation position={[17.5, getIslandGroundHeight(17.5, -3.5), -3.5]} kind="bike" label="실내 자전거" onSeat={worldSeat} onRest={worldSeat} onStand={worldSeat} />
      <FitnessStation position={[-20.5, getIslandGroundHeight(-20.5, 5), 5]} kind="elliptical" label="일립티컬" onSeat={worldSeat} onRest={worldSeat} onStand={worldSeat} />
      <FitnessStation position={[20.5, getIslandGroundHeight(20.5, 5), 5]} kind="rower" label="로잉 머신" onSeat={worldSeat} onRest={worldSeat} onStand={worldSeat} />
      {/* 추가 운동기구 7종: 클릭 즉시 해당 기구로 이동·착석하고 구동 애니메이션을 시작합니다. */}
      <FitnessStation position={[-25.5, getIslandGroundHeight(-25.5, -10), -10]} kind="stepper" label="스텝퍼" onSeat={worldSeat} onRest={worldSeat} onStand={worldSeat} />
      <FitnessStation position={[25.5, getIslandGroundHeight(25.5, -10), -10]} kind="chest-press" label="체스트 프레스" onSeat={worldSeat} onRest={worldSeat} onStand={worldSeat} />
      <FitnessStation position={[-28, getIslandGroundHeight(-28, 3), 3]} kind="lat-pulldown" label="랫 풀다운" onSeat={worldSeat} onRest={worldSeat} onStand={worldSeat} />
      <FitnessStation position={[28, getIslandGroundHeight(28, 3), 3]} kind="leg-press" label="레그 프레스" onSeat={worldSeat} onRest={worldSeat} onStand={worldSeat} />
      <FitnessStation position={[-25, getIslandGroundHeight(-25, 13), 13]} kind="punching-bag" label="샌드백 복싱" onSeat={worldSeat} onRest={worldSeat} onStand={worldSeat} />
      <FitnessStation position={[25, getIslandGroundHeight(25, 13), 13]} kind="bench-press" label="벤치 프레스" onSeat={worldSeat} onRest={worldSeat} onStand={worldSeat} />
      <FitnessStation position={[0, getIslandGroundHeight(0, 31), 31]} kind="yoga-mat" label="요가·스트레칭 매트" onSeat={worldSeat} onRest={worldSeat} onStand={worldSeat} />
    </group>
  )
}
