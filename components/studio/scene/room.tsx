'use client'

import type { ThreeEvent } from '@react-three/fiber'
import { RoundedBox, useTexture } from '@react-three/drei'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { createWoodFloorTexture } from '@/lib/textures'
import type { GraphicsTier } from '@/lib/graphics-quality'

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


function SolarPanelUnit({ position, rotationZ = 0 }: { position: [number, number, number]; rotationZ?: number }) {
  return (
    <group position={position} rotation-z={rotationZ} raycast={noRaycast}>
      <RoundedBox args={[3.35, 0.105, 2.05]} radius={0.07} smoothness={4} castShadow>
        <meshStandardMaterial color="#26323a" metalness={0.82} roughness={0.28} />
      </RoundedBox>
      <mesh position={[0, 0.058, 0]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[3.17, 1.88]} />
        <meshPhysicalMaterial color="#173f61" metalness={0.72} roughness={0.24} clearcoat={0.72} clearcoatRoughness={0.18} />
      </mesh>
      {Array.from({ length: 6 }, (_, i) => (
        <mesh key={`solar-col-${i}`} position={[-1.32 + i * 0.528, 0.064, 0]}>
          <boxGeometry args={[0.012, 0.012, 1.86]} />
          <meshStandardMaterial color="#b4c8d4" metalness={0.85} roughness={0.3} />
        </mesh>
      ))}
      {Array.from({ length: 4 }, (_, i) => (
        <mesh key={`solar-row-${i}`} position={[0, 0.066, -0.72 + i * 0.48]}>
          <boxGeometry args={[3.12, 0.012, 0.012]} />
          <meshStandardMaterial color="#a9c2d2" metalness={0.82} roughness={0.32} />
        </mesh>
      ))}
    </group>
  )
}

function VaultedCeiling({ quality }: { quality: GraphicsTier }) {
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
          {quality !== 'mobile' && <pointLight position={[point.x, point.y - 0.38, 0]} color="#ffbd73" intensity={quality === 'balanced' ? 8 : index === 2 ? 22 : 14} distance={14} decay={2} />}
        </group>
      ))}

      {/* Exterior photovoltaic panels: two sun-facing roof banks, visible from outside. */}
      {[-7.2, -3.6, 0, 3.6, 7.2].map((z) => (
        <group key={`solar-row-${z}`}>
          <SolarPanelUnit position={[-9.2, 8.72, z]} rotationZ={0.237} />
          <SolarPanelUnit position={[9.2, 8.72, z]} rotationZ={-0.237} />
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
                {quality !== 'mobile' && <pointLight position={[0, -0.08, 0]} color="#ffd59a" intensity={quality === 'balanced' ? 2.5 : 5} distance={6} decay={2} />}
              </group>
            )
          })}
        </group>
      ))}
    </group>
  )
}

function AtmosphereFallback() {
  const vertexShader = `
    varying vec3 vDirection;
    void main() {
      vDirection = normalize(position);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `
  const fragmentShader = `
    varying vec3 vDirection;
    void main() {
      float h = clamp(normalize(vDirection).y, -1.0, 1.0);
      vec3 horizon = vec3(0.52, 0.72, 0.82);
      vec3 blue = vec3(0.18, 0.46, 0.70);
      vec3 deep = vec3(0.09, 0.25, 0.43);
      float upper = smoothstep(-0.08, 0.58, h);
      vec3 sky = mix(blue, deep, smoothstep(0.55, 1.0, h) * 0.22);
      sky = mix(horizon, sky, upper);
      gl_FragColor = vec4(sky, 1.0);
    }
  `
  return (
    <mesh position={[0, 3.25, 0]} renderOrder={-110} raycast={noRaycast} frustumCulled={false}>
      <sphereGeometry args={[420, 32, 20]} />
      <shaderMaterial vertexShader={vertexShader} fragmentShader={fragmentShader} side={THREE.BackSide} depthWrite={false} depthTest={false} toneMapped={false} />
    </mesh>
  )
}


function makeGrassBankGeometry(axis: 'x' | 'z', side: -1 | 1, inner: number, outer: number, yTop: number, yBottom: number, halfLength: number) {
  const geometry = new THREE.BufferGeometry()
  const positions = axis === 'x'
    ? [side * inner, yTop, -halfLength, side * inner, yTop, halfLength, side * outer, yBottom, -halfLength, side * outer, yBottom, halfLength]
    : [-halfLength, yTop, side * inner, halfLength, yTop, side * inner, -halfLength, yBottom, side * outer, halfLength, yBottom, side * outer]
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 0, 5, 1.7, 0, 1.7, 5], 2))
  geometry.setIndex([0, 2, 1, 2, 3, 1])
  geometry.computeVertexNormals()
  return geometry
}

