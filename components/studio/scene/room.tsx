'use client'

import type { ThreeEvent } from '@react-three/fiber'
import { RoundedBox, useTexture } from '@react-three/drei'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { createWoodFloorTexture } from '@/lib/textures'
import { createLawnTexture, NaturalTree } from './outdoor'

export const ROOM = { halfX: 12, halfZ: 9, height: 8 }
const GLASS_TOP = 7.55
const noRaycast = () => null
const BRONZE = '#2a2520'

type RoofPoint = { x: number; y: number }

function DolbyCeilingSpeaker({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <RoundedBox args={[0.78, 0.24, 0.72]} radius={0.08} smoothness={5} castShadow>
        <meshPhysicalMaterial color="#202326" roughness={0.3} metalness={0.55} clearcoat={0.5} />
      </RoundedBox>
      <mesh position={[0, -0.17, 0]} rotation-x={Math.PI} castShadow>
        <cylinderGeometry args={[0.23, 0.18, 0.22, 40]} />
        <meshPhysicalMaterial color="#0b0c0e" roughness={0.28} metalness={0.5} />
      </mesh>
      <mesh position={[0, -0.295, 0]} rotation-x={Math.PI}>
        <torusGeometry args={[0.13, 0.012, 10, 32]} />
        <meshStandardMaterial color="#bca36f" metalness={0.8} roughness={0.22} />
      </mesh>
    </group>
  )
}

function VaultedCeiling() {
  const halfZ = ROOM.halfZ
  // Five-point roof profile: wide eaves cover the side glass, with a tall central crown.
  // The five vertices form four upward-facing facets rather than a shallow inverted V.
  const roof: RoofPoint[] = [
    { x: -13.25, y: 7.62 },
    { x: -5.25, y: 9.55 },
    { x: 0, y: 10.35 },
    { x: 5.25, y: 9.55 },
    { x: 13.25, y: 7.62 },
  ]
  const depth = halfZ * 2 + 4
  const facets = roof.slice(0, -1).map((a, index) => {
    const b = roof[index + 1]
    const dx = b.x - a.x
    const dy = b.y - a.y
    return {
      key: index,
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
      width: Math.hypot(dx, dy) + 0.12,
      angle: Math.atan2(dy, dx),
    }
  })

  return (
    <group>
      {/* Four thick timber roof facets. The overhang extends beyond both glass walls. */}
      {facets.map((facet) => (
        <group key={`facet-${facet.key}`} position={[facet.x, facet.y, 0]} rotation-z={facet.angle}>
          <mesh raycast={noRaycast} receiveShadow castShadow>
            <boxGeometry args={[facet.width, 0.34, depth]} />
            <meshPhysicalMaterial color="#85512a" roughness={0.62} metalness={0.08} clearcoat={0.12} />
          </mesh>
          <mesh position={[0, -0.18, 0]} raycast={noRaycast}>
            <boxGeometry args={[facet.width - 0.12, 0.035, depth - 0.35]} />
            <meshStandardMaterial color="#a86e39" roughness={0.58} />
          </mesh>
        </group>
      ))}

      {/* Exposed cross rafters make the high polygon ceiling read as real timber construction. */}
      {[-8.7, -4.35, 0, 4.35, 8.7].map((z) => (
        <group key={`rafter-${z}`}>
          {facets.map((facet) => (
            <mesh key={facet.key} position={[facet.x, facet.y - 0.24, z]} rotation-z={facet.angle} raycast={noRaycast} castShadow>
              <boxGeometry args={[facet.width + 0.08, 0.22, 0.34]} />
              <meshStandardMaterial color="#4e2e19" roughness={0.72} />
            </mesh>
          ))}
        </group>
      ))}

      {/* Warm continuous LED strips trace the five roof ridges and edges. */}
      {roof.map((point, index) => (
        <group key={`led-${index}`}>
          <mesh position={[point.x, point.y - 0.25, 0]} raycast={noRaycast}>
            <boxGeometry args={[0.055, 0.035, depth - 0.4]} />
            <meshBasicMaterial color="#ffd18a" toneMapped={false} />
          </mesh>
          <pointLight position={[point.x, point.y - 0.38, 0]} color="#ffbd73" intensity={index === 2 ? 22 : 14} distance={14} decay={2} />
        </group>
      ))}

      {/* Five overhead Atmos-style speakers: one centered and four around the room corners. */}
      <DolbyCeilingSpeaker position={[0, 9.95, -0.8]} />
      <DolbyCeilingSpeaker position={[-7.45, 8.68, -5.45]} />
      <DolbyCeilingSpeaker position={[7.45, 8.68, -5.45]} />
      <DolbyCeilingSpeaker position={[-7.45, 8.68, 5.45]} />
      <DolbyCeilingSpeaker position={[7.45, 8.68, 5.45]} />

      {/* Small recessed warm downlights along the sloped timber panels. */}
      {[-8, -4, 0, 4, 8].map((z) => (
        <group key={`downlight-${z}`}>
          {[-9.8, -2.8, 2.8, 9.8].map((x) => {
            const y = x < -5.25
              ? 7.62 + ((x + 13.25) / 8) * (9.55 - 7.62)
              : x > 5.25
                ? 9.55 - ((x - 5.25) / 8) * (9.55 - 7.62)
                : 9.55 + (1 - Math.abs(x / 5.25)) * 0.8
            return (
              <group key={`${x}-${z}`} position={[x, y - 0.24, z]}>
                <mesh raycast={noRaycast}>
                  <cylinderGeometry args={[0.14, 0.14, 0.035, 24]} />
                  <meshStandardMaterial color="#2c2118" metalness={0.55} roughness={0.35} />
                </mesh>
                <mesh position={[0, -0.025, 0]} raycast={noRaycast}>
                  <circleGeometry args={[0.105, 24]} />
                  <meshBasicMaterial color="#ffe0ad" toneMapped={false} />
                </mesh>
                <pointLight position={[0, -0.08, 0]} color="#ffd59a" intensity={5} distance={6} decay={2} />
              </group>
            )
          })}
        </group>
      ))}
    </group>
  )
}

