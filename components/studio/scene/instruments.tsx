'use client'

import type { ThreeEvent } from '@react-three/fiber'
import { Html, RoundedBox } from '@react-three/drei'
import { GLBAsset } from './gltf-asset'
import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import {
  playCymbal,
  playHiHat,
  playKick,
  playPiano,
  playPianoChord,
  playRhodes,
  playSnare,
  playTom,
  strumGuitar,
} from '@/lib/sound'
import { createDrumHeadTexture, createFabricTexture } from '@/lib/textures'
import { CLICK_DRAG_TOLERANCE, Interactive } from './interactive'

const isBlack = (midi: number) => [1, 3, 6, 8, 10].includes(midi % 12)
const CHROME = { color: '#d9d9d9', metalness: 1, roughness: 0.18 } as const
type SeatHandler = (position: [number, number, number], rotationY: number) => void

function worldSeatPoint(roomPosition: [number, number, number], rotationY: number, local: [number, number, number]): [number, number, number] {
  const offset = new THREE.Vector3(local[0], 0, local[2]).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotationY)
  return [roomPosition[0] + offset.x, 0, roomPosition[2] + offset.z]
}

function Keys({
  low,
  high,
  width,
  depth,
  onNote,
}: {
  low: number
  high: number
  width: number
  depth: number
  onNote: (midi: number) => void
}) {
  const whiteRef = useRef<THREE.InstancedMesh>(null)
  const blackRef = useRef<THREE.InstancedMesh>(null)
  const { whites, blacks, keyW } = useMemo(() => {
    const whites: number[] = []
    const blacks: { midi: number; x: number }[] = []
    for (let m = low; m <= high; m++) if (!isBlack(m)) whites.push(m)
    const keyW = width / whites.length
    let wi = 0
    for (let m = low; m <= high; m++) {
      if (isBlack(m)) blacks.push({ midi: m, x: -width / 2 + wi * keyW })
      else wi++
    }
    return { whites, blacks, keyW }
  }, [low, high, width])

  useLayoutEffect(() => {
    const m = new THREE.Matrix4()
    whites.forEach((_, i) => {
      m.makeTranslation(-width / 2 + keyW / 2 + i * keyW, 0, 0)
      whiteRef.current!.setMatrixAt(i, m)
    })
    blacks.forEach((b, i) => {
      m.makeTranslation(b.x, 0.012, -depth * 0.18)
      blackRef.current!.setMatrixAt(i, m)
    })
    whiteRef.current!.instanceMatrix.needsUpdate = true
    blackRef.current!.instanceMatrix.needsUpdate = true
  }, [whites, blacks, keyW, width, depth])

  const handle = (list: number[]) => (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    if (e.delta > CLICK_DRAG_TOLERANCE || e.instanceId === undefined) return
    onNote(list[e.instanceId])
  }
  const hoverOn = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    document.body.style.cursor = 'pointer'
  }
  const hoverOff = () => {
    document.body.style.cursor = 'auto'
  }

  return (
    <group>
      <instancedMesh
        ref={whiteRef}
        args={[undefined, undefined, whites.length]}
        onClick={handle(whites)}
        onPointerOver={hoverOn}
        onPointerOut={hoverOff}
      >
        <boxGeometry args={[keyW * 0.94, 0.02, depth]} />
        <meshStandardMaterial color="#f7f4ec" roughness={0.3} />
      </instancedMesh>
      <instancedMesh
        ref={blackRef}
        args={[undefined, undefined, blacks.length]}
        onClick={handle(blacks.map((b) => b.midi))}
        onPointerOver={hoverOn}
        onPointerOut={hoverOff}
      >
        <boxGeometry args={[keyW * 0.55, 0.03, depth * 0.62]} />
        <meshStandardMaterial color="#111" roughness={0.25} />
      </instancedMesh>
    </group>
  )
}

function pianoShape() {
  const s = new THREE.Shape()
  s.moveTo(-0.76, 0)
  s.lineTo(0.76, 0)
  s.lineTo(0.76, 0.5)
  s.bezierCurveTo(0.76, 0.95, 0.25, 1.0, 0.18, 1.5)
  s.bezierCurveTo(0.12, 1.95, 0.0, 2.15, -0.35, 2.15)
  s.bezierCurveTo(-0.62, 2.15, -0.76, 2.0, -0.76, 1.7)
  s.lineTo(-0.76, 0)
  return s
}

