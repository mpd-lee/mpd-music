'use client'

import { Html } from '@react-three/drei'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useRef, useState, type ReactNode } from 'react'
import type { Group } from 'three'

export const CLICK_DRAG_TOLERANCE = 6

type InteractiveProps = {
  label: string
  onActivate: (event: ThreeEvent<MouseEvent>) => void
  children: ReactNode
  labelOffset?: [number, number, number]
  position?: [number, number, number]
  rotation?: [number, number, number]
}

export function Interactive({ label, onActivate, children, labelOffset = [0, 1, 0], position, rotation }: InteractiveProps) {
  const [hovered, setHovered] = useState(false)
  const inner = useRef<Group>(null)
  const pulse = useRef(0)

  useFrame((_, dt) => {
    if (!inner.current || pulse.current <= 0) return
    pulse.current = Math.max(0, pulse.current - dt * 5)
    inner.current.scale.setScalar(1 + Math.sin(pulse.current * Math.PI) * 0.03)
  })

  return (
    <group position={position} rotation={rotation}>
      <group
        ref={inner}
        onPointerOver={(e) => {
          e.stopPropagation()
          setHovered(true)
          document.body.style.cursor = 'pointer'
        }}
        onPointerOut={() => {
          setHovered(false)
          document.body.style.cursor = 'auto'
        }}
        onClick={(e) => {
          e.stopPropagation()
          if (e.delta > CLICK_DRAG_TOLERANCE) return
          pulse.current = 1
          onActivate(e)
        }}
      >
        {children}
      </group>
      {hovered && (
        <Html position={labelOffset} center style={{ pointerEvents: 'none' }} zIndexRange={[20, 0]}>
          <div className="whitespace-nowrap rounded-full border border-white/15 bg-neutral-950/80 px-3 py-1 text-xs font-medium text-amber-100 shadow-lg backdrop-blur">
            {label}
          </div>
        </Html>
      )}
    </group>
  )
}
