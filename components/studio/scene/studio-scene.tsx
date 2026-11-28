'use client'

import { Environment, OrbitControls } from '@react-three/drei'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
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
  // Shared input ref: PlayerControls writes once; Avatar owns the underwater motion loop.
  const moveVectorRef = useRef<MoveVector>({ x: 0, z: 0, y: 0 })
  const [graphicsTier, setGraphicsTier] = useState<GraphicsTier | null>(null)
  const [adaptiveDpr, setAdaptiveDpr] = useState(0.9)
  const graphics = GRAPHICS_PRESETS[graphicsTier ?? 'mobile']
  const target = travel?.position ?? null

  underwaterRef.current = underwater

  const handleLocalPosition = useCallback((position: [number, number, number], rotationY: number) => {
    localPositionRef.current.set(position[0], position[1], position[2])
    localRotationRef.current = rotationY
    // Reaching the shallow-water ceiling no longer silently exits the dive.
    // The diver can swim freely just below the surface; only the explicit
    // 'return to studio' action leaves underwater mode.
    onLocalPosition(position, rotationY)
  }, [onLocalPosition])

  const handleMoveVector = useCallback((value: MoveVector) => {
    // The ref is the single low-latency input channel shared by PlayerControls and Avatar.
    moveVectorRef.current = { x: value.x, z: value.z, y: value.y ?? 0 }
    if (Math.hypot(value.x, value.z) > 0.018 || Math.abs(value.y ?? 0) > 0.018) {
      pendingPoolEntry.current = null
      // While diving, do not cause a React render for every joystick/keyboard update.
      // Avatar cancels its own 3D click route imperatively in the animation frame.
      if (!underwaterRef.current) {
        window.dispatchEvent(new Event('mpd-stop-fitness-machines'))
        setSeatActivity(null)
        setTravel((current) => current ? null : current)
      }
    }
  }, [])

  // Native capture-phase fallback for underwater controls. This intentionally
  // writes to the same ref as PlayerControls, but does not depend on React's
  // synthetic pointer/keyboard event delivery. It is enabled only while diving.
  useEffect(() => {
    if (!underwater) {
      moveVectorRef.current = { x: 0, z: 0, y: 0 }
      return
    }

    const keys = new Set<string>()
    const stick = { x: 0, z: 0 }
    const pointers = new Map<number, { kind: 'stick' | 'axis'; started: number; moved: boolean; axis: number }>()
    const axisTimers = new Map<number, number>()
    let stickPointerId: number | null = null
    let nudgeTimer: number | null = null

    const publish = () => {
      const keyX = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0)
        - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0)
      const keyZ = (keys.has('KeyS') ? 1 : 0) - (keys.has('KeyW') ? 1 : 0)
      let x = keyX + stick.x
      let z = keyZ + stick.z
      const length = Math.hypot(x, z)
      if (length > 1) { x /= length; z /= length }
      let axisY = 0
      pointers.forEach((pointer) => { if (pointer.kind === 'axis') axisY += pointer.axis })
      const keyY = keys.has('Space') || keys.has('ArrowUp')
        ? 1
        : keys.has('ShiftLeft') || keys.has('ArrowDown') ? -1 : 0
      moveVectorRef.current = { x, z, y: THREE.MathUtils.clamp(axisY || keyY, -1, 1) }
    }

    const isTyping = (target: EventTarget | null) => {
      const element = target as HTMLElement | null
      return Boolean(element && (element.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName)))
    }

    const joystickElement = document.querySelector<HTMLElement>('[data-mpd-joystick="true"]')
    const updateStick = (event: PointerEvent) => {
      const rect = joystickElement?.getBoundingClientRect()
      if (!rect || rect.width < 2 || rect.height < 2) return
      const radius = Math.min(rect.width, rect.height) * 0.34
      let x = (event.clientX - (rect.left + rect.width / 2)) / radius
      let y = (event.clientY - (rect.top + rect.height / 2)) / radius
      const length = Math.hypot(x, y)
      if (length > 1) { x /= length; y /= length }
      stick.x = x
      stick.z = y
      const pointer = pointers.get(event.pointerId)
      if (pointer) pointer.moved ||= length > 0.12
      publish()
    }

    const down = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null
      const joystick = target?.closest?.('[data-mpd-joystick="true"]')
      const axisButton = target?.closest?.('[data-mpd-dive-axis]') as HTMLElement | null
      if (!joystick && !axisButton) return
      event.preventDefault()
      if (joystick) {
        if (stickPointerId !== null) return
        stickPointerId = event.pointerId
        pointers.set(event.pointerId, { kind: 'stick', started: performance.now(), moved: false, axis: 0 })
        if (nudgeTimer !== null) { window.clearTimeout(nudgeTimer); nudgeTimer = null }
        updateStick(event)
      } else if (axisButton) {
        if (axisTimers.has(event.pointerId)) {
          window.clearTimeout(axisTimers.get(event.pointerId)!)
          axisTimers.delete(event.pointerId)
        }
        pointers.set(event.pointerId, {
          kind: 'axis', started: performance.now(), moved: false,
          axis: axisButton.dataset.mpdDiveAxis === 'up' ? 1 : -1,
        })
        publish()
      }
    }

    const move = (event: PointerEvent) => {
      if (stickPointerId !== event.pointerId) return
      event.preventDefault()
      updateStick(event)
    }

    const up = (event: PointerEvent) => {
      const pointer = pointers.get(event.pointerId)
      if (!pointer) return
      if (pointer.kind === 'stick') {
        pointers.delete(event.pointerId)
        stickPointerId = null
        const wasTap = !pointer.moved
        stick.x = 0
        stick.z = 0
        publish()
        if (wasTap) {
          // A short nudge on a simple joystick tap; dragging remains continuous.
          stick.z = -0.88
          publish()
          nudgeTimer = window.setTimeout(() => {
            stick.x = 0
            stick.z = 0
            publish()
            nudgeTimer = null
          }, 720)
        }
      } else {
        const delay = Math.max(0, 520 - (performance.now() - pointer.started))
        const timer = window.setTimeout(() => {
          pointers.delete(event.pointerId)
          axisTimers.delete(event.pointerId)
          publish()
        }, delay)
        axisTimers.set(event.pointerId, timer)
        publish()
      }
    }

    const cancel = (event: PointerEvent) => {
      const pointer = pointers.get(event.pointerId)
      if (!pointer) return
      if (pointer.kind === 'stick') {
        pointers.delete(event.pointerId)
        stickPointerId = null
        stick.x = 0
        stick.z = 0
      }
      const timer = axisTimers.get(event.pointerId)
      if (timer !== undefined) window.clearTimeout(timer)
      axisTimers.delete(event.pointerId)
      publish()
    }

    const downKey = (event: KeyboardEvent) => {
      if (isTyping(event.target)) return
      const code = event.code
      const supported = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'ShiftLeft']
      if (!supported.includes(code)) return
      event.preventDefault()
      keys.add(code)
      publish()
    }
    const upKey = (event: KeyboardEvent) => {
      keys.delete(event.code)
      publish()
    }
    const blur = () => {
      keys.clear()
      stick.x = 0
      stick.z = 0
      pointers.clear()
      stickPointerId = null
      axisTimers.forEach((timer) => window.clearTimeout(timer))
      axisTimers.clear()
      if (nudgeTimer !== null) window.clearTimeout(nudgeTimer)
      nudgeTimer = null
      publish()
    }

    window.addEventListener('pointerdown', down, true)
    window.addEventListener('pointermove', move, true)
    window.addEventListener('pointerup', up, true)
    window.addEventListener('pointercancel', cancel, true)
    window.addEventListener('keydown', downKey, true)
    window.addEventListener('keyup', upKey, true)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('pointerdown', down, true)
      window.removeEventListener('pointermove', move, true)
      window.removeEventListener('pointerup', up, true)
      window.removeEventListener('pointercancel', cancel, true)
      window.removeEventListener('keydown', downKey, true)
      window.removeEventListener('keyup', upKey, true)
      window.removeEventListener('blur', blur)
      axisTimers.forEach((timer) => window.clearTimeout(timer))
      if (nudgeTimer !== null) window.clearTimeout(nudgeTimer)
      moveVectorRef.current = { x: 0, z: 0, y: 0 }
    }
  }, [underwater])

  const handleAvatarArrive = useCallback(() => {
    const poolTarget = pendingPoolEntry.current
    if (poolTarget) {
      pendingPoolEntry.current = null
      window.dispatchEvent(new Event('mpd-stop-fitness-machines'))
      underwaterRef.current = true
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
    // Pointer location determines a 3D destination, so tapping higher/lower
    // on the water view changes depth while centre taps swim straight ahead.
    const travelDistance = THREE.MathUtils.clamp(
      260 + (1 - Math.abs(pointerY)) * 360 + Math.abs(pointerX) * 140,
      220,
      760,
    )
    const destination = current.addScaledVector(direction, travelDistance)
    destination.x = THREE.MathUtils.clamp(destination.x, UNDERWATER_MIN_X, UNDERWATER_MAX_X)
    destination.z = THREE.MathUtils.clamp(destination.z, UNDERWATER_MIN_Z, UNDERWATER_MAX_Z)
    destination.y = THREE.MathUtils.clamp(
      destination.y,
      UNDERWATER_MIN_Y + 2,
      UNDERWATER_SURFACE_Y - 0.12,
    )
    moveVectorRef.current = { x: 0, z: 0, y: 0 }
    pendingPoolEntry.current = null
    setSeatActivity(null)
    window.dispatchEvent(new Event('mpd-stop-fitness-machines'))
    // Avatar's single movement loop consumes this target. This removes the old
    // second driver/ref path that could disagree with Avatar and camera state.
    setTravel({ position: destination, sit: false })
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
            <UnderwaterClickCatcher onNavigate={handleUnderwaterTap} />
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
          enableZoom
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
