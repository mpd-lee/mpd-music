'use client'

import useSWR from 'swr'

export type GuestEntry = {
  id: string | number
  name: string
  message: string
  candle: boolean
  createdAt: string
}

type GuestbookData = { storage: 'database' | 'local'; entries: GuestEntry[] }

const LOCAL_KEY = 'mpd-studio-guestbook-v1'

function readLocal(): GuestEntry[] {
  try {
    const raw = window.localStorage.getItem(LOCAL_KEY)
    return raw ? (JSON.parse(raw) as GuestEntry[]) : []
  } catch {
    return []
  }
}

function writeLocal(entries: GuestEntry[]) {
  try {
    window.localStorage.setItem(LOCAL_KEY, JSON.stringify(entries.slice(0, 200)))
  } catch {}
}

async function fetcher(url: string): Promise<GuestbookData> {
  try {
    const res = await fetch(url, { cache: 'no-store' })
    if (res.ok) {
      const data = (await res.json()) as GuestbookData
      if (data.storage === 'database') return data
    }
  } catch {}
  return { storage: 'local', entries: readLocal() }
}

export function useGuestbook() {
  const { data, mutate, isLoading } = useSWR('/api/guestbook', fetcher, { refreshInterval: 30000 })

  async function addEntry(input: { name: string; message: string; candle: boolean }) {
    const name = input.name.trim().slice(0, 30)
    const message = input.message.trim().slice(0, 300)
    if (!name || !message) throw new Error('이름과 메시지를 입력해 주세요.')

    if (data?.storage === 'database') {
      const res = await fetch('/api/guestbook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, message, candle: input.candle }),
      })
      if (res.ok) {
        const { entry } = (await res.json()) as { entry: GuestEntry }
        await mutate({ storage: 'database', entries: [entry, ...(data?.entries ?? [])] }, { revalidate: true })
        return
      }
    }

    const entry: GuestEntry = {
      id: `local-${Date.now()}`,
      name,
      message,
      candle: input.candle,
      createdAt: new Date().toISOString(),
    }
    const next = [entry, ...readLocal()]
    writeLocal(next)
    await mutate({ storage: 'local', entries: next }, { revalidate: false })
  }

  return {
    entries: data?.entries ?? [],
    storage: data?.storage ?? 'local',
    isLoading,
    addEntry,
  }
}
