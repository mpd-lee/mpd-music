import { NextResponse } from 'next/server'
import type { Pool } from 'pg'

export const dynamic = 'force-dynamic'

let poolPromise: Promise<Pool> | null = null

// Uses Neon/Postgres when DATABASE_URL is present; otherwise the client falls back to browser storage.
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

type Row = { id: number; name: string; message: string; candle: boolean; created_at: Date }

const toEntry = (row: Row) => ({
  id: row.id,
  name: row.name,
  message: row.message,
  candle: row.candle,
  createdAt: new Date(row.created_at).toISOString(),
})

export async function GET() {
  try {
    const pool = await getPool()
    if (!pool) return NextResponse.json({ storage: 'local', entries: [] })
    const { rows } = await pool.query<Row>(
      'SELECT id, name, message, candle, created_at FROM guestbook_entries ORDER BY created_at DESC LIMIT 200',
    )
    return NextResponse.json({ storage: 'database', entries: rows.map(toEntry) })
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
    if (!pool) return NextResponse.json({ storage: 'local' }, { status: 503 })
    const { rows } = await pool.query<Row>(
      'INSERT INTO guestbook_entries (name, message, candle) VALUES ($1, $2, $3) RETURNING id, name, message, candle, created_at',
      [cleanName, cleanMessage, candle !== false],
    )
    return NextResponse.json({ storage: 'database', entry: toEntry(rows[0]) })
  } catch (error) {
    console.error('guestbook POST failed', error)
    return NextResponse.json({ storage: 'local' }, { status: 503 })
  }
}
