'use client'

import { useMemo } from 'react'
import { Html, RoundedBox } from '@react-three/drei'
import * as THREE from 'three'
import { createFabricTexture } from '@/lib/textures'
import { Interactive } from './interactive'

type SeatHandler = (position: [number, number, number], rotationY: number) => void

function Sofa({ position, side, rotationY = 0, length = 5.8, onSit }: { position: [number, number, number]; side: string; rotationY?: number; length?: number; onSit: SeatHandler }) {
  const upholstery = useMemo(() => createFabricTexture('#54463d'), [])
  const cushion = useMemo(() => createFabricTexture('#806b59'), [])
  const pillow = useMemo(() => createFabricTexture('#b7a58e'), [])
  const seatCount = 5
  const seatSpacing = length / seatCount
  const seatWidth = seatSpacing - 0.1
  const seatXs = Array.from({ length: seatCount }, (_, index) => -length / 2 + seatSpacing * (index + 0.5))

  const sitAtSeat = (seatX: number) => {
    const worldOffset = new THREE.Vector3(seatX, 0, 0.43).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotationY)
    onSit([position[0] + worldOffset.x, 0, position[2] + worldOffset.z], rotationY)
  }

  return (
    <group position={position} rotation-y={rotationY}>
      {/* One continuous premium sofa, with five clearly separated cushions. */}
      <group>
        <RoundedBox args={[length, 0.28, 1.2]} radius={0.12} smoothness={7} position={[0, 0.25, 0]} castShadow receiveShadow>
          <meshStandardMaterial color="#38291f" roughness={0.62} />
        </RoundedBox>
        <RoundedBox args={[length - 0.2, 0.16, 1.05]} radius={0.07} smoothness={6} position={[0, 0.43, 0.025]} castShadow>
          <meshStandardMaterial color="#a47c52" roughness={0.48} />
        </RoundedBox>
        <RoundedBox args={[length - 0.3, 0.72, 0.28]} radius={0.13} smoothness={8} position={[0, 0.88, -0.43]} castShadow>
          <meshStandardMaterial map={upholstery} color="#9b8572" roughness={0.96} />
        </RoundedBox>

        {seatXs.map((x, index) => (
          <group key={`seat-${index}`} position={[x, 0, 0]}>
            <RoundedBox args={[seatWidth, 0.24, 0.76]} radius={0.11} smoothness={7} position={[0, 0.57, 0.1]} castShadow receiveShadow>
              <meshStandardMaterial map={cushion} color="#b09a82" roughness={0.98} />
            </RoundedBox>
            <RoundedBox args={[seatWidth * 0.98, 0.61, 0.23]} radius={0.11} smoothness={7} position={[0, 0.9, -0.25]} castShadow>
              <meshStandardMaterial map={upholstery} color="#a18b77" roughness={0.96} />
            </RoundedBox>
            {index === 0 || index === seatCount - 1 ? (
              <RoundedBox args={[0.46, 0.34, 0.16]} radius={0.08} smoothness={6} position={[0, 1.16, -0.22]} rotation-z={index === 0 ? -0.1 : 0.1} castShadow>
                <meshStandardMaterial map={pillow} color="#c8b69d" roughness={0.98} />
              </RoundedBox>
            ) : null}
          </group>
        ))}

        {[-1, 1].map((direction) => (
          <group key={`arm-${direction}`} position={[direction * (length / 2 - 0.18), 0, 0]}>
            <RoundedBox args={[0.34, 0.78, 1.14]} radius={0.14} smoothness={8} position={[0, 0.61, 0]} castShadow>
              <meshStandardMaterial map={upholstery} color="#8c7765" roughness={0.95} />
            </RoundedBox>
            <RoundedBox args={[0.36, 0.12, 0.92]} radius={0.065} smoothness={6} position={[0, 1.02, 0.01]}>
              <meshStandardMaterial color="#392a20" roughness={0.58} />
            </RoundedBox>
          </group>
        ))}

        {[-length / 2 + 0.38, -length / 4, 0, length / 4, length / 2 - 0.38].map((x, index) => (
          <group key={`leg-${index}`} position={[x, 0.12, 0.39]}>
            <mesh castShadow>
              <cylinderGeometry args={[0.045, 0.06, 0.22, 18]} />
              <meshStandardMaterial color="#221a15" metalness={0.2} roughness={0.5} />
            </mesh>
            <mesh position={[0, -0.08, 0]}>
              <cylinderGeometry args={[0.06, 0.06, 0.018, 18]} />
              <meshStandardMaterial color="#9a784f" metalness={0.6} roughness={0.32} />
            </mesh>
          </group>
        ))}
      </group>

      {/* Each transparent hit area is independent, so five avatars can occupy five seats. */}
      {seatXs.map((seatX, index) => (
        <Interactive
          key={`seat-hit-${index}`}
          position={[seatX, 0.78, 0.1]}
          label={`${side} 쇼파 ${index + 1}번 좌석에 앉기`}
          labelOffset={[0, 0.85, 0.1]}
          onActivate={() => sitAtSeat(seatX)}
        >
          <mesh>
            <boxGeometry args={[seatWidth * 0.9, 0.38, 0.72]} />
            <meshBasicMaterial transparent opacity={0} colorWrite={false} depthWrite={false} />
          </mesh>
        </Interactive>
      ))}
    </group>
  )
}

