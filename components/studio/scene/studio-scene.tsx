'use client'

import { Environment, OrbitControls } from '@react-three/drei'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { Suspense, useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react'
import * as THREE from 'three'
import { GRAPHICS_PRESETS, type GraphicsTier } from '@/lib/graphics-quality'
import { getIslandGroundHeight, ISLAND_WALK_RADIUS } from '@/lib/island-terrain'
import type { GuestEntry } from '@/lib/use-guestbook'
import type { StudioPlayer } from '@/lib/use-multiplayer'
import { AVATAR_START, Avatar, RemoteAvatar, TargetMarker } from './avatar'
import type { FitnessKind } from '@/lib/studio-interactions'
import { CandleBench } from './candles'
import { ControlRoom } from './control-room'
import { CLICK_DRAG_TOLERANCE } from './interactive'
import { Instruments } from './instruments'
import { Outdoor, SUN_POSITION } from './outdoor'
import { ROOM, Room } from './room'
import { StudioFurniture } from './studio-furniture'
import { UnderwaterWorld } from './underwater-world'
import { UNDERWATER_MIN_X, UNDERWATER_MAX_X, UNDERWATER_MIN_Y, UNDERWATER_MIN_Z, UNDERWATER_MAX_Z, UNDERWATER_SURFACE_Y } from '@/lib/world-depth'
import { PlayerControls } from '../player-controls'

const DEFAULT_ORBIT_TARGET: [number, number, number] = [AVATAR_START.x, 2.35, AVATAR_START.z]

const INTERIOR_LIGHTS: [number, number, number][] = [
  [-7.5, 6.8, -3], [0, 7.1, -3], [7.5, 6.8, -3],
  [-7.5, 6.8, 4], [0, 7.1, 4], [7.5, 6.8, 4],
]

// Outdoor is rendered inside a 180-degree rotated group, so world X/Z must
// be inverted before sampling its asymmetric terrain height field.
function getWorldIslandGroundHeight(x: number, z: number) {
  return getIslandGroundHeight(-x, -z)
}

function intersectIslandSurface(ray: THREE.Ray, fallback: THREE.Vector3) {
  // Find the first positive ray/height-field crossing. A bracketed binary search
  // is stable on the island's rolling lawn and its sloped outer walkable edge.
  if (Math.abs(ray.direction.y) < 0.00005) return fallback.clone()
  const samplePoint = new THREE.Vector3()
  const errorAt = (distance: number) => {
    ray.at(distance, samplePoint)
    if (Math.hypot(samplePoint.x, samplePoint.z) > ISLAND_WALK_RADIUS + 0.25) return Number.POSITIVE_INFINITY
    return samplePoint.y - getWorldIslandGroundHeight(samplePoint.x, samplePoint.z)
  }

  let previousDistance = 0.05
  let previousError = errorAt(previousDistance)
  if (!Number.isFinite(previousError)) return fallback.clone()

  const step = 0.32
  for (let distance = previousDistance + step; distance <= 260; distance += step) {
    const error = errorAt(distance)
    if (!Number.isFinite(error)) break
    if (previousError >= 0 && error <= 0) {
      let low = previousDistance
      let high = distance
      for (let iteration = 0; iteration < 16; iteration += 1) {
        const middle = (low + high) * 0.5
        if (errorAt(middle) > 0) low = middle
        else high = middle
      }
      ray.at((low + high) * 0.5, samplePoint)
      samplePoint.y = getWorldIslandGroundHeight(samplePoint.x, samplePoint.z)
      return samplePoint.clone()
    }
    previousDistance = distance
    previousError = error
  }
  return fallback.clone()
}

type TravelAction = { position: THREE.Vector3; sit: boolean; lie?: boolean; rotationY?: number; instant?: boolean }
type SeatHandler = (position: [number, number, number], rotationY: number, activity?: 'drums' | null) => void
type RestHandler = (position: [number, number, number], rotationY: number) => void
type MoveVector = { x: number; z: number; y?: number }

function UnderwaterClickCatcher({
  onNavigate,
}: {
  onNavigate: (direction: THREE.Vector3, pointerX: number, pointerY: number) => void
}) {
  const { camera, gl, raycaster } = useThree()
  useEffect(() => {
    const canvas = gl.domElement
    const previousTouchAction = canvas.style.touchAction
    canvas.style.touchAction = 'none'
    let active: { id: number; x: number; y: number; cancelled: boolean } | null = null

    const insideCanvas = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      return event.clientX >= rect.left && event.clientX <= rect.right
        && event.clientY >= rect.top && event.clientY <= rect.bottom
    }
    const isUiControl = (target: EventTarget | null) => {
      const element = target as HTMLElement | null
      return Boolean(element?.closest?.('button,a,input,textarea,select,[role="button"],.mpd-mobile-controls,.mpd-underwater-hud'))
    }
    const down = (event: PointerEvent) => {
      if (!insideCanvas(event) || isUiControl(event.target)) return
      if (event.pointerType === 'mouse' && event.button !== 0) return
      if (event.isPrimary === false || active) { active = null; return }
      active = { id: event.pointerId, x: event.clientX, y: event.clientY, cancelled: false }
    }
    const move = (event: PointerEvent) => {
      if (!active || active.id !== event.pointerId) return
      if (Math.hypot(event.clientX - active.x, event.clientY - active.y) > 18) active.cancelled = true
    }
    const up = (event: PointerEvent) => {
      if (!active || active.id !== event.pointerId) return
      const tap = active
      active = null
      if (tap.cancelled || !insideCanvas(event)) return
      const rect = canvas.getBoundingClientRect()
      if (rect.width < 2 || rect.height < 2) return
      const pointerX = ((event.clientX - rect.left) / rect.width) * 2 - 1
      const pointerY = -(((event.clientY - rect.top) / rect.height) * 2 - 1)
      const ndc = new THREE.Vector2(THREE.MathUtils.clamp(pointerX, -1, 1), THREE.MathUtils.clamp(pointerY, -1, 1))
      raycaster.setFromCamera(ndc, camera)
      onNavigate(raycaster.ray.direction.clone(), pointerX, pointerY)
    }
    const cancel = (event: PointerEvent) => { if (active?.id === event.pointerId) active = null }

    // Window capture works with mouse, pen and mobile touch even when R3F's
    // OrbitControls captures the pointer. A tap moves; a drag/pinch stays camera control.
    window.addEventListener('pointerdown', down, true)
    window.addEventListener('pointermove', move, true)
    window.addEventListener('pointerup', up, true)
    window.addEventListener('pointercancel', cancel, true)
    return () => {
      window.removeEventListener('pointerdown', down, true)
      window.removeEventListener('pointermove', move, true)
      window.removeEventListener('pointerup', up, true)
      window.removeEventListener('pointercancel', cancel, true)
      canvas.style.touchAction = previousTouchAction
      active = null
    }
  }, [camera, gl, raycaster, onNavigate])
  return null
}

