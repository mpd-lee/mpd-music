'use client'

import { useLayoutEffect, useMemo, useRef } from 'react'
import { Html, RoundedBox, useTexture } from '@react-three/drei'
import * as THREE from 'three'
import { playBlip } from '@/lib/sound'
import { createScreenTexture } from '@/lib/textures'
import { Interactive } from './interactive'
import { ROOM } from './room'

export const YOUTUBE_CHANNEL_URL = 'https://www.youtube.com/@MPD_Music'

const CHANNELS = 60
const CONSOLE_W = 6.6
const KNOB_ROWS = 9
const KNOB_COLORS = ['#c9372c', '#c9372c', '#2f6fb3', '#2f6fb3', '#e0e0e0', '#3a9a4a', '#e6b13a', '#7a7a7a', '#ffffff']

function ConsoleSurface() {
  const knobs = useRef<THREE.InstancedMesh>(null)
  const faders = useRef<THREE.InstancedMesh>(null)
  const slots = useRef<THREE.InstancedMesh>(null)
  const leds = useRef<THREE.InstancedMesh>(null)
  const meters = useRef<THREE.InstancedMesh>(null)
  const spacing = (CONSOLE_W - 0.4) / CHANNELS

  useLayoutEffect(() => {
    const m = new THREE.Matrix4()
    const c = new THREE.Color()
    const q = new THREE.Quaternion()
    for (let ch = 0; ch < CHANNELS; ch++) {
      const x = -CONSOLE_W / 2 + 0.2 + spacing / 2 + ch * spacing
      for (let r = 0; r < KNOB_ROWS; r++) {
        m.makeTranslation(x, 0.012, -0.5 + r * 0.075)
        knobs.current!.setMatrixAt(ch * KNOB_ROWS + r, m)
        knobs.current!.setColorAt(ch * KNOB_ROWS + r, c.set(KNOB_COLORS[r]))
      }
      m.makeTranslation(x, 0.003, 0.36)
      slots.current!.setMatrixAt(ch, m)
      m.makeTranslation(x, 0.018, 0.28 + Math.abs(Math.sin(ch * 1.7)) * 0.16)
      faders.current!.setMatrixAt(ch, m)
      m.makeTranslation(x, 0.006, 0.2)
      leds.current!.setMatrixAt(ch, m)
      leds.current!.setColorAt(ch, c.set(ch % 5 === 0 ? '#ff4b3a' : '#43e06b'))
      const level = 0.3 + Math.abs(Math.sin(ch * 0.9)) * 0.7
      m.compose(new THREE.Vector3(x, 0.05 + level * 0.09, 0), q, new THREE.Vector3(1, level, 1))
      meters.current!.setMatrixAt(ch, m)
      meters.current!.setColorAt(ch, c.set(level > 0.85 ? '#ffb347' : '#5df08a'))
    }
    for (const ref of [knobs, faders, slots, leds, meters]) {
      ref.current!.instanceMatrix.needsUpdate = true
      if (ref.current!.instanceColor) ref.current!.instanceColor.needsUpdate = true
    }
  }, [spacing])

  return (
    <group>
      <instancedMesh ref={knobs} args={[undefined, undefined, CHANNELS * KNOB_ROWS]}>
        <cylinderGeometry args={[0.016, 0.019, 0.025, 10]} />
        <meshStandardMaterial roughness={0.4} />
      </instancedMesh>
      <instancedMesh ref={slots} args={[undefined, undefined, CHANNELS]}>
        <boxGeometry args={[0.012, 0.004, 0.22]} />
        <meshStandardMaterial color="#090909" />
      </instancedMesh>
      <instancedMesh ref={faders} args={[undefined, undefined, CHANNELS]}>
        <boxGeometry args={[0.04, 0.03, 0.05]} />
        <meshStandardMaterial color="#d8d8d8" roughness={0.3} metalness={0.3} />
      </instancedMesh>
      <instancedMesh ref={leds} args={[undefined, undefined, CHANNELS]}>
        <sphereGeometry args={[0.008, 8, 8]} />
        <meshStandardMaterial emissive="#ffffff" emissiveIntensity={1.5} toneMapped={false} />
      </instancedMesh>
      <group position={[0, 0.25, -0.64]}>
        <instancedMesh ref={meters} args={[undefined, undefined, CHANNELS]}>
          <boxGeometry args={[0.05, 0.18, 0.01]} />
          <meshStandardMaterial emissive="#ffffff" emissiveIntensity={1.2} toneMapped={false} />
        </instancedMesh>
      </group>
    </group>
  )
}

