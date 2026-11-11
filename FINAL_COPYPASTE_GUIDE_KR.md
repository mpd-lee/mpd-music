# MPD Music Studio 최종 복사·실행 안내

1. 최종 ZIP을 새 폴더에 압축 해제합니다.
2. 기존 프로젝트의 `.env.local`을 새 프로젝트 최상위 폴더에 복사합니다. ZIP에는 개인 환경변수를 넣지 않았습니다.
3. Supabase Authentication에서 Anonymous Sign-Ins를 켭니다.
4. `supabase/schema.sql` 전체를 Supabase SQL Editor에서 실행합니다.
5. VS Code PowerShell 터미널에서 실행합니다.

```powershell
npm install -g pnpm@12.3.4
pnpm install
pnpm dev
```

로컬 주소: `http://localhost:3000`

Production 빌드와 배포:

```powershell
pnpm build
vercel link
vercel --prod
```

기존 Vercel 프로젝트 `mzpdlee-4096/mpd-music`을 선택합니다.

## 대표 계정 표시 이름

대표 계정으로 사용할 브라우저에서 사이트 주소 뒤에 `?mpd-owner=1`을 한 번 붙여 접속합니다. 예: `https://사이트주소/?mpd-owner=1`. 이 브라우저의 표시 이름이 `MPD-Lee`로 저장되고 주소의 임시 매개변수는 자동 제거됩니다. 다른 방문자는 계속 `MPD-000000` 형식의 방문자 ID를 사용합니다. 이 표시 이름은 공개 닉네임이며 Supabase 로그인 권한이나 관리자 보안을 대신하지 않습니다.

## 기능

- 대표 표시 ID `MPD-Lee`, 신규 방문자 `MPD-000000` 형식
- 실시간 캐릭터 입장/퇴장 및 이동 동기화
- 단체 채팅과 캐릭터 클릭 기반 1:1 채팅
- 실시간 1:1 마이크 음성통화(WebRTC, Google STUN)
- 단체/1:1 채팅 파일 첨부: 현재 최대 50MB, 6MB 초과는 TUS 이어 올리기
- PC WASD/방향키, 모바일 터치 조이스틱과 바닥 탭 이동
- 피아노 마우스/키보드 연주, 악기·스피커 링크, 마이크 샘플 재생
- 절벽/해안·고밀도 숲·하늘·야외 리조트와 11종 운동기구
- 수영장 진입 시 자동 잠수, 별도 바닷속 월드, 물고기·거북이·가오리·산호·해초 애니메이션, 수면 복귀

## 음성통화 참고

마이크 통화는 참여자별 비공개 Supabase Realtime Broadcast 채널로 신호를 교환하고 브라우저 WebRTC로 음성을 연결합니다. HTTPS 또는 localhost에서 마이크 권한을 허용해야 합니다. 현재는 무료 STUN 서버를 사용하므로 일부 회사망·모바일망·엄격한 NAT 환경에서는 연결되지 않을 수 있습니다. 이런 환경까지 연결률을 높이려면 TURN 중계 서비스를 추가해야 하며, TURN은 별도 비용이 발생할 수 있습니다.

## 파일 업로드 제한

현재 프로젝트와 Supabase 버킷을 50MB로 설정했습니다. Supabase 프로젝트 전체 Storage 제한이 더 낮으면 그 제한이 우선합니다. 이 버킷은 공개 URL을 사용하므로 민감한 파일은 첨부하지 마세요.
