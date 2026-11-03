# MPD Music Studio 새 통합본 시작하기

## 꼭 지켜 주세요

이번 파일은 `components` 폴더만 교체하는 패치가 아닙니다. **전체 Next.js 프로젝트 한 벌**입니다. 기존 폴더와 섞지 말고, 새 폴더에 압축을 푼 뒤 그 새 폴더를 VS Code에서 여세요. 예전 서버가 실행 중이면 먼저 VS Code 터미널에서 `Ctrl + C`를 눌러 종료하세요.

## 1. 올바른 폴더인지 확인

VS Code 터미널에서 다음 명령을 실행하세요.

```powershell
Get-Location
Test-Path .\package.json
```

두 번째 명령 결과가 `True`여야 합니다. Explorer 최상단에 `package.json`, `app`, `components`, `lib`, `public`, `supabase`가 보여야 합니다.

## 2. Supabase 환경 파일 만들기

프로젝트 가장 바깥쪽에 있는 `.env.example`을 복사해 `.env.local`로 만듭니다.

```powershell
Copy-Item .env.example .env.local
```

`.env.local`을 열고 Supabase Dashboard의 Project Settings → API에서 본인 프로젝트 URL과 공개용 anon/publishable key를 입력하세요. `service_role` 비밀키는 절대 입력하지 마세요.

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_ANON_OR_PUBLISHABLE_KEY
```

Supabase에서 Authentication → Sign In / Providers → Anonymous Sign-Ins도 켜 주세요. `supabase/schema.sql`은 프로젝트 초기 설정 때 SQL Editor에서 실행합니다.

## 3. 새 프로젝트에서만 실행

```powershell
Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue
pnpm install
pnpm dev
```

`pnpm`을 찾을 수 없으면 아래 명령을 한 번 실행한 다음 VS Code 터미널을 닫고 다시 여세요.

```powershell
npm install -g pnpm@12.3.4
```

브라우저에서는 터미널에 표시된 Local 주소로 접속하세요. 기존 서버가 3000번 포트를 사용 중이면 새 서버는 3001번 등 다른 포트로 실행될 수 있으니, 터미널에 표시된 주소를 사용해야 합니다.

## 4. 수정본이 실제로 적용됐는지 확인

프로젝트 루트 터미널에서 아래 세 줄을 실행하세요.

```powershell
Select-String -Path .\components\studio\scene\control-room.tsx -Pattern 'SSL / NEVE STYLE'
Select-String -Path .\components\studio\scene\instruments.tsx -Pattern 'FrontSpeaker'
Select-String -Path .\components\studio\scene\outdoor.tsx -Pattern 'function PoolWater'
```

첫 번째와 두 번째 명령은 결과가 없어야 합니다. 세 번째 명령은 `PoolWater` 함수가 있는 줄을 출력해야 합니다.

## 5. Supabase가 연결되지 않을 때

새 통합본은 Supabase 인증/네트워크에 실패해도 3D 스튜디오가 멈추지 않도록 로컬 미리보기 모드로 전환합니다. 이 모드에서는 장면과 이동·착석은 확인할 수 있지만, 실시간 멀티플레이어, 음성통화 및 채팅 파일 전송은 Supabase 연결이 복구되어야 작동합니다.
