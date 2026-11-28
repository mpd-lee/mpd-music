'use client'

import { Html } from '@react-three/drei'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react'
import * as THREE from 'three'
import type { StudioPlayer } from '@/lib/use-multiplayer'
import { getIslandGroundHeight, ISLAND_WALK_RADIUS } from '@/lib/island-terrain'
import { UNDERWATER_MIN_X, UNDERWATER_MAX_X, UNDERWATER_MIN_Y, UNDERWATER_MIN_Z, UNDERWATER_MAX_Z, UNDERWATER_SURFACE_Y } from '@/lib/world-depth'
import { collectStudioCollisionBoxes, findCollisionAwarePath, moveWithCollision, type CollisionBox } from '@/lib/studio-collision'
import type { WorkoutMode } from '@/lib/studio-interactions'

type OrbitControlsImpl = { target: THREE.Vector3; update: () => void }

export const AVATAR_START = new THREE.Vector3(0, 0, 4.2)
const SPEED = 4.25
const UNDERWATER_INPUT_SPEED = 42.0
const UNDERWATER_CLICK_SPEED = 84.0
const UNDERWATER_ASCENT_SPEED = 25.0
const UNDERWATER_DESCENT_SPEED = 30.0
type MoveVector = { x: number; z: number; y?: number }
const SKIN = '#f3cba5'
const HOODIE = '#2f4a5a'
const ACCENT = '#e8b26a'

type AvatarProps = {
  target: THREE.Vector3 | null
  instantTravel?: boolean
  underwaterMode?: boolean
  workoutMode?: WorkoutMode
  moveVectorRef: MutableRefObject<MoveVector>
  avatarRootRef?: MutableRefObject<THREE.Group | null>
  underwaterTargetRef?: MutableRefObject<THREE.Vector3 | null>
  sitOnArrival?: boolean
  lieOnArrival?: boolean
  seatRotation?: number
  seatActivity?: 'drums' | null
  onArrive: () => void
  onMove?: (position: [number, number, number], rotationY: number) => void
  displayName?: string
  resetKey: number
}


function ScubaBubbleTrail() {
  const bubbles = useRef<(THREE.Mesh | null)[]>([])
  const materials = useRef<(THREE.MeshPhysicalMaterial | null)[]>([])
  useFrame((state) => {
    const time = state.clock.elapsedTime
    // Short breathing bursts: a few tiny bubbles rise, pause, then repeat.
    bubbles.current.forEach((mesh, index) => {
      const material = materials.current[index]
      if (!mesh || !material) return
      const cycle = (time * 0.32 + index * 0.19) % 1
      const visible = cycle < 0.34
      mesh.visible = visible
      if (!visible) return
      const rise = cycle / 0.34
      mesh.position.set(Math.sin(time * 1.7 + index * 1.3) * 0.022, 0.01 + rise * 0.22, 0.015)
      mesh.scale.setScalar(0.0045 + rise * 0.007)
      material.opacity = 0.16 + (1 - rise) * 0.20
    })
  })
  return (
    <group position={[0, 1.035, 0.325]}>
      {Array.from({ length: 5 }, (_, index) => (
        <mesh key={index} ref={(mesh) => { bubbles.current[index] = mesh }}>
          <sphereGeometry args={[1, 8, 6]} />
          <meshPhysicalMaterial ref={(material) => { materials.current[index] = material }} color="#d8fbff" transparent opacity={0.38} roughness={0.06} metalness={0} clearcoat={1} depthWrite={false} />
        </mesh>
      ))}
    </group>
  )
}

