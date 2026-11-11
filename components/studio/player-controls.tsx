'use client'

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { ArrowDown, ArrowUp, Joystick } from 'lucide-react'

type Vector = { x: number; z: number; y?: number }
type Props = { onMove: (value: Vector) => void; underwater?: boolean }

const ZERO: Vector = { x: 0, z: 0 }

export function PlayerControls({ onMove, underwater = false }: Props) {
  const baseRef = useRef<HTMLDivElement>(null)
  const keys = useRef(new Set<string>())
  const stick = useRef<Vector>(ZERO)
  const vertical = useRef(0)
  const activePointer = useRef<number | null>(null)
  const [thumb, setThumb] = useState({ x: 0, y: 0 })

  const publish = useCallback(() => {
    const keyX = (keys.current.has('d') || keys.current.has('arrowright') ? 1 : 0)
      - (keys.current.has('a') || keys.current.has('arrowleft') ? 1 : 0)
    const keyZ = (keys.current.has('s') || keys.current.has('arrowdown') ? 1 : 0)
      - (keys.current.has('w') || keys.current.has('arrowup') ? 1 : 0)
    let x = keyX + stick.current.x
    let z = keyZ + stick.current.z
    const length = Math.hypot(x, z)
    if (length > 1) { x /= length; z /= length }
    const y = underwater ? vertical.current : 0
    onMove(length < 0.04 && Math.abs(y) < 0.04 ? ZERO : { x, z, y })
  }, [onMove, underwater])

  useEffect(() => {
    if (!underwater) vertical.current = 0
    const movementKeys = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'])
    const isTyping = (target: EventTarget | null) => {
      const element = target as HTMLElement | null
      return Boolean(element && (element.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName)))
    }
    const down = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase()
      if (isTyping(event.target) || document.body.dataset.mpdPianoOpen === 'true') return
      if (underwater && (event.code === 'Space' || key === 'shift')) {
        event.preventDefault()
        vertical.current = event.code === 'Space' ? 1 : -1
        publish()
        return
      }
      if (!movementKeys.has(key)) return
      event.preventDefault()
      keys.current.add(key)
      publish()
    }
    const up = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase()
      if (underwater && (event.code === 'Space' || key === 'shift')) { vertical.current = 0; publish(); return }
      if (!movementKeys.has(key)) return
      keys.current.delete(key)
      publish()
    }
    const blur = () => { keys.current.clear(); stick.current = ZERO; vertical.current = 0; setThumb({ x: 0, y: 0 }); publish() }
    window.addEventListener('keydown', down, { passive: false })
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
      onMove(ZERO)
    }
  }, [onMove, publish, underwater])

  const updateStick = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = baseRef.current?.getBoundingClientRect()
    if (!rect) return
    const radius = Math.min(rect.width, rect.height) * 0.34
    let x = (event.clientX - (rect.left + rect.width / 2)) / radius
    let y = (event.clientY - (rect.top + rect.height / 2)) / radius
    const length = Math.hypot(x, y)
    if (length > 1) { x /= length; y /= length }
    stick.current = { x, z: y }
    setThumb({ x: x * radius * 0.78, y: y * radius * 0.78 })
    publish()
  }

  const stopStick = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (activePointer.current !== event.pointerId) return
    activePointer.current = null
    stick.current = ZERO
    setThumb({ x: 0, y: 0 })
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    publish()
  }

  const setDiveAxis = (value: number) => {
    vertical.current = value
    publish()
  }

  return (
    <>
      <div className="mpd-desktop-move-hint" aria-hidden="true">
        <span>W A S D</span> 또는 방향키로 이동 · 마우스로 바닥을 누르면 해당 위치로 이동
      </div>
      <div className="mpd-mobile-controls" aria-label="모바일 이동 조이스틱">
        <div
          ref={baseRef}
          className="mpd-joystick-base"
          onPointerDown={(event) => {
            activePointer.current = event.pointerId
            event.currentTarget.setPointerCapture(event.pointerId)
            updateStick(event)
          }}
          onPointerMove={(event) => { if (activePointer.current === event.pointerId) updateStick(event) }}
          onPointerUp={stopStick}
          onPointerCancel={stopStick}
          onLostPointerCapture={(event) => { if (activePointer.current === event.pointerId) stopStick(event) }}
          title="손가락으로 밀어 이동"
        >
          <span className="mpd-joystick-ring" />
          <span className="mpd-joystick-thumb" style={{ transform: `translate(${thumb.x}px, ${thumb.y}px)` }}>
            <Joystick size={22} strokeWidth={1.8} />
          </span>
          <span className="mpd-joystick-caption">MOVE</span>
        </div>
        {underwater && (
          <div className="mpd-dive-axis" aria-label="수중 위아래 이동">
            <button type="button" onPointerDown={(event) => { event.preventDefault(); setDiveAxis(1) }} onPointerUp={() => setDiveAxis(0)} onPointerCancel={() => setDiveAxis(0)} onPointerLeave={() => setDiveAxis(0)}><ArrowUp size={16} /> 상승</button>
            <button type="button" onPointerDown={(event) => { event.preventDefault(); setDiveAxis(-1) }} onPointerUp={() => setDiveAxis(0)} onPointerCancel={() => setDiveAxis(0)} onPointerLeave={() => setDiveAxis(0)}><ArrowDown size={16} /> 하강</button>
            <small>PC: Space / Shift</small>
          </div>
        )}
      </div>
    </>
  )
}
