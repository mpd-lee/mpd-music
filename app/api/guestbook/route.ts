import { NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Pool } from 'pg'
import { authorizeStudioOwner } from '@/lib/server/owner-auth'

export const dynamic = 'force-dynamic'

let poolPromise: Promise<Pool> | null = null

// Keep compatibility with an existing DATABASE_URL, but Supabase alone is now
// sufficient for a shared guestbook. No extra paid database is required.
async function getPool(): Promise<Pool | null> {
  if (!process.env.DATABASE_URL) return null
  if (!poolPromise) {
    poolPromise = (async () => {
      const { Pool } = await import('pg')
      const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3 })
      await pool.query(
        `CREATE TABLE IF NOT EXISTS guestbook_entries (
          id SERIAL PRIMARY KEY,
          name VARCHAR(30) NOT NULL,
          message VARCHAR(300) NOT NULL,
          candle BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`,
      )
      return pool
    })().catch((error) => {
      poolPromise = null
      throw error
    })
  }
  return poolPromise
}

function getPublicSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}

type PgRow = { id: number; name: string; message: string; candle: boolean; created_at: Date }
type SupabaseRow = { id: string; name: string; message: string; candle: boolean; created_at: string }

const toPgEntry = (row: PgRow) => ({
  id: row.id,
  name: row.name,
  message: row.message,
  candle: row.candle,
  createdAt: new Date(row.created_at).toISOString(),
})

const toSupabaseEntry = (row: SupabaseRow) => ({
  id: row.id,
  name: row.name,
  message: row.message,
  candle: row.candle,
  createdAt: new Date(row.created_at).toISOString(),
})

export async function GET() {
  try {
    const pool = await getPool()
    if (pool) {
      const { rows } = await pool.query<PgRow>(
        'SELECT id, name, message, candle, created_at FROM guestbook_entries ORDER BY created_at DESC LIMIT 200',
      )
      return NextResponse.json({ storage: 'database', backend: 'postgres', entries: rows.map(toPgEntry) })
    }

    const supabase = getPublicSupabase()
    if (!supabase) return NextResponse.json({ storage: 'local', entries: [] })
    const { data, error } = await supabase
      .from('guestbook_entries')
      .select('id, name, message, candle, created_at')
      .order('created_at', { ascending: false })
      .limit(200)
    if (error) throw error
    return NextResponse.json({ storage: 'database', backend: 'supabase', entries: (data as SupabaseRow[]).map(toSupabaseEntry) })
  } catch (error) {
    console.error('guestbook GET failed', error)
    return NextResponse.json({ storage: 'local', entries: [] })
  }
}

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 })
  }
  const { name, message, candle } = (body ?? {}) as Record<string, unknown>
  const cleanName = typeof name === 'string' ? name.trim().slice(0, 30) : ''
  const cleanMessage = typeof message === 'string' ? message.trim().slice(0, 300) : ''
  if (!cleanName || !cleanMessage) {
    return NextResponse.json({ error: '이름과 메시지를 입력해 주세요.' }, { status: 400 })
  }

  try {
    const pool = await getPool()
    if (pool) {
      const { rows } = await pool.query<PgRow>(
        'INSERT INTO guestbook_entries (name, message, candle) VALUES ($1, $2, $3) RETURNING id, name, message, candle, created_at',
        [cleanName, cleanMessage, candle !== false],
      )
      return NextResponse.json({ storage: 'database', backend: 'postgres', entry: toPgEntry(rows[0]) })
    }

    const supabase = getPublicSupabase()
    if (!supabase) return NextResponse.json({ storage: 'local' }, { status: 503 })
    const { data, error } = await supabase
      .from('guestbook_entries')
      .insert({ name: cleanName, message: cleanMessage, candle: candle !== false })
      .select('id, name, message, candle, created_at')
      .single()
    if (error) throw error
    return NextResponse.json({ storage: 'database', backend: 'supabase', entry: toSupabaseEntry(data as SupabaseRow) })
  } catch (error) {
    console.error('guestbook POST failed', error)
    return NextResponse.json({ storage: 'local' }, { status: 503 })
  }
}

export async function DELETE(request: Request) {
  const authorization = await authorizeStudioOwner(request)
  if (!authorization.ok) return NextResponse.json({ error: authorization.error }, { status: authorization.status })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 })
  }
  const rawId = (body as Record<string, unknown> | null)?.id
  const id = typeof rawId === 'string' ? rawId : Number(rawId)
  if (!(typeof id === 'string' && id.length > 0 && id.length <= 80) && !(typeof id === 'number' && Number.isSafeInteger(id) && id > 0)) {
    return NextResponse.json({ error: '방명록 번호가 올바르지 않습니다.' }, { status: 400 })
  }

  try {
    const pool = await getPool()
    if (pool) {
      const result = await pool.query('DELETE FROM guestbook_entries WHERE id = $1 RETURNING id', [id])
      if (!result.rowCount) return NextResponse.json({ error: '이미 삭제되었거나 방명록을 찾을 수 없습니다.' }, { status: 404 })
      return NextResponse.json({ ok: true, id })
    }

    const { data, error } = await authorization.admin
      .from('guestbook_entries')
      .delete()
      .eq('id', String(id))
      .select('id')
      .maybeSingle()
    if (error) throw error
    if (!data) return NextResponse.json({ error: '이미 삭제되었거나 방명록을 찾을 수 없습니다.' }, { status: 404 })
    return NextResponse.json({ ok: true, id: data.id })
  } catch (error) {
    console.error('guestbook DELETE failed', error)
    return NextResponse.json({ error: '방명록 삭제 중 데이터베이스 오류가 발생했습니다.' }, { status: 500 })
  }
}