function VintageMicrophone({ position, onActivate }: { position: [number, number, number]; onActivate: () => void }) {
  return (
    <group position={position}>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.012, 0]} receiveShadow>
        <circleGeometry args={[0.48, 56]} />
        <meshStandardMaterial color="#171717" roughness={0.94} />
      </mesh>
      <Interactive label="클래식 보컬 마이크 · 샘플 음성 재생" labelOffset={[0, 2.5, 0]} onActivate={onActivate}>
        <group>
          {/* Weighted vintage tripod base and polished support column. */}
          <mesh position={[0, 0.1, 0]} castShadow>
            <cylinderGeometry args={[0.28, 0.34, 0.16, 40]} />
            <meshPhysicalMaterial color="#24272a" metalness={0.82} roughness={0.22} />
          </mesh>
          <mesh position={[0, 0.19, 0]}>
            <torusGeometry args={[0.28, 0.018, 10, 44]} />
            <meshStandardMaterial color="#c4a36d" metalness={0.9} roughness={0.2} />
          </mesh>
          <mesh position={[0, 0.88, 0]} castShadow>
            <cylinderGeometry args={[0.035, 0.055, 1.28, 20]} />
            <meshPhysicalMaterial color="#b5b9bb" metalness={0.94} roughness={0.19} />
          </mesh>
          <mesh position={[0, 1.5, 0]}>
            <cylinderGeometry args={[0.075, 0.075, 0.08, 24]} />
            <meshStandardMaterial color="#292d31" metalness={0.8} roughness={0.24} />
          </mesh>
          {/* Shock-mount cradle with suspended arms. */}
          <group position={[0, 1.78, 0]}>
            <mesh rotation-x={Math.PI / 2}>
              <torusGeometry args={[0.3, 0.025, 12, 48]} />
              <meshPhysicalMaterial color="#b99a66" metalness={0.9} roughness={0.2} />
            </mesh>
            {[-1, 1].map((side) => (
              <mesh key={side} position={[side * 0.23, -0.12, 0]} rotation-z={side * 0.36}>
                <cylinderGeometry args={[0.012, 0.018, 0.46, 10]} />
                <meshStandardMaterial color="#b99a66" metalness={0.88} roughness={0.2} />
              </mesh>
            ))}
            {/* Large-diaphragm capsule: champagne body, dark grille and fine gold rings. */}
            <mesh position={[0, 0.14, 0]} castShadow>
              <capsuleGeometry args={[0.2, 0.48, 12, 28]} />
              <meshPhysicalMaterial color="#b89a69" metalness={0.88} roughness={0.22} clearcoat={0.9} />
            </mesh>
            <mesh position={[0, 0.49, 0]}>
              <sphereGeometry args={[0.19, 32, 24, 0, Math.PI * 2, 0, Math.PI / 2]} />
              <meshStandardMaterial color="#202326" metalness={0.72} roughness={0.28} />
            </mesh>
            {[-0.02, 0.08, 0.18, 0.28, 0.38].map((y) => (
              <mesh key={y} position={[0, y, 0]} rotation-x={Math.PI / 2}>
                <torusGeometry args={[0.198, 0.009, 7, 40]} />
                <meshStandardMaterial color="#e0c18a" metalness={0.9} roughness={0.18} />
              </mesh>
            ))}
            {Array.from({ length: 12 }, (_, index) => {
              const angle = (index / 12) * Math.PI * 2
              return (
                <mesh key={`grille-${index}`} position={[Math.cos(angle) * 0.188, 0.18, Math.sin(angle) * 0.188]} rotation-y={-angle}>
                  <boxGeometry args={[0.012, 0.34, 0.008]} />
                  <meshStandardMaterial color="#2d3033" metalness={0.78} roughness={0.32} />
                </mesh>
              )
            })}
            <mesh position={[0, -0.23, 0]}>
              <cylinderGeometry args={[0.14, 0.17, 0.1, 32]} />
              <meshStandardMaterial color="#292d31" metalness={0.78} roughness={0.22} />
            </mesh>
            <mesh position={[0, 0.13, 0.205]}>
              <circleGeometry args={[0.055, 24]} />
              <meshStandardMaterial color="#181b1d" metalness={0.6} roughness={0.26} />
            </mesh>
            <mesh position={[0, 0.13, 0.211]}>
              <torusGeometry args={[0.055, 0.006, 6, 24]} />
              <meshStandardMaterial color="#e0c18a" metalness={0.9} roughness={0.18} />
            </mesh>
          </group>
        </group>
      </Interactive>
      <Html position={[0, 2.55, 0]} center distanceFactor={9} style={{ pointerEvents: 'none' }}>
        <div className="whitespace-nowrap rounded-full border border-amber-200/25 bg-neutral-950/85 px-3 py-1 text-[10px] font-semibold tracking-wide text-amber-100 backdrop-blur">VINTAGE VOCAL MIC · CLICK TO PLAY SAMPLE</div>
      </Html>
    </group>
  )
}

