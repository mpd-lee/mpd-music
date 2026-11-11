# Vercel 공개 주소 업데이트 방법

현재 `http://localhost:3000`은 내 PC에서 실행되는 로컬 버전이고, `https://mpd-music.vercel.app/`은 Vercel에 마지막으로 배포된 공개 버전입니다. 로컬 파일만 수정해도 공개 주소는 자동으로 바뀌지 않습니다.

## 방법 A. 기존 GitHub 연결을 사용하는 경우 (권장)

1. Vercel 대시보드에서 `mpd-music` 프로젝트가 연결된 GitHub 저장소와 Production Branch를 확인합니다.
2. 새 `MPD_Music_Studio` 폴더의 소스 파일을 해당 저장소 작업 폴더에 반영합니다. 기존 프로젝트를 백업한 뒤 진행하세요.
3. Git 변경사항을 확인하고 커밋/푸시합니다.

```powershell
git status
git add .
git commit -m "Update MPD Music Studio forest environment and console UI"
git push origin main
```

`main`이 아닌 Production Branch를 쓰고 있다면 마지막 명령의 브랜치 이름을 그 이름으로 바꿉니다. Vercel이 해당 브랜치를 감시하고 있다면 푸시 후 자동으로 새 배포를 시작합니다.

## 방법 B. Vercel CLI로 기존 프로젝트에 직접 배포하는 경우

VS Code 터미널에서 새 프로젝트 폴더를 연 뒤 실행합니다.

```powershell
npm install -g vercel
vercel login
vercel link
```

`vercel link` 질문에서는 기존 Vercel 프로젝트를 선택하고 `mpd-music` 프로젝트에 연결합니다. 새 프로젝트를 만들지 않도록 기존 프로젝트 이름을 확인하세요.

연결이 끝나면 아래 명령으로 Production에 배포합니다.

```powershell
vercel --prod
```

배포가 성공하면 기존 프로젝트에 연결된 `https://mpd-music.vercel.app/` 주소가 새 배포를 가리키게 됩니다. 이 작업은 Vercel 계정에 로그인한 사용자 PC에서 실행해야 합니다. 이 대화에서는 사용자 Vercel 계정에 직접 로그인하거나 배포를 실행할 수 없습니다.

## Vercel 환경변수 확인

Vercel Dashboard → `mpd-music` → Settings → Environment Variables에서 다음을 확인합니다.

| 변수 | 값 | 적용 환경 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://프로젝트ID.supabase.co` | Production, Preview |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | 기존 `sb_publishable_...` 공개 키 | Production, Preview |
| `DATABASE_URL` | 기존 PostgreSQL 연결 문자열이 있는 경우 그대로 유지 | Production, Preview |

`DATABASE_URL`은 방명록 API가 PostgreSQL을 사용할 때 필요합니다. 기존 Vercel 설정에 이미 등록되어 있다면 지우거나 바꾸지 마세요. 새 환경변수를 수정한 뒤에는 반드시 다시 배포해야 합니다.

`.env.local`은 로컬 실행용입니다. `.gitignore`에 포함되어 있으므로 GitHub에 커밋하지 마세요. Publishable Key는 브라우저용 공개 키이지만, Supabase 테이블과 Storage는 RLS 정책으로 보호해야 합니다.

## 배포 후 확인

1. Vercel Deployments에서 새 배포가 `Ready`인지 확인합니다.
2. `https://mpd-music.vercel.app/`을 열고 `Ctrl + Shift + R`로 강력 새로고침합니다.
3. 새 풍경·콘솔 스피커 위치·최소화 플레이어·채팅 연결을 확인합니다.
4. 배포가 실패하면 Vercel의 Build Logs에서 가장 첫 번째 오류를 확인합니다.