function NearfieldMonitor({ position, rotationY = 0, scale = 1 }: { position: [number, number, number]; rotationY?: number; scale?: number }) {
  return (
    <group position={position} rotation-y={rotationY} scale={scale}>
      <RoundedBox args={[0.72, 1.05, 0.55]} radius={0.055} smoothness={6} castShadow receiveShadow>
        <meshPhysicalMaterial color="#26282b" roughness={0.34} metalness={0.22} clearcoat={0.35} />
      </RoundedBox>
      <mesh position={[0, -0.12, 0.281]} rotation-x={Math.PI / 2}>
        <cylinderGeometry args={[0.235, 0.235, 0.025, 48]} />
        <meshStandardMaterial color="#090a0b" roughness={0.48} metalness={0.2} />
      </mesh>
      <mesh position={[0, -0.12, 0.297]} rotation-x={Math.PI / 2}>
        <torusGeometry args={[0.208, 0.022, 12, 48]} />
        <meshStandardMaterial color="#9a9fa4" metalness={0.7} roughness={0.24} />
      </mesh>
      <mesh position={[0, -0.12, 0.322]} rotation-x={Math.PI / 2}>
        <coneGeometry args={[0.17, 0.035, 36]} />
        <meshStandardMaterial color="#202326" roughness={0.3} metalness={0.3} />
      </mesh>
      <mesh position={[0, 0.27, 0.286]} rotation-x={Math.PI / 2}>
        <cylinderGeometry args={[0.095, 0.095, 0.022, 40]} />
        <meshStandardMaterial color="#070808" metalness={0.45} roughness={0.24} />
      </mesh>
      <mesh position={[0, 0.27, 0.302]} rotation-x={Math.PI / 2}>
        <torusGeometry args={[0.082, 0.014, 10, 36]} />
        <meshStandardMaterial color="#9a9fa4" metalness={0.72} roughness={0.24} />
      </mesh>
      <Html position={[0, -0.44, 0.31]} center transform distanceFactor={9} style={{ pointerEvents: 'none' }}>
        <div className="text-[8px] font-black tracking-[0.18em] text-white/70">GENELEC</div>
      </Html>
    </group>
  )
}

function MainMonitor({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <RoundedBox args={[1.2, 1.5, 0.55]} radius={0.045} smoothness={5} castShadow receiveShadow>
        <meshPhysicalMaterial color="#755237" roughness={0.62} clearcoat={0.12} />
      </RoundedBox>
      <RoundedBox args={[1.04, 1.34, 0.055]} radius={0.025} smoothness={4} position={[0, 0, 0.285]}>
        <meshStandardMaterial color="#18191b" roughness={0.82} />
      </RoundedBox>
      <group position={[0, -0.27, 0.324]}>
        <mesh rotation-x={Math.PI / 2}>
          <cylinderGeometry args={[0.31, 0.31, 0.028, 48]} />
          <meshStandardMaterial color="#090a0b" metalness={0.32} roughness={0.48} />
        </mesh>
        <mesh position={[0, 0, 0.02]} rotation-x={Math.PI / 2}>
          <torusGeometry args={[0.275, 0.027, 12, 48]} />
          <meshStandardMaterial color="#b58b53" metalness={0.82} roughness={0.24} />
        </mesh>
        <mesh position={[0, 0, 0.03]} rotation-x={Math.PI / 2}>
          <coneGeometry args={[0.245, 0.07, 40, 2]} />
          <meshPhysicalMaterial color="#262a2e" roughness={0.34} metalness={0.28} />
        </mesh>
        <mesh position={[0, 0, 0.072]}>
          <sphereGeometry args={[0.072, 24, 18]} />
          <meshStandardMaterial color="#111315" metalness={0.42} roughness={0.28} />
        </mesh>
      </group>
      <group position={[0, 0.44, 0.324]}>
        <mesh rotation-x={Math.PI / 2}>
          <cylinderGeometry args={[0.13, 0.13, 0.024, 40]} />
          <meshStandardMaterial color="#070808" metalness={0.45} roughness={0.3} />
        </mesh>
        <mesh position={[0, 0, 0.02]} rotation-x={Math.PI / 2}>
          <torusGeometry args={[0.108, 0.016, 8, 36]} />
          <meshStandardMaterial color="#c2a273" metalness={0.86} roughness={0.22} />
        </mesh>
        <mesh position={[0, 0, 0.025]}>
          <sphereGeometry args={[0.078, 20, 16]} />
          <meshStandardMaterial color="#34383c" metalness={0.45} roughness={0.26} />
        </mesh>
      </group>
      {[-0.48, 0.48].flatMap((x) => [-0.62, 0.62].map((y) => (
        <mesh key={`${x}-${y}`} position={[x, y, 0.322]}>
          <cylinderGeometry args={[0.014, 0.014, 0.018, 12]} />
          <meshStandardMaterial color="#b6a17f" metalness={0.85} roughness={0.24} />
        </mesh>
      )))}
      <mesh position={[0, -0.78, 0]} castShadow>
        <boxGeometry args={[0.46, 0.12, 0.34]} />
        <meshStandardMaterial color="#252525" roughness={0.58} />
      </mesh>
    </group>
  )
}