export function StudioFurniture({ onSeat }: { onSeat: SeatHandler; onRest?: SeatHandler }) {
  const playMicSample = () => {
    const audio = new Audio('/audio/vocal-demo-synth.wav')
    audio.volume = 0.7
    void audio.play().catch(() => {})
  }
  return (
    <group>
      {/* Two long sofas run along the side glass walls, facing inward. Each has five separate seats. */}
      <Sofa position={[-11.35, 0, 0]} side="왼쪽 유리벽" rotationY={Math.PI / 2} length={5.8} onSit={onSeat} />
      <Sofa position={[11.35, 0, 0]} side="오른쪽 유리벽" rotationY={-Math.PI / 2} length={5.8} onSit={onSeat} />

      {/* Premium vocal rug and a large vintage condenser microphone, clear of the rear exit. */}
      <group position={[-3.75, 0, 5.25]}>
        <mesh rotation-x={-Math.PI / 2} position={[0, 0.012, 0]} receiveShadow>
          <planeGeometry args={[4.15, 2.9]} />
          <meshStandardMaterial color="#542b32" roughness={0.98} />
        </mesh>
        <mesh rotation-x={-Math.PI / 2} position={[0, 0.018, 0]}>
          <ringGeometry args={[1.28, 1.36, 64]} />
          <meshStandardMaterial color="#c6a36c" metalness={0.35} roughness={0.55} />
        </mesh>
        {[-2.02, 2.02].map((x) => (
          <mesh key={x} position={[x, 0.025, 0]}>
            <boxGeometry args={[0.035, 0.025, 2.82]} />
            <meshStandardMaterial color="#c6a36c" metalness={0.4} roughness={0.5} />
          </mesh>
        ))}
        {[-1.38, 1.38].map((z) => (
          <mesh key={z} position={[0, 0.025, z]}>
            <boxGeometry args={[4.02, 0.025, 0.035]} />
            <meshStandardMaterial color="#c6a36c" metalness={0.4} roughness={0.5} />
          </mesh>
        ))}
      </group>
      <VintageMicrophone position={[-5.15, 0, 2.35]} onActivate={playMicSample} />
    </group>
  )
}