function GrandPiano(props: { position: [number, number, number]; rotationY: number; onSeat: SeatHandler }) {
  const shape = useMemo(pianoShape, [])
  const lacquer = (
    <meshPhysicalMaterial color="#070707" roughness={0.12} metalness={0.1} clearcoat={1} clearcoatRoughness={0.05} />
  )
  return (
    <group position={props.position} rotation-y={props.rotationY}>
      <Interactive label="그랜드 피아노 (건반을 눌러 연주)" labelOffset={[0, 1.9, -0.8]} onActivate={() => { playPianoChord(); window.dispatchEvent(new Event('mpd-open-piano')) }}>
        <mesh position={[0, 0.62, 0]} rotation-x={-Math.PI / 2} castShadow>
          <extrudeGeometry args={[shape, { depth: 0.32, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.015, bevelSegments: 3, curveSegments: 40 }]} />
          {lacquer}
        </mesh>
        <mesh position={[0, 0.9, -0.02]} rotation-x={-Math.PI / 2}>
          <shapeGeometry args={[shape, 40]} />
          <meshStandardMaterial color="#b8894e" roughness={0.6} />
        </mesh>
        <group position={[-0.76, 0.96, 0]} rotation-z={0.55}>
          <mesh position={[0.76, 0, 0]} rotation-x={-Math.PI / 2} castShadow>
            <extrudeGeometry args={[shape, { depth: 0.02, bevelEnabled: false, curveSegments: 40 }]} />
            {lacquer}
          </mesh>
        </group>
        <mesh position={[0.62, 1.22, -0.9]} rotation-z={0.25}>
          <cylinderGeometry args={[0.012, 0.012, 0.75, 8]} />
          <meshStandardMaterial color="#111" />
        </mesh>
        {[
          [-0.66, 0.08],
          [0.66, 0.08],
          [-0.3, -1.9],
        ].map(([x, z]) => (
          <mesh key={`${x}${z}`} position={[x, 0.32, z]} castShadow>
            <cylinderGeometry args={[0.06, 0.045, 0.64, 14]} />
            {lacquer}
          </mesh>
        ))}
        <mesh position={[0, 0.2, 0.12]} castShadow>
          <boxGeometry args={[0.24, 0.4, 0.06]} />
          {lacquer}
        </mesh>
        <mesh position={[0, 0.68, 0.17]} castShadow>
          <boxGeometry args={[1.55, 0.1, 0.36]} />
          {lacquer}
        </mesh>
        <mesh position={[0, 0.96, 0.03]}>
          <boxGeometry args={[1.3, 0.12, 0.04]} />
          {lacquer}
        </mesh>
      </Interactive>
      <group position={[0, 0.74, 0.2]}>
        <Keys low={21} high={108} width={1.36} depth={0.15} onNote={(m) => playPiano(m)} />
      </group>
      <Interactive
        label="그랜드 피아노 벤치에 앉기"
        labelOffset={[0, 0.72, 0]}
        position={[0, 0, 0.85]}
        onActivate={() => props.onSeat(worldSeatPoint(props.position, props.rotationY, [0, 0, 0.93]), props.rotationY + Math.PI)}
      >
        <mesh position={[0, 0.25, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.85, 0.08, 0.36]} />
          <meshPhysicalMaterial color="#111214" roughness={0.24} clearcoat={0.85} />
        </mesh>
        <mesh position={[0, 0.3, 0]}>
          <boxGeometry args={[0.79, 0.025, 0.31]} />
          <meshStandardMaterial color="#292729" roughness={0.8} />
        </mesh>
        {[-0.38, 0.38].map((x) => (
          <mesh key={x} position={[x, 0.12, 0]} castShadow>
            <boxGeometry args={[0.05, 0.25, 0.32]} />
            {lacquer}
          </mesh>
        ))}
      </Interactive>
    </group>
  )
}