function RackTower({ position, rotationY }: { position: [number, number, number]; rotationY: number }) {
  const units = 12
  const leds = useRef<THREE.InstancedMesh>(null)
  const knobs = useRef<THREE.InstancedMesh>(null)
  const perUnitKnobs = 6
  useLayoutEffect(() => {
    const m = new THREE.Matrix4()
    const c = new THREE.Color()
    for (let u = 0; u < units; u++) {
      const y = 0.15 + u * 0.09
      m.makeTranslation(-0.2, y, 0.29)
      leds.current!.setMatrixAt(u, m)
      leds.current!.setColorAt(u, c.set(['#ff5a3c', '#46e27a', '#ffb547', '#5ac8ff'][u % 4]))
      for (let k = 0; k < perUnitKnobs; k++) {
        m.makeRotationX(Math.PI / 2).setPosition(-0.1 + k * 0.06, y, 0.29)
        knobs.current!.setMatrixAt(u * perUnitKnobs + k, m)
      }
    }
    leds.current!.instanceMatrix.needsUpdate = true
    if (leds.current!.instanceColor) leds.current!.instanceColor.needsUpdate = true
    knobs.current!.instanceMatrix.needsUpdate = true
  }, [])
  return (
    <group position={position} rotation-y={rotationY}>
      <mesh position={[0, 0.6, 0]} castShadow>
        <boxGeometry args={[0.62, 1.2, 0.56]} />
        <meshStandardMaterial color="#1d1c1b" roughness={0.6} />
      </mesh>
      {Array.from({ length: units }).map((_, u) => (
        <mesh key={u} position={[0, 0.15 + u * 0.09, 0.282]}>
          <boxGeometry args={[0.54, 0.08, 0.01]} />
          <meshStandardMaterial color={['#b9b9b5', '#2b2b2e', '#7c6a4f', '#cfc8b8', '#3d4a5a'][u % 5]} metalness={0.5} roughness={0.35} />
        </mesh>
      ))}
      <instancedMesh ref={leds} args={[undefined, undefined, units]}>
        <sphereGeometry args={[0.008, 8, 8]} />
        <meshStandardMaterial emissive="#fff" emissiveIntensity={2} toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={knobs} args={[undefined, undefined, units * perUnitKnobs]}>
        <cylinderGeometry args={[0.014, 0.014, 0.02, 10]} />
        <meshStandardMaterial color="#d8d4c8" metalness={0.6} roughness={0.3} />
      </instancedMesh>
      <mesh position={[0, 1.23, 0]}>
        <boxGeometry args={[0.64, 0.04, 0.58]} />
        <meshStandardMaterial color="#e9e4da" roughness={0.4} />
      </mesh>
    </group>
  )
}