function UnderwaterFovZoom({ enabled, mobile }: { enabled: boolean; mobile: boolean }) {
  const { camera, gl } = useThree()
  useEffect(() => {
    if (!enabled || !(camera as THREE.PerspectiveCamera).isPerspectiveCamera) return
    const perspective = camera as THREE.PerspectiveCamera
    const canvas = gl.domElement
    const baseFov = mobile ? 54 : 52
    perspective.fov = baseFov
    perspective.updateProjectionMatrix()
    const clampFov = () => {
      perspective.fov = THREE.MathUtils.clamp(perspective.fov, 34, 72)
      perspective.updateProjectionMatrix()
    }
    const wheel = (event: WheelEvent) => {
      event.preventDefault()
      perspective.fov = THREE.MathUtils.clamp(perspective.fov + event.deltaY * 0.018, 34, 72)
      perspective.updateProjectionMatrix()
    }
    const pointers = new Map<number, { x: number; y: number }>()
    let lastPinchDistance = 0
    const distance = () => {
      const points = Array.from(pointers.values())
      return points.length < 2 ? 0 : Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y)
    }
    const down = (event: PointerEvent) => {
      if (!canvas.contains(event.target as Node)) return
      if (event.pointerType !== 'touch') return
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
      if (pointers.size === 2) lastPinchDistance = distance()
    }
    const move = (event: PointerEvent) => {
      if (!pointers.has(event.pointerId)) return
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
      if (pointers.size !== 2) return
      const nextDistance = distance()
      if (lastPinchDistance > 0 && nextDistance > 0) {
        // Fingers spreading apart decreases FOV (zoom in); closing increases it.
        perspective.fov = THREE.MathUtils.clamp(perspective.fov - (nextDistance - lastPinchDistance) * 0.045, 34, 72)
        perspective.updateProjectionMatrix()
      }
      lastPinchDistance = nextDistance
    }
    const up = (event: PointerEvent) => {
      pointers.delete(event.pointerId)
      lastPinchDistance = pointers.size === 2 ? distance() : 0
    }
    canvas.addEventListener('wheel', wheel, { passive: false })
    window.addEventListener('pointerdown', down, true)
    window.addEventListener('pointermove', move, true)
    window.addEventListener('pointerup', up, true)
    window.addEventListener('pointercancel', up, true)
    clampFov()
    return () => {
      canvas.removeEventListener('wheel', wheel)
      window.removeEventListener('pointerdown', down, true)
      window.removeEventListener('pointermove', move, true)
      window.removeEventListener('pointerup', up, true)
      window.removeEventListener('pointercancel', up, true)
      pointers.clear()
    }
  }, [enabled, mobile, camera, gl])
  return null
}

type UnderwaterControls = { target: THREE.Vector3; update: () => void }

/**
 * Dedicated underwater movement driver.
 * It deliberately owns the diver's movement while submerged instead of relying
 * on Avatar's land path-following state. This keeps keyboard, pointer, joystick,
 * vertical buttons and click destinations on one deterministic update path.
 */
