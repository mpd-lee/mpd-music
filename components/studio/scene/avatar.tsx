'use client'

import { Html } from '@react-three/drei'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import type { StudioPlayer } from '@/lib/use-multiplayer'

type OrbitControlsImpl = { target: THREE.Vector3; update: () => void }

export const AVATAR_START = new THREE.Vector3(0, 0, 4.2)
const SPEED = 2.6
const SKIN = '#f3cba5'
const HOODIE = '#2f4a5a'
const ACCENT = '#e8b26a'

type AvatarProps = {
  target: THREE.Vector3 | null
  sitOnArrival?: boolean
  lieOnArrival?: boolean
  seatRotation?: number
  onArrive: () => void
  onMove?: (position: [number, number, number], rotationY: number) => void
  resetKey: number
}

export function Avatar({ target, sitOnArrival = false, lieOnArrival = false, seatRotation, onArrive, onMove, resetKey }: AvatarProps) {
  const root = useRef<THREE.Group>(null)
  const body = useRef<THREE.Group>(null)
  const leftLeg = useRef<THREE.Group>(null)
  const rightLeg = useRef<THREE.Group>(null)
  const leftArm = useRef<THREE.Group>(null)
  const rightArm = useRef<THREE.Group>(null)
  const phase = useRef(0)
  const sitting = useRef(false)
  const swimming = useRef(false)
  const lying = useRef(false)
  const arrived = useRef(false)
  const lastMoveSent = useRef(0)
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null
  const prev = useRef(AVATAR_START.clone())
  const route = useRef<THREE.Vector3[]>([])
  const routeIndex = useRef(0)

  useEffect(() => {
    if (!controls || !root.current) return
    const pos = root.current.position
    controls.target.set(pos.x, 1.1, pos.z)
    camera.position.set(pos.x, 3.0, pos.z + 5.5)
    controls.update()
  }, [resetKey, controls, camera])

  useEffect(() => {
    if (target) {
      sitting.current = false
      lying.current = false
      arrived.current = false
      routeIndex.current = 0
      const current = root.current?.position.clone()
      swimming.current = target.z > 12 && target.z < 22 && Math.abs(target.x) < 8.1
      const needsExitRoute = current && target.z > 9.2 && current.z <= 9.2
      const needsEntryRoute = current && current.z > 9.2 && target.z <= 9.2
      if (needsExitRoute) {
        const laneX = THREE.MathUtils.clamp(current!.x, -5.4, 5.4)
        route.current = [
          new THREE.Vector3(laneX, 0, 9.7),
          new THREE.Vector3(laneX, 0, 13.2),
          target.clone(),
        ]
      } else if (needsEntryRoute) {
        const laneX = THREE.MathUtils.clamp(target.x, -5.4, 5.4)
        route.current = [
          new THREE.Vector3(laneX, 0, 13.2),
          new THREE.Vector3(laneX, 0, 9.7),
          target.clone(),
        ]
      } else {
        route.current = [target.clone()]
      }
    }
  }, [target])

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const g = root.current
    if (!g) return
    let moving = false

    if (target && !arrived.current) {
      const waypoint = route.current[routeIndex.current] ?? target
      const dx = waypoint.x - g.position.x
      const dz = waypoint.z - g.position.z
      const dist = Math.hypot(dx, dz)
      if (dist > 0.055) {
        moving = true
        const desired = Math.atan2(dx, dz)
        let diff = desired - g.rotation.y
        diff = Math.atan2(Math.sin(diff), Math.cos(diff))
        g.rotation.y += diff * Math.min(1, dt * 10)
        const facing = Math.abs(diff) < 1.2 ? 1 : 0.35
        const step = Math.min(dist, SPEED * dt * facing)
        g.position.x += (dx / dist) * step
        g.position.z += (dz / dist) * step
      } else if (routeIndex.current < route.current.length - 1) {
        routeIndex.current += 1
      } else {
        if (seatRotation !== undefined) g.rotation.y = seatRotation
        sitting.current = sitOnArrival
        lying.current = lieOnArrival
        arrived.current = true
        onArrive()
      }
    }

    phase.current += dt * (moving ? 10 : sitting.current ? 1.5 : 2)
    const swing = moving ? Math.sin(phase.current) * 0.7 : 0
    const seatedLeg = sitting.current ? -1.12 : 0
    const restBody = lying.current ? -1.34 : 0
    const swimWave = swimming.current ? Math.sin(phase.current * 1.6) * 0.35 : 0
    leftLeg.current!.rotation.x = THREE.MathUtils.lerp(leftLeg.current!.rotation.x, swimming.current ? -0.55 + swimWave : lying.current ? -1.15 : moving ? swing : seatedLeg, 0.22)
    rightLeg.current!.rotation.x = THREE.MathUtils.lerp(rightLeg.current!.rotation.x, swimming.current ? 0.55 - swimWave : lying.current ? -1.15 : moving ? -swing : seatedLeg, 0.22)
    leftArm.current!.rotation.x = THREE.MathUtils.lerp(leftArm.current!.rotation.x, swimming.current ? -1.0 + swimWave : lying.current ? -0.75 : moving ? -swing * 0.8 : sitting.current ? -0.58 : 0, 0.22)
    rightArm.current!.rotation.x = THREE.MathUtils.lerp(rightArm.current!.rotation.x, swimming.current ? -1.0 - swimWave : lying.current ? -0.75 : moving ? swing * 0.8 : sitting.current ? -0.58 : 0, 0.22)
    body.current!.rotation.x = THREE.MathUtils.lerp(body.current!.rotation.x, swimming.current ? -0.22 : lying.current ? -1.34 : sitting.current ? -0.06 : 0, 0.18)
    body.current!.position.y = THREE.MathUtils.lerp(
      body.current!.position.y,
      swimming.current ? 0.12 : lying.current ? 0.25 : sitting.current ? 0.17 : moving ? Math.abs(Math.sin(phase.current)) * 0.05 : Math.sin(phase.current) * 0.012,
      0.2,
    )

    if (controls) {
      const delta = g.position.clone().sub(prev.current)
      if (delta.lengthSq() > 0) {
        controls.target.add(delta)
        camera.position.add(delta)
        controls.update()
      }
    }
    prev.current.copy(g.position)

    const now = performance.now()
    if (onMove && now - lastMoveSent.current > 140) {
      lastMoveSent.current = now
      onMove([g.position.x, g.position.y, g.position.z], g.rotation.y)
    }
  })

  return (
    <group ref={root} position={AVATAR_START.toArray()} rotation-y={Math.PI}>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.01, 0]}>
        <circleGeometry args={[0.32, 24]} />
        <meshBasicMaterial color="#000" transparent opacity={0.22} depthWrite={false} />
      </mesh>
      <group ref={body}>
        <group ref={leftLeg} position={[-0.1, 0.36, 0]}>
          <mesh position={[0, -0.16, 0]} castShadow>
            <capsuleGeometry args={[0.065, 0.2, 6, 12]} />
            <meshStandardMaterial color="#2b2b30" roughness={0.8} />
          </mesh>
          <mesh position={[0, -0.32, 0.04]} castShadow>
            <boxGeometry args={[0.13, 0.07, 0.2]} />
            <meshStandardMaterial color="#f2f2f2" roughness={0.6} />
          </mesh>
        </group>
        <group ref={rightLeg} position={[0.1, 0.36, 0]}>
          <mesh position={[0, -0.16, 0]} castShadow>
            <capsuleGeometry args={[0.065, 0.2, 6, 12]} />
            <meshStandardMaterial color="#2b2b30" roughness={0.8} />
          </mesh>
          <mesh position={[0, -0.32, 0.04]} castShadow>
            <boxGeometry args={[0.13, 0.07, 0.2]} />
            <meshStandardMaterial color="#f2f2f2" roughness={0.6} />
          </mesh>
        </group>
        <mesh position={[0, 0.58, 0]} castShadow>
          <capsuleGeometry args={[0.2, 0.22, 8, 20]} />
          <meshStandardMaterial color={HOODIE} roughness={0.85} />
        </mesh>
        <mesh position={[0, 0.6, 0.19]}>
          <boxGeometry args={[0.2, 0.12, 0.02]} />
          <meshStandardMaterial color={ACCENT} roughness={0.6} />
        </mesh>
        <group ref={leftArm} position={[-0.25, 0.7, 0]}>
          <mesh position={[0, -0.13, 0]} rotation-z={0.15} castShadow>
            <capsuleGeometry args={[0.055, 0.2, 6, 12]} />
            <meshStandardMaterial color={HOODIE} roughness={0.85} />
          </mesh>
          <mesh position={[-0.03, -0.28, 0]}>
            <sphereGeometry args={[0.05, 12, 12]} />
            <meshStandardMaterial color={SKIN} roughness={0.7} />
          </mesh>
        </group>
        <group ref={rightArm} position={[0.25, 0.7, 0]}>
          <mesh position={[0, -0.13, 0]} rotation-z={-0.15} castShadow>
            <capsuleGeometry args={[0.055, 0.2, 6, 12]} />
            <meshStandardMaterial color={HOODIE} roughness={0.85} />
          </mesh>
          <mesh position={[0.03, -0.28, 0]}>
            <sphereGeometry args={[0.05, 12, 12]} />
            <meshStandardMaterial color={SKIN} roughness={0.7} />
          </mesh>
        </group>
        <group position={[0, 1.08, 0]}>
          <mesh castShadow>
            <sphereGeometry args={[0.3, 32, 32]} />
            <meshStandardMaterial color={SKIN} roughness={0.65} />
          </mesh>
          <mesh position={[0, 0.06, -0.03]} scale={[1.05, 0.95, 1.05]}>
            <sphereGeometry args={[0.3, 32, 32, 0, Math.PI * 2, 0, Math.PI * 0.45]} />
            <meshStandardMaterial color="#3a2a20" roughness={0.9} />
          </mesh>
          {[-0.1, 0.1].map((x) => (
            <mesh key={x} position={[x, -0.01, 0.275]}>
              <sphereGeometry args={[0.03, 12, 12]} />
              <meshStandardMaterial color="#1a1412" roughness={0.3} />
            </mesh>
          ))}
          {[-0.17, 0.17].map((x) => (
            <mesh key={x} position={[x, -0.08, 0.24]}>
              <sphereGeometry args={[0.04, 12, 12]} />
              <meshStandardMaterial color="#f29a8f" transparent opacity={0.55} />
            </mesh>
          ))}
          <mesh position={[0, 0.02, 0]} rotation-z={Math.PI / 2} rotation-y={Math.PI / 2}>
            <torusGeometry args={[0.32, 0.025, 10, 32, Math.PI]} />
            <meshStandardMaterial color="#1c1c1c" roughness={0.4} metalness={0.4} />
          </mesh>
          {[-0.31, 0.31].map((x) => (
            <mesh key={x} position={[x, 0, 0]} rotation-z={Math.PI / 2}>
              <cylinderGeometry args={[0.09, 0.09, 0.07, 20]} />
              <meshStandardMaterial color={ACCENT} roughness={0.4} metalness={0.5} />
            </mesh>
          ))}
        </group>
      </group>
      <Html position={[0, 1.62, 0]} center style={{ pointerEvents: 'none' }} zIndexRange={[10, 0]}>
        <div className="flex items-center gap-1 whitespace-nowrap rounded-full bg-neutral-950/70 px-2.5 py-0.5 text-[11px] font-medium text-white backdrop-blur">
          <span className="size-1.5 rounded-full bg-emerald-400" aria-hidden="true" />나
        </div>
      </Html>
    </group>
  )
}