function Chair({ position, rotationY = 0, onSit }: { position: [number, number, number]; rotationY?: number; onSit: (position: [number, number, number], rotationY: number) => void }) {
  return (
    <Interactive
      label="프로 컨트롤룸 체어에 앉기"
      labelOffset={[0, 1.35, 0]}
      position={position}
      rotation={[0, rotationY, 0]}
      onActivate={() => onSit([position[0], 0, position[2] + 0.24], Math.PI)}
    >
      {/* Five-star caster base, gas lift and padded ergonomic seat. */}
      {Array.from({ length: 5 }).map((_, i) => {
        const a = (i / 5) * Math.PI * 2
        return (
          <group key={i} position={[Math.sin(a) * 0.36, 0.08, Math.cos(a) * 0.36]} rotation-y={a}>
            <mesh position={[0, 0.035, 0.12]} rotation-x={Math.PI / 2} castShadow>
              <cylinderGeometry args={[0.052, 0.052, 0.1, 18]} />
              <meshStandardMaterial color="#14171a" roughness={0.55} />
            </mesh>
            <mesh position={[0, 0.02, 0.08]} castShadow>
              <cylinderGeometry args={[0.018, 0.025, 0.22, 12]} />
              <meshStandardMaterial color="#7c8589" metalness={0.92} roughness={0.2} />
            </mesh>
          </group>
        )
      })}
      <mesh position={[0, 0.31, 0]} castShadow>
        <cylinderGeometry args={[0.035, 0.04, 0.42, 16]} />
        <meshStandardMaterial color="#858c90" metalness={0.95} roughness={0.18} />
      </mesh>
      <RoundedBox args={[0.66, 0.17, 0.62]} radius={0.1} smoothness={6} position={[0, 0.55, 0.02]} castShadow>
        <meshStandardMaterial color="#24282c" roughness={0.9} />
      </RoundedBox>
      <RoundedBox args={[0.58, 0.1, 0.5]} radius={0.07} smoothness={6} position={[0, 0.65, 0.02]}>
        <meshStandardMaterial color="#32373b" roughness={0.94} />
      </RoundedBox>
      <RoundedBox args={[0.58, 0.82, 0.18]} radius={0.1} smoothness={6} position={[0, 1.02, -0.24]} rotation-x={0.12} castShadow>
        <meshStandardMaterial color="#25292d" roughness={0.91} />
      </RoundedBox>
      {[-0.38, 0.38].map((x) => (
        <group key={x} position={[x, 0.72, 0.02]}>
          <mesh position={[0, 0.13, 0]} castShadow>
            <cylinderGeometry args={[0.025, 0.025, 0.28, 12]} />
            <meshStandardMaterial color="#8c9498" metalness={0.9} roughness={0.24} />
          </mesh>
          <RoundedBox args={[0.13, 0.09, 0.5]} radius={0.045} smoothness={4} position={[0, 0.28, 0.03]} castShadow>
            <meshStandardMaterial color="#24282c" roughness={0.88} />
          </RoundedBox>
        </group>
      ))}
    </Interactive>
  )
}

function LargeRearMonitor({ position }: { position: [number, number, number] }) {
  return (
    <group position={position} scale={1.85}>
      <RoundedBox args={[0.82, 1.28, 0.58]} radius={0.06} smoothness={7} castShadow receiveShadow>
        <meshPhysicalMaterial color="#1e2023" roughness={0.28} metalness={0.42} clearcoat={0.55} />
      </RoundedBox>
      <mesh position={[0, -0.18, 0.3]} rotation-x={Math.PI / 2}>
        <cylinderGeometry args={[0.27, 0.27, 0.035, 48]} />
        <meshStandardMaterial color="#08090a" roughness={0.35} metalness={0.45} />
      </mesh>
      <mesh position={[0, -0.18, 0.322]} rotation-x={Math.PI / 2}>
        <torusGeometry args={[0.245, 0.026, 12, 48]} />
        <meshStandardMaterial color="#b2b7bb" metalness={0.86} roughness={0.2} />
      </mesh>
      <mesh position={[0, -0.18, 0.352]} rotation-x={Math.PI / 2}>
        <coneGeometry args={[0.2, 0.045, 40]} />
        <meshStandardMaterial color="#1b1e21" roughness={0.28} metalness={0.32} />
      </mesh>
      <mesh position={[0, 0.31, 0.302]} rotation-x={Math.PI / 2}>
        <cylinderGeometry args={[0.105, 0.105, 0.025, 40]} />
        <meshStandardMaterial color="#08090a" roughness={0.3} metalness={0.45} />
      </mesh>
      <mesh position={[0, 0.31, 0.322]} rotation-x={Math.PI / 2}>
        <torusGeometry args={[0.09, 0.014, 10, 36]} />
        <meshStandardMaterial color="#b6a06e" metalness={0.8} roughness={0.2} />
      </mesh>
    </group>
  )
}

