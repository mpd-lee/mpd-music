'use client'

import { Html } from '@react-three/drei'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useRef, useState, type MutableRefObject } from 'react'
import * as THREE from 'three'
import type { StudioPlayer } from '@/lib/use-multiplayer'
import { getIslandGroundHeight } from '@/lib/island-terrain'

type OrbitControlsImpl = { target: THREE.Vector3; update: () => void }

export const AVATAR_START = new THREE.Vector3(0, 0, 4.2)
const SPEED = 4.25
type MoveVector = { x: number; z: number; y?: number }
const SKIN = '#f3cba5'
const HOODIE = '#2f4a5a'
const ACCENT = '#e8b26a'

type AvatarProps = {
  target: THREE.Vector3 | null
  instantTravel?: boolean
  underwaterMode?: boolean
  moveVectorRef: MutableRefObject<MoveVector>
  sitOnArrival?: boolean
  lieOnArrival?: boolean
  seatRotation?: number
  onArrive: () => void
  onMove?: (position: [number, number, number], rotationY: number) => void
  displayName?: string
  resetKey: number
}


function ScubaBubbleTrail() {
  const bubbles = useRef<(THREE.Mesh | null)[]>([])
  useFrame((state) => {
    const time = state.clock.elapsedTime
    bubbles.current.forEach((mesh, index) => {
      if (!mesh) return
      const cycle = (time * 0.72 + index * 0.29) % 1.18
      mesh.position.set(Math.sin(time * 1.8 + index * 1.7) * 0.025, 0.015 + cycle * 0.34, 0.015)
      const radius = 0.012 + cycle * 0.009
      mesh.scale.setScalar(radius)
      mesh.visible = true
    })
  })
  return (
    <group position={[0, 1.02, 0.31]}>
      {Array.from({ length: 4 }, (_, index) => (
        <mesh key={index} ref={(mesh) => { bubbles.current[index] = mesh }}>
          <sphereGeometry args={[1, 8, 6]} />
          <meshPhysicalMaterial color="#c9f8ff" transparent opacity={0.38} roughness={0.08} metalness={0} clearcoat={0.8} depthWrite={false} />
        </mesh>
      ))}
    </group>
  )
}

