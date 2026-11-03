'use client'

import { Flame, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import type { GuestEntry } from '@/lib/use-guestbook'

type Props = {
  open: boolean
  onClose: () => void
  entries: GuestEntry[]
  storage: 'database' | 'local'
  addEntry: (input: { name: string; message: string; candle: boolean }) => Promise<void>
}

function formatDate(iso: string) {
  try {
    return new Intl.DateTimeFormat('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
  } catch {
    return ''
  }
}

export function GuestbookPanel({ open, onClose, entries, storage, addEntry }: Props) {
  const [name, setName] = useState('')
  const [message, setMessage] = useState('')
  const [candle, setCandle] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await addEntry({ name, message, candle })
      setMessage('')
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장에 실패했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <aside
      aria-label="방명록"
      className="fixed right-4 top-16 z-40 flex max-h-[calc(100dvh-14rem)] w-[min(360px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-white/10 bg-neutral-950/85 text-white shadow-2xl backdrop-blur-md"
    >
      <header className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">방명록 & 촛불</h2>
          <p className="text-[11px] text-neutral-400">
            {storage === 'database' ? '데이터베이스에 영구 저장됩니다' : '이 브라우저에 영구 저장됩니다'}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex size-8 items-center justify-center rounded-full text-neutral-300 hover:bg-white/10 hover:text-white"
          aria-label="방명록 닫기"
        >
          <X className="size-4" />
        </button>
      </header>

      <form onSubmit={handleSubmit} className="flex flex-col gap-2 border-b border-white/10 p-4">
        <label className="sr-only" htmlFor="gb-name">
          이름
        </label>
        <input
          id="gb-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={30}
          required
          placeholder="이름"
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm placeholder:text-neutral-500 focus:border-amber-300/60 focus:outline-none"
        />
        <label className="sr-only" htmlFor="gb-message">
          메시지
        </label>
        <textarea
          id="gb-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={300}
          required
          rows={3}
          placeholder="MPD Music Studio에 응원의 메시지를 남겨주세요"
          className="resize-none rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm placeholder:text-neutral-500 focus:border-amber-300/60 focus:outline-none"
        />
        <div className="flex items-center justify-between gap-2">
          <label className="flex cursor-pointer items-center gap-2 text-xs text-neutral-300">
            <input type="checkbox" checked={candle} onChange={(e) => setCandle(e.target.checked)} className="accent-amber-300" />
            <Flame className="size-3.5 text-amber-300" aria-hidden="true" />
            촛불 함께 켜기
          </label>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-full bg-amber-300 px-4 py-1.5 text-xs font-semibold text-neutral-950 transition hover:bg-amber-200 disabled:opacity-60"
          >
            {submitting ? '저장 중...' : '남기기'}
          </button>
        </div>
        {error && (
          <p role="alert" className="text-xs text-red-300">
            {error}
          </p>
        )}
      </form>

      <ul className="flex-1 space-y-2 overflow-y-auto p-4">
        {entries.length === 0 && <li className="py-6 text-center text-xs text-neutral-500">첫 번째 방명록을 남겨주세요.</li>}
        {entries.map((entry) => (
          <li key={entry.id} className="rounded-xl bg-white/5 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-amber-200">
                {entry.candle && <Flame className="size-3 text-amber-400" aria-label="촛불" />}
                {entry.name}
              </span>
              <time className="text-[10px] text-neutral-500" dateTime={entry.createdAt}>
                {formatDate(entry.createdAt)}
              </time>
            </div>
            <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-relaxed text-neutral-200">{entry.message}</p>
          </li>
        ))}
      </ul>
    </aside>
  )
}