function CornerStudioSpeaker({ position, rotationY }: { position: [number, number, number]; rotationY: number }) {
  const openChannel = () => window.open(YOUTUBE_CHANNEL_URL, '_blank', 'noopener,noreferrer')
  return (
    <Interactive
      position={position}
      rotation={[0, rotationY, 0]}
      label="MPD Music · YouTube 채널 열기"
      labelOffset={[0, 0.95, 0.08]}
      onActivate={openChannel}
    >
      <group scale={0.94}>
        <RoundedBox args={[0.76, 1.12, 0.43]} radius={0.055} smoothness={7} castShadow receiveShadow>
          <meshPhysicalMaterial color="#202326" roughness={0.28} metalness={0.48} clearcoat={0.55} />
        </RoundedBox>
        {[-0.2, 0.28].map((y) => (
          <group key={y} position={[0, y, 0.225]}>
            <mesh rotation-x={Math.PI / 2}>
              <cylinderGeometry args={[y > 0 ? 0.14 : 0.2, y > 0 ? 0.14 : 0.2, 0.035, 40]} />
              <meshStandardMaterial color="#08090a" roughness={0.26} metalness={0.44} />
            </mesh>
            <mesh rotation-x={Math.PI / 2} position={[0, 0, 0.024]}>
              <torusGeometry args={[y > 0 ? 0.12 : 0.175, 0.018, 10, 40]} />
              <meshStandardMaterial color="#c0a06a" metalness={0.85} roughness={0.22} />
            </mesh>
          </group>
        ))}
        <mesh position={[0, -0.5, 0.226]}>
          <boxGeometry args={[0.42, 0.018, 0.018]} />
          <meshStandardMaterial color="#d6b36d" metalness={0.7} roughness={0.25} />
        </mesh>
      </group>
    </Interactive>
  )
}

