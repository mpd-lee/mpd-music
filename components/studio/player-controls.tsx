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
  const lastPublished = useRef<Vector>(ZERO)
  const activePointer = useRef<number | null>(null)
  const axisPressStartedAt = useRef(0)
  const axisReleaseTimer = useRef<number | null>(null)
  const joystickPressStartedAt = useRef(0)
  const joystickMoved = useRef(false)
  const joystickReleaseTimer = useRef<number | null>(null)
  const [thumb, setThumb] = useState({ x: 0, y: 0 })

  const publish = useCallback(() => {
    const keyX = (keys.current.has('KeyD') || keys.current.has('ArrowRight') ? 1 : 0)
      - (keys.current.has('KeyA') || keys.current.has('ArrowLeft') ? 1 : 0)
    const keyZ = (keys.current.has('KeyS') || (!underwater && keys.current.has('ArrowDown')) ? 1 : 0)
      - (keys.current.has('KeyW') || (!underwater && keys.current.has('ArrowUp')) ? 1 : 0)
    let x = keyX + stick.current.x
    let z = keyZ + stick.current.z
    const length = Math.hypot(x, z)
    if (length > 1) { x /= length; z /= length }
    const y = underwater ? vertical.current : 0
    const next = length < 0.018 && Math.abs(y) < 0.018 ? ZERO : { x, z, y }
    // Publish every control transition. Do not suppress small but intentional
    // joystick movements; the Avatar applies its own 3D movement dead-zone.
    lastPublished.current = next
    onMove(next)
  }, [onMove, underwater])

  useEffect(() => {
    // A pool-to-underwater transition must not inherit a stale joystick/key press.
    keys.current.clear()
    stick.current = ZERO
    vertical.current = 0
    lastPublished.current = ZERO
    activePointer.current = null
    setThumb({ x: 0, y: 0 })
    onMove(ZERO)
    const movementCodes = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'])
    const isTyping = (target: EventTarget | null) => {
      const element = target as HTMLElement | null
      return Boolean(element && (element.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName)))
    }
    const down = (event: KeyboardEvent) => {
      const code = event.code
      if (isTyping(event.target) || document.body.dataset.mpdPianoOpen === 'true') return
      if (underwater && (code === 'Space' || code === 'ShiftLeft' || code === 'ArrowUp' || code === 'ArrowDown')) {
        event.preventDefault()
        vertical.current = (code === 'Space' || code === 'ArrowUp') ? 1 : -1
        publish()
        return
      }
      if (!movementCodes.has(code)) return
      event.preventDefault()
      keys.current.add(code)
      publish()
    }
    const up = (event: KeyboardEvent) => {
      const code = event.code
      if (underwater && (code === 'Space' || code === 'ShiftLeft' || code === 'ArrowUp' || code === 'ArrowDown')) {
        vertical.current = 0
        keys.current.delete(code)
        publish()
        return
      }
      if (!movementCodes.has(code)) return
      keys.current.delete(code)
      publish()
    }
    const blur = () => {
      keys.current.clear()
      stick.current = ZERO
      vertical.current = 0
      setThumb({ x: 0, y: 0 })
      publish()
    }
    window.addEventListener('keydown', down, { passive: false })
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => {
      if (axisReleaseTimer.current !== null) window.clearTimeout(axisReleaseTimer.current)
      if (joystickReleaseTimer.current !== null) window.clearTimeout(joystickReleaseTimer.current)
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
    if (length > 0.12) joystickMoved.current = true
    setThumb({ x: x * radius * 0.78, y: y * radius * 0.78 })
    publish()
  }

  const stopStick = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (activePointer.current !== event.pointerId) return
    activePointer.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    if (joystickReleaseTimer.current !== null) window.clearTimeout(joystickReleaseTimer.current)
    // A simple tap on the joystick gives a short forward swim nudge; dragging
    // remains continuous 360-degree steering. This avoids a dead-feeling center tap.
    if (!joystickMoved.current && underwater) {
      stick.current = { x: 0, z: -0.92 }
      publish()
      joystickReleaseTimer.current = window.setTimeout(() => {
        stick.current = ZERO
        setThumb({ x: 0, y: 0 })
        publish()
        joystickReleaseTimer.current = null
      }, Math.max(700, 1250 - (performance.now() - joystickPressStartedAt.current)))
    } else {
      stick.current = ZERO
      setThumb({ x: 0, y: 0 })
      publish()
    }
  }

  const setDiveAxis = (value: number) => {
    vertical.current = value
    publish()
  }
  const startDiveAxis = (event: ReactPointerEvent<HTMLButtonElement>, value: number) => {
    event.preventDefault()
    event.stopPropagation()
    if (axisReleaseTimer.current !== null) {
      window.clearTimeout(axisReleaseTimer.current)
      axisReleaseTimer.current = null
    }
    axisPressStartedAt.current = performance.now()
    try { event.currentTarget.setPointerCapture(event.pointerId) } catch { /* browser may already own the pointer */ }
    setDiveAxis(value)
  }
  const stopDiveAxis = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const elapsed = performance.now() - axisPressStartedAt.current
    const minimumTapMs = 520
    const release = () => {
      setDiveAxis(0)
      axisReleaseTimer.current = null
      axisPressStartedAt.current = 0
    }
    if (axisReleaseTimer.current === null && elapsed > 0 && elapsed < minimumTapMs) {
      axisReleaseTimer.current = window.setTimeout(release, minimumTapMs - elapsed)
    } else if (axisReleaseTimer.current === null) {
      release()
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const handleDiveLostCapture = () => {
    // pointerup has already scheduled or completed the minimum tap pulse.
    // Only stop if the browser unexpectedly revoked capture while still pressed.
    if (axisReleaseTimer.current !== null || axisPressStartedAt.current === 0) return
    setDiveAxis(0)
    axisPressStartedAt.current = 0
  }

  return (
    <>
      <div className="mpd-desktop-move-hint" aria-hidden="true">
        {underwater
          ? <><span>W A S D</span> 수평 수영 · <span>↑ / Space</span> 상승 · <span>↓ / Left Shift</span> 하강 · 화면 위/아래 터치로 깊이 이동</>
          : <><span>W A S D</span> 또는 방향키로 이동 · 마우스로 바닥을 누르면 해당 위치로 이동</>}
      </div>
      <div className="mpd-mobile-controls" aria-label="모바일 이동 조이스틱">
        <div
          ref={baseRef}
          data-mpd-joystick="true"
          className="mpd-joystick-base"
          style={{ touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none', pointerEvents: 'auto' }}
          onContextMenu={(event) => event.preventDefault()}
          onPointerDown={(event) => {
            event.preventDefault()
            event.stopPropagation()
            if (activePointer.current !== null) return
            activePointer.current = event.pointerId
            joystickPressStartedAt.current = performance.now()
            joystickMoved.current = false
            if (joystickReleaseTimer.current !== null) {
              window.clearTimeout(joystickReleaseTimer.current)
              joystickReleaseTimer.current = null
            }
            try { event.currentTarget.setPointerCapture(event.pointerId) } catch { /* browser may already own the pointer */ }
            updateStick(event)
            publish()
          }}
          onPointerMove={(event) => {
            if (activePointer.current !== event.pointerId) return
            event.preventDefault()
            event.stopPropagation()
            updateStick(event)
          }}
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
          <div className="mpd-dive-axis" aria-label="수중 위아래 이동" style={{ touchAction: 'none', pointerEvents: 'auto' }}>
            <button type="button" data-mpd-dive-axis="up" style={{ touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none' }} onPointerDown={(event) => startDiveAxis(event, 1)} onPointerUp={stopDiveAxis} onPointerCancel={stopDiveAxis} onLostPointerCapture={handleDiveLostCapture}><ArrowUp size={13} /> 상승</button>
            <button type="button" data-mpd-dive-axis="down" style={{ touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none' }} onPointerDown={(event) => startDiveAxis(event, -1)} onPointerUp={stopDiveAxis} onPointerCancel={stopDiveAxis} onLostPointerCapture={handleDiveLostCapture}><ArrowDown size={13} /> 하강</button>
            <small>두 손가락: 시야 줌</small>
          </div>
        )}
      </div>
    </>
  )
}