function UnderwaterMovementDriver({
  enabled,
  playerRef,
  inputRef,
  targetRef,
}: {
  enabled: boolean
  playerRef: MutableRefObject<THREE.Group | null>
  inputRef: MutableRefObject<MoveVector>
  targetRef: MutableRefObject<THREE.Vector3 | null>
}) {
  const camera = useThree((state) => state.camera)
  const controls = useThree((state) => state.controls) as UnderwaterControls | null
  const previousPosition = useRef(new THREE.Vector3())
  const initialized = useRef(false)
  const fallbackKeys = useRef(new Set<string>())
  const playerControlsSeen = useRef(false)

  useEffect(() => {
    if (!enabled) {
      fallbackKeys.current.clear()
      playerControlsSeen.current = false
      return
    }
    playerControlsSeen.current = false
    const isTyping = (target: EventTarget | null) => {
      const element = target as HTMLElement | null
      return Boolean(element && (element.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName)))
    }
    const publishKeys = () => {
      const keys = fallbackKeys.current
      const x = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0)
        - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0)
      const z = (keys.has('KeyS') ? 1 : 0) - (keys.has('KeyW') ? 1 : 0)
      const y = (keys.has('Space') || keys.has('ArrowUp') ? 1 : 0)
        - (keys.has('ShiftLeft') || keys.has('ShiftRight') || keys.has('ArrowDown') ? 1 : 0)
      inputRef.current = { x, z, y }
    }
    const down = (event: KeyboardEvent) => {
      if (isTyping(event.target) || document.body.dataset.mpdPianoOpen === 'true') return
      if (!['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'ShiftRight'].includes(event.code)) return
      event.preventDefault()
      fallbackKeys.current.add(event.code)
      // PlayerControls normally publishes a combined keyboard/joystick vector.
      // This native fallback only takes over when that event path has not fired.
      if (!playerControlsSeen.current) publishKeys()
    }
    const up = (event: KeyboardEvent) => {
      if (!fallbackKeys.current.has(event.code)) return
      fallbackKeys.current.delete(event.code)
      if (!playerControlsSeen.current) publishKeys()
    }
    const blur = () => {
      fallbackKeys.current.clear()
      inputRef.current = { x: 0, z: 0, y: 0 }
    }
    const customInput = (event: Event) => {
      const detail = (event as CustomEvent<MoveVector>).detail
      if (!detail) return
      playerControlsSeen.current = true
      inputRef.current = {
        x: THREE.MathUtils.clamp(Number(detail.x) || 0, -1, 1),
        z: THREE.MathUtils.clamp(Number(detail.z) || 0, -1, 1),
        y: THREE.MathUtils.clamp(Number(detail.y) || 0, -1, 1),
      }
    }
    window.addEventListener('keydown', down, { passive: false })
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    window.addEventListener('mpd-underwater-input', customInput)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
      window.removeEventListener('mpd-underwater-input', customInput)
      fallbackKeys.current.clear()
    }
  }, [enabled, inputRef])

  useEffect(() => {
    initialized.current = false
    if (enabled && playerRef.current) {
      previousPosition.current.copy(playerRef.current.position)
      initialized.current = true
    }
  }, [enabled, playerRef])

  useFrame((_, rawDelta) => {
    if (!enabled) return
    const diver = playerRef.current
    if (!diver) return

    if (!initialized.current) {
      previousPosition.current.copy(diver.position)
      initialized.current = true
    }

    const dt = Math.min(Math.max(rawDelta, 0), 0.05)
    const input = inputRef.current
    const horizontalInput = Math.hypot(input.x, input.z)
    const verticalInput = THREE.MathUtils.clamp(input.y ?? 0, -1, 1)
    const hasManualInput = horizontalInput > 0.018 || Math.abs(verticalInput) > 0.018

    if (hasManualInput) {
      // Manual steering takes priority over any queued click destination.
      targetRef.current = null

      if (horizontalInput > 0.018) {
        const forward = new THREE.Vector3()
        camera.getWorldDirection(forward)
        forward.y = 0
        if (forward.lengthSq() < 0.0001) {
          forward.set(Math.sin(diver.rotation.y), 0, Math.cos(diver.rotation.y))
        }
        forward.normalize()
        const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), forward).normalize()
        const direction = right.multiplyScalar(input.x).addScaledVector(forward, -input.z)
        if (direction.lengthSq() > 0.0001) {
          direction.normalize()
          diver.position.addScaledVector(direction, 52 * dt)
          const desired = Math.atan2(direction.x, direction.z)
          let difference = desired - diver.rotation.y
          difference = Math.atan2(Math.sin(difference), Math.cos(difference))
          diver.rotation.y += difference * Math.min(1, dt * 8.5)
        }
      }

      if (Math.abs(verticalInput) > 0.018) {
        const verticalSpeed = verticalInput > 0 ? 30 : 36
        diver.position.y += verticalInput * verticalSpeed * dt
      }
    } else {
      const destination = targetRef.current
      if (destination) {
        const deltaToTarget = destination.clone().sub(diver.position)
        const distance = deltaToTarget.length()
        if (distance > 0.8) {
          const horizontalDistance = Math.hypot(deltaToTarget.x, deltaToTarget.z)
          if (horizontalDistance > 0.02) {
            const desired = Math.atan2(deltaToTarget.x, deltaToTarget.z)
            let difference = desired - diver.rotation.y
            difference = Math.atan2(Math.sin(difference), Math.cos(difference))
            diver.rotation.y += difference * Math.min(1, dt * 8.5)
          }
          diver.position.addScaledVector(deltaToTarget, Math.min(1, (128 * dt) / distance))
        } else {
          diver.position.copy(destination)
          targetRef.current = null
        }
      }
    }

    // Large open-water bounds: 100km square with a true vertical dive volume.
    diver.position.x = THREE.MathUtils.clamp(diver.position.x, UNDERWATER_MIN_X, UNDERWATER_MAX_X)
    diver.position.z = THREE.MathUtils.clamp(diver.position.z, UNDERWATER_MIN_Z, UNDERWATER_MAX_Z)
    diver.position.y = THREE.MathUtils.clamp(diver.position.y, UNDERWATER_MIN_Y, UNDERWATER_SURFACE_Y - 0.025)

    // Follow exactly the same world-space displacement as the diver, so the
    // avatar remains third-person sized while the full panorama zooms with it.
    const cameraDelta = diver.position.clone().sub(previousPosition.current)
    if (cameraDelta.lengthSq() > 1e-10) {
      camera.position.add(cameraDelta)
      if (controls) {
        controls.target.add(cameraDelta)
        controls.update()
      } else {
        camera.lookAt(diver.position.x, diver.position.y + 1.18, diver.position.z)
      }
    }
    previousPosition.current.copy(diver.position)
  })

  return null
}

