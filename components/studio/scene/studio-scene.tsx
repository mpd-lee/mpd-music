'use client'

import { Environment, OrbitControls } from '@react-three/drei'
import { Canvas, useFrame, type ThreeEvent } from '@react-three/fiber'
import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { GRAPHICS_PRESETS, type GraphicsTier } from '@/lib/graphics-quality'
import { getIslandGroundHeight, ISLAND_WALK_RADIUS } from '@/lib/island-terrain'
import type { GuestEntry } from '@/lib/use-guestbook'
import type { StudioPlayer } from '@/lib/use-multiplayer'
import { AVATAR_START, Avatar, RemoteAvatar, TargetMarker } from './avatar'
import { CoastalPanorama } from './coastal-panorama'
import type { FitnessKind } from '@/lib/studio-interactions'
import { CandleBench } from './candles'
import { ControlRoom } from './control-room'
import { CLICK_DRAG_TOLERANCE } from './interactive'
import { Instruments } from './instruments'
import { Outdoor, SUN_POSITION } from './outdoor'
import { ROOM, Room } from './room'
import { StudioFurniture } from './studio-furniture'
import { UnderwaterWorld } from './underwater-world'
import { PlayerControls } from '../player-controls'

const DEFAULT_ORBIT_TARGET: [number, number, number] = [AVATAR_START.x, 1.9, 0.8]

const INTERIOR_LIGHTS: [number, number, number][] = [
  [-7.5, 6.8, -3], [0, 7.1, -3], [7.5, 6.8, -3],
  [-7.5, 6.8, 4], [0, 7.1, 4], [7.5, 6.8, 4],
]

