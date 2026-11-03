'use client'

import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef, useState } from 'react'
import type * as THREE from 'three'
import type { GuestEntry } from '@/lib/use-guestbook'

const MAX_CANDLES = 48
const DISPLAY_POSITION: [number, number, number] = [-8.45, 0, 7.15]

function Candle({ entry, position, seed }: { entry: GuestEntry; position: [number, number, number]; seed: number }) {
  const flame = useRef<THREE.Mesh>(null)
  const [hovered, setHovered] = useState(false)
  const height = 0.12 + (seed % 3) * 0.04

  useFrame(({ clock }) => {
    if (!flame.current) return
    const t = clock.elapsedTime * 9 + seed * 3.1
    const f = 1 + Math.sin(t) * 0.12 + Math.sin(t * 2.3) * 0.08
    flame.current.scale.set(1, f * 1.8, 1)
    flame.current.position.x = Math.sin(t * 0.7) * 0.003
  })

  return (
    <group
      position={position}
      onPointerOver={(e) => {
        e.stopPropagation()
        setHovered(true)
      }}
      onPointerOut={() => setHovered(false)}
    >
      <mesh position={[0, height / 2, 0]} castShadow>
        <cylinderGeometry args={[0.035, 0.038, height, 16]} />
        <meshStandardMaterial color="#f5ecd8" roughness={0.6} emissive="#ffb35c" emissiveIntensity={0.15} />
      </mesh>
      <mesh ref={flame} position={[0, height + 0.025, 0]}>
        <sphereGeometry args={[0.014, 10, 10]} />
        <meshStandardMaterial color="#ffd27a" emissive="#ff9a2e" emissiveIntensity={6} toneMapped={false} />
      </mesh>
      {hovered && (
        <Html position={[0, height + 0.25, 0]} center style={{ pointerEvents: 'none' }} zIndexRange={[20, 0]}>
          <div className="w-52 rounded-xl border border-amber-200/20 bg-neutral-950/85 p-3 text-left shadow-xl backdrop-blur">
            <p className="text-xs font-semibold text-amber-200">{entry.name}</p>
            <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-neutral-200">{entry.message}</p>
          </div>
        </Html>
      )}
    </group>
  )
}

export function CandleBench({ entries }: { entries: GuestEntry[] }) {
  const lit = useMemo(() => entries.filter((e) => e.candle).slice(0, MAX_CANDLES), [entries])
  const light = useRef<THREE.PointLight>(null)

  useFrame(({ clock }) => {
    if (!light.current) return
    light.current.intensity = Math.min(lit.length, 12) * 0.35 * (1 + Math.sin(clock.elapsedTime * 7) * 0.06)
  })

  return (
    <group position={DISPLAY_POSITION}>
      {/* A compact non-seating candle console sits beside the exit, keeping the central pool path open. */}
      <mesh position={[0, 0.88, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.55, 0.14, 0.82]} />
        <meshPhysicalMaterial color="#6b4228" roughness={0.42} clearcoat={0.18} />
      </mesh>
      <mesh position={[0, 0.96, 0]}>
        <boxGeometry args={[2.38, 0.025, 0.68]} />
        <meshStandardMaterial color="#b18a5e" roughness={0.5} />
      </mesh>
      {[-0.86, 0.86].map((x) => [-0.24, 0.24].map((z) => (
        <mesh key={`${x}-${z}`} position={[x, 0.43, z]} castShadow>
          <boxGeometry args={[0.12, 0.86, 0.12]} />
          <meshStandardMaterial color="#4a2e1a" roughness={0.58} />
        </mesh>
      )))}
      <group position={[0, 0.99, 0]}>
        {lit.map((entry, i) => {
          const column = i % 12
          const row = Math.floor(i / 12)
          const x = -0.99 + column * 0.18
          const z = -0.27 + row * 0.18
          return <Candle key={entry.id} entry={entry} seed={i} position={[x, 0, z]} />
        })}
      </group>
      <pointLight ref={light} position={[0, 1.35, -0.4]} color="#ffb163" distance={5} decay={2} />
    </group>
  )
}
