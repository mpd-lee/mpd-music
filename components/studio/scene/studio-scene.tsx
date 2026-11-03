'use client';

import { Environment, OrbitControls } from '@react-three/drei';
import { Canvas, type ThreeEvent } from '@react-three/fiber';
import { Suspense, useCallback, useState, useEffect } from 'react';
import * as THREE from 'three';
import type { GuestEntry } from '@/lib/use-guestbook';
import type { StudioPlayer } from '@/lib/use-multiplayer';
import { AVATAR_START, Avatar, RemoteAvatar, TargetMarker } from './avatar';
import { CandleBench } from './candles';
import { ControlRoom } from './control-room';
import { CLICK_DRAG_TOLERANCE } from './interactive';
import { Instruments } from './instruments';
import { Outdoor, SUN_POSITION } from './outdoor';
import { ROOM, Room } from './room';
import { StudioFurniture } from './studio-furniture';

const INTERIOR_LIGHTS: [number, number, number][] = [
  [-7.5, 6.8, -3],
  [0, 7.1, -3],
  [7.5, 6.8, -3],
  [-7.5, 6.8, 4],
  [0, 7.1, 4],
  [7.5, 6.8, 4],
];

type TravelAction = { position: THREE.Vector3; sit: boolean; lie?: boolean; rotationY?: number };
type SeatHandler = (position: [number, number, number], rotationY: number) => void;
type RestHandler = (position: [number, number, number], rotationY: number) => void;

export function StudioScene({
  entries,
  resetKey,
  players,
  onLocalPosition,
  onSelectPlayer,
}: {
  entries: GuestEntry[];
  resetKey: number;
  players: StudioPlayer[];
  onLocalPosition: (position: [number, number, number], rotationY: number) => void;
  onSelectPlayer: (target: { userId: string; name: string }) => void;
}) {
  const [travel, setTravel] = useState<TravelAction | null>(null);
  const target = travel?.position ?? null;

  // 시간대 자동 연동 (오후 6시 ~ 오전 6시 야간 모드 적용)
  const [isNight, setIsNight] = useState(false);
  useEffect(() => {
    const checkHour = () => {
      const hour = new Date().getHours();
      setIsNight(hour < 6 || hour >= 18);
    };
    checkHour();
    const timer = setInterval(checkHour, 60000);
    return () => clearInterval(timer);
  }, []);

  const handleFloorClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.delta > CLICK_DRAG_TOLERANCE) return;
    const margin = 0.6;
    setTravel({
      position: new THREE.Vector3(
        THREE.MathUtils.clamp(e.point.x, -ROOM.halfX + margin, ROOM.halfX - margin),
        0,
        THREE.MathUtils.clamp(e.point.z, -ROOM.halfZ + margin, ROOM.halfZ - margin),
      ),
      sit: false,
    });
  }, []);

  const handlePathClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.delta > CLICK_DRAG_TOLERANCE) return;
    let x = THREE.MathUtils.clamp(e.point.x, -35.5, 35.5);
    let z = THREE.MathUtils.clamp(e.point.z, 9.35, 84.0);
    const poolLocalZ = z - 17;
    if (Math.abs(x) < 8.15 && Math.abs(poolLocalZ) < 4.25) {
      setTravel({ position: new THREE.Vector3(x, 0.06, z), sit: false });
      return;
    }
    setTravel({ position: new THREE.Vector3(x, 0, z), sit: false });
  }, []);

  const handleSeat: SeatHandler = useCallback((position: [number, number, number], rotationY: number) => {
    setTravel({ position: new THREE.Vector3(position[0], 0, position[2]), sit: true, rotationY });
  }, []);

  const handleRest: RestHandler = useCallback((position: [number, number, number], rotationY: number) => {
    setTravel({ position: new THREE.Vector3(position[0], 0, position[2]), sit: false, lie: true, rotationY });
  }, []);

  return (
    <Canvas
      shadows
      dpr={[1, 1.75]}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05 }}
      camera={{ position: [AVATAR_START.x, 3, AVATAR_START.z + 5.5], fov: 58, near: 0.1, far: 5000 }}
      onPointerMissed={() => {
        document.body.style.cursor = 'auto';
      }}
    >
      {/* 주야간에 따른 안개(Fog) 색상 자동 연동 */}
      <fog attach="fog" args={[isNight ? '#0b1329' : '#c7d2c3', 115, 620]} />
      
      {/* 주야간에 따른 메인 조명 및 태양광/달빛 자동 연동 */}
      <ambientLight intensity={isNight ? 0.35 : 0.42} color={isNight ? '#334466' : '#fff2df'} />
      <hemisphereLight args={[isNight ? '#112244' : '#e5efff', isNight ? '#222233' : '#695b43', isNight ? 0.5 : 0.82]} />
      <directionalLight
        position={SUN_POSITION}
        intensity={isNight ? 0.4 : 2.15}
        color={isNight ? '#7799bb' : '#fff0d9'}
        castShadow
        shadow-mapSize={[3072, 3072]}
        shadow-camera-left={-16}
        shadow-camera-right={16}
        shadow-camera-top={16}
        shadow-camera-bottom={-16}
        shadow-camera-near={1}
        shadow-camera-far={300}
        shadow-bias={-0.00035}
        shadow-normalBias={0.025}
      />
      {INTERIOR_LIGHTS.map((p, i) => (
        <pointLight key={i} position={p} intensity={isNight ? 18 : 14} distance={13} decay={2} color={isNight ? '#ffcc88' : '#ffdcb0'} />
      ))}

      <Suspense fallback={null}>
        <Environment preset={isNight ? 'night' : 'park'} environmentIntensity={isNight ? 0.3 : 0.55} />
        <Outdoor onPathClick={handlePathClick} onSeat={handleSeat} />
        <Room onFloorClick={handleFloorClick} />
        <ControlRoom onSit={handleSeat} />
        <Instruments onSeat={handleSeat} />
        <StudioFurniture onSeat={handleSeat} onRest={handleRest} />
        <CandleBench entries={entries} />
        <Avatar
          target={target}
          sitOnArrival={travel?.sit ?? false}
          lieOnArrival={travel?.lie ?? false}
          seatRotation={travel?.rotationY}
          onArrive={() => setTravel(null)}
          onMove={onLocalPosition}
          resetKey={resetKey}
        />
        {players.map((player) => (
          <RemoteAvatar key={player.userId} player={player} onSelect={onSelectPlayer} />
        ))}
        <TargetMarker target={target} />
      </Suspense>

      <OrbitControls
        makeDefault
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        rotateSpeed={0.6}
        minDistance={2.2}
        maxDistance={52}
        minPolarAngle={1.08}
        maxPolarAngle={1.34}
        target={[AVATAR_START.x, 1.65, 0.8]}
      />
    </Canvas>
  );
}