function StudioFoundation({ quality }: { quality: GraphicsTier }) {
  const grass = useTexture(quality === 'mobile' ? '/images/mpd-natural-grass-mobile.webp' : '/images/mpd-natural-grass.webp')
  const banks = useMemo(() => [
    makeGrassBankGeometry('x', -1, 12.60, 18.65, -0.015, -4.45, 13.10),
    makeGrassBankGeometry('x', 1, 12.60, 18.65, -0.015, -4.45, 13.10),
    makeGrassBankGeometry('z', -1, 9.55, 15.75, -0.015, -4.45, 17.70),
    makeGrassBankGeometry('z', 1, 9.55, 15.75, -0.015, -4.45, 17.70),
  ], [])
  useEffect(() => {
    grass.colorSpace = THREE.SRGBColorSpace
    grass.wrapS = THREE.RepeatWrapping
    grass.wrapT = THREE.RepeatWrapping
    grass.repeat.set(1, 1)
    grass.anisotropy = quality === 'mobile' ? 2 : quality === 'balanced' ? 8 : 12
    grass.needsUpdate = true
  }, [grass, quality])
  useEffect(() => () => banks.forEach((geometry) => geometry.dispose()), [banks])
  const buttresses = [
    { x: -12.65, z: -9.55, r: 0.12 }, { x: 0, z: -9.8, r: -0.08 }, { x: 12.65, z: -9.55, r: -0.12 },
    { x: -12.85, z: -2.8, r: 0.08 }, { x: 12.85, z: 2.8, r: -0.08 },
    { x: -12.65, z: 9.55, r: -0.12 }, { x: 0, z: 9.8, r: 0.08 }, { x: 12.65, z: 9.55, r: 0.12 },
  ]
  const stoneTones = ['#4f7048', '#64824f', '#456847', '#78935b']

  return (
    <group>
      {/* Sloping turf shoulders cover the exposed vertical stone skirt and blend into the island lawn. */}
      {banks.map((geometry, index) => (
        <mesh key={`foundation-grass-bank-${index}`} geometry={geometry} raycast={noRaycast} receiveShadow renderOrder={1}>
          <meshStandardMaterial map={grass} color="#e0efc5" roughness={0.99} side={THREE.DoubleSide} />
        </mesh>
      ))}
      {/* Hidden grass-textured backer skins seal tiny corner gaps in the sloping turf.
          Their top edge stays below the timber floor, so they cannot cover the room. */}
      {[
        { position: [-12.735, -2.235, 0] as [number, number, number], size: [0.24, 4.40, 20.35] as [number, number, number] },
        { position: [12.735, -2.235, 0] as [number, number, number], size: [0.24, 4.40, 20.35] as [number, number, number] },
        { position: [0, -2.235, -9.685] as [number, number, number], size: [26.25, 4.40, 0.24] as [number, number, number] },
        { position: [0, -2.235, 9.685] as [number, number, number], size: [26.25, 4.40, 0.24] as [number, number, number] },
      ].map((panel, index) => (
        <mesh key={`foundation-grass-seal-${index}`} position={panel.position} raycast={noRaycast} receiveShadow renderOrder={1}>
          <boxGeometry args={panel.size} />
          <meshStandardMaterial map={grass} color="#a9c78c" roughness={1} side={THREE.DoubleSide} />
        </mesh>
      ))}
      {/* A deep limestone plinth sits flush with the island lawn, not on a floating platform. */}
      <RoundedBox args={[25.95, 2.28, 19.85]} radius={0.52} smoothness={8} position={[0, -1.16, 0]} receiveShadow castShadow>
        <meshStandardMaterial map={grass} color="#d8e9bc" roughness={0.99} metalness={0} />
      </RoundedBox>
      <RoundedBox args={[26.35, 0.34, 20.25]} radius={0.48} smoothness={7} position={[0, -2.12, 0]} receiveShadow castShadow>
        <meshStandardMaterial map={grass} color="#b9d59b" roughness={1} />
      </RoundedBox>

      {/* Irregular bedrock buttresses visibly lock the pavilion into the coastal headland. */}
      {buttresses.map((stone, index) => (
        <group key={`foundation-rock-${index}`} position={[stone.x, -1.95, stone.z]} rotation-y={stone.r}>
          <mesh position={[0, 0, 0]} scale={[1.32 + (index % 3) * 0.16, 2.1 + (index % 2) * 0.25, 1.08 + (index % 2) * 0.18]} castShadow receiveShadow>
            <dodecahedronGeometry args={[1, 1]} />
            <meshStandardMaterial map={grass} color="#9bb77b" roughness={1} flatShading />
          </mesh>
          <mesh position={[0.28, -1.75, 0.08]} scale={[1.02, 1.18, 0.88]} castShadow receiveShadow>
            <icosahedronGeometry args={[1, 1]} />
            <meshStandardMaterial map={grass} color="#86a96d" roughness={1} flatShading />
          </mesh>
        </group>
      ))}
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
      <mesh position={[0, ROOM.height / 2, 0]} raycast={noRaycast} renderOrder={2} userData={{ mpdSolid: true }}>
        <planeGeometry args={[length, ROOM.height - 0.18]} />
        <meshPhysicalMaterial color="#ffffff" transparent opacity={0.015} roughness={0.01} metalness={0.02} transmission={0.98} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      {Array.from({ length: panes + 1 }).map((_, i) => (
        <mesh key={i} position={[-length / 2 + i * paneW, ROOM.height / 2, 0]} raycast={noRaycast} castShadow>
          <boxGeometry args={[0.04, ROOM.height, 0.075]} />
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
      <mesh position={[0, GLASS_TOP / 2, 0]} raycast={noRaycast} renderOrder={2} userData={{ mpdSolid: true }}>
        <planeGeometry args={[length, GLASS_TOP - 0.16]} />
        <meshPhysicalMaterial color="#d8ecf2" transparent opacity={0.045} roughness={0.02} metalness={0.1} reflectivity={0.6} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      {Array.from({ length: panes + 1 }).map((_, i) => (
        <mesh key={i} position={[-length / 2 + i * paneW, GLASS_TOP / 2, 0]} raycast={noRaycast} castShadow>
          <boxGeometry args={[0.045, GLASS_TOP, 0.09]} />
          <meshStandardMaterial color={BRONZE} roughness={0.4} metalness={0.6} />
        </mesh>
      ))}
    </group>
  )
}


function CurvedEntranceWings() {
  // Permanently-open double slider: the two transparent leaves are parked outside
  // the walking lane, like a resort pavilion with both automatic doors held open.
  return (
    <group position={[0, 0, ROOM.halfZ + 0.12]} userData={{ mpdNoCollision: true }}>
      <mesh position={[0, 0.075, 0]} raycast={noRaycast}>
        <boxGeometry args={[12.8, 0.14, 0.34]} />
        <meshStandardMaterial color="#4a3525" roughness={0.48} metalness={0.42} />
      </mesh>
      {[-1, 1].map((side) => (
        <group key={side} position={[side * 5.0, 0, 0]}>
          <mesh position={[side * 0.55, GLASS_TOP / 2, -0.34]} raycast={noRaycast} renderOrder={2}>
            <boxGeometry args={[1.45, GLASS_TOP - 0.18, 0.065]} />
            <meshPhysicalMaterial color="#d9edf3" transparent opacity={0.065} roughness={0.025} metalness={0.08} transmission={0.9} depthWrite={false} side={THREE.DoubleSide} />
          </mesh>
          <mesh position={[side * 0.55, GLASS_TOP - 0.12, -0.34]} raycast={noRaycast}>
            <boxGeometry args={[1.53, 0.11, 0.13]} />
            <meshStandardMaterial color={BRONZE} roughness={0.35} metalness={0.7} />
          </mesh>
          <mesh position={[side * 0.55, 0.045, -0.34]} raycast={noRaycast}>
            <boxGeometry args={[1.53, 0.07, 0.13]} />
            <meshStandardMaterial color={BRONZE} roughness={0.4} metalness={0.65} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, GLASS_TOP + 0.02, -0.32]} raycast={noRaycast}>
        <boxGeometry args={[13.4, 0.2, 0.24]} />
        <meshStandardMaterial color="#5a3a23" roughness={0.55} metalness={0.28} />
      </mesh>
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

export function Room({ onFloorClick, quality = 'high' }: { onFloorClick: (e: ThreeEvent<MouseEvent>) => void; quality?: GraphicsTier }) {
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
      <directionalLight position={[12, 25, 12]} intensity={2.0} color="#fff2df" castShadow={quality === 'high'} shadow-mapSize={[quality === 'high' ? 2048 : 512, quality === 'high' ? 2048 : 512]} />
      <directionalLight position={[-12, 18, -10]} intensity={1.0} color="#e5efff" />

      <StudioFoundation quality={quality} />
      <mesh position={[0, 0.092, 0]} rotation-x={-Math.PI / 2} receiveShadow onClick={onFloorClick} name="floor" userData={{ mpdFloor: true }}>
        <planeGeometry args={[26.30, 20.20]} />
        <meshStandardMaterial map={floorTex} bumpMap={floorTex} bumpScale={0.018} roughness={0.42} metalness={0.025} side={THREE.DoubleSide} />
      </mesh>

      <VaultedCeiling quality={quality} />
      <OceanGlassWall length={halfX * 2} />
      <GlassWall length={halfZ * 2} position={[halfX, 0, 0]} rotationY={Math.PI / 2} />
      <GlassWall length={halfZ * 2} position={[-halfX, 0, 0]} rotationY={Math.PI / 2} />
      <CurvedEntranceWings />
      {/* Sky dome only. A single forward-facing coastal photograph is mounted by Outdoor; no ocean image is wrapped around the sides or rear. */}
      <AtmosphereFallback />
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