export function Avatar({ target, instantTravel = false, underwaterMode = false, moveVectorRef, sitOnArrival = false, lieOnArrival = false, seatRotation, onArrive, onMove, displayName = 'MPD-Lee', resetKey }: AvatarProps) {
  const root = useRef<THREE.Group>(null)
  const body = useRef<THREE.Group>(null)
  const leftLeg = useRef<THREE.Group>(null)
  const rightLeg = useRef<THREE.Group>(null)
  const leftArm = useRef<THREE.Group>(null)
  const rightArm = useRef<THREE.Group>(null)
  const phase = useRef(0)
  const sitting = useRef(false)
  const swimming = useRef(false)
  const diving = useRef(false)
  const [showScubaGear, setShowScubaGear] = useState(false)
  const lying = useRef(false)
  const arrived = useRef(false)
  const lastMoveSent = useRef(0)
  const lastSentPosition = useRef(AVATAR_START.clone())
  const lastSentRotation = useRef(Math.PI)
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
    if (!target) return
    sitting.current = false
    lying.current = false
    arrived.current = false
    routeIndex.current = 0
    const current = root.current?.position.clone()

    // Entering or leaving the underwater realm is an intentional portal transition.
    if (instantTravel && root.current) {
      const destination = target.clone()
      const delta = destination.clone().sub(root.current.position)
      root.current.position.copy(destination)
      prev.current.copy(destination)
      if (controls) {
        controls.target.add(delta)
        camera.position.add(delta)
        controls.update()
      }
      route.current = [destination]
      arrived.current = true
      onArrive()
      return
    }

    // The 180-degree outdoor rotation places the garden exit on world +Z.
    if (!underwaterMode && current && current.z <= 9.2 && target.z > 9.2) {
      const laneX = THREE.MathUtils.clamp(current.x, -5.4, 5.4)
      route.current = [
        new THREE.Vector3(laneX, current.y, 9.7),
        new THREE.Vector3(laneX, current.y, target.z <= 12.55 ? 12.25 : 13.2),
        target.clone(),
      ]
    } else if (!underwaterMode && current && current.z > 9.2 && target.z <= 9.2) {
      const laneX = THREE.MathUtils.clamp(target.x, -5.4, 5.4)
      route.current = [
        new THREE.Vector3(laneX, target.y, 13.2),
        new THREE.Vector3(laneX, target.y, 9.7),
        target.clone(),
      ]
    } else {
      route.current = [target.clone()]
    }
  }, [target, instantTravel, underwaterMode, controls, camera, onArrive])

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const g = root.current
    if (!g) return
    let moving = false
    const input = moveVectorRef.current
    const inputLength = Math.hypot(input.x, input.z)

    if (underwaterMode && Math.abs(input.y ?? 0) > 0.04) {
      g.position.y = THREE.MathUtils.clamp(g.position.y + THREE.MathUtils.clamp(input.y ?? 0, -1, 1) * 2.1 * dt, -4.45, 2.5)
    }

    if (inputLength > 0.04) {
      sitting.current = false
      lying.current = false
      arrived.current = true
      const forward = new THREE.Vector3()
      camera.getWorldDirection(forward)
      forward.y = 0
      if (forward.lengthSq() < 0.001) forward.set(0, 0, -1)
      forward.normalize()
      const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize()
      const direction = right.multiplyScalar(input.x).addScaledVector(forward, -input.z)
      if (direction.lengthSq() > 0.001) {
        direction.normalize()
        const speed = underwaterMode ? 3.15 : SPEED
        g.position.addScaledVector(direction, speed * dt)
        const desired = Math.atan2(direction.x, direction.z)
        let diff = desired - g.rotation.y
        diff = Math.atan2(Math.sin(diff), Math.cos(diff))
        g.rotation.y += diff * Math.min(1, dt * 10)
        moving = true
      }
    } else if (target && !arrived.current) {
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
        // Keep click-to-move responsive while the avatar smoothly turns toward the destination.
        const moveSpeed = swimming.current && g.position.y < -0.8 ? 3.05 : swimming.current ? 3.35 : SPEED
        const step = Math.min(dist, moveSpeed * dt)
        g.position.x += (dx / dist) * step
        g.position.z += (dz / dist) * step
        g.position.y = THREE.MathUtils.lerp(g.position.y, waypoint.y, Math.min(1, dt * 5.5))
      } else if (routeIndex.current < route.current.length - 1) {
        routeIndex.current += 1
      } else {
        g.position.y = waypoint.y
        if (seatRotation !== undefined) g.rotation.y = seatRotation
        sitting.current = sitOnArrival
        lying.current = lieOnArrival
        arrived.current = true
        onArrive()
      }
    }

    // Outdoor is rotated by 180 degrees, placing the garden and pool on world +Z.
    const inPoolWater = Math.abs(g.position.x) < 8.05 && g.position.z >= 12.65 && g.position.z <= 21.35
    swimming.current = underwaterMode || inPoolWater
    diving.current = underwaterMode || (inPoolWater && g.position.y < -0.82)
    if (showScubaGear !== diving.current) setShowScubaGear(diving.current)
    const waterFloatY = diving.current
      ? -1.90 + Math.sin(phase.current * 1.05) * 0.018
      : -0.48 + Math.sin(phase.current * 1.15) * 0.025
    if (swimming.current) {
      if (!underwaterMode) {
        g.position.y = THREE.MathUtils.lerp(g.position.y, waterFloatY, diving.current ? 0.12 : 0.14)
      } else if ((!target || arrived.current) && Math.abs(input.y ?? 0) < 0.04) {
        // Gentle neutral buoyancy when no vertical input is held.
        g.position.y = THREE.MathUtils.lerp(g.position.y, -1.9 + Math.sin(phase.current * 1.05) * 0.018, 0.025)
      }
    } else if (!sitting.current && !lying.current && (g.position.z > 9.2 || Math.abs(g.position.x) > 12.2)) {
      const onPoolDeck = Math.abs(g.position.x) <= 9.4 && g.position.z >= 11.3 && g.position.z <= 22.7
      const groundY = onPoolDeck ? 0.015 : getIslandGroundHeight(g.position.x, g.position.z)
      g.position.y = THREE.MathUtils.lerp(g.position.y, groundY, Math.min(1, dt * 9))
    }

    // Keep walking avatars on the walkable island instead of allowing them to drift beyond the terrain mesh.
    if (!underwaterMode && !swimming.current) {
      const radius = Math.hypot(g.position.x, g.position.z)
      const maxRadius = 74.2
      if (radius > maxRadius) {
        const scale = maxRadius / radius
        g.position.x *= scale
        g.position.z *= scale
      }
    }

    phase.current += dt * (moving ? 10 : sitting.current ? 1.5 : swimming.current ? 4.2 : 2)
    const swing = moving ? Math.sin(phase.current) * 0.7 : 0
    const seatedLeg = sitting.current ? -1.12 : 0
    const swimWave = swimming.current ? Math.sin(phase.current * (diving.current ? 1.1 : 1.6)) * (diving.current ? 0.22 : 0.35) : 0
    leftLeg.current!.rotation.x = THREE.MathUtils.lerp(leftLeg.current!.rotation.x, swimming.current ? -0.55 + swimWave : lying.current ? -1.15 : moving ? swing : seatedLeg, 0.22)
    rightLeg.current!.rotation.x = THREE.MathUtils.lerp(rightLeg.current!.rotation.x, swimming.current ? 0.55 - swimWave : lying.current ? -1.15 : moving ? -swing : seatedLeg, 0.22)
    leftArm.current!.rotation.x = THREE.MathUtils.lerp(leftArm.current!.rotation.x, swimming.current ? -1.0 + swimWave : lying.current ? -0.75 : moving ? -swing * 0.8 : sitting.current ? -0.58 : 0, 0.22)
    rightArm.current!.rotation.x = THREE.MathUtils.lerp(rightArm.current!.rotation.x, swimming.current ? -1.0 - swimWave : lying.current ? -0.75 : moving ? swing * 0.8 : sitting.current ? -0.58 : 0, 0.22)
    body.current!.rotation.x = THREE.MathUtils.lerp(body.current!.rotation.x, swimming.current ? (diving.current ? -0.62 : -0.22) : lying.current ? -1.34 : sitting.current ? -0.06 : 0, 0.18)
    body.current!.position.y = THREE.MathUtils.lerp(
      body.current!.position.y,
      swimming.current ? 0.34 + Math.sin(phase.current * 1.15) * 0.025 : lying.current ? 0.25 : sitting.current ? 0.17 : moving ? Math.abs(Math.sin(phase.current)) * 0.05 : Math.sin(phase.current) * 0.012,
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
      const moved = g.position.distanceToSquared(lastSentPosition.current) > 0.0025
      let rotationDelta = g.rotation.y - lastSentRotation.current
      rotationDelta = Math.atan2(Math.sin(rotationDelta), Math.cos(rotationDelta))
      if (moved || Math.abs(rotationDelta) > 0.035) {
        lastMoveSent.current = now
        lastSentPosition.current.copy(g.position)
        lastSentRotation.current = g.rotation.y
        onMove([g.position.x, g.position.y, g.position.z], g.rotation.y)
      }
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
          <meshStandardMaterial color={showScubaGear ? '#123b55' : HOODIE} roughness={0.72} metalness={showScubaGear ? 0.12 : 0} />
        </mesh>
        <mesh position={[0, 0.6, 0.19]}>
          <boxGeometry args={[0.2, 0.12, 0.02]} />
          <meshStandardMaterial color={ACCENT} roughness={0.6} />
        </mesh>
        <group ref={leftArm} position={[-0.25, 0.7, 0]}>
          <mesh position={[0, -0.13, 0]} rotation-z={0.15} castShadow>
            <capsuleGeometry args={[0.055, 0.2, 6, 12]} />
            <meshStandardMaterial color={showScubaGear ? '#174b63' : HOODIE} roughness={0.78} />
          </mesh>
          <mesh position={[-0.03, -0.28, 0]}>
            <sphereGeometry args={[0.05, 12, 12]} />
            <meshStandardMaterial color={SKIN} roughness={0.7} />
          </mesh>
        </group>
        <group ref={rightArm} position={[0.25, 0.7, 0]}>
          <mesh position={[0, -0.13, 0]} rotation-z={-0.15} castShadow>
            <capsuleGeometry args={[0.055, 0.2, 6, 12]} />
            <meshStandardMaterial color={showScubaGear ? '#174b63' : HOODIE} roughness={0.78} />
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
      {showScubaGear && (
        <group>
          {/* Compact scuba tank, harness, mask and fins appear only while underwater. */}
          <mesh position={[0, 0.68, -0.245]} castShadow>
            <cylinderGeometry args={[0.115, 0.13, 0.58, 14]} />
            <meshStandardMaterial color="#e6b94f" metalness={0.58} roughness={0.3} />
          </mesh>
          <mesh position={[0, 1.12, 0.265]}>
            <boxGeometry args={[0.34, 0.15, 0.075]} />
            <meshPhysicalMaterial color="#101d25" metalness={0.25} roughness={0.16} clearcoat={0.8} />
          </mesh>
          <mesh position={[0, 1.12, 0.31]}>
            <boxGeometry args={[0.25, 0.085, 0.018]} />
            <meshBasicMaterial color="#55d9ed" toneMapped={false} />
          </mesh>
          <mesh position={[0.25, 1.18, 0.06]}>
            <cylinderGeometry args={[0.025, 0.025, 0.38, 8]} />
            <meshStandardMaterial color="#d8e1e5" metalness={0.45} />
          </mesh>
          {[-0.13, 0.13].map((x) => (
            <mesh key={x} position={[x, 0.055, -0.16]} rotation-x={-0.08}>
              <boxGeometry args={[0.16, 0.045, 0.42]} />
              <meshStandardMaterial color="#153c51" roughness={0.42} />
            </mesh>
          ))}
          {/* Small regulator and a fine stream of bubbles rising from the diver's mouth. */}
          <mesh position={[0.035, 1.025, 0.34]}>
            <sphereGeometry args={[0.045, 10, 8]} />
            <meshStandardMaterial color="#192d38" metalness={0.25} roughness={0.3} />
          </mesh>
          <ScubaBubbleTrail />
        </group>
      )}
      <Html position={[0, 1.62, 0]} center style={{ pointerEvents: 'none' }} zIndexRange={[10, 0]}>
        <div className="flex items-center gap-1 whitespace-nowrap rounded-full bg-neutral-950/70 px-2.5 py-0.5 text-[11px] font-medium text-white backdrop-blur">
          <span className="size-1.5 rounded-full bg-emerald-400" aria-hidden="true" />{displayName}
        </div>
      </Html>
    </group>
  )
}

