'use client'

import useSWR from 'swr'
import { useEffect } from 'react'
import { getSupabaseClient } from './supabase'

export type GuestEntry = {
  id: string | number
  name: string
  message: string
  candle: boolean
  createdAt: string
}

type GuestbookData = { storage: 'database' | 'local'; backend?: 'postgres' | 'supabase'; entries: GuestEntry[] }

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

export function useGuestbook(enabled = true) {
  const { data, mutate, isLoading } = useSWR(enabled ? '/api/guestbook' : null, fetcher, { refreshInterval: 45000, revalidateOnFocus: true })

  // Supabase-backed guestbook deletes appear immediately on every connected client.
  // Existing DATABASE_URL installations continue to refresh through SWR polling.
  useEffect(() => {
    if (!enabled || data?.backend !== 'supabase') return
    const supabase = getSupabaseClient()
    if (!supabase) return
    const channel = supabase
      .channel('mpd-studio-guestbook-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'guestbook_entries' }, (payload) => {
        const row = payload.new as { id: string; name: string; message: string; candle: boolean; created_at: string }
        const entry: GuestEntry = { id: row.id, name: row.name, message: row.message, candle: row.candle, createdAt: row.created_at }
        void mutate((current) => current?.storage === 'database'
          ? { ...current, entries: current.entries.some((item) => String(item.id) === row.id) ? current.entries : [entry, ...current.entries].slice(0, 200) }
          : current, { revalidate: false })
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'guestbook_entries' }, (payload) => {
        const row = payload.old as { id?: string }
        if (!row.id) return
        void mutate((current) => current ? { ...current, entries: current.entries.filter((item) => String(item.id) !== row.id) } : current, { revalidate: false })
      })
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [enabled, data?.backend, mutate])

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
        await mutate({ storage: 'database', backend: data?.backend, entries: [entry, ...(data?.entries ?? [])] }, { revalidate: true })
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

  async function deleteEntry(id: string | number) {
    if (data?.storage === 'database') {
      const supabase = getSupabaseClient()
      if (!supabase) throw new Error('Supabase 연결을 확인해 주세요.')
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
      if (sessionError) throw sessionError
      const token = sessionData.session?.access_token
      if (!token) throw new Error('로그인 세션이 없습니다. 다시 접속해 주세요.')
      const response = await fetch('/api/guestbook', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || '방명록을 삭제하지 못했습니다.')
      await mutate((current) => current ? { ...current, entries: current.entries.filter((entry) => String(entry.id) !== String(id)) } : current, { revalidate: true })
      return
    }
    const next = readLocal().filter((entry) => String(entry.id) !== String(id))
    writeLocal(next)
    await mutate({ storage: 'local', entries: next }, { revalidate: false })
  }


  return {
    entries: data?.entries ?? [],
    storage: data?.storage ?? 'local',
    isLoading,
    addEntry,
    deleteEntry,
  }
}