function AdaptiveFrameGuard({ tier, onSlowFrame }: { tier: GraphicsTier; onSlowFrame: () => void }) {
  const sample = useRef({ elapsed: 0, frames: 0, lastDowngrade: 0 })
  useFrame((_, delta) => {
    sample.current.elapsed += Math.min(delta, 0.1)
    sample.current.frames += 1
    if (sample.current.elapsed < 4) return
    const fps = sample.current.frames / sample.current.elapsed
    const now = performance.now()
    const target = tier === 'high' ? 48 : tier === 'balanced' ? 34 : 28
    if (fps < target && now - sample.current.lastDowngrade > 10000) {
      sample.current.lastDowngrade = now
      onSlowFrame()
    }
    sample.current.elapsed = 0
    sample.current.frames = 0
  })
  return null
}


export function StudioScene({
  entries,
  resetKey,
  players,
  userName,
  onLocalPosition,
  onSelectPlayer,
}: {
  entries: GuestEntry[]
  resetKey: number
  players: StudioPlayer[]
  userName: string
  onLocalPosition: (position: [number, number, number], rotationY: number) => void
  onSelectPlayer: (target: { userId: string; name: string }) => void
}) {
  const [travel, setTravel] = useState<TravelAction | null>(null)
  const [underwater, setUnderwater] = useState(false)
  const [workoutMode, setWorkoutMode] = useState<FitnessKind | null>(null)
  const [seatActivity, setSeatActivity] = useState<'drums' | null>(null)
  const workoutModeRef = useRef<FitnessKind | null>(null)
  const underwaterRef = useRef(false)
  const localPositionRef = useRef(new THREE.Vector3(0, 0, 4.2))
  const localRotationRef = useRef(0)
  const pendingPoolEntry = useRef<{ x: number; z: number } | null>(null)
  const avatarRootRef = useRef<THREE.Group | null>(null)
  const underwaterTargetRef = useRef<THREE.Vector3 | null>(null)
  // High-frequency input is read directly by UnderwaterMovementDriver without React re-renders.
  const moveVectorRef = useRef<MoveVector>({ x: 0, z: 0, y: 0 })
  const [graphicsTier, setGraphicsTier] = useState<GraphicsTier | null>(null)
  const [adaptiveDpr, setAdaptiveDpr] = useState(0.9)
  const graphics = GRAPHICS_PRESETS[graphicsTier ?? 'mobile']
  const target = travel?.position ?? null

  underwaterRef.current = underwater

  const handleLocalPosition = useCallback((position: [number, number, number], rotationY: number) => {
    localPositionRef.current.set(position[0], position[1], position[2])
    localRotationRef.current = rotationY
    // Only the actual PoolWater mesh may initiate a dive. Walking or clicking on
    // the surrounding deck remains ordinary ground navigation, so the pool's
    // broad visual bounds cannot pull a nearby destination underwater.
    if (underwaterRef.current && position[1] >= UNDERWATER_SURFACE_Y - 0.02) {
      // Exit only at the actual waterline. The previous 0.10m threshold ended a
      // dive too early and made the ascent control feel as if it stopped working.
      window.dispatchEvent(new Event('mpd-stop-fitness-machines'))
      underwaterRef.current = false
      underwaterTargetRef.current = null
      moveVectorRef.current = { x: 0, z: 0, y: 0 }
      setUnderwater(false)
      setTravel({
        position: new THREE.Vector3(THREE.MathUtils.clamp(position[0], -42.0, -26.0), 0.03, 9.0),
        sit: false,
        instant: true,
      })
    }
    onLocalPosition(position, rotationY)
  }, [onLocalPosition])

  const handleMoveVector = useCallback((value: MoveVector) => {
    moveVectorRef.current = { x: value.x, z: value.z, y: value.y ?? 0 }
    // The dedicated underwater driver reads this ref every frame. Manual input
    // cancels both underwater click targets and land routes immediately.
    if (Math.hypot(value.x, value.z) > 0.018 || Math.abs(value.y ?? 0) > 0.018) {
      underwaterTargetRef.current = null
      pendingPoolEntry.current = null
      window.dispatchEvent(new Event('mpd-stop-fitness-machines'))
      setSeatActivity(null)
      setTravel(null)
    }
  }, [])

  const handleAvatarArrive = useCallback(() => {
    const poolTarget = pendingPoolEntry.current
    if (poolTarget) {
      pendingPoolEntry.current = null
      window.dispatchEvent(new Event('mpd-stop-fitness-machines'))
      underwaterRef.current = true
      underwaterTargetRef.current = null
      moveVectorRef.current = { x: 0, z: 0, y: 0 }
      // Seed the world/camera anchor before the underwater scene mounts. This
      // prevents its first frame from anchoring at the old outdoor spawn point.
      localPositionRef.current.set(poolTarget.x, -3.0, poolTarget.z)
      setUnderwater(true)
      setTravel({ position: new THREE.Vector3(poolTarget.x, -3.0, poolTarget.z), sit: false, instant: true })
      return
    }
    const selectedWorkout = workoutModeRef.current
    if (selectedWorkout) {
      window.dispatchEvent(new CustomEvent('mpd-fitness-arrived', { detail: { kind: selectedWorkout } }))
    }
    setTravel(null)
  }, [])


  const riseToSurface = useCallback(() => {
    pendingPoolEntry.current = null
    underwaterTargetRef.current = null
    moveVectorRef.current = { x: 0, z: 0, y: 0 }
    underwaterRef.current = false
    setUnderwater(false)
    const exit = new THREE.Vector3(-34, 0.03, 9.0)
    setTravel({ position: exit, sit: false, instant: true })
  }, [])

  // 시간대 자동 연동 (오후 6시 ~ 오전 6시 야간 모드 적용)
  const [isNight, setIsNight] = useState(false)
  useEffect(() => {
    const checkHour = () => {
      const hour = new Date().getHours()
      setIsNight(hour < 6 || hour >= 18)
    }
    checkHour()
    const timer = setInterval(checkHour, 60000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    const onNavigationBlocked = () => {
      setTravel(null)
      pendingPoolEntry.current = null
      window.dispatchEvent(new Event('mpd-stop-fitness-machines'))
    }
    window.addEventListener('mpd-navigation-blocked', onNavigationBlocked)
    return () => window.removeEventListener('mpd-navigation-blocked', onNavigationBlocked)
  }, [])

  useEffect(() => {
    const stopWorkout = () => {
      workoutModeRef.current = null
      setWorkoutMode(null)
    }
    const startWorkout = (event: Event) => {
      const detail = (event as CustomEvent<{ kind?: FitnessKind }>).detail
      const kind = detail?.kind ?? null
      workoutModeRef.current = kind
      setWorkoutMode(kind)
    }
    window.addEventListener('mpd-stop-fitness-machines', stopWorkout)
    window.addEventListener('mpd-start-fitness', startWorkout)
    return () => {
      window.removeEventListener('mpd-stop-fitness-machines', stopWorkout)
      window.removeEventListener('mpd-start-fitness', startWorkout)
    }
  }, [])

  // Detect phones/tablets and lower rendering cost before the scene becomes interactive.
  useEffect(() => {
    const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean; effectiveType?: string } }
    const coarsePointer = window.matchMedia('(pointer: coarse)').matches
    const narrowViewport = window.innerWidth < 820
    const mobileUA = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
    // Unknown device specs are treated conservatively instead of assuming a gaming PC.
    const memory = nav.deviceMemory ?? 4
    const cores = navigator.hardwareConcurrency ?? 4
    const saveData = Boolean(nav.connection?.saveData) || nav.connection?.effectiveType === '2g'
    // Average desktops start balanced. High detail is reserved for machines with
    // clearly stronger memory/CPU headroom, avoiding a slow first visit on laptops.
    const powerfulDesktop = memory >= 12 && cores >= 10
    const tier: GraphicsTier = (coarsePointer || narrowViewport || mobileUA || saveData)
      ? 'mobile'
      : powerfulDesktop ? 'high' : 'balanced'
    setGraphicsTier(tier)
    setAdaptiveDpr(GRAPHICS_PRESETS[tier].dpr)
  }, [])

  const handleSlowFrame = useCallback(() => {
    setGraphicsTier((current) => current === 'high' ? 'balanced' : current === 'balanced' ? 'mobile' : 'mobile')
    setAdaptiveDpr((current) => Math.max(0.72, Number((current - 0.05).toFixed(2))))
  }, [])

  const handleFloorClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    if (e.delta > CLICK_DRAG_TOLERANCE) return
    setSeatActivity(null)
    pendingPoolEntry.current = null
    window.dispatchEvent(new Event('mpd-stop-fitness-machines'))
    underwaterRef.current = false
    setUnderwater(false)
    const margin = 0.6
    setTravel({
      position: new THREE.Vector3(
        THREE.MathUtils.clamp(e.point.x, -ROOM.halfX + margin, ROOM.halfX - margin),
        0,
        THREE.MathUtils.clamp(e.point.z, -ROOM.halfZ + margin, ROOM.halfZ - margin),
      ),
      sit: false,
    })
  }, [])

  const handlePoolClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    if (e.delta > CLICK_DRAG_TOLERANCE) return
    setSeatActivity(null)
    pendingPoolEntry.current = null
    window.dispatchEvent(new Event('mpd-stop-fitness-machines'))
    // The pool is placed in the left garden, preserving the straight-ahead ocean view.
    const x = THREE.MathUtils.clamp(e.point.x, -42.0, -26.0)
    const z = THREE.MathUtils.clamp(e.point.z, 10.0, 18.0)
    const current = localPositionRef.current
    // Walk to the closest dry coping edge before entering the water.
    const edgeCandidates: THREE.Vector3[] = [
      new THREE.Vector3(THREE.MathUtils.clamp(current.x, -42.0, -26.0), 0.02, 9.0),
      new THREE.Vector3(THREE.MathUtils.clamp(current.x, -42.0, -26.0), 0.02, 19.0),
      new THREE.Vector3(-43.5, 0.02, THREE.MathUtils.clamp(current.z, 10.0, 18.0)),
      new THREE.Vector3(-24.5, 0.02, THREE.MathUtils.clamp(current.z, 10.0, 18.0)),
    ]
    const approach = edgeCandidates.reduce((best, candidate) =>
      candidate.distanceToSquared(current) < best.distanceToSquared(current) ? candidate : best,
    )
    pendingPoolEntry.current = { x, z }
    underwaterRef.current = false
    setUnderwater(false)
    setTravel({ position: approach, sit: false })
  }, [])

  const handleUnderwaterTap = useCallback((rayDirection: THREE.Vector3, pointerX: number, pointerY: number) => {
    if (!underwaterRef.current) return
    const current = localPositionRef.current.clone()
    const direction = rayDirection.clone().normalize()
    const horizontal = new THREE.Vector3(direction.x, 0, direction.z)
    if (horizontal.lengthSq() < 0.0025) {
      horizontal.set(Math.sin(localRotationRef.current), 0, Math.cos(localRotationRef.current))
    }
    horizontal.normalize()

    // A single tap sets a reachable 3D waypoint. The driver then swims there
    // smoothly; repeated taps can continue across the full 100km exploration area.
    const distance = THREE.MathUtils.clamp(
      420 + (1 - Math.abs(pointerY)) * 760 + Math.abs(pointerX) * 240,
      280,
      1_500,
    )
    const vertical = THREE.MathUtils.clamp(pointerY * 320 + direction.y * 160, -520, 520)
    const destinationY = THREE.MathUtils.clamp(current.y + vertical, UNDERWATER_MIN_Y, UNDERWATER_SURFACE_Y - 0.025)
    underwaterTargetRef.current = new THREE.Vector3(
      THREE.MathUtils.clamp(current.x + horizontal.x * distance, UNDERWATER_MIN_X, UNDERWATER_MAX_X),
      destinationY,
      THREE.MathUtils.clamp(current.z + horizontal.z * distance, UNDERWATER_MIN_Z, UNDERWATER_MAX_Z),
    )
    moveVectorRef.current = { x: 0, z: 0, y: 0 }
    pendingPoolEntry.current = null
    setSeatActivity(null)
    setTravel(null)
    window.dispatchEvent(new Event('mpd-stop-fitness-machines'))
  }, [])

  const handlePathClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    if (e.delta > CLICK_DRAG_TOLERANCE) return
    setSeatActivity(null)
    window.dispatchEvent(new Event('mpd-stop-fitness-machines'))

    if (underwaterRef.current) {
      // UnderwaterClickCatcher handles canvas taps at window-capture level so
      // OrbitControls pointer capture cannot swallow a click. Avoid duplicate routing.
      return
    }

    // When the real island mesh receives the pointer event, e.point is already
    // the exact world-space hit. Prefer it; the ray/height-field fallback is only
    // needed for the large transparent navigation plane. This prevents a nearby
    // machine, pool edge, or shallow camera ray from producing a wrong destination.
    // Any outdoor ground tap cancels an older pool-water request before a new route starts.
    pendingPoolEntry.current = null
    const eventPointRadius = Math.hypot(e.point.x, e.point.z)
    const hasUsableTerrainHit = Number.isFinite(e.point.x)
      && Number.isFinite(e.point.z)
      && eventPointRadius <= ISLAND_WALK_RADIUS + 0.5
    const groundPoint = hasUsableTerrainHit
      ? new THREE.Vector3(e.point.x, getWorldIslandGroundHeight(e.point.x, e.point.z), e.point.z)
      : intersectIslandSurface(e.ray, e.point)
    let x = groundPoint.x
    let z = groundPoint.z

    const radius = Math.hypot(x, z)
    if (radius > ISLAND_WALK_RADIUS) {
      const scale = (ISLAND_WALK_RADIUS - 0.5) / radius
      x *= scale
      z *= scale
    }

    underwaterRef.current = false
    setUnderwater(false)
    // The pool's travertine deck is raised slightly above the island lawn. Keep
    // that exact deck height rather than projecting it down onto the island field.
    const onPoolDeck = Math.abs(x) <= 9.45 && z >= 11.3 && z <= 22.7
    const groundY = onPoolDeck ? 0.02 : getWorldIslandGroundHeight(x, z)
    setTravel({ position: new THREE.Vector3(x, groundY, z), sit: false })
  }, [])

  const handleSeat: SeatHandler = useCallback((position: [number, number, number], rotationY: number, activity: 'drums' | null = null) => {
    setSeatActivity(activity)
    pendingPoolEntry.current = null
    window.dispatchEvent(new Event('mpd-stop-fitness-machines'))
    underwaterRef.current = false
    setUnderwater(false)
    setTravel({ position: new THREE.Vector3(position[0], position[1], position[2]), sit: true, rotationY })
  }, [])

  const handleRest: RestHandler = useCallback((position: [number, number, number], rotationY: number) => {
    setSeatActivity(null)
    pendingPoolEntry.current = null
    window.dispatchEvent(new Event('mpd-stop-fitness-machines'))
    underwaterRef.current = false
    setUnderwater(false)
    setTravel({ position: new THREE.Vector3(position[0], position[1], position[2]), sit: false, lie: true, rotationY })
  }, [])

  const handleStand: RestHandler = useCallback((position: [number, number, number], rotationY: number) => {
    setSeatActivity(null)
    pendingPoolEntry.current = null
    window.dispatchEvent(new Event('mpd-stop-fitness-machines'))
    underwaterRef.current = false
    setUnderwater(false)
    setTravel({ position: new THREE.Vector3(position[0], position[1], position[2]), sit: false, lie: false, rotationY })
  }, [])

  // Interior objects are visually rotated with the pavilion. Convert their local interaction targets
  // through the same 180-degree transform before asking the world-space avatar to walk there.
  const handleStudioSeat: SeatHandler = useCallback((position, rotationY, activity: 'drums' | null = null) => {
    handleSeat([-position[0], position[1], -position[2]], rotationY + Math.PI, activity)
  }, [handleSeat])
  const handleStudioRest: RestHandler = useCallback((position, rotationY) => {
    handleRest([-position[0], position[1], -position[2]], rotationY + Math.PI)
  }, [handleRest])

  if (graphicsTier === null) {
    return <div className="flex h-full w-full items-center justify-center bg-slate-950 text-sm text-emerald-100">기기 성능에 맞게 스튜디오 그래픽을 설정하고 있습니다…</div>
  }

  return (
    <div className="relative h-full w-full">
      <Canvas
        shadows={!underwater && graphics.shadows}
        dpr={Math.min(graphics.dpr, adaptiveDpr)}
        performance={{ min: 0.45, max: 1, debounce: 180 }}
        gl={{ antialias: graphics.antialias, powerPreference: 'high-performance', precision: 'highp', toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: underwater ? 0.98 : 1.04, stencil: false, preserveDrawingBuffer: false }}
        camera={{ position: [AVATAR_START.x, 3.25, AVATAR_START.z + 9.2], fov: graphicsTier === 'mobile' ? 52 : 50, near: 0.25, far: 26000 }}
        onCreated={({ scene }) => {
          scene.background = new THREE.Color(underwater ? '#075a79' : isNight ? '#12253d' : '#84bde7')
        }}
        onPointerMissed={() => { document.body.style.cursor = 'auto' }}
      >
        <fog attach="fog" args={underwater
          ? ['#07506a', 2600, 18000]
          : [isNight ? '#0b1329' : '#d8edf5', 420, 1250]}
        />

        {!underwater && <>
          <ambientLight intensity={isNight ? 0.42 : 0.62} color={isNight ? '#405474' : '#f4f8ff'} />
          <hemisphereLight args={[isNight ? '#152a4c' : '#bfe0ff', isNight ? '#252a32' : '#49613c', isNight ? 0.58 : 1.05]} />
          <directionalLight
            position={SUN_POSITION}
            intensity={isNight ? 0.5 : 2.45}
            color={isNight ? '#7799bb' : '#fff0d9'}
            castShadow={graphicsTier === 'high'}
            shadow-mapSize={[graphicsTier === 'high' ? 2048 : 512, graphicsTier === 'high' ? 2048 : 512]}
            shadow-camera-left={-16}
            shadow-camera-right={16}
            shadow-camera-top={16}
            shadow-camera-bottom={-16}
            shadow-camera-near={1}
            shadow-camera-far={300}
            shadow-bias={-0.00035}
            shadow-normalBias={0.025}
          />
          {INTERIOR_LIGHTS.slice(0, graphicsTier === 'mobile' ? 2 : INTERIOR_LIGHTS.length).map((p, i) => (
            <pointLight key={i} position={p} intensity={graphicsTier === 'mobile' ? 5 : isNight ? 18 : 14} distance={13} decay={2} color={isNight ? '#ffcc88' : '#ffdcb0'} />
          ))}
        </>}

        {!underwater && graphics.environment && (
          <Suspense fallback={null}>
            <Environment preset={isNight ? 'night' : 'park'} environmentIntensity={isNight ? 0.25 : 0.42} />
          </Suspense>
        )}
        <AdaptiveFrameGuard tier={graphicsTier} onSlowFrame={handleSlowFrame} />

        {underwater ? (
          <>
            <UnderwaterWorld quality={graphicsTier} playerPositionRef={localPositionRef} />
            <UnderwaterMovementDriver
              enabled={underwater}
              playerRef={avatarRootRef}
              inputRef={moveVectorRef}
              targetRef={underwaterTargetRef}
            />
            <UnderwaterClickCatcher onNavigate={handleUnderwaterTap} />
            <UnderwaterFovZoom enabled={underwater} mobile={graphicsTier === 'mobile'} />
          </>
        ) : (
          <>
            <Suspense fallback={null}><Outdoor onPathClick={handlePathClick} onPoolClick={handlePoolClick} onSeat={handleSeat} onRest={handleRest} onStand={handleStand} quality={graphicsTier} /></Suspense>
            {/* Rotate the complete pavilion 180 degrees so its ocean glass wall faces the existing front bay. */}
            <group rotation-y={Math.PI}>
              <Room onFloorClick={handleFloorClick} quality={graphicsTier} />
              <Suspense fallback={null}><ControlRoom onSit={handleStudioSeat} /></Suspense>
              <Suspense fallback={null}><Instruments onSeat={handleStudioSeat} /></Suspense>
              <Suspense fallback={null}><StudioFurniture onSeat={handleStudioSeat} onRest={handleStudioRest} /></Suspense>
              <CandleBench entries={entries} />
            </group>
          </>
        )}

        {!underwater && (
          <mesh position={[0, -0.04, 0]} rotation-x={-Math.PI / 2} onClick={handlePathClick}>
            <planeGeometry args={[190, 190]} />
            <meshBasicMaterial color="#ffffff" transparent opacity={0} colorWrite={false} depthWrite={false} side={THREE.DoubleSide} />
          </mesh>
        )}

        <Avatar
          target={target}
          sitOnArrival={travel?.sit ?? false}
          lieOnArrival={travel?.lie ?? false}
          seatRotation={travel?.rotationY}
          seatActivity={seatActivity}
          instantTravel={travel?.instant ?? false}
          underwaterMode={underwater}
          workoutMode={workoutMode}
          moveVectorRef={moveVectorRef}
          avatarRootRef={avatarRootRef}
          onArrive={handleAvatarArrive}
          onMove={handleLocalPosition}
          displayName={userName || '접속 중'}
          resetKey={resetKey}
        />
        {players
          .filter((player) => !underwater || (player.position[0] >= UNDERWATER_MIN_X && player.position[0] <= UNDERWATER_MAX_X && player.position[2] >= UNDERWATER_MIN_Z && player.position[2] <= UNDERWATER_MAX_Z))
          .map((player) => <RemoteAvatar key={player.userId} player={player} onSelect={onSelectPlayer} />)}
        <TargetMarker target={target} underwater={underwater} />

        <OrbitControls
          makeDefault
          enablePan={false}
          enableDamping
          dampingFactor={0.08}
          rotateSpeed={graphicsTier === 'mobile' ? 0.64 : 0.74}
          enableZoom={!underwater}
          zoomSpeed={1.12}
          minDistance={graphicsTier === 'mobile' ? 4.0 : 3.8}
          maxDistance={graphicsTier === 'mobile' ? 52 : 56}
          // Outdoors: keep the camera close to the horizon so looking upward
          // cannot pass through the ground. Underwater remains a free 3D orbit.
          minPolarAngle={underwater ? 0.16 : 1.28}
          maxPolarAngle={underwater ? Math.PI - 0.16 : Math.PI / 2}
          target={DEFAULT_ORBIT_TARGET}
        />
      </Canvas>

      <PlayerControls onMove={handleMoveVector} underwater={underwater} />
      {underwater && (
        <div className="mpd-underwater-hud">
          <div className="mpd-underwater-title"><span className="mpd-underwater-live-dot" /> SCUBA EXPLORATION</div>
          <div className="mpd-underwater-subtitle">수평 100km × 100km · 최대 수심 8,000m · 360° 산호초 탐험</div>
          <button type="button" onClick={riseToSurface} className="mpd-surface-button">↑ 수면으로 올라와 스튜디오로 돌아가기</button>
        </div>
      )}
    </div>
  )
}