export function RemoteAvatar({ player, onSelect }: { player: StudioPlayer; onSelect: (target: { userId: string; name: string }) => void }) {
  const groupRef = useRef<THREE.Group>(null)
  const initialPosition = useRef(new THREE.Vector3(...player.position)).current
  const initialRotation = useRef(player.rotationY).current
  const goal = useRef(new THREE.Vector3(...player.position))
  const goalRotation = useRef(player.rotationY)
  goal.current.set(...player.position)
  goalRotation.current = player.rotationY
  useFrame((_, delta) => {
    if (!groupRef.current) return
    const alpha = 1 - Math.exp(-Math.min(delta, 0.05) * 11)
    groupRef.current.position.lerp(goal.current, alpha)
    let diff = goalRotation.current - groupRef.current.rotation.y
    diff = Math.atan2(Math.sin(diff), Math.cos(diff))
    groupRef.current.rotation.y += diff * alpha
  })
  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation()
    onSelect({ userId: player.userId, name: player.name })
  }
  return (
    <group
      ref={groupRef}
      position={initialPosition}
      rotation-y={initialRotation}
      onClick={handleClick}
      onPointerOver={() => { document.body.style.cursor = 'pointer' }}
      onPointerOut={() => { document.body.style.cursor = 'auto' }}
    >
      <mesh position={[0, 0.85, 0]} onClick={handleClick}>
        <capsuleGeometry args={[0.34, 0.82, 6, 10]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
      </mesh>
      <mesh position={[0, 0.58, 0]} castShadow>
        <capsuleGeometry args={[0.2, 0.22, 8, 16]} />
        <meshStandardMaterial color="#586c8a" roughness={0.82} />
      </mesh>
      {player.position[1] < -0.82 && (
        <group>
          <mesh position={[0, 0.66, -0.22]} castShadow><cylinderGeometry args={[0.11, 0.125, 0.55, 12]} /><meshStandardMaterial color="#e6b94f" metalness={0.5} roughness={0.32} /></mesh>
          <mesh position={[0, 1.11, 0.26]}><boxGeometry args={[0.32, 0.14, 0.07]} /><meshStandardMaterial color="#173c4b" metalness={0.25} roughness={0.18} /></mesh>
          <mesh position={[0, 1.11, 0.3]}><boxGeometry args={[0.23, 0.07, 0.015]} /><meshBasicMaterial color="#55d9ed" toneMapped={false} /></mesh>
        </group>
      )}
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