function Stand({ height, position }: { height: number; position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, height / 2, 0]}>
        <cylinderGeometry args={[0.012, 0.014, height, 8]} />
        <meshStandardMaterial {...CHROME} />
      </mesh>
      {[0, 2.1, 4.2].map((a) => (
        <mesh key={a} position={[Math.sin(a) * 0.13, 0.08, Math.cos(a) * 0.13]} rotation={[Math.cos(a) * 1.0, 0, -Math.sin(a) * 1.0]}>
          <cylinderGeometry args={[0.008, 0.008, 0.32, 6]} />
          <meshStandardMaterial {...CHROME} />
        </mesh>
      ))}
    </group>
  )
}

function Drum({ radius, depth, color = '#7a2f1c' }: { radius: number; depth: number; color?: string }) {
  return (
    <group>
      <mesh castShadow>
        <cylinderGeometry args={[radius, radius, depth, 32]} />
        <meshPhysicalMaterial color={color} roughness={0.25} metalness={0.3} clearcoat={0.9} />
      </mesh>
      {[depth / 2, -depth / 2].map((y) => (
        <mesh key={y} position={[0, y, 0]} rotation-x={Math.PI / 2}>
          <torusGeometry args={[radius, 0.012, 8, 32]} />
          <meshStandardMaterial {...CHROME} />
        </mesh>
      ))}
      <mesh position={[0, depth / 2 + 0.002, 0]} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[radius - 0.005, 32]} />
        <meshStandardMaterial color="#efeae0" roughness={0.7} />
      </mesh>
    </group>
  )
}

function Cymbal({ radius }: { radius: number }) {
  return (
    <group>
      <mesh castShadow>
        <cylinderGeometry args={[radius * 0.12, radius, 0.025, 40]} />
        <meshStandardMaterial color="#c9a24a" metalness={1} roughness={0.28} />
      </mesh>
      <mesh position={[0, 0.02, 0]}>
        <sphereGeometry args={[radius * 0.14, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#d8b25a" metalness={1} roughness={0.25} />
      </mesh>
    </group>
  )
}

function DrumKit(props: { position: [number, number, number]; rotationY: number; onSeat: SeatHandler }) {
  const headTex = useMemo(() => createDrumHeadTexture(), [])
  const bassFallback = (
    <group>
      <group position={[0, 0.36, 0]} rotation-x={Math.PI / 2}><Drum radius={0.48} depth={0.52} /></group>
      {[-0.35, 0.35].map((x) => <group key={x} position={[x, 0.95, -0.25]}><Drum radius={0.22} depth={0.28} /></group>)}
      <mesh position={[0, 0.36, 0.28]}><circleGeometry args={[0.44, 32]} /><meshStandardMaterial map={headTex} /></mesh>
    </group>
  )
  const snareFallback = <group><Stand height={0.6} position={[0, 0, 0]} /><group position={[0, 0.64, 0]}><Drum radius={0.22} depth={0.14} color="#b8b8b8" /></group></group>
  const floorTomFallback = <group><Drum radius={0.24} depth={0.48} />{[0, 2.1, 4.2].map((a) => <mesh key={a} position={[Math.sin(a) * 0.25, -0.18, Math.cos(a) * 0.25]}><cylinderGeometry args={[0.012, 0.012, 0.36, 7]} /><meshStandardMaterial {...CHROME} /></mesh>)}</group>
  return (
    <group position={props.position} rotation-y={props.rotationY}>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.006, -0.1]} receiveShadow>
        <circleGeometry args={[1.75, 56]} />
        <meshStandardMaterial color="#6a2d2d" roughness={0.98} />
      </mesh>

      <Interactive label="베이스 드럼 · 킥 테스트" labelOffset={[0, 1.55, 0.25]} position={[0, 0, 0.05]} onActivate={() => playKick()}>
        <GLBAsset url="https://cdn.3dassets.dev/assets/33793/v1/model.glb" scale={1.62} fallback={bassFallback} />
      </Interactive>

      <Interactive label="스네어 드럼" labelOffset={[0, 1.0, 0]} position={[-0.95, 0, 0.12]} onActivate={() => playSnare()}>
        <GLBAsset url="https://cdn.3dassets.dev/assets/33794/v1/model.glb" scale={1.0} fallback={snareFallback} />
      </Interactive>

      <Interactive label="플로어 탐" labelOffset={[0, 0.95, 0]} position={[0.95, 0, -0.28]} onActivate={() => playTom(98)}>
        <GLBAsset url="https://cdn.3dassets.dev/assets/33792/v1/model.glb" scale={1.12} fallback={floorTomFallback} />
      </Interactive>

      <Interactive label="하이햇 심벌" labelOffset={[0, 1.25, 0]} position={[-1.35, 0, -0.24]} onActivate={() => playHiHat(Math.random() > 0.7)}>
        <GLBAsset url="https://cdn.3dassets.dev/assets/33795/v1/model.glb" scale={1.05} fallback={<group><Stand height={0.95} position={[0, 0, 0]} /><Cymbal radius={0.2} /></group>} />
      </Interactive>

      <Interactive label="크래시 심벌" labelOffset={[0, 1.65, 0]} position={[-1.12, 0, 0.78]} onActivate={() => playCymbal('crash')}>
        <GLBAsset url="https://cdn.3dassets.dev/assets/33791/v1/model.glb" scale={1.05} fallback={<group><Stand height={1.3} position={[0, 0, 0]} /><Cymbal radius={0.25} /></group>} />
      </Interactive>

      <Interactive label="라이드 심벌" labelOffset={[0, 1.65, 0]} position={[1.32, 0, 0.72]} onActivate={() => playCymbal('ride')}>
        <GLBAsset url="https://cdn.3dassets.dev/assets/33791/v1/model.glb" scale={1.12} fallback={<group><Stand height={1.2} position={[0, 0, 0]} /><Cymbal radius={0.29} /></group>} />
      </Interactive>

      <Interactive
        label="드럼 스툴에 앉기"
        labelOffset={[0, 0.85, 0]}
        position={[0, 0, 1.35]}
        onActivate={() => props.onSeat(worldSeatPoint(props.position, props.rotationY, [0, 0, 1.35]), props.rotationY)}
      >
        <mesh position={[0, 0.25, 0]}><cylinderGeometry args={[0.02, 0.02, 0.5, 10]} /><meshStandardMaterial {...CHROME} /></mesh>
        <mesh position={[0, 0.52, 0]} castShadow><cylinderGeometry args={[0.2, 0.2, 0.1, 28]} /><meshStandardMaterial color="#151515" roughness={0.8} /></mesh>
        <mesh position={[0, 0.58, 0]}><cylinderGeometry args={[0.16, 0.16, 0.025, 28]} /><meshStandardMaterial color="#302b28" roughness={0.92} /></mesh>
      </Interactive>
    </group>
  )
}

