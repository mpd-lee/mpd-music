# MPD Music Studio 실시간 캐릭터 및 채팅 안내

이 문서는 현재 버전 기준입니다. **1:1 WebRTC 마이크 음성통화가 포함되어 있습니다.**

## 방문자 캐릭터
- Supabase 익명 인증으로 각 방문자를 구분합니다.
- 소유자 표시 이름은 `MPD-Lee`입니다. 대표 브라우저에서 사이트 주소 뒤에 `?mpd-owner=1`을 한 번 붙여 접속하면 표시 이름이 저장됩니다.
- 신규 방문자는 `MPD-` + 6자리 숫자 형식의 짧은 이름을 받습니다.
- 내부 채팅 권한은 표시 이름이 아닌 Supabase 사용자 UUID를 기준으로 합니다.
- Presence는 입장/퇴장 상태에, Broadcast는 캐릭터 위치/방향에 사용합니다.

## 단체 채팅
Global Chat을 열고 메시지를 입력합니다. 메시지는 `global_messages`에 저장되고 Realtime으로 전달됩니다.

## 1:1 채팅
접속자 목록 또는 스튜디오의 다른 캐릭터를 누르면 해당 사용자와 1:1 채팅이 열립니다. 양쪽 사용자는 `direct_messages`에서 본인과 상대방이 참여자인 메시지만 읽을 수 있습니다.

## 파일 첨부
단체 채팅과 1:1 채팅 모두 파일 하나당 최대 50MB입니다. 6MB 초과 파일은 TUS resumable upload를 사용합니다. 실제 제한은 Supabase 프로젝트 및 버킷 설정 중 더 낮은 값입니다. 현재 `chat-files` 버킷은 공개 URL이므로 민감한 파일을 올리지 마세요.

## 음성통화
접속자 이름 옆 전화 아이콘 또는 1:1 채팅 상단 전화 버튼을 누릅니다. 브라우저가 마이크 사용 권한을 요청하면 허용합니다. WebRTC 음성은 직접 연결하고, 신호는 두 참여자의 Supabase 사용자 UUID를 포함한 별도 비공개 `mpd-studio-voice:<UUID>:<UUID>` Realtime Broadcast 채널로 전달합니다. 무료 STUN 서버만 사용하므로 일부 NAT/방화벽 환경에서는 TURN 중계 서버가 필요할 수 있습니다.

## Supabase
`supabase/schema.sql`을 SQL Editor에서 실행하고 Anonymous Sign-Ins를 켜야 합니다. `supabase/schema.sql`에는 두 참여자만 해당 private 채널을 읽고 게시하도록 제한하는 `realtime.messages` 정책이 포함되어 있으므로 별도의 `voice_signals` 테이블은 필요하지 않습니다.
