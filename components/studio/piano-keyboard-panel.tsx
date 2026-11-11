'use client'

import { useEffect, useMemo, useState } from 'react'
import { Piano, X } from 'lucide-react'
import { playPiano } from '@/lib/sound'

type Props = { open: boolean; onClose: () => void }

const KEYBOARD_MAP = ['a', 'w', 's', 'e', 'd', 'f', 't', 'g', 'y', 'h', 'u', 'j', 'k', 'o', 'l', 'p']
const noteNames = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']
const isBlack = (midi: number) => [1, 3, 6, 8, 10].includes(midi % 12)

export function PianoKeyboardPanel({ open, onClose }: Props) {
  const [pressed, setPressed] = useState<number | null>(null)
  const notes = useMemo(() => Array.from({ length: 24 }, (_, index) => 48 + index), [])
  const whiteNotes = useMemo(() => notes.filter((note) => !isBlack(note)), [notes])
  const blackNotes = useMemo(() => {
    let whiteIndex = 0
    return notes.flatMap((midi) => {
      if (isBlack(midi)) return [{ midi, left: ((whiteIndex - 0.32) / whiteNotes.length) * 100 }]
      whiteIndex += 1
      return []
    })
  }, [notes, whiteNotes.length])

  useEffect(() => {
    if (!open) return
    document.body.dataset.mpdPianoOpen = 'true'
    const down = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return
      const index = KEYBOARD_MAP.indexOf(event.key.toLowerCase())
      if (index < 0 || event.repeat) return
      event.preventDefault()
      const midi = 48 + index
      playPiano(midi, 0, 0.7)
      setPressed(midi)
    }
    const up = (event: KeyboardEvent) => {
      const index = KEYBOARD_MAP.indexOf(event.key.toLowerCase())
      if (index >= 0) setPressed(null)
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      delete document.body.dataset.mpdPianoOpen
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [open])

  if (!open) return null

  return (
    <section className="mpd-piano-panel" aria-label="피아노 연주 패널">
      <header className="mpd-piano-header">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-xl bg-amber-300/15 text-amber-200"><Piano size={17} /></span>
          <div className="min-w-0"><strong>MPD GRAND PIANO</strong><span>마우스 또는 키보드 A W S E D F T G Y H U J K O L P</span></div>
        </div>
        <button type="button" onClick={onClose} aria-label="피아노 패널 닫기" className="rounded-lg p-2 text-neutral-300 hover:bg-white/10"><X size={17} /></button>
      </header>
      <div className="mpd-piano-keys" role="group" aria-label="피아노 건반">
        <div className="mpd-white-keys">
          {whiteNotes.map((midi) => {
            const name = noteNames[midi % 12]
            const octave = Math.floor(midi / 12) - 1
            const index = notes.indexOf(midi)
            return <button key={midi} type="button" className={`mpd-white-key ${pressed === midi ? 'is-pressed' : ''}`} onPointerDown={(event) => { event.preventDefault(); playPiano(midi, 0, 0.72); setPressed(midi) }} onPointerUp={() => setPressed(null)} onPointerLeave={() => setPressed(null)} aria-label={`${name}${octave} 연주`}><span>{name}{octave}</span><small>{KEYBOARD_MAP[index] ?? ''}</small></button>
          })}
        </div>
        {blackNotes.map(({ midi, left }) => <button key={midi} type="button" className={`mpd-black-key ${pressed === midi ? 'is-pressed' : ''}`} style={{ left: `${left}%` }} onPointerDown={(event) => { event.preventDefault(); playPiano(midi, 0, 0.7); setPressed(midi) }} onPointerUp={() => setPressed(null)} onPointerLeave={() => setPressed(null)} aria-label={`${noteNames[midi % 12]} 연주`}><small>{KEYBOARD_MAP[notes.indexOf(midi)] ?? ''}</small></button>)}
      </div>
      <p className="mpd-piano-footer">키보드 연주: A W S E D F T G Y H U J K O L P · 건반을 누르면 바로 소리가 납니다</p>
    </section>
  )
}