function guitarBodyShape() {
  const s = new THREE.Shape()
  s.absellipse(0, -0.12, 0.19, 0.17, 0, Math.PI * 2, false, 0)
  const upper = new THREE.Path()
  upper.absellipse(0, 0.12, 0.15, 0.13, 0, Math.PI * 2, false, 0)
  return [s, new THREE.Shape(upper.getPoints(40))]
}

function Guitar({ position, rotationY = 0, color, kind }: { position: [number, number, number]; rotationY?: number; color: string; kind: 'bass' | 'acoustic' }) {
  const shapes = useMemo(guitarBodyShape, [])
  const label = kind === 'bass' ? '베이스 기타 · MPD Music 채널' : '어쿠스틱 기타 · MPD Music 채널'
  const openChannel = () => window.open('https://www.youtube.com/@MPD_Music', '_blank', 'noopener,noreferrer')
  const neckHeight = kind === 'bass' ? 0.9 : 0.68
  const neckY = kind === 'bass' ? 0.62 : 0.5
  const headY = kind === 'bass' ? 1.13 : 0.9
  const stringCount = kind === 'bass' ? 4 : 6
  const fallback = (
    <group position={[0, 0.42, 0]} rotation-x={-0.18}>
      {shapes.map((shape, i) => (
        <mesh key={i} position={[0, 0, -0.025]} castShadow>
          <extrudeGeometry args={[shape, { depth: 0.05, bevelEnabled: true, bevelSize: 0.01, bevelThickness: 0.01, bevelSegments: 2 }]} />
          <meshPhysicalMaterial color={color} roughness={kind === 'acoustic' ? 0.42 : 0.2} clearcoat={kind === 'acoustic' ? 0.35 : 1} />
        </mesh>
      ))}
      {kind === 'acoustic' && (
        <>
          <mesh position={[0, -0.12, 0.04]}><circleGeometry args={[0.068, 32]} /><meshStandardMaterial color="#24160e" roughness={0.9} /></mesh>
          <mesh position={[0, -0.12, 0.045]}><torusGeometry args={[0.082, 0.009, 8, 32]} /><meshStandardMaterial color="#d2ad70" metalness={0.25} roughness={0.55} /></mesh>
          <mesh position={[0, -0.28, 0.045]}><boxGeometry args={[0.18, 0.035, 0.018]} /><meshStandardMaterial color="#3a2115" roughness={0.6} /></mesh>
        </>
      )}
      <mesh position={[0, neckY, 0.01]} castShadow><boxGeometry args={[kind === 'bass' ? 0.07 : 0.055, neckHeight, 0.025]} /><meshStandardMaterial color="#c58f52" roughness={0.5} /></mesh>
      <mesh position={[0, headY, 0.01]}><boxGeometry args={[0.08, 0.16, 0.02]} /><meshStandardMaterial color="#c58f52" roughness={0.5} /></mesh>
      <mesh position={[0, -0.06, 0.04]}><boxGeometry args={[0.1, 0.03, 0.01]} /><meshStandardMaterial {...CHROME} /></mesh>
      {[-0.12, 0.02].map((y) => <mesh key={y} position={[0, y, 0.035]}><boxGeometry args={[0.08, 0.02, 0.01]} /><meshStandardMaterial color="#111" /></mesh>)}
      {Array.from({ length: stringCount }, (_, i) => {
        const x = (i / (stringCount - 1) - 0.5) * (kind === 'bass' ? 0.042 : 0.046)
        return <mesh key={`string-${i}`} position={[x, 0.39, 0.047]}><boxGeometry args={[0.0035, 1.12, 0.0035]} /><meshStandardMaterial color="#d9d4c9" metalness={0.92} roughness={0.2} /></mesh>
      })}
      {Array.from({ length: 14 }, (_, i) => {
        const fretY = 0.02 + i * 0.052
        const fretWidth = (kind === 'bass' ? 0.07 : 0.055) * (1 - i * 0.025)
        return <mesh key={`fret-${i}`} position={[0, fretY, 0.047]}><boxGeometry args={[fretWidth, 0.008, 0.006]} /><meshStandardMaterial color="#c2c4c5" metalness={0.94} roughness={0.22} /></mesh>
      })}
      <mesh position={[0, -0.27, 0.05]} castShadow><boxGeometry args={[0.21, 0.055, 0.028]} /><meshStandardMaterial color={kind === 'bass' ? '#202326' : '#3b2417'} roughness={0.42} metalness={kind === 'bass' ? 0.45 : 0.08} /></mesh>
      {kind === 'bass' && (
        <>
          {[-0.13, 0.12].map((y) => <RoundedBox key={y} args={[0.12, 0.065, 0.018]} radius={0.012} smoothness={3} position={[0, y, 0.058]}><meshStandardMaterial color="#17191b" roughness={0.48} /></RoundedBox>)}
          {[0.0, 0.15].map((y) => <mesh key={`knob-${y}`} position={[0.12, y - 0.16, 0.06]}><cylinderGeometry args={[0.025, 0.025, 0.016, 16]} /><meshStandardMaterial color="#b9b8b2" metalness={0.9} roughness={0.22} /></mesh>)}
        </>
      )}
      {kind === 'acoustic' && <mesh position={[0.035, -0.12, 0.051]} rotation-z={-0.22}><boxGeometry args={[0.22, 0.28, 0.009]} /><meshStandardMaterial color="#3c261c" roughness={0.52} /></mesh>}
      {Array.from({ length: stringCount }, (_, i) => {
        const side = i % 2 === 0 ? -1 : 1
        const row = Math.floor(i / 2)
        return <group key={`tuner-${i}`} position={[side * (kind === 'bass' ? 0.065 : 0.056), headY + 0.035 - row * 0.045, 0.015]}><mesh rotation-z={Math.PI / 2}><cylinderGeometry args={[0.012, 0.012, 0.075, 12]} /><meshStandardMaterial color="#c4c7c9" metalness={0.96} roughness={0.18} /></mesh><mesh position={[side * 0.055, 0, 0]}><boxGeometry args={[0.07, 0.035, 0.022]} /><meshStandardMaterial color="#e0e1df" metalness={0.75} roughness={0.28} /></mesh></group>
      })}
    </group>
  )
  const modelUrl = kind === 'bass'
    ? 'https://cdn.3dassets.dev/assets/33787/v1/model.glb'
    : 'https://cdn.3dassets.dev/assets/33789/v1/model.glb'

  return (
    <group position={position} rotation-y={rotationY}>
      <Interactive label={label} labelOffset={[0, 1.55, 0]} onActivate={openChannel}>
        <GLBAsset url={modelUrl} scale={1} fallback={fallback} />
      </Interactive>
    </group>
  )
}