export function ControlRoom({ onSit }: { onSit: (position: [number, number, number], rotationY: number) => void }) {
  const tvTex = useTexture('/images/mpd-studio-photo.png')
  tvTex.colorSpace = THREE.SRGBColorSpace
  const dawTex = useMemo(() => createScreenTexture('daw'), [])
  const wallZ = -ROOM.halfZ
  // The rear wall is open now, so place the display safely inside the room.
  const displayZ = wallZ + 1.65
  const studioWebsite = 'https://lotto-ai1.tistory.com/'
  const openStudioWebsite = () => window.open(studioWebsite, '_blank', 'noopener,noreferrer')

  return (
    <group>
      {/* Larger central MPD screen. Both the screen and title plaque open the Tistory page. */}
      <Interactive
        label="MPD Music Studio TV · 티스토리 공식 페이지 열기"
        labelOffset={[0, 1.58, 0.12]}
        position={[0, 3.35, displayZ]}
        onActivate={openStudioWebsite}
      >
        <RoundedBox args={[4.85, 2.78, 0.18]} radius={0.11} smoothness={7} castShadow receiveShadow>
          <meshPhysicalMaterial color="#090c11" roughness={0.24} metalness={0.46} clearcoat={0.9} />
        </RoundedBox>
        <mesh position={[0, 0, 0.098]}>
          <planeGeometry args={[4.58, 2.55]} />
          <meshBasicMaterial map={tvTex} toneMapped={false} />
        </mesh>
        <mesh position={[0, -1.35, 0]} castShadow>
          <boxGeometry args={[0.62, 0.12, 0.45]} />
          <meshStandardMaterial color="#17191d" metalness={0.48} roughness={0.3} />
        </mesh>
      </Interactive>
      <Interactive
        label="MPD MUSIC STUDIO · 티스토리 공식 페이지 열기"
        labelOffset={[0, 0.75, 0.1]}
        position={[0, 5.48, displayZ - 0.04]}
        onActivate={openStudioWebsite}
      >
        <RoundedBox args={[8.9, 1.02, 0.2]} radius={0.1} smoothness={8} castShadow>
          <meshPhysicalMaterial color="#0c1c3d" roughness={0.22} metalness={0.42} clearcoat={0.95} />
        </RoundedBox>
        {/* Full-bleed royal-blue backplate, matching the solid sign in the reference screenshot. */}
        <mesh position={[0, 0, 0.108]}>
          <planeGeometry args={[8.68, 0.8]} />
          <meshBasicMaterial color="#174fb5" toneMapped={false} />
        </mesh>
        <Html position={[0, 0, 0.12]} center transform distanceFactor={7} style={{ pointerEvents: 'none' }}>
          <div className="whitespace-nowrap text-center text-[32px] font-black tracking-[0.2em] text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.55)]">MPD MUSIC STUDIO</div>
        </Html>
      </Interactive>

      <Interactive
        label="MPD Music 유튜브 채널 열기"
        labelOffset={[0, 1.6, 0]}
        position={[0, 0, -5.25]}
        onActivate={() => {
          playBlip()
          window.open(YOUTUBE_CHANNEL_URL, '_blank', 'noopener,noreferrer')
        }}
      >
        <group>
              {[-2.3, -0.8, 0.8, 2.3].map((x) => (
                <mesh key={x} position={[x, 0.36, -0.1]} castShadow>
                  <boxGeometry args={[0.12, 0.72, 0.9]} />
                  <meshStandardMaterial color="#1b1b1c" roughness={0.6} />
                </mesh>
              ))}
              <mesh position={[0, 0.8, 0]} castShadow receiveShadow>
                <boxGeometry args={[CONSOLE_W + 0.3, 0.16, 1.5]} />
                <meshStandardMaterial color="#2a2b2e" roughness={0.5} metalness={0.3} />
              </mesh>
              <mesh position={[0, 0.82, 0.8]} castShadow>
                <boxGeometry args={[CONSOLE_W + 0.3, 0.1, 0.18]} />
                <meshStandardMaterial color="#5a3a22" roughness={0.45} />
              </mesh>
              <mesh position={[-3.25, 0.78, 0]} castShadow><boxGeometry args={[0.22, 0.86, 1.5]} /><meshStandardMaterial color="#6b4329" roughness={0.45} /></mesh>
              <mesh position={[3.25, 0.78, 0]} castShadow><boxGeometry args={[0.22, 0.86, 1.5]} /><meshStandardMaterial color="#6b4329" roughness={0.45} /></mesh>
              <group position={[0, 0.9, 0.05]} rotation-x={0.16}>
                <mesh>
                  <boxGeometry args={[CONSOLE_W, 0.02, 1.25]} />
                  <meshStandardMaterial color="#3b3e44" roughness={0.45} metalness={0.5} />
                </mesh>
                <ConsoleSurface />
              </group>
              <mesh position={[0, 1.15, -0.72]} castShadow>
                <boxGeometry args={[CONSOLE_W, 0.42, 0.18]} />
                <meshStandardMaterial color="#232427" roughness={0.5} />
              </mesh>
              <mesh position={[0, 1.37, -0.72]}>
                <boxGeometry args={[CONSOLE_W + 0.1, 0.03, 0.26]} />
                <meshStandardMaterial color="#5a3a22" roughness={0.45} />
              </mesh>
              <group position={[0, 1.38, -0.72]}>
                <mesh position={[0, 0.3, 0]} castShadow>
                  <boxGeometry args={[1.05, 0.6, 0.04]} />
                  <meshStandardMaterial color="#0e0e0e" />
                </mesh>
                <mesh position={[0, 0.3, 0.022]}>
                  <planeGeometry args={[1.0, 0.56]} />
                  <meshBasicMaterial map={dawTex} toneMapped={false} />
                </mesh>
                <mesh position={[0, 0.0, -0.02]}>
                  <boxGeometry args={[0.2, 0.04, 0.16]} />
                  <meshStandardMaterial color="#444" metalness={0.7} />
                </mesh>
              </group>
              <NearfieldMonitor position={[-1.65, 1.72, -0.72]} rotationY={0.22} scale={1.35} />
              <NearfieldMonitor position={[1.65, 1.72, -0.72]} rotationY={-0.22} scale={1.35} />
            </group>
      </Interactive>

      <RackTower position={[-4.7, 0, -6.15]} rotationY={0.12} />
      <RackTower position={[4.7, 0, -6.15]} rotationY={-0.12} />
      {/* Rear main tower speakers restored; the two large front-facing towers stay removed. */}
      <LargeRearMonitor position={[-8.55, 2.55, -8.45]} />
      <LargeRearMonitor position={[8.55, 2.55, -8.45]} />
      {/* Four elevated, clickable medium monitors remain at the room corners. */}
      <CornerStudioSpeaker position={[-10.35, 5.55, -6.7]} rotationY={Math.PI * 0.10} />
      <CornerStudioSpeaker position={[10.35, 5.55, -6.7]} rotationY={-Math.PI * 0.10} />
      <CornerStudioSpeaker position={[-10.35, 5.55, 6.7]} rotationY={Math.PI * 0.90} />
      <CornerStudioSpeaker position={[10.35, 5.55, 6.7]} rotationY={-Math.PI * 0.90} />
      <Chair position={[0, 0, -3.85]} rotationY={Math.PI} onSit={onSit} />

      <mesh rotation-x={-Math.PI / 2} position={[0, 0.005, -1.0]} receiveShadow>
        <planeGeometry args={[7.5, 4]} />
        <meshStandardMaterial color="#6f655b" roughness={1} />
      </mesh>
    </group>
  )
}
