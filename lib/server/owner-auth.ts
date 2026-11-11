import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export type OwnerAuthResult =
  | { ok: true; admin: SupabaseClient; userId: string }
  | { ok: false; status: number; error: string }

/**
 * The ?mpd-owner=1 parameter only changes a public nickname. Real moderation
 * is authorized by the Supabase Auth UUID stored in server-only Vercel env vars.
 */
export async function authorizeStudioOwner(request: Request): Promise<OwnerAuthResult> {
  const expectedOwnerId = process.env.MPD_OWNER_USER_ID
  const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!expectedOwnerId || !projectUrl || !serviceRoleKey) {
    return { ok: false, status: 503, error: '관리자 보안 설정이 아직 완료되지 않았습니다. Vercel 환경 변수 MPD_OWNER_USER_ID, SUPABASE_SERVICE_ROLE_KEY를 확인해 주세요.' }
  }
  const authorization = request.headers.get('authorization') || ''
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1]
  if (!token) return { ok: false, status: 401, error: '로그인 인증이 필요합니다.' }

  const admin = createClient(projectUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  const { data, error } = await admin.auth.getUser(token)
  if (error || !data.user) return { ok: false, status: 401, error: '로그인 세션이 만료되었습니다. 다시 접속해 주세요.' }
  if (data.user.id !== expectedOwnerId) return { ok: false, status: 403, error: '대표 관리자 계정만 사용할 수 있는 기능입니다.' }
  return { ok: true, admin, userId: data.user.id }
}
