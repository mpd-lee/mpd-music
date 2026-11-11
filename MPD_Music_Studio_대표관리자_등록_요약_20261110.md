# MPD-Lee 대표 관리자 등록 요약

1. 새 프로젝트를 GitHub `mpd-lee/mpd-music`의 `main` 브랜치에 반영하고 Vercel에서 `Ready` 상태가 될 때까지 기다립니다.
2. Supabase SQL Editor에서 프로젝트 안의 `supabase/schema.sql` 전체를 실행합니다.
3. 대표님이 사용할 크롬 브라우저에서 운영 사이트 주소 끝에 `?mpd-owner=1`을 한 번 붙여 접속합니다.
4. 스튜디오 입장 후 상단 `관리자 등록 ID` 버튼을 눌러 UUID를 복사합니다.
5. Vercel → 기존 `mpd-music` → Settings → Environment Variables에 세 변수를 등록합니다.
   - `MPD_OWNER_USER_ID` = 복사한 UUID
   - `NEXT_PUBLIC_MPD_OWNER_USER_ID` = 같은 UUID
   - `SUPABASE_SERVICE_ROLE_KEY` = Supabase 서버 전용 service role 비밀 키
6. Vercel Deployments에서 Redeploy합니다.
7. 같은 크롬 브라우저로 다시 접속했을 때 `OWNER` 표시가 보이면 완료입니다.

`?mpd-owner=1`은 공개 닉네임만 바꿉니다. 관리자 권한은 위 UUID와 서버 비밀 키가 함께 맞아야 생깁니다. service role 키는 GitHub나 `.env.example`에 절대 넣지 마세요.
