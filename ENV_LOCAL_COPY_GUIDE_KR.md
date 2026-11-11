# .env.local 복사 안내

`.env.local`은 Supabase 연결 정보와 서버 설정이 들어가므로 ZIP에 포함하지 않았습니다.

1. 기존에 정상 작동하던 프로젝트 폴더를 엽니다.
2. 최상위의 `.env.local` 파일을 복사합니다.
3. 새 프로젝트 `MPD_Music_Studio`의 `package.json`과 같은 위치에 붙여넣습니다.
4. 파일을 열어 다음 항목이 기존 Supabase 프로젝트와 일치하는지 확인합니다.

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_SUPABASE_PUBLISHABLE_KEY
```

기존 프로젝트가 `NEXT_PUBLIC_SUPABASE_ANON_KEY`를 사용하면 그것을 유지해도 됩니다. `DATABASE_URL`이 이미 있다면 방명록 기능에 사용할 수 있으므로 삭제하지 마세요. `service_role` 키는 `NEXT_PUBLIC_`로 시작하는 브라우저 환경변수에 넣지 마세요.

현재 버전은 무료 STUN 서버로 1:1 WebRTC 통화를 연결합니다. 일부 NAT 환경에는 별도 TURN 서버가 필요할 수 있습니다.
