import { NextResponse } from 'next/server'
import { authorizeStudioOwner } from '@/lib/server/owner-auth'

export const dynamic = 'force-dynamic'

export async function DELETE(request: Request) {
  const authorization = await authorizeStudioOwner(request)
  if (!authorization.ok) return NextResponse.json({ error: authorization.error }, { status: authorization.status })

  let body: unknown
  try { body = await request.json() } catch { return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 }) }
  const payload = (body ?? {}) as Record<string, unknown>
  const table = payload.table
  const id = typeof payload.id === 'string' ? payload.id : ''
  if (!['global_messages', 'direct_messages'].includes(String(table)) || !id || id.length > 80) {
    return NextResponse.json({ error: '삭제 대상이 올바르지 않습니다.' }, { status: 400 })
  }

  const { data: deleted, error } = await authorization.admin
    .from(table as 'global_messages' | 'direct_messages')
    .delete()
    .eq('id', id)
    .select('id, file_url')
    .maybeSingle()
  if (error) {
    console.error('[MPD admin] Chat moderation failed:', error.message)
    return NextResponse.json({ error: '메시지 삭제에 실패했습니다. Supabase 테이블 설정을 확인해 주세요.' }, { status: 500 })
  }
  if (!deleted) return NextResponse.json({ error: '이미 삭제되었거나 메시지를 찾을 수 없습니다.' }, { status: 404 })

  // Best-effort cleanup for an uploaded chat attachment belonging to the removed row.
  const fileUrl = (deleted as { file_url?: string | null }).file_url
  if (fileUrl) {
    try {
      const parsed = new URL(fileUrl)
      const marker = '/storage/v1/object/public/chat-files/'
      const markerIndex = parsed.pathname.indexOf(marker)
      if (markerIndex >= 0) {
        const path = decodeURIComponent(parsed.pathname.slice(markerIndex + marker.length))
        if (path) await authorization.admin.storage.from('chat-files').remove([path])
      }
    } catch (cleanupError) {
      console.warn('[MPD admin] Attachment cleanup skipped:', cleanupError)
    }
  }
  return NextResponse.json({ ok: true, id })
}