function EnvironmentBackdrop() {
  const ocean = useTexture('/images/mpd-ocean-resort-backdrop.jpg')
  const grass = useMemo(() => createLawnTexture(), [])
  ocean.colorSpace = THREE.SRGBColorSpace
  ocean.anisotropy = 16
  grass.colorSpace = THREE.SRGBColorSpace
  grass.anisotropy = 16

  return (
    <group>
      {/* A real 3D lawn begins just outside the glass. No close-up forest wallpaper planes. */}
      <mesh position={[0, -0.09, -66]} rotation-x={-Math.PI / 2} raycast={noRaycast} receiveShadow>
        <planeGeometry args={[190, 122]} />
        <meshStandardMaterial map={grass} roughness={0.96} color="#ffffff" />
      </mesh>

      {/* Physical trees frame the view on both sides, leaving the distant sea visible in the middle. */}
      <NaturalTree position={[-10.6, 0, -20]} scale={1.18} seed={301} />
      <NaturalTree position={[10.4, 0, -21]} scale={1.16} seed={307} />
      <NaturalTree position={[-8.1, 0, -37]} scale={0.94} seed={313} />
      <NaturalTree position={[8.4, 0, -39]} scale={0.98} seed={317} />
      <NaturalTree position={[-15.5, 0, -34]} scale={0.9} seed={331} />
      <NaturalTree position={[15.2, 0, -36]} scale={0.92} seed={337} />

      {/* The ocean panorama is pushed far away, beyond the lawn and actual 3D trees. */}
      <mesh position={[0, 12.5, -122]} raycast={noRaycast}>
        <planeGeometry args={[184, 23]} />
        <meshBasicMaterial map={ocean} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}

function OceanGlassWall({ length }: { length: number }) {
  const panes = Math.max(5, Math.round(length / 3))
  const paneW = length / panes

  return (
    <group position={[0, 0, -ROOM.halfZ]}>
      <mesh position={[0, 0.12, 0]} raycast={noRaycast}>
        <boxGeometry args={[length, 0.16, 0.22]} />
        <meshStandardMaterial color="#1d2428" roughness={0.35} metalness={0.75} />
      </mesh>
      <mesh position={[0, ROOM.height / 2, 0]} raycast={noRaycast} renderOrder={2}>
        <planeGeometry args={[length, ROOM.height - 0.18]} />
        <meshPhysicalMaterial color="#ffffff" transparent opacity={0.015} roughness={0.01} metalness={0.02} transmission={0.98} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      {Array.from({ length: panes + 1 }).map((_, i) => (
        <mesh key={i} position={[-length / 2 + i * paneW, ROOM.height / 2, 0]} raycast={noRaycast} castShadow>
          <boxGeometry args={[0.06, ROOM.height, 0.12]} />
          <meshStandardMaterial color="#22272b" roughness={0.28} metalness={0.78} />
        </mesh>
      ))}
    </group>
  )
}

function GlassWall({ length, position, rotationY }: { length: number; position: [number, number, number]; rotationY: number }) {
  const panes = Math.round(length / 3)
  const paneW = length / panes
  return (
    <group position={position} rotation-y={rotationY}>
      <mesh position={[0, 0.08, 0]} raycast={noRaycast}>
        <boxGeometry args={[length, 0.16, 0.3]} />
        <meshStandardMaterial color={BRONZE} roughness={0.5} metalness={0.4} />
      </mesh>
      <mesh position={[0, GLASS_TOP / 2, 0]} raycast={noRaycast} renderOrder={2}>
        <planeGeometry args={[length, GLASS_TOP - 0.16]} />
        <meshPhysicalMaterial color="#d8ecf2" transparent opacity={0.045} roughness={0.02} metalness={0.1} reflectivity={0.6} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      {Array.from({ length: panes + 1 }).map((_, i) => (
        <mesh key={i} position={[-length / 2 + i * paneW, GLASS_TOP / 2, 0]} raycast={noRaycast} castShadow>
          <boxGeometry args={[0.09, GLASS_TOP, 0.16]} />
          <meshStandardMaterial color={BRONZE} roughness={0.4} metalness={0.6} />
        </mesh>
      ))}
    </group>
  )
}

function BackTableWithProps({ onTurnTableClick, onBottleClick }: { onTurnTableClick: () => void; onBottleClick: (name: string) => void }) {
  return (
    <group position={[0, 0, -6.5]}>
      <mesh position={[0, 0.6, 0]} castShadow receiveShadow>
        <boxGeometry args={[3.5, 0.12, 1.3]} />
        <meshStandardMaterial color="#5c3a21" roughness={0.6} />
      </mesh>
      <mesh position={[-1.5, 0.3, -0.4]} castShadow>
        <boxGeometry args={[0.15, 0.6, 1.0]} />
        <meshStandardMaterial color="#222" roughness={0.5} />
      </mesh>
      <mesh position={[1.5, 0.3, -0.4]} castShadow>
        <boxGeometry args={[0.15, 0.6, 1.0]} />
        <meshStandardMaterial color="#222" roughness={0.5} />
      </mesh>
      <group position={[-0.9, 0.68, 0]} onClick={(e) => { e.stopPropagation(); onTurnTableClick() }}>
        <mesh castShadow>
          <boxGeometry args={[0.75, 0.08, 0.65]} />
          <meshStandardMaterial color="#1a1a1a" roughness={0.3} />
        </mesh>
        <mesh position={[0, 0.05, 0]}>
          <cylinderGeometry args={[0.26, 0.26, 0.01, 32]} />
          <meshStandardMaterial color="#111" roughness={0.2} />
        </mesh>
      </group>
      {[{ x: 0.3, color: '#550011' }, { x: 0.6, color: '#330022' }].map((b) => (
        <group key={b.x} position={[b.x, 0.66, 0]} onClick={(e) => { e.stopPropagation(); onBottleClick('와인') }}>
          <mesh position={[0, 0.32, 0]} castShadow>
            <cylinderGeometry args={[0.06, 0.08, 0.64, 16]} />
            <meshStandardMaterial color={b.color} roughness={0.3} />
          </mesh>
        </group>
      ))}
      {[{ x: 0.95, color: '#d48800' }, { x: 1.25, color: '#aa5500' }].map((b) => (
        <group key={b.x} position={[b.x, 0.66, 0.1]} onClick={(e) => { e.stopPropagation(); onBottleClick('위스키') }}>
          <mesh position={[0, 0.3, 0]} castShadow>
            <boxGeometry args={[0.12, 0.55, 0.12]} />
            <meshStandardMaterial color={b.color} roughness={0.2} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

export function Room({ onFloorClick }: { onFloorClick: (e: ThreeEvent<MouseEvent>) => void }) {
  const { halfX, halfZ } = ROOM
  const floorTex = useMemo(() => createWoodFloorTexture(4, 3), [])
  const [isPlayingLP, setIsPlayingLP] = useState(false)
  const lpAudioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    lpAudioRef.current = new Audio('https://actions.google.com/sounds/v1/ambiences/vinyl_record_crackle.ogg')
    lpAudioRef.current.loop = true
    lpAudioRef.current.volume = 0.03
    return () => lpAudioRef.current?.pause()
  }, [])

  const toggleLP = () => {
    if (!lpAudioRef.current) return
    if (isPlayingLP) {
      lpAudioRef.current.pause()
      setIsPlayingLP(false)
    } else {
      lpAudioRef.current.play().catch(() => {})
      setIsPlayingLP(true)
    }
  }

  const playDrinkSound = (type: string) => {
    const sound = new Audio('https://actions.google.com/sounds/v1/eating/drinking_gulp.ogg')
    sound.volume = 0.5
    sound.play().catch(() => {})
  }

  return (
    <group>
      <ambientLight intensity={1.1} color="#fffcf5" />
      <directionalLight position={[12, 25, 12]} intensity={2.2} color="#fff2df" castShadow shadow-mapSize={[3072, 3072]} />
      <directionalLight position={[-12, 18, -10]} intensity={1.0} color="#e5efff" />

      <mesh rotation-x={-Math.PI / 2} receiveShadow onClick={onFloorClick} name="floor">
        <planeGeometry args={[halfX * 2, halfZ * 2]} />
        <meshStandardMaterial map={floorTex} bumpMap={floorTex} bumpScale={0.015} roughness={0.4} metalness={0.05} />
      </mesh>

      <VaultedCeiling />
      <OceanGlassWall length={halfX * 2} />
      <GlassWall length={halfZ * 2} position={[halfX, 0, 0]} rotationY={Math.PI / 2} />
      <GlassWall length={halfZ * 2} position={[-halfX, 0, 0]} rotationY={Math.PI / 2} />
      <EnvironmentBackdrop />
      <BackTableWithProps onTurnTableClick={toggleLP} onBottleClick={playDrinkSound} />
      <Plant position={[-11.2, 0, 8.2]} />
    </group>
  )
}

function Plant({ position }: { position: [number, number, number] }) {
  const leaves = useMemo(
    () => Array.from({ length: 9 }).map((_, i) => {
      const a = (i / 9) * Math.PI * 2
      const h = 0.9 + (i % 3) * 0.35
      const tilt = 0.35 + (i % 2) * 0.25
      return { a, h, tilt }
    }),
    [],
  )

  return (
    <group position={position}>
      <mesh position={[0, 0.3, 0]} castShadow raycast={noRaycast}>
        <cylinderGeometry args={[0.28, 0.22, 0.6, 20]} />
        <meshStandardMaterial color="#e9e4dc" roughness={0.6} />
      </mesh>
      {leaves.map((leaf, i) => (
        <mesh
          key={i}
          position={[Math.sin(leaf.a) * 0.2, 0.6 + leaf.h / 2, Math.cos(leaf.a) * 0.2]}
          rotation={[Math.cos(leaf.a) * leaf.tilt, 0, -Math.sin(leaf.a) * leaf.tilt]}
          castShadow
          raycast={noRaycast}
        >
          <sphereGeometry args={[0.16, 10, 10]} />
          <meshStandardMaterial color={i % 2 ? '#2f6b34' : '#3e7f3a'} roughness={0.7} />
        </mesh>
      ))}
    </group>
  )
}