type TravelAction = { position: THREE.Vector3; sit: boolean; lie?: boolean; rotationY?: number; instant?: boolean }
type SeatHandler = (position: [number, number, number], rotationY: number) => void
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
    // Walking directly into the pool also enters the underwater realm.
    if (!underwaterRef.current && Math.abs(position[0]) <= 7.85 && position[2] >= 13.0 && position[2] <= 21.0) {
      underwaterRef.current = true
      setUnderwater(true)
      setTravel(null)
    } else if (underwaterRef.current && position[1] > 0.18) {
      // Reaching the surface restores the outdoor scene and normal clothes automatically.
      underwaterRef.current = false
      setUnderwater(false)
      setTravel({
        position: new THREE.Vector3(THREE.MathUtils.clamp(position[0], -7.2, 7.2), 0.03, 11.15),
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
      window.dispatchEvent(new Event('mpd-stop-fitness-machines'))
      setTravel((current) => current ? null : current)
    }
  }, [])

  const handleAvatarArrive = useCallback(() => {
    const poolTarget = pendingPoolEntry.current
    if (poolTarget) {
      pendingPoolEntry.current = null
      underwaterRef.current = true
      setUnderwater(true)
      setTravel({ position: new THREE.Vector3(poolTarget.x, -1.9, poolTarget.z), sit: false, instant: true })
      return
    }
    setTravel(null)
  }, [])


  const riseToSurface = useCallback(() => {
    pendingPoolEntry.current = null
    underwaterRef.current = false
    setUnderwater(false)
    const exit = new THREE.Vector3(0, 0.03, 11.15)
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
    const stopWorkout = () => setWorkoutMode(null)
    const startWorkout = (event: Event) => {
      const detail = (event as CustomEvent<{ kind?: FitnessKind }>).detail
      setWorkoutMode(detail?.kind ?? null)
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
    setAdaptiveDpr(Math.max(0.82, GRAPHICS_PRESETS[tier].dpr))
  }, [])

  const handleSlowFrame = useCallback(() => {
    setGraphicsTier((current) => current === 'high' ? 'balanced' : current === 'balanced' ? 'mobile' : 'mobile')
    setAdaptiveDpr((current) => Math.max(0.72, Number((current - 0.06).toFixed(2))))
  }, [])

  const handleFloorClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    if (e.delta > CLICK_DRAG_TOLERANCE) return
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

  const handlePathClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    if (e.delta > CLICK_DRAG_TOLERANCE) return
    window.dispatchEvent(new Event('mpd-stop-fitness-machines'))

    let x = e.point.x
    let z = e.point.z

    if (underwaterRef.current) {
      // Underwater clicks use the actual camera ray, not the seabed hit point.
      // A transparent spherical pick surface makes the whole view clickable,
      // including the water column above the diver where no floor is visible.
      const rayDirection = e.ray.direction.clone().normalize()
      const horizontal = new THREE.Vector2(rayDirection.x, rayDirection.z)
      if (horizontal.lengthSq() < 0.0001) horizontal.set(0, -1)
      horizontal.normalize()
      const distance = THREE.MathUtils.clamp(11 + Math.abs(e.pointer.x) * 5, 9, 16)
      const current = localPositionRef.current
      x = THREE.MathUtils.clamp(current.x + horizontal.x * distance, -43, 43)
      z = THREE.MathUtils.clamp(current.z + horizontal.y * distance, -27, 61)
      // Three's pointer.y is normalized device-coordinate: top=+1, bottom=-1.
      // This gives true 3D click-to-swim targets rather than a separate guessed button.
      const pointerY = THREE.MathUtils.clamp(e.pointer.y, -1, 1)
      const swimY = THREE.MathUtils.clamp(current.y + pointerY * 4.8, -4.35, 0.42)
      setTravel({ position: new THREE.Vector3(x, swimY, z), sit: false })
      return
    }

    const radius = Math.hypot(x, z)
    if (radius > ISLAND_WALK_RADIUS) {
      const scale = (ISLAND_WALK_RADIUS - 0.5) / radius
      x *= scale
      z *= scale
    }

    // Outdoor is rotated by 180 degrees, so the pool is on world +Z.
    const inPool = Math.abs(x) <= 8.1 && z >= 12.65 && z <= 21.35
    if (inPool) {
      // Do not teleport from the studio: walk to the near pool lip, then the arrival callback performs the dive.
      pendingPoolEntry.current = { x: THREE.MathUtils.clamp(x, -7.25, 7.25), z: THREE.MathUtils.clamp(z, 13.0, 21.0) }
      underwaterRef.current = false
      setUnderwater(false)
      setTravel({ position: new THREE.Vector3(THREE.MathUtils.clamp(x, -7.25, 7.25), 0.02, 12.25), sit: false })
      return
    }

    underwaterRef.current = false
    setUnderwater(false)
    setTravel({ position: new THREE.Vector3(x, getIslandGroundHeight(x, z), z), sit: false })
  }, [])

  const handleSeat: SeatHandler = useCallback((position: [number, number, number], rotationY: number) => {
    window.dispatchEvent(new Event('mpd-stop-fitness-machines'))
    underwaterRef.current = false
    setUnderwater(false)
    setTravel({ position: new THREE.Vector3(position[0], position[1], position[2]), sit: true, rotationY })
  }, [])

  const handleRest: RestHandler = useCallback((position: [number, number, number], rotationY: number) => {
    window.dispatchEvent(new Event('mpd-stop-fitness-machines'))
    underwaterRef.current = false
    setUnderwater(false)
    setTravel({ position: new THREE.Vector3(position[0], position[1], position[2]), sit: false, lie: true, rotationY })
  }, [])

  const handleStand: RestHandler = useCallback((position: [number, number, number], rotationY: number) => {
    window.dispatchEvent(new Event('mpd-stop-fitness-machines'))
    underwaterRef.current = false
    setUnderwater(false)
    setTravel({ position: new THREE.Vector3(position[0], position[1], position[2]), sit: false, lie: false, rotationY })
  }, [])

  if (graphicsTier === null) {
    return <div className="flex h-full w-full items-center justify-center bg-slate-950 text-sm text-emerald-100">기기 성능에 맞게 스튜디오 그래픽을 설정하고 있습니다…</div>
  }

  return (
    <div className="relative h-full w-full">
      <Canvas
        shadows={!underwater && graphics.shadows}
        dpr={Math.min(graphics.dpr, adaptiveDpr)}
        performance={{ min: 0.45, max: 1, debounce: 180 }}
        gl={{ antialias: graphics.antialias, powerPreference: graphicsTier === 'mobile' ? 'low-power' : 'high-performance', precision: graphicsTier === 'mobile' ? 'mediump' : 'highp', toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: underwater ? 1.16 : 1.05, stencil: false, preserveDrawingBuffer: false }}
        camera={{ position: [AVATAR_START.x, 2.75, AVATAR_START.z + 6.5], fov: 56, near: 0.1, far: 1200 }}
        onPointerMissed={() => { document.body.style.cursor = 'auto' }}
      >
        <color attach="background" args={[underwater ? '#075a79' : isNight ? '#12253d' : '#84bde7']} />
        {!underwater && <Suspense fallback={null}><CoastalPanorama quality={graphicsTier} /></Suspense>}
        <fog attach="fog" args={underwater
          ? ['#075a79', 18, 92]
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
          <UnderwaterWorld onPathClick={handlePathClick} quality={graphicsTier} />
        ) : (
          <>
            <Suspense fallback={null}><Outdoor onPathClick={handlePathClick} onSeat={handleSeat} onRest={handleRest} onStand={handleStand} quality={graphicsTier} /></Suspense>
            <Room onFloorClick={handleFloorClick} quality={graphicsTier} />
            <Suspense fallback={null}><ControlRoom onSit={handleSeat} /></Suspense>
            <Suspense fallback={null}><Instruments onSeat={handleSeat} /></Suspense>
            <Suspense fallback={null}><StudioFurniture onSeat={handleSeat} onRest={handleRest} /></Suspense>
            <CandleBench entries={entries} />
          </>
        )}

        {!underwater && (
          <mesh position={[0, -12, 0]} rotation-x={-Math.PI / 2} onClick={handlePathClick}>
            <planeGeometry args={[180, 180]} />
            <meshBasicMaterial color="#ffffff" transparent opacity={0} colorWrite={false} depthWrite={false} side={THREE.DoubleSide} />
          </mesh>
        )}

        <Avatar
          target={target}
          sitOnArrival={travel?.sit ?? false}
          lieOnArrival={travel?.lie ?? false}
          seatRotation={travel?.rotationY}
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
          .filter((player) => !underwater || (player.position[2] >= -30 && player.position[2] <= 64))
          .map((player) => <RemoteAvatar key={player.userId} player={player} onSelect={onSelectPlayer} />)}
        <TargetMarker target={target} underwater={underwater} />

        <OrbitControls
          makeDefault
          enablePan={false}
          enableDamping
          dampingFactor={0.08}
          rotateSpeed={graphicsTier === 'mobile' ? 0.48 : 0.68}
          minDistance={graphicsTier === 'mobile' ? 3.2 : 2.2}
          maxDistance={underwater ? 42 : graphicsTier === 'mobile' ? 68 : 96}
          minPolarAngle={0.68}
          maxPolarAngle={1.58}
          target={DEFAULT_ORBIT_TARGET}
        />
      </Canvas>

      <PlayerControls onMove={handleMoveVector} underwater={underwater} />
      {underwater && (
        <div className="mpd-underwater-hud">
          <div className="mpd-underwater-title"><span className="mpd-underwater-live-dot" /> SCUBA EXPLORATION</div>
          <div className="mpd-underwater-subtitle">산호 정원 · 열대어 무리 · 바다거북 · 만타가오리</div>
          <button type="button" onClick={riseToSurface} className="mpd-surface-button">↑ 수면으로 올라와 스튜디오로 돌아가기</button>
        </div>
      )}
    </div>
  )
}