export function RemoteAvatar({ player, onSelect }: { player: StudioPlayer; onSelect: (target: { userId: string; name: string }) => void }) {
  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation()
    onSelect({ userId: player.userId, name: player.name })
  }
  return (
    <group
      position={player.position}
      rotation-y={player.rotationY}
      onClick={handleClick}
      onPointerOver={() => { document.body.style.cursor = 'pointer' }}
      onPointerOut={() => { document.body.style.cursor = 'auto' }}
    >
      <mesh position={[0, 0.58, 0]} castShadow>
        <capsuleGeometry args={[0.2, 0.22, 8, 16]} />
        <meshStandardMaterial color="#586c8a" roughness={0.82} />
      </mesh>
      <mesh position={[0, 1.08, 0]} castShadow>
        <sphereGeometry args={[0.3, 24, 24]} />
        <meshStandardMaterial color="#e6bd9c" roughness={0.7} />
      </mesh>
      <mesh position={[-0.12, 0.32, 0]} rotation-x={0.05}>
        <capsuleGeometry args={[0.065, 0.35, 5, 10]} />
        <meshStandardMaterial color="#262a32" />
      </mesh>
      <mesh position={[0.12, 0.32, 0]} rotation-x={0.05}>
        <capsuleGeometry args={[0.065, 0.35, 5, 10]} />
        <meshStandardMaterial color="#262a32" />
      </mesh>
      <mesh position={[-0.25, 0.57, 0]} rotation-z={-0.1}>
        <capsuleGeometry args={[0.055, 0.28, 5, 10]} />
        <meshStandardMaterial color="#586c8a" />
      </mesh>
      <mesh position={[0.25, 0.57, 0]} rotation-z={0.1}>
        <capsuleGeometry args={[0.055, 0.28, 5, 10]} />
        <meshStandardMaterial color="#586c8a" />
      </mesh>
      <Html position={[0, 1.55, 0]} center style={{ pointerEvents: 'none' }} zIndexRange={[10, 0]}>
        <div className="whitespace-nowrap rounded-full border border-sky-200/20 bg-neutral-950/80 px-2.5 py-1 text-[10px] font-semibold text-sky-100 shadow-lg backdrop-blur">
          {player.name}
        </div>
      </Html>
    </group>
  )
}

export function TargetMarker({ target }: { target: THREE.Vector3 | null }) {
  const ref = useRef<THREE.Mesh>(null)
  useFrame(({ clock }) => {
    if (!ref.current) return
    const s = 1 + Math.sin(clock.elapsedTime * 6) * 0.12
    ref.current.scale.set(s, s, s)
  })
  if (!target) return null
  return (
    <mesh ref={ref} position={[target.x, 0.02, target.z]} rotation-x={-Math.PI / 2} raycast={() => null}>
      <ringGeometry args={[0.18, 0.26, 32]} />
      <meshBasicMaterial color={ACCENT} transparent opacity={0.9} toneMapped={false} />
    </mesh>
  )
}