function Amp({ position, rotationY = 0, label, onActivate }: { position: [number, number, number]; rotationY?: number; label: string; onActivate: () => void }) {
  const grille = useMemo(() => createFabricTexture('#242322'), [])
  const isBass = label.toLowerCase().includes('베이스') || label.toLowerCase().includes('bass')
  const url = isBass
    ? 'https://cdn.3dassets.dev/assets/33799/v1/model.glb'
    : 'https://cdn.3dassets.dev/assets/33798/v1/model.glb'
  const fallback = (
    <group>
      <RoundedBox args={[0.78, 0.96, 0.42]} radius={0.055} smoothness={6} position={[0, 0.49, 0]} castShadow receiveShadow>
        <meshPhysicalMaterial color="#17191b" roughness={0.67} metalness={0.16} clearcoat={0.22} />
      </RoundedBox>
      <RoundedBox args={[0.67, 0.64, 0.035]} radius={0.025} smoothness={4} position={[0, 0.4, 0.216]}>
        <meshStandardMaterial map={grille} color="#8e8980" roughness={0.98} />
      </RoundedBox>
      <mesh position={[0, 0.4, 0.238]}>
        <planeGeometry args={[0.6, 0.57]} />
        <meshStandardMaterial map={grille} color="#b0a99c" roughness={1} />
      </mesh>
      {[-0.34, 0.34].flatMap((x) => [-0.02, 0.82].map((y) => (
        <mesh key={`${x}-${y}`} position={[x, y, 0.22]}>
          <cylinderGeometry args={[0.012, 0.012, 0.012, 10]} />
          <meshStandardMaterial color="#b5b1a8" metalness={0.86} roughness={0.24} />
        </mesh>
      )))}
      <RoundedBox args={[0.78, 0.18, 0.42]} radius={0.035} smoothness={4} position={[0, 0.99, 0]} castShadow>
        <meshStandardMaterial color="#111315" roughness={0.48} metalness={0.25} />
      </RoundedBox>
      <mesh position={[0, 0.99, 0.218]}>
        <boxGeometry args={[0.7, 0.035, 0.012]} />
        <meshStandardMaterial color="#c5a16b" metalness={0.72} roughness={0.32} />
      </mesh>
      {[-0.25, -0.15, -0.05, 0.05, 0.15, 0.25].map((x, i) => (
        <group key={x} position={[x, 1.015, 0.23]}>
          <mesh><cylinderGeometry args={[0.025, 0.025, 0.024, 16]} /><meshStandardMaterial color="#c5c7c8" metalness={0.88} roughness={0.22} /></mesh>
          <mesh position={[0, 0.015, 0.013]} rotation-z={(i - 2.5) * 0.16}><boxGeometry args={[0.003, 0.018, 0.003]} /><meshStandardMaterial color="#26282a" /></mesh>
        </group>
      ))}
      <mesh position={[0.29, 0.99, 0.24]}><sphereGeometry args={[0.012, 10, 10]} /><meshStandardMaterial emissive="#ff3b2f" emissiveIntensity={3} toneMapped={false} /></mesh>
      <mesh position={[0, 0.04, 0]}><boxGeometry args={[0.7, 0.08, 0.32]} /><meshStandardMaterial color="#0f1011" roughness={0.8} /></mesh>
      {[-0.27, 0.27].map((x) => <mesh key={x} position={[x, 0.045, 0.11]}><boxGeometry args={[0.045, 0.09, 0.25]} /><meshStandardMaterial color="#0b0b0b" roughness={0.5} metalness={0.3} /></mesh>)}
    </group>
  )
  return (
    <Interactive label={label} labelOffset={[0, 1.4, 0]} position={position} rotation={[0, rotationY, 0]} onActivate={onActivate}>
      <GLBAsset url={url} scale={isBass ? 1 : 1.2} fallback={fallback} />
    </Interactive>
  )
}

