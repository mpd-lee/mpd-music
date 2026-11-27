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

function UnderwaterPointerNavigator({ enabled, onNavigate }: {
  enabled: boolean
  onNavigate: (ray: THREE.Ray, ndcX: number, ndcY: number) => void
}) {
  const { gl, camera } = useThree()
  const callback = useRef(onNavigate)
  useEffect(() => { callback.current = onNavigate }, [onNavigate])
  useEffect(() => {
    if (!enabled) return
    const element = gl.domElement
    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    let activeId: number | null = null
    let startX = 0
    let startY = 0
    let multiTouch = false
    const onDown = (event: PointerEvent) => {
      if (event.target !== element) return
      if (event.pointerType === 'mouse' && event.button !== 0) return
      if (activeId !== null) { multiTouch = true; activeId = null; return }
      activeId = event.pointerId
      multiTouch = false
      startX = event.clientX
      startY = event.clientY
    }
    const onUp = (event: PointerEvent) => {
      if (event.pointerId !== activeId) return
      const dx = event.clientX - startX
      const dy = event.clientY - startY
      const tapTolerance = event.pointerType === 'touch' ? 400 : 100
      const isTap = !multiTouch && (dx * dx + dy * dy) <= tapTolerance
      activeId = null
      if (!isTap) return
      const rect = element.getBoundingClientRect()
      if (!rect.width || !rect.height) return
      const ndcX = ((event.clientX - rect.left) / rect.width) * 2 - 1
      const ndcY = 1 - ((event.clientY - rect.top) / rect.height) * 2
      pointer.set(ndcX, ndcY)
      raycaster.setFromCamera(pointer, camera)
      callback.current(raycaster.ray.clone(), ndcX, ndcY)
    }
    const onCancel = () => { activeId = null; multiTouch = false }
    element.addEventListener('pointerdown', onDown, true)
    // Capture pointer-up globally: some mobile browsers release outside the canvas.
    window.addEventListener('pointerup', onUp, true)
    window.addEventListener('pointercancel', onCancel, true)
    return () => {
      element.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('pointerup', onUp, true)
      window.removeEventListener('pointercancel', onCancel, true)
    }
  }, [enabled, gl, camera])
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
  const pendingPoolEntry = useRef<{ x: number; z: number } | null>(null)
  // High-frequency joystick input is kept in a ref so every finger movement does not re-render the whole 3D scene.
  const moveVectorRef = useRef<MoveVector>({ x: 0, z: 0, y: 0 })
  const [graphicsTier, setGraphicsTier] = useState<GraphicsTier | null>(null)
  const [adaptiveDpr, setAdaptiveDpr] = useState(0.9)
  const graphics = GRAPHICS_PRESETS[graphicsTier ?? 'mobile']
  const target = travel?.position ?? null

  const handleLocalPosition = useCallback((position: [number, number, number], rotationY: number) => {
    localPositionRef.current.set(position[0], position[1], position[2])
    // Only the actual PoolWater mesh may initiate a dive. Walking or clicking on
    // the surrounding deck remains ordinary ground navigation, so the pool's
    // broad visual bounds cannot pull a nearby destination underwater.
    if (underwaterRef.current && position[1] >= UNDERWATER_SURFACE_Y - 0.035) {
      // Exit only at the actual waterline. The previous 0.10m threshold ended a
      // dive too early and made the ascent control feel as if it stopped working.
      window.dispatchEvent(new Event('mpd-stop-fitness-machines'))
      underwaterRef.current = false
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
    // Manual steering immediately cancels an active click-to-walk route.
    if (Math.hypot(value.x, value.z) > 0.04 || Math.abs(value.y ?? 0) > 0.04) {
      // A manual movement cancels a pending pool entry so an old water tap cannot
      // teleport the visitor into the pool after they have steered somewhere else.
      pendingPoolEntry.current = null
      window.dispatchEvent(new Event('mpd-stop-fitness-machines'))
      setSeatActivity(null)
      setTravel((current) => current ? null : current)
    }
  }, [])

  const handleAvatarArrive = useCallback(() => {
    const poolTarget = pendingPoolEntry.current
    if (poolTarget) {
      pendingPoolEntry.current = null
      window.dispatchEvent(new Event('mpd-stop-fitness-machines'))
      underwaterRef.current = true
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

  useEffect(() => {
    document.body.dataset.mpdUnderwater = underwater ? 'true' : 'false'
    return () => { delete document.body.dataset.mpdUnderwater }
  }, [underwater])

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

  const handleDiveNavigate = useCallback((ray: THREE.Ray, ndcX: number, ndcY: number) => {
    if (!underwaterRef.current) return
    const current = localPositionRef.current
    const horizontal = ray.direction.clone()
    horizontal.y = 0
    if (horizontal.lengthSq() < 0.006) horizontal.set(0, 0, -1)
    horizontal.normalize()
    // Each tap travels a useful distance; repeated taps can cover the entire 8 km volume.
    const distance = THREE.MathUtils.clamp(230 + (1 - Math.abs(ndcY)) * 170 + Math.abs(ndcX) * 70, 220, 410)
    const x = THREE.MathUtils.clamp(current.x + horizontal.x * distance, UNDERWATER_MIN_X, UNDERWATER_MAX_X)
    const z = THREE.MathUtils.clamp(current.z + horizontal.z * distance, UNDERWATER_MIN_Z, UNDERWATER_MAX_Z)
    // Screen top means ascending; screen bottom means deeper. Keep tap navigation submerged.
    const y = THREE.MathUtils.clamp(current.y + ndcY * 115, UNDERWATER_MIN_Y, UNDERWATER_SURFACE_Y - 0.65)
    pendingPoolEntry.current = null
    window.dispatchEvent(new Event('mpd-stop-fitness-machines'))
    setSeatActivity(null)
    setTravel({ position: new THREE.Vector3(x, y, z), sit: false })
  }, [])

  const handlePathClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    if (e.delta > CLICK_DRAG_TOLERANCE) return
    setSeatActivity(null)
    window.dispatchEvent(new Event('mpd-stop-fitness-machines'))

    if (underwaterRef.current) {
      // Convert the clicked screen position into an explicit 3D swim destination.
      // The previous approach blended vertical intent with a far-away sphere hit;
      // on a perspective camera that often produced almost no depth change.
      // Here the screen's vertical coordinate maps directly to water depth, while
      // the ray's horizontal direction selects the swimming direction. Mouse and
      // touch therefore use the same deterministic 3-axis destination.
      const current = localPositionRef.current
      const pointerY = THREE.MathUtils.clamp(e.pointer.y, -1, 1)
      // Touch/click depth is deliberately bounded: top of the screen means rise,
      // bottom means descend. A single tap must never send the diver hundreds of
      // metres away or create an unreachable route beyond the visible reef.
      const rayVertical = THREE.MathUtils.clamp(e.ray.direction.y, -0.72, 0.72)
      const verticalDelta = THREE.MathUtils.clamp(pointerY * 76.0 + rayVertical * 18.0, -105.0, 105.0)
      const swimY = THREE.MathUtils.clamp(current.y + verticalDelta, UNDERWATER_MIN_Y, UNDERWATER_SURFACE_Y - 0.035)
      const depthPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -swimY)
      const tappedPoint = new THREE.Vector3()
      const planeHit = e.ray.intersectPlane(depthPlane, tappedPoint)
      const horizontalDirection = e.ray.direction.clone()
      horizontalDirection.y = 0
      if (horizontalDirection.lengthSq() < 0.0025) horizontalDirection.set(0, 0, -1)
      horizontalDirection.normalize()
      const fallbackDistance = 84.0 + (1 - Math.abs(pointerY)) * 34.0
      let dx: number
      let dz: number
      if (planeHit && Number.isFinite(tappedPoint.x) && Number.isFinite(tappedPoint.z)) {
        dx = tappedPoint.x - current.x
        dz = tappedPoint.z - current.z
        const horizontalDistance = Math.hypot(dx, dz)
        if (horizontalDistance < 8.0) {
          dx = horizontalDirection.x * fallbackDistance
          dz = horizontalDirection.z * fallbackDistance
        } else if (horizontalDistance > 220.0) {
          const scale = 220.0 / horizontalDistance
          dx *= scale
          dz *= scale
        }
      } else {
        dx = horizontalDirection.x * fallbackDistance
        dz = horizontalDirection.z * fallbackDistance
      }
      let x = current.x + dx
      let z = current.z + dz
      x = THREE.MathUtils.clamp(x, UNDERWATER_MIN_X, UNDERWATER_MAX_X)
      z = THREE.MathUtils.clamp(z, UNDERWATER_MIN_Z, UNDERWATER_MAX_Z)
      setTravel({ position: new THREE.Vector3(x, swimY, z), sit: false })
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
        camera={{ position: [AVATAR_START.x, 3.25, AVATAR_START.z + 9.2], fov: underwater ? (graphicsTier === 'mobile' ? 86 : 78) : graphicsTier === 'mobile' ? 52 : 48, near: 0.25, far: 18000 }}
        onCreated={({ scene }) => {
          scene.background = new THREE.Color(underwater ? '#075a79' : isNight ? '#12253d' : '#84bde7')
        }}
        onPointerMissed={() => { document.body.style.cursor = 'auto' }}
      >
        <fog attach="fog" args={underwater
          ? ['#07506a', 620, 5200]
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
            <UnderwaterPointerNavigator enabled={underwater} onNavigate={handleDiveNavigate} />
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
          minDistance={underwater ? (graphicsTier === 'mobile' ? 5.5 : 5.0) : graphicsTier === 'mobile' ? 4.0 : 3.8}
          maxDistance={underwater ? (graphicsTier === 'mobile' ? 1450 : graphicsTier === 'balanced' ? 1650 : 1800) : graphicsTier === 'mobile' ? 52 : 56}
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
          <div className="mpd-underwater-subtitle">최대 수심 약 900m · 8km 자유 탐험 · 360° 산호초</div>
          <button type="button" onClick={riseToSurface} className="mpd-surface-button">↑ 수면으로 올라와 스튜디오로 돌아가기</button>
        </div>
      )}
    </div>
  )
}
