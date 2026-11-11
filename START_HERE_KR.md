# MPD Music Studio 최종 시작 안내

이 버전은 단체 채팅·1:1 채팅·파일 업로드와 **1:1 WebRTC 마이크 음성통화**를 지원하는 현재 통합본입니다. 기존 3D 스튜디오, 아바타, 음악 플레이어, 악기, 좌석, 수영장, 방명록 및 운동기구 기능은 유지합니다.

## 1. 새 폴더에 압축 풀기

기존 프로젝트 위에 덮어쓰지 말고 새 폴더에 압축을 푸세요. VS Code에서 가장 바깥쪽 `MPD_Music_Studio` 폴더를 엽니다. `package.json`, `app`, `components`, `lib`, `public`, `supabase`가 같은 위치에 보여야 합니다.

## 2. 환경변수 파일 넣기

보안상 `.env.local`은 ZIP에 포함하지 않았습니다. 기존 프로젝트에서 사용하던 본인의 `.env.local`을 새 프로젝트 최상위 폴더에 복사하세요.

필수 항목은 다음 두 가지입니다.

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_SUPABASE_PUBLISHABLE_KEY
```

기존 프로젝트가 `NEXT_PUBLIC_SUPABASE_ANON_KEY`를 사용 중이면 그 키도 앱에서 인식합니다. `service_role` 키는 브라우저용 환경변수에 넣지 마세요. `DATABASE_URL`이 이미 설정되어 있다면 방명록에서 사용할 수 있으므로 기존 값을 보존하세요.

## 3. Supabase 설정

1. Supabase Dashboard에서 기존 MPD 프로젝트를 엽니다.
2. Authentication → Sign In / Providers → Anonymous Sign-Ins를 활성화합니다.
3. SQL Editor에서 `supabase/schema.sql` 전체를 실행합니다.

이 SQL은 기존 단체/1:1 채팅 테이블과 파일 저장소, Realtime Broadcast 권한을 설정합니다. 음성통화 신호는 참여자 두 명만 접근할 수 있는 전용 비공개 Realtime 채널을 사용하므로 별도 음성 신호 테이블을 만들지 않습니다. 기존 채팅 메시지와 업로드 파일은 삭제하지 않습니다.

## 4. 로컬 실행

VS Code의 PowerShell 터미널에서 다음을 순서대로 실행하세요.

```powershell
npm install -g pnpm@12.3.4
pnpm install
pnpm dev
```

이미 pnpm 12.3.4가 설치되어 있으면 첫 번째 명령은 건너뛰셔도 됩니다. 브라우저에서 `http://localhost:3000`을 엽니다.

## 5. 사용자 ID

소유자 브라우저에서 한 번 다음 주소를 엽니다.

`http://localhost:3000/?mpd-owner=1`

공개 배포 후에는 같은 도메인에 `?mpd-owner=1`을 붙여 한 번 더 열어도 됩니다. 소유자 표시 ID는 `MPD-Lee`입니다. 이 값은 표시용 닉네임이며 관리자 권한을 부여하는 보안 인증은 아닙니다. 다른 방문자는 `MPD-` 뒤에 6자리 숫자가 붙은 표시 ID를 자동으로 받습니다. 실제 채팅 권한 확인에는 Supabase 사용자 UUID를 사용합니다.

## 6. 채팅과 파일 업로드

- 왼쪽 아래 Global Chat을 열면 단체 채팅이 가능합니다.
- 접속자 이름 또는 캐릭터를 누르면 해당 사용자와 1:1 채팅이 열립니다.
- 단체 채팅과 1:1 채팅 모두 파일 하나당 최대 **50MB**까지 첨부할 수 있습니다.
- 6MB를 넘는 파일은 TUS 이어 올리기를 사용합니다.
- 현재 설정은 50MB입니다. 실제 허용량은 Supabase 프로젝트의 전체 Storage 제한과 버킷 제한 중 더 낮은 값에 따릅니다.
- 채팅 첨부는 공개 버킷 URL로 제공되므로 비밀번호, 신분증 등 민감한 파일을 올리지 마세요.

단체 채팅 접속자 옆 전화 아이콘 또는 1:1 채팅창의 전화 버튼을 누르면 마이크 통화를 시작합니다. HTTPS에서 마이크 권한을 허용해 주세요. 무료 STUN만 사용하므로 일부 NAT/방화벽 환경에는 별도 TURN 서버가 필요할 수 있습니다. 스튜디오 마이크 오브젝트의 샘플 소리 재생도 유지됩니다.

## 7. 배포

먼저 로컬 빌드를 확인합니다.

```powershell
pnpm build
```

성공하면 기존 Vercel 프로젝트에 연결해 Production 배포합니다.

```powershell
vercel link
vercel --prod
```

반드시 기존 `mzpdlee-4096/mpd-music` 프로젝트를 선택합니다. Vercel Production에도 `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`를 등록하고, 기존 `DATABASE_URL`이 있다면 삭제하지 마세요.

공개 주소: `https://mpd-music.vercel.app/`

## 8. 스튜디오와 수중 모드

- 정면 반원은 해안/바다, 좌우와 후면은 3D 숲으로 구성했습니다.
- 스튜디오 하부에는 암반 받침을 추가해 지형과 이어지게 했습니다.
- 수영장 물을 클릭하거나 수영장 안으로 걸어 들어가면 별도의 바닷속 월드로 즉시 전환되고 스쿠버 장비가 표시됩니다.
- 물속 바닥을 클릭하거나 모바일 조이스틱을 밀어 수중 이동합니다.
- `수면으로 올라와 스튜디오로 돌아가기`를 누르면 정원으로 즉시 복귀하고 평상복으로 돌아옵니다. 물고기 떼·바다거북·가오리·산호·해초·기포가 움직입니다.

모바일은 자동으로 낮은 렌더링 해상도, 그림자 비활성화, 적은 숲 인스턴스를 사용합니다. 실제 기기별 성능은 기종과 브라우저에 따라 다릅니다.
