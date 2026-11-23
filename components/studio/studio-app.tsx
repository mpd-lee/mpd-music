'use client'

import { Loader } from '@react-three/drei'
import { BookOpen, ExternalLink, Flame, MousePointerClick, RotateCcw, ShieldCheck, Copy } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { ChatPanel } from './chat-panel'
import { useMultiplayer } from '@/lib/use-multiplayer'
import { unlockAudio } from '@/lib/sound'
import { useGuestbook } from '@/lib/use-guestbook'
import { GuestbookPanel } from './guestbook-panel'
import { MusicPlayer, type MusicPlayerHandle } from './music-player'
import { ConsolePlayer } from './console-player'
import { YOUTUBE_CHANNEL_URL } from './scene/control-room'
import { StudioScene } from './scene/studio-scene'
import { PianoKeyboardPanel } from './piano-keyboard-panel'

export default function StudioApp() {
  const [entered, setEntered] = useState(false)
  const { entries, storage, addEntry, deleteEntry } = useGuestbook(entered)
  const multiplayer = useMultiplayer(entered)
  const [chatTarget, setChatTarget] = useState<{ userId: string; name: string } | null>(null)
  const [guestbookOpen, setGuestbookOpen] = useState(false)
  const [startSignal, setStartSignal] = useState(0)
  const [musicStatus, setMusicStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const musicPlayerRef = useRef<MusicPlayerHandle>(null)
  const [resetKey, setResetKey] = useState(0)
  const [consolePlayerOpen, setConsolePlayerOpen] = useState(false)
  const [speakerPlayerOpen, setSpeakerPlayerOpen] = useState(false)
  const [pianoOpen, setPianoOpen] = useState(false)
  const [pianoInstrument, setPianoInstrument] = useState<'piano' | 'rhodes' | 'synth'>('piano')
  const candleCount = entries.filter((e) => e.candle).length

  useEffect(() => {
    const openConsolePlayer = () => { setSpeakerPlayerOpen(false); setConsolePlayerOpen(true) }
    const openSpeakerPlayer = () => { setConsolePlayerOpen(false); setSpeakerPlayerOpen(true) }
    const openPiano = (event: Event) => {
      const detail = (event as CustomEvent<{ instrument?: 'piano' | 'rhodes' | 'synth' }>).detail
      setPianoInstrument(detail?.instrument === 'rhodes' || detail?.instrument === 'synth' ? detail.instrument : 'piano')
      setPianoOpen(true)
    }
    window.addEventListener('mpd-open-console-player', openConsolePlayer)
    window.addEventListener('mpd-open-speaker-player', openSpeakerPlayer)
    window.addEventListener('mpd-open-piano', openPiano)
    return () => {
      window.removeEventListener('mpd-open-console-player', openConsolePlayer)
      window.removeEventListener('mpd-open-speaker-player', openSpeakerPlayer)
      window.removeEventListener('mpd-open-piano', openPiano)
    }
  }, [])

  const enter = () => {
    unlockAudio()
    musicPlayerRef.current?.playFromGesture()
    setEntered(true)
    setStartSignal((n) => n + 1)
  }

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-neutral-950 text-white">
      <h1 className="sr-only">[MPD] MPD Music Studio 사운드 프로덕션 & 뮤직 커뮤니티</h1>
      {entered && (
        <div className="absolute inset-0">
          <StudioScene
            entries={entries}
            resetKey={resetKey}
            players={multiplayer.players}
            userName={multiplayer.userName}
            onLocalPosition={multiplayer.publishPosition}
            onSelectPlayer={setChatTarget}
          />
        </div>
      )}
      {entered && <Loader containerStyles={{ background: '#0c0a09' }} barStyles={{ background: '#e8b26a' }} dataInterpolation={(p) => `스튜디오 불러오는 중 ${p.toFixed(0)}%`} />}

      <header className="pointer-events-none fixed inset-x-4 top-4 z-20 flex items-start justify-between gap-3">
        <a
          href="https://mpd-music.carrd.co"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="[MPD] MPD Music Studio 사운드 프로덕션 & 뮤직 커뮤니티 공식 페이지 열기"
          className="pointer-events-auto flex items-center gap-3 rounded-full border border-white/10 bg-neutral-950/65 py-1.5 pl-1.5 pr-4 backdrop-blur-md transition hover:border-amber-200/50 hover:bg-neutral-900/80"
        >
          <span className="flex h-9 items-center rounded-full border border-amber-200/35 bg-gradient-to-br from-amber-200 to-amber-400 px-2.5 text-[11px] font-black tracking-wide text-neutral-950">[MPD]</span>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-bold tracking-[0.02em] text-white">MPD Music Studio</p>
            <p className="truncate text-[10px] font-medium tracking-[0.04em] text-amber-100/75">사운드 프로덕션 & 뮤직 커뮤니티</p>
          </div>
        </a>
        <div className="pointer-events-auto flex items-center gap-2">
          <span className="hidden items-center gap-1.5 rounded-full border border-white/10 bg-neutral-950/65 px-3 py-2 text-xs backdrop-blur-md md:flex">
            <span className={`size-1.5 rounded-full ${multiplayer.connection === 'online' ? 'bg-emerald-400' : 'bg-amber-300'}`} />
            {multiplayer.connection === 'online' ? `접속자 ${multiplayer.players.length + 1}명` : multiplayer.connection === 'error' ? '연결 설정 확인' : '미리보기'}
          </span>
          <span className="hidden rounded-full border border-amber-200/20 bg-neutral-950/65 px-2.5 py-2 text-[10px] font-semibold text-amber-100 backdrop-blur-md sm:inline-flex">ID · {multiplayer.userName || '연결 중'}</span>
          {multiplayer.isOwner && <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300/25 bg-emerald-400/10 px-2.5 py-2 text-[10px] font-semibold text-emerald-100"><ShieldCheck className="size-3.5"/> OWNER</span>}
          {entered && multiplayer.userName === 'MPD-Lee' && !multiplayer.isOwner && multiplayer.connection === 'online' && <button type="button" onClick={() => { void navigator.clipboard.writeText(multiplayer.userId).then(() => window.alert('대표 계정 UUID를 복사했습니다. 이 값을 Vercel의 MPD_OWNER_USER_ID와 NEXT_PUBLIC_MPD_OWNER_USER_ID에 등록하세요.')) }} className="rounded-full border border-amber-200/25 bg-neutral-950/75 px-2.5 py-2 text-[10px] font-semibold text-amber-100" title="서버 관리자 권한을 연결할 계정 UUID 복사"><Copy className="mr-1 inline size-3"/>관리자 등록 ID</button>}
          <span className="hidden items-center gap-1.5 rounded-full border border-white/10 bg-neutral-950/65 px-3 py-2 text-xs backdrop-blur-md sm:flex">
            <Flame className="size-3.5 text-amber-300" aria-hidden="true" />
            촛불 {candleCount}
          </span>
          <a
            href={YOUTUBE_CHANNEL_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-full bg-red-600 px-3 py-2 text-xs font-semibold transition hover:bg-red-500"
          >
            YouTube
            <ExternalLink className="size-3.5" aria-hidden="true" />
          </a>
        </div>
      </header>

      <nav
        aria-label="스튜디오 메뉴"
        className="fixed right-4 top-[4.35rem] z-20 flex items-center gap-1 rounded-2xl border border-white/10 bg-neutral-950/75 p-1.5 shadow-xl backdrop-blur-md max-sm:right-2 max-sm:top-[4.1rem]"
      >
        {[
          { label: '방명록', icon: BookOpen, onClick: () => setGuestbookOpen((v) => !v), active: guestbookOpen },
          { label: '촛불 켜기', icon: Flame, onClick: () => setGuestbookOpen(true), active: false },
          { label: '시점 초기화', icon: RotateCcw, onClick: () => setResetKey((k) => k + 1), active: false },
        ].map(({ label, icon: Icon, onClick, active }) => (
          <button
            key={label}
            type="button"
            onClick={onClick}
            aria-pressed={label === '방명록' ? active : undefined}
            className={`flex w-[70px] flex-col items-center gap-1 rounded-xl px-2 py-1.5 text-[11px] transition hover:bg-white/10 ${active ? 'bg-white/10 text-amber-200' : 'text-neutral-200'}`}
          >
            <Icon className="size-4" aria-hidden="true" />
            {label}
          </button>
        ))}
      </nav>

      {entered && <ChatPanel
        userId={multiplayer.userId}
        userName={multiplayer.userName}
        connection={multiplayer.connection}
        players={multiplayer.players}
        target={chatTarget}
        onSelectPlayer={setChatTarget}
        onCloseDirect={() => {
          setChatTarget(null)
        }}
        sendVoiceSignal={multiplayer.sendVoiceSignal}
        isOwner={multiplayer.isOwner}
      />}

      {entered && <GuestbookPanel
        open={guestbookOpen}
        onClose={() => setGuestbookOpen(false)}
        entries={entries}
        storage={storage}
        addEntry={addEntry}
        deleteEntry={deleteEntry}
        isOwner={multiplayer.isOwner}
      />}
      <MusicPlayer ref={musicPlayerRef} startSignal={startSignal} suspended={consolePlayerOpen || speakerPlayerOpen} visible={entered} onStatusChange={setMusicStatus} />
      {entered && <ConsolePlayer open={consolePlayerOpen} onClose={() => setConsolePlayerOpen(false)} />}
      {entered && <ConsolePlayer open={speakerPlayerOpen} videoId="qAOv0gx6HBE" title="라지 스피커 지정 음악" onClose={() => setSpeakerPlayerOpen(false)} />}
      {entered && <PianoKeyboardPanel open={pianoOpen} instrument={pianoInstrument} onClose={() => setPianoOpen(false)} />}

      {!entered && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-neutral-950/88 px-3 py-3 backdrop-blur-md sm:px-6 sm:py-6">
          <div className="flex max-h-[calc(100dvh-24px)] w-full max-w-xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-neutral-950/95 shadow-2xl">
            <div className="shrink-0 border-b border-white/10 px-5 pb-4 pt-5 text-center sm:px-7 sm:pt-7">
              <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-amber-300">Welcome to</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-[0.08em] sm:text-3xl">MPD MUSIC STUDIO</h2>
              <p className="mt-2 text-xs text-amber-100/75">사운드 프로덕션 · 음악 커뮤니티 · 오션 리조트</p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-7">
              <p className="text-center text-sm leading-relaxed text-neutral-200">아름다운 바다와 숲으로 둘러싸인 스튜디오를 자유롭게 둘러보세요.</p>
              <details className="group mt-4 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.035]">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-amber-100 marker:hidden">
                  <span className="flex items-center gap-2"><BookOpen className="size-4"/> 사용법 보기</span>
                  <span className="text-xs text-neutral-400 transition group-open:rotate-180">⌄</span>
                </summary>
                <div className="border-t border-white/10 px-4 py-3">
                  <ul className="space-y-2.5 text-[12px] leading-relaxed text-neutral-200 sm:text-sm">
                    <li className="flex gap-3"><span className="w-[92px] shrink-0 text-amber-200">시점 조작</span><span>마우스 드래그 또는 손가락 드래그로 좌우 회전, 상하 시점 조절</span></li>
                    <li className="flex gap-3"><span className="w-[92px] shrink-0 text-amber-200">PC 이동</span><span>W/A/S/D 또는 방향키로 이동, 바닥을 클릭하면 해당 위치로 걸어갑니다.</span></li>
                    <li className="flex gap-3"><span className="w-[92px] shrink-0 text-amber-200">휴대폰 이동</span><span>왼쪽 아래 조이스틱 또는 이동할 바닥을 터치하세요.</span></li>
                    <li className="flex gap-3"><span className="w-[92px] shrink-0 text-amber-200">모바일 조이스틱</span><span>왼쪽 아래 원형 조이스틱은 휴대폰·터치 기기에서 계속 표시됩니다. 수중에서도 같은 조이스틱으로 좌우·앞뒤 이동하며, 오른쪽 상승·하강 버튼으로 깊이를 조절합니다.</span></li>
                    <li className="flex gap-3"><span className="w-[92px] shrink-0 text-amber-200">피아노</span><span>피아노를 클릭하고 화면 건반을 누르거나 PC 키보드 A W S E D F T G Y H U J K O L P로 연주</span></li>
                    <li className="flex gap-3"><span className="w-[92px] shrink-0 text-amber-200">악기·스피커</span><span>베이스 기타와 새 일렉트릭 기타를 클릭하면 각각 지정 Spotify 트랙을 엽니다. 트랙이 끝나면 자동 반복 재생을 요청하며, 브라우저가 자동 재생을 제한하면 Spotify 플레이어 안의 재생 버튼을 눌러주세요. 베이스 앰프는 펑키 베이스 리프, 오른쪽 대형 스피커는 지정 YouTube 곡을 반복 재생합니다. 콘솔은 기존 레퍼런스 음악 플레이어를 엽니다.</span></li>
                    <li className="flex gap-3"><span className="w-[92px] shrink-0 text-amber-200">피아노 음색</span><span>그랜드 피아노는 어쿠스틱 콘서트 그랜드 샘플, 붉은 로즈 키보드는 일렉트릭 피아노 샘플을 사용합니다. 첫 음은 샘플 준비 중 합성 예비음으로 들릴 수 있으며 이후 샘플 음색으로 전환됩니다.</span></li>
                    <li className="flex gap-3"><span className="w-[92px] shrink-0 text-amber-200">의자·소파</span><span>클릭하면 해당 자리까지 이동해 앉거나 눕습니다. 콘솔 의자는 콘솔 방향으로, 드럼 의자는 드럼을 바라보며 앉고 양손으로 연주하는 동작을 합니다.</span></li>
                    <li className="flex gap-3"><span className="w-[92px] shrink-0 text-amber-200">운동기구</span><span>러닝머신, 자전거, 일립티컬, 로잉, 스텝퍼, 체스트 프레스, 랫 풀다운, 레그 프레스, 샌드백, 벤치 프레스, 요가 매트를 클릭하면 이동 후 동작합니다.</span></li>
                    <li className="flex gap-3"><span className="w-[92px] shrink-0 text-amber-200">수영장</span><span>수영장 물을 클릭하면 입구까지 걸어간 뒤 스쿠버 장비를 착용하고 바닷속으로 들어갑니다. 수중에서는 클릭한 화면 높이로 위아래 이동할 수 있습니다.</span></li>
                    <li className="flex gap-3"><span className="w-[92px] shrink-0 text-amber-200">배경 음악</span><span>입장 버튼을 누르면 오른쪽 아래 MPD Music 영상의 재생과 반복을 요청합니다. 브라우저 정책상 플레이어 연결이 입장 동작보다 늦으면 먼저 음소거로 시작할 수 있으므로, 플레이어에 표시되는 '🔊 MPD Music 배경음악 소리 켜기'를 한 번 눌러주세요. 재생·일시정지, 음소거, 볼륨 조절과 접기도 가능합니다.</span></li>
                    <li className="flex gap-3"><span className="w-[92px] shrink-0 text-amber-200">수중 조작</span><span>모바일은 왼쪽 조이스틱으로 수평 이동, 오른쪽 상승·하강 버튼으로 깊이를 조절합니다. PC는 WASD로 수평 이동, Space로 상승, Shift로 하강합니다. 바다 위로 올라오면 자동으로 해변으로 복귀합니다.</span></li>
                    <li className="flex gap-3"><span className="w-[92px] shrink-0 text-amber-200">파일 업로드·ID</span><span>방문자는 별도 아이디·비밀번호 입력 없이 이용합니다. 파일을 처음 올릴 때 Supabase 익명 계정이 자동으로 생성되고, 그 계정의 UUID 폴더에 파일이 저장됩니다. MPD-숫자 표시 이름은 채팅 작성자 이름이고 실제 소유·업로드 권한은 UUID로 구분합니다. 같은 브라우저의 사이트 데이터를 유지하면 보통 같은 익명 ID를 계속 사용합니다. 사이트 데이터 삭제, 로그아웃 또는 다른 기기에서는 새 ID가 생기며 예전 익명 계정은 복구할 수 없습니다.</span></li>
                    <li className="flex gap-3"><span className="w-[92px] shrink-0 text-amber-200">업로드 준비</span><span>운영자는 Supabase Dashboard → Authentication → Sign In / Providers에서 Anonymous Sign-Ins를 켜야 합니다. 프로젝트에 제공되는 MPD_CHAT_STORAGE_SETUP.sql 전체를 SQL Editor에서 한 번 실행해 채팅 테이블·Realtime·chat-files 저장소·사용자별 폴더 권한을 설정합니다. .env.local에는 프로젝트 기본 URL과 공개용 publishable/anon 키가 정확히 설정되어 있어야 합니다.</span></li>
                    <li className="flex gap-3"><span className="w-[92px] shrink-0 text-amber-200">업로드 주의</span><span>현재 MPD 채팅은 파일당 최대 50MiB로 제한하며 Supabase 프로젝트·버킷 제한이 더 낮으면 그 제한이 적용됩니다. 파일은 공개 링크(getPublicUrl)로 공유되므로 링크를 가진 사람은 열 수 있습니다. 비밀번호·신분증·계약서 등 민감한 파일은 올리지 마세요. 익명 ID는 브라우저 사이트 데이터를 지우거나 다른 기기를 쓰면 달라질 수 있습니다. 'Failed to fetch'는 네트워크·프로젝트 URL·브라우저 확장 프로그램 문제일 수 있으며, 익명 로그인이 꺼졌다는 뜻으로 단정할 수 없습니다.</span></li>
                    <li className="flex gap-3"><span className="w-[92px] shrink-0 text-amber-200">채팅·방명록</span><span>Global Chat은 모두가 함께 보고, 접속자 이름을 누르면 1:1 채팅을 엽니다. 전화 아이콘은 마이크 통화, 방명록 메뉴에서는 글과 촛불을 관리합니다.</span></li>
                    <li className="flex gap-3"><span className="w-[92px] shrink-0 text-amber-200">화면·성능</span><span>시점 초기화 버튼으로 카메라를 처음 위치로 되돌립니다. 휴대폰은 자동으로 낮은 그래픽 설정과 작은 배경 텍스처를 사용합니다.</span></li>
                    <li className="flex gap-3"><span className="w-[92px] shrink-0 text-amber-200">대표 계정</span><span>대표 이름은 MPD-Lee입니다. 채팅·방명록 관리 권한은 서버에 등록된 대표 계정에만 부여됩니다.</span></li>
                  </ul>
                </div>
              </details>
              <p className="mt-3 text-center text-[10px] text-neutral-500">사용법은 접혀 있습니다. 필요할 때만 펼쳐 보세요.</p>
            </div>
            <div className="shrink-0 border-t border-white/10 bg-neutral-950 px-5 pb-[max(14px,env(safe-area-inset-bottom))] pt-3 sm:px-7 sm:pb-5">
              <button
                type="button"
                onClick={enter}
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-amber-300 px-6 py-3 text-sm font-bold text-neutral-950 shadow-lg shadow-amber-950/20 transition hover:bg-amber-200 active:scale-[0.99]"
              >
                <MousePointerClick className="size-4" aria-hidden="true" />
                스튜디오 입장하기
              </button>
              <p aria-live="polite" className={`mt-2 text-center text-[10px] ${musicStatus === 'error' ? 'text-rose-300' : musicStatus === 'ready' ? 'text-emerald-300' : 'text-neutral-500'}`}>
                {musicStatus === 'ready'
                  ? 'MPD Music 플레이어 연결 완료. 입장 버튼을 누르면 재생을 요청합니다. 음소거로 시작하면 플레이어의 소리 켜기를 눌러주세요.'
                  : musicStatus === 'error'
                    ? 'YouTube 플레이어 연결에 실패했습니다. 입장 후 플레이어의 YouTube에서 직접 열기 링크를 확인해 주세요.'
                    : 'MPD Music 플레이어 연결 중입니다. 연결 완료 후 입장하면 재생을 요청합니다.'}
              </p>
              <p className="mt-1 text-center text-[10px] text-neutral-500">입장 전에는 3D 그래픽을 실행하지 않아 휴대폰 자원을 아낍니다.</p>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