export function Avatar({ target, instantTravel = false, underwaterMode = false, workoutMode = null, moveVectorRef, avatarRootRef, underwaterTargetRef, sitOnArrival = false, lieOnArrival = false, seatRotation, seatActivity = null, onArrive, onMove, displayName = 'MPD-Lee', resetKey }: AvatarProps) {
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
  const lastSentRotation = useRef(0)
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null
  const scene = useThree((s) => s.scene)
  const collisionBoxesRef = useRef<CollisionBox[]>([])
  const collisionRefreshRef = useRef(0)
  const collisionDirtyRef = useRef(true)
  const prev = useRef(AVATAR_START.clone())
  const route = useRef<THREE.Vector3[]>([])
  const routeIndex = useRef(0)
  const underwaterDepthRef = useRef(-3.0)
  const attachAvatarRoot = useCallback((node: THREE.Group | null) => {
    root.current = node
    if (avatarRootRef) avatarRootRef.current = node
  }, [avatarRootRef])

  useEffect(() => {
    if (!root.current) return
    const pos = root.current.position
    const facing = root.current.rotation.y
    const coarse = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse), (max-width: 820px)').matches
    // Keep the diver at the same third-person scale as the outdoor avatar.
    const distance = coarse ? 9.2 : 9.0
    const targetHeight = 1.18
    const cameraHeight = 2.82
    // A slightly wider underwater view makes the reef feel more distant. Scale
    // the diver by the matching projection ratio so the avatar remains the same
    // apparent size as it is outdoors; subsequent FOV zoom affects both together.
    const outdoorFov = coarse ? 52 : 50
    const underwaterFov = coarse ? 54 : 52
    root.current.scale.setScalar(underwaterMode ? 1.04 : 1)
    if ((camera as THREE.PerspectiveCamera).isPerspectiveCamera) {
      const perspective = camera as THREE.PerspectiveCamera
      perspective.fov = underwaterMode ? underwaterFov : outdoorFov
      perspective.updateProjectionMatrix()
    }
    const targetPoint = new THREE.Vector3(pos.x, pos.y + targetHeight, pos.z)
    if (controls) controls.target.copy(targetPoint)
    camera.position.set(
      pos.x - Math.sin(facing) * distance,
      pos.y + cameraHeight,
      pos.z - Math.cos(facing) * distance,
    )
    camera.lookAt(targetPoint)
    controls?.update()
    prev.current.copy(pos)
  }, [resetKey, controls, camera, underwaterMode])

  useEffect(() => {
    if (!target) return
    if (underwaterMode) underwaterDepthRef.current = THREE.MathUtils.clamp(target.y, UNDERWATER_MIN_Y, UNDERWATER_SURFACE_Y - 0.02)
    sitting.current = false
    lying.current = false
    arrived.current = false
    routeIndex.current = 0
    const current = root.current?.position.clone()
    // Underwater scenery (reef, cave and panoramic shell) is visual, not a
    // walkable obstacle. Never build land A* colliders while diving.
    collisionBoxesRef.current = underwaterMode ? [] : collectStudioCollisionBoxes(scene)
    collisionDirtyRef.current = false

    // Entering or leaving the underwater realm is an intentional portal transition.
    if (instantTravel && root.current) {
      const destination = target.clone()
      const delta = destination.clone().sub(root.current.position)
      root.current.position.copy(destination)
      if (underwaterMode) underwaterDepthRef.current = destination.y
      prev.current.copy(destination)
      camera.position.add(delta)
      if (controls) {
        controls.target.add(delta)
        controls.update()
      } else {
        camera.lookAt(destination.x, destination.y + 1.18, destination.z)
      }
      route.current = [destination]
      arrived.current = true
      onArrive()
      return
    }

    // Underwater taps become direct 3D swim destinations. A* is only for
    // land navigation around furniture, walls and equipment.
    if (underwaterMode) {
      const destination = target.clone()
      destination.x = THREE.MathUtils.clamp(destination.x, UNDERWATER_MIN_X, UNDERWATER_MAX_X)
      destination.z = THREE.MathUtils.clamp(destination.z, UNDERWATER_MIN_Z, UNDERWATER_MAX_Z)
      destination.y = THREE.MathUtils.clamp(destination.y, UNDERWATER_MIN_Y, UNDERWATER_SURFACE_Y - 0.02)
      route.current = [destination]
      return
    }

    // The pavilion has a broad, curved glass opening at its front. Guide
    // arrivals/departures through that opening, then let A* route around every
    // solid object rather than cutting through furniture or equipment.
    const boxes = collisionBoxesRef.current
    const isInsidePavilion = (point: THREE.Vector3) => Math.abs(point.x) <= 12.25 && point.z <= 9.25 && point.z >= -9.5
    if (!underwaterMode && current && (isInsidePavilion(current) !== isInsidePavilion(target))) {
      const laneX = THREE.MathUtils.clamp(isInsidePavilion(current) ? current.x : target.x, -2.15, 2.15)
      const gate = new THREE.Vector3(laneX, 0, -11.45)
      const firstLeg = findCollisionAwarePath(current, gate, boxes, { radius: 0.28, cellSize: 0.72, maxIterations: 42000 })
      const secondLeg = findCollisionAwarePath(gate, target, boxes, { radius: 0.28, cellSize: 0.72, maxIterations: 42000 })
      route.current = firstLeg.length && secondLeg.length
        ? [...firstLeg, ...secondLeg]
        : findCollisionAwarePath(current, target, boxes, { radius: 0.28, cellSize: 0.72, maxIterations: 42000 })
    } else {
      route.current = current
        ? findCollisionAwarePath(current, target, boxes, { radius: underwaterMode ? 0.34 : 0.28, cellSize: 0.72, maxIterations: 42000 })
        : [target.clone()]
    }
    if (!route.current.length && current) {
      route.current = findCollisionAwarePath(current, target, boxes, {
        radius: underwaterMode ? 0.30 : 0.24,
        cellSize: 0.62,
        maxIterations: 65000,
      })
    }
    if (!route.current.length && current) {
      route.current = findCollisionAwarePath(current, target, boxes, {
        radius: 0.18,
        cellSize: 0.52,
        maxIterations: 90000,
      })
    }
    if (!route.current.length) {
      // Last resort is still not a teleport or noclip: moveWithCollision sweeps
      // every small step and slides/stops at solid objects. This keeps click-to-move
      // responsive even when a dense furniture collider makes A* return no route.
      route.current = [target.clone()]
    }
    // Correct intermediate land waypoints to the shared terrain height field.
    // Preserve the final object's authored height so seats, beds and gym stations
    // still receive the avatar at their intended interaction point.
    if (!underwaterMode) {
      const lastIndex = route.current.length - 1
      route.current = route.current.map((point, index) => {
        const inside = Math.abs(point.x) <= 12.25 && point.z <= 9.25 && point.z >= -9.5
        const y = index === lastIndex
          ? target.y
          : inside ? 0 : getIslandGroundHeight(-point.x, -point.z)
        return new THREE.Vector3(point.x, y, point.z)
      })
    }
  }, [target, instantTravel, underwaterMode, controls, camera, onArrive, scene])

  useEffect(() => {
    collisionDirtyRef.current = true
  }, [underwaterMode, scene])



  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const g = root.current
    if (!g) return
    if (!underwaterMode && (collisionDirtyRef.current || state.clock.elapsedTime - collisionRefreshRef.current > 0.9)) {
      collisionBoxesRef.current = collectStudioCollisionBoxes(scene)
      collisionRefreshRef.current = state.clock.elapsedTime
      collisionDirtyRef.current = false
    }
    const colliders = collisionBoxesRef.current
    let moving = false
    const input = moveVectorRef.current
    const inputLength = Math.hypot(input.x, input.z)

    if (underwaterMode) {
      // One authoritative movement owner: this Avatar frame updates the diver,
      // waypoint, camera and replicated position together. Previously a second
      // scene driver competed with Avatar/OrbitControls, which could leave the
      // diver visually frozen even while the controls displayed active input.
      const verticalInput = THREE.MathUtils.clamp(input.y ?? 0, -1, 1)
      const hasHorizontalInput = inputLength > 0.018
      const hasVerticalInput = Math.abs(verticalInput) > 0.018
      const hasManualInput = hasHorizontalInput || hasVerticalInput

      sitting.current = false
      lying.current = false
      arrived.current = true

      if (hasManualInput) {
        if (underwaterTargetRef) underwaterTargetRef.current = null

        if (hasHorizontalInput) {
          const forward = new THREE.Vector3()
          camera.getWorldDirection(forward)
          forward.y = 0
          if (forward.lengthSq() < 0.0001) {
            forward.set(-Math.sin(g.rotation.y), 0, -Math.cos(g.rotation.y))
          }
          forward.normalize()
          // world-up × camera-forward matches the outdoor controller orientation.
          const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), forward).normalize()
          const direction = right.multiplyScalar(input.x).addScaledVector(forward, -input.z)
          if (direction.lengthSq() > 0.0001) {
            direction.normalize()
            g.position.addScaledVector(direction, UNDERWATER_INPUT_SPEED * dt)
            const desired = Math.atan2(direction.x, direction.z)
            let difference = desired - g.rotation.y
            difference = Math.atan2(Math.sin(difference), Math.cos(difference))
            g.rotation.y += difference * Math.min(1, dt * 8.5)
            moving = true
          }
        }

        if (hasVerticalInput) {
          const verticalSpeed = verticalInput > 0 ? UNDERWATER_ASCENT_SPEED : UNDERWATER_DESCENT_SPEED
          g.position.y += Math.sign(verticalInput) * verticalSpeed * dt
          moving = true
        }
      } else {
        const destination = underwaterTargetRef?.current ?? null
        if (destination) {
          const deltaToTarget = destination.clone().sub(g.position)
          const distance = deltaToTarget.length()
          if (distance > 0.85) {
            if (Math.hypot(deltaToTarget.x, deltaToTarget.z) > 0.02) {
              const desired = Math.atan2(deltaToTarget.x, deltaToTarget.z)
              let difference = desired - g.rotation.y
              difference = Math.atan2(Math.sin(difference), Math.cos(difference))
              g.rotation.y += difference * Math.min(1, dt * 8.5)
            }
            g.position.addScaledVector(deltaToTarget, Math.min(1, (UNDERWATER_CLICK_SPEED * dt) / distance))
            moving = true
          } else {
            g.position.copy(destination)
            underwaterTargetRef!.current = null
          }
        }
      }
    } else {
      if (inputLength > 0.012) {
        sitting.current = false
        lying.current = false
        arrived.current = true
        const forward = new THREE.Vector3()
        camera.getWorldDirection(forward)
        forward.y = 0
        if (forward.lengthSq() < 0.001) forward.set(Math.sin(g.rotation.y), 0, Math.cos(g.rotation.y))
        forward.normalize()
        const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), forward).normalize()
        const direction = right.multiplyScalar(input.x).addScaledVector(forward, -input.z)
        if (direction.lengthSq() > 0.001) {
          direction.normalize()
          const displacement = direction.clone().multiplyScalar(SPEED * dt)
          moveWithCollision(g.position, displacement, colliders, { radius: 0.28, height: 1.72 })
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
          if (Math.hypot(dx, dz) > 0.02) {
            const desired = Math.atan2(dx, dz)
            let diff = desired - g.rotation.y
            diff = Math.atan2(Math.sin(diff), Math.cos(diff))
            g.rotation.y += diff * Math.min(1, dt * 10)
          }
          const moveSpeed = swimming.current ? 3.35 : SPEED
          const step = Math.min(dist, moveSpeed * dt)
          const movement = new THREE.Vector3((dx / dist) * step, 0, (dz / dist) * step)
          moveWithCollision(g.position, movement, colliders, { radius: 0.28, height: 1.72 })
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
    }

    // Outdoor is rotated by 180 degrees, placing the garden and pool on world +Z.
    const inPoolWater = !underwaterMode && g.position.x >= -43.8 && g.position.x <= -24.2 && g.position.z >= 8.6 && g.position.z <= 19.4
    swimming.current = underwaterMode || inPoolWater
    diving.current = underwaterMode || (inPoolWater && g.position.y < -0.82)
    if (showScubaGear !== diving.current) setShowScubaGear(diving.current)
    const waterFloatY = diving.current
      ? -1.90 + Math.sin(phase.current * 1.05) * 0.018
      : -0.48 + Math.sin(phase.current * 1.15) * 0.025
    if (swimming.current) {
      if (!underwaterMode) {
        g.position.y = THREE.MathUtils.lerp(g.position.y, waterFloatY, diving.current ? 0.12 : 0.14)
      } else if ((!target || arrived.current) && Math.abs(input.y ?? 0) < 0.012) {
        // Gentle neutral buoyancy when no vertical input is held.
        g.position.y = THREE.MathUtils.lerp(g.position.y, underwaterDepthRef.current + Math.sin(phase.current * 1.05) * 0.018, 0.025)
      }
    } else if (!sitting.current && !lying.current && !workoutMode && (g.position.z > 9.2 || Math.abs(g.position.x) > 12.2)) {
      const onPoolDeck = Math.abs(g.position.x) <= 9.4 && g.position.z >= 11.3 && g.position.z <= 22.7
      const groundY = onPoolDeck ? 0.015 : getIslandGroundHeight(-g.position.x, -g.position.z)
      g.position.y = THREE.MathUtils.lerp(g.position.y, groundY, Math.min(1, dt * 9))
    }

    // Keep walking avatars on the walkable island instead of allowing them to drift beyond the terrain mesh.
    if (!underwaterMode && !swimming.current) {
      const radius = Math.hypot(g.position.x, g.position.z)
      const maxRadius = ISLAND_WALK_RADIUS - 0.8
      if (radius > maxRadius) {
        const scale = maxRadius / radius
        g.position.x *= scale
        g.position.z *= scale
      }
    } else if (underwaterMode) {
      // Keep free-swimming movement inside the underwater exploration volume.
      g.position.x = THREE.MathUtils.clamp(g.position.x, UNDERWATER_MIN_X, UNDERWATER_MAX_X)
      g.position.z = THREE.MathUtils.clamp(g.position.z, UNDERWATER_MIN_Z, UNDERWATER_MAX_Z)
      g.position.y = THREE.MathUtils.clamp(g.position.y, UNDERWATER_MIN_Y, UNDERWATER_SURFACE_Y - 0.02)
      underwaterDepthRef.current = g.position.y
    }

    phase.current += dt * (moving ? 10 : sitting.current ? 1.5 : swimming.current ? 5.2 : 2)
    const swing = moving ? Math.sin(phase.current) * 0.7 : 0
    const seatedLeg = sitting.current ? -1.12 : 0
    const swimWave = swimming.current ? Math.sin(phase.current * (diving.current ? 1.65 : 1.9)) * (diving.current ? 0.3 : 0.38) : 0

    let leftLegTarget = swimming.current ? -0.55 + swimWave : lying.current ? -1.15 : moving ? swing : seatedLeg
    let rightLegTarget = swimming.current ? 0.55 - swimWave : lying.current ? -1.15 : moving ? -swing : seatedLeg
    let leftArmTarget = swimming.current ? -0.92 + swimWave : lying.current ? -0.75 : moving ? -swing * 0.8 : sitting.current ? -0.58 : 0
    let rightArmTarget = swimming.current ? -0.92 - swimWave : lying.current ? -0.75 : moving ? swing * 0.8 : sitting.current ? -0.58 : 0
    let bodyRotX = swimming.current ? (diving.current ? -0.68 : -0.24) : lying.current ? -1.34 : sitting.current ? -0.06 : 0
    let bodyRotZ = 0
    let bodyY = swimming.current
      ? (underwaterMode ? 0.13 : 0.34) + Math.sin(phase.current * 1.15) * 0.025
      : lying.current ? 0.25 : sitting.current ? 0.17 : moving ? Math.abs(Math.sin(phase.current)) * 0.05 : Math.sin(phase.current) * 0.012

    // A seated drummer alternates both forearms toward the snare and cymbals.
    if (sitting.current && seatActivity === 'drums') {
      const hitLeft = Math.max(0, Math.sin(phase.current * 4.2))
      const hitRight = Math.max(0, Math.sin(phase.current * 4.2 + Math.PI))
      leftArmTarget = -1.12 - hitLeft * 0.72
      rightArmTarget = -1.12 - hitRight * 0.72
      leftLegTarget = -1.05 + Math.sin(phase.current * 2.1) * 0.08
      rightLegTarget = -1.05 - Math.sin(phase.current * 2.1) * 0.08
      bodyRotX = -0.12
      bodyRotZ = Math.sin(phase.current * 2.1) * 0.025
      bodyY = 0.17 + Math.abs(Math.sin(phase.current * 4.2)) * 0.012
    }

    // The avatar now performs a matching pose while the selected piece of gym equipment runs.
    const exercise = arrived.current && !swimming.current ? workoutMode : null
    const cycle = phase.current
    if (exercise) {
      const wave = Math.sin(cycle * 1.8)
      switch (exercise) {
        case 'treadmill':
        case 'elliptical':
        case 'stepper':
          leftLegTarget = Math.sin(cycle * 1.45) * 0.78
          rightLegTarget = -Math.sin(cycle * 1.45) * 0.78
          leftArmTarget = -Math.sin(cycle * 1.45) * 0.38 - 0.12
          rightArmTarget = Math.sin(cycle * 1.45) * 0.38 - 0.12
          bodyRotX = 0.035
          bodyY = 0.015 + Math.abs(Math.sin(cycle * 1.45)) * 0.055
          break
        case 'bike':
          leftLegTarget = -0.82 + Math.sin(cycle * 1.65) * 0.42
          rightLegTarget = -0.82 - Math.sin(cycle * 1.65) * 0.42
          leftArmTarget = -0.72
          rightArmTarget = -0.72
          bodyRotX = -0.14
          bodyY = 0.17 + Math.sin(cycle * 1.65) * 0.018
          break
        case 'rower': {
          const pull = Math.sin(cycle * 1.25)
          leftLegTarget = -0.98 + pull * 0.27
          rightLegTarget = -0.98 + pull * 0.27
          leftArmTarget = -0.72 - pull * 0.55
          rightArmTarget = -0.72 - pull * 0.55
          bodyRotX = -0.08 + pull * 0.2
          bodyY = 0.16 + pull * 0.025
          break
        }
        case 'chest-press': {
          const press = (Math.sin(cycle * 1.5) + 1) * 0.5
          leftLegTarget = -1.12
          rightLegTarget = -1.12
          leftArmTarget = -0.48 - press * 0.66
          rightArmTarget = -0.48 - press * 0.66
          bodyRotX = -0.09
          bodyY = 0.17
          break
        }
        case 'lat-pulldown': {
          const pull = (Math.sin(cycle * 1.25) + 1) * 0.5
          leftLegTarget = -1.12
          rightLegTarget = -1.12
          leftArmTarget = -1.45 - pull * 0.52
          rightArmTarget = -1.45 - pull * 0.52
          bodyRotX = 0.04 + pull * 0.08
          bodyY = 0.17
          break
        }
        case 'leg-press': {
          const press = (Math.sin(cycle * 1.25) + 1) * 0.5
          leftLegTarget = -1.55 + press * 0.72
          rightLegTarget = -1.55 + press * 0.72
          leftArmTarget = -0.62
          rightArmTarget = -0.62
          bodyRotX = -0.16
          bodyY = 0.17
          break
        }
        case 'punching-bag': {
          const punchL = (Math.sin(cycle * 2.35) + 1) * 0.5
          const punchR = (Math.sin(cycle * 2.35 + Math.PI) + 1) * 0.5
          leftLegTarget = -0.12 + Math.sin(cycle * 1.2) * 0.14
          rightLegTarget = 0.1 - Math.sin(cycle * 1.2) * 0.14
          leftArmTarget = -0.58 - punchL * 1.0
          rightArmTarget = -0.58 - punchR * 1.0
          bodyRotX = -0.04
          bodyRotZ = Math.sin(cycle * 2.35) * 0.1
          bodyY = 0.015 + Math.abs(wave) * 0.025
          break
        }
        case 'bench-press': {
          const press = (Math.sin(cycle * 1.45) + 1) * 0.5
          leftLegTarget = -1.12
          rightLegTarget = -1.12
          leftArmTarget = -1.45 + press * 0.42
          rightArmTarget = -1.45 + press * 0.42
          bodyRotX = -1.34
          bodyY = 0.25
          break
        }
        case 'yoga-mat': {
          const breath = Math.sin(cycle * 0.5)
          leftLegTarget = -1.08 + breath * 0.08
          rightLegTarget = -1.08 - breath * 0.08
          leftArmTarget = -0.78 + breath * 0.18
          rightArmTarget = -0.78 - breath * 0.18
          bodyRotX = -1.34
          bodyY = 0.25 + Math.sin(cycle * 0.5) * 0.025
          break
        }
      }
    }

    leftLeg.current!.rotation.x = THREE.MathUtils.lerp(leftLeg.current!.rotation.x, leftLegTarget, 0.22)
    rightLeg.current!.rotation.x = THREE.MathUtils.lerp(rightLeg.current!.rotation.x, rightLegTarget, 0.22)
    leftArm.current!.rotation.x = THREE.MathUtils.lerp(leftArm.current!.rotation.x, leftArmTarget, 0.22)
    rightArm.current!.rotation.x = THREE.MathUtils.lerp(rightArm.current!.rotation.x, rightArmTarget, 0.22)
    body.current!.rotation.x = THREE.MathUtils.lerp(body.current!.rotation.x, bodyRotX, 0.18)
    body.current!.rotation.z = THREE.MathUtils.lerp(body.current!.rotation.z, bodyRotZ, 0.18)
    body.current!.position.y = THREE.MathUtils.lerp(body.current!.position.y, bodyY, 0.2)

    const cameraDelta = g.position.clone().sub(prev.current)
    if (cameraDelta.lengthSq() > 1e-10) {
      // The camera follows the exact avatar displacement in both realms. The
      // controls target is translated with it, preserving the user's 360° orbit
      // while the diver moves freely through the underwater volume.
      camera.position.add(cameraDelta)
      if (controls) {
        controls.target.add(cameraDelta)
        controls.update()
      } else {
        camera.lookAt(g.position.x, g.position.y + 1.18, g.position.z)
      }
    }
    prev.current.copy(g.position)

    const now = performance.now()
    if (onMove && now - lastMoveSent.current > (underwaterMode ? 65 : 140)) {
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
    <group
      ref={attachAvatarRoot}
      position={AVATAR_START.toArray()}
      rotation-y={0}
      scale={1}
      userData={{ mpdNoCollision: true }}
    >
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
          {seatActivity === 'drums' && <mesh position={[-0.03, -0.29, 0.15]} rotation-x={Math.PI / 2} castShadow><cylinderGeometry args={[0.009, 0.013, 0.38, 7]} /><meshStandardMaterial color="#c69b61" roughness={0.72} /></mesh>}
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
          {seatActivity === 'drums' && <mesh position={[0.03, -0.29, 0.15]} rotation-x={Math.PI / 2} castShadow><cylinderGeometry args={[0.009, 0.013, 0.38, 7]} /><meshStandardMaterial color="#c69b61" roughness={0.72} /></mesh>}
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
      userData={{ mpdNoCollision: true }}
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

export function TargetMarker({ target, underwater = false }: { target: THREE.Vector3 | null; underwater?: boolean }) {
  const ref = useRef<THREE.Mesh>(null)
  useFrame(({ clock }) => {
    if (!ref.current) return
    const s = 1 + Math.sin(clock.elapsedTime * 6) * 0.12
    ref.current.scale.set(s, s, s)
  })
  if (!target) return null
  return (
    <group position={[target.x, target.y + (underwater ? 0.06 : 0.025), target.z]} raycast={() => null}>
      <mesh ref={ref} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[0.25, 0.34, 40]} />
        <meshBasicMaterial color={underwater ? '#72edff' : ACCENT} transparent opacity={0.95} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0.025, 0]}>
        <sphereGeometry args={[0.055, 12, 8]} />
        <meshBasicMaterial color={underwater ? '#b8f9ff' : '#fff0bf'} toneMapped={false} />
      </mesh>
    </group>
  )
}