function StageKeyboard({ position, rotationY }: { position: [number, number, number]; rotationY: number }) {
  return (
    <group position={position} rotation-y={rotationY}>
      {[-0.45, 0.45].map((x) => (
        <group key={x} position={[x, 0.4, 0]}>
          <mesh rotation-x={0.55}>
            <boxGeometry args={[0.03, 0.9, 0.03]} />
            <meshStandardMaterial color="#222" metalness={0.6} />
          </mesh>
          <mesh rotation-x={-0.55}>
            <boxGeometry args={[0.03, 0.9, 0.03]} />
            <meshStandardMaterial color="#222" metalness={0.6} />
          </mesh>
        </group>
      ))}
      <Interactive label="로즈 피아노 (건반 클릭)" labelOffset={[0, 0.6, 0]} onActivate={() => { [52, 55, 59, 62].forEach((m, i) => playRhodes(m, i * 0.03)); window.dispatchEvent(new Event('mpd-open-piano')) }} position={[0, 0.82, 0]}>
        <mesh castShadow>
          <boxGeometry args={[1.3, 0.12, 0.36]} />
          <meshStandardMaterial color="#b8312b" roughness={0.45} />
        </mesh>
        <mesh position={[0, 0.07, -0.13]}>
          <boxGeometry args={[1.3, 0.04, 0.1]} />
          <meshStandardMaterial color="#141414" />
        </mesh>
      </Interactive>
      <group position={[0, 0.89, 0.05]}>
        <Keys low={36} high={96} width={1.2} depth={0.2} onNote={(m) => playRhodes(m)} />
      </group>
    </group>
  )
}

function MicStand({ position, rotationY = 0 }: { position: [number, number, number]; rotationY?: number }) {
  return (
    <group position={position} rotation-y={rotationY}>
      <Stand height={1.35} position={[0, 0, 0]} />
      <group position={[0, 1.35, 0]} rotation-z={-0.9}>
        <mesh position={[0, 0.4, 0]}>
          <cylinderGeometry args={[0.01, 0.01, 1.0, 6]} />
          <meshStandardMaterial {...CHROME} />
        </mesh>
        <mesh position={[0, -0.12, 0]}>
          <sphereGeometry args={[0.05, 12, 12]} />
          <meshStandardMaterial color="#222" metalness={0.8} />
        </mesh>
        <group position={[0, 0.92, 0]} rotation-z={0.9}>
          <mesh position={[0, -0.08, 0]} castShadow>
            <cylinderGeometry args={[0.03, 0.025, 0.18, 16]} />
            <meshStandardMaterial color="#c9c3b5" metalness={0.9} roughness={0.25} />
          </mesh>
          <mesh position={[0, 0.03, 0]}>
            <sphereGeometry args={[0.032, 16, 16]} />
            <meshStandardMaterial color="#8a857a" metalness={0.8} roughness={0.5} />
          </mesh>
        </group>
      </group>
    </group>
  )
}

export function Instruments({ onSeat }: { onSeat: SeatHandler }) {
  return (
    <group>
      <GrandPiano position={[-6.2, 0, 3.4]} rotationY={0.75} onSeat={onSeat} />
      <DrumKit position={[5.6, 0, 3.6]} rotationY={-2.4} onSeat={onSeat} />
      <Amp position={[9.6, 0, 6.4]} rotationY={-2.4} label="기타 앰프" onActivate={() => strumGuitar()} />
      <Amp position={[8.2, 0, 7.6]} rotationY={-2.7} label="베이스 앰프" onActivate={() => playKick()} />
      <Guitar position={[9.0, 0, 5.2]} rotationY={-2.2} color="#172b2b" kind="bass" />
      <Guitar position={[10.4, 0, 4.4]} rotationY={-2.0} color="#b8793e" kind="acoustic" />
      <StageKeyboard position={[-9.6, 0, -0.6]} rotationY={1.3} />
    </group>
  )
}
