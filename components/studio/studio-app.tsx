'use client'

import { Loader } from '@react-three/drei'
import { BookOpen, ExternalLink, Flame, MousePointerClick, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { ChatPanel } from './chat-panel'
import { useMultiplayer } from '@/lib/use-multiplayer'
import { unlockAudio } from '@/lib/sound'
import { useGuestbook } from '@/lib/use-guestbook'
import { GuestbookPanel } from './guestbook-panel'
import { MusicPlayer } from './music-player'
import { YOUTUBE_CHANNEL_URL } from './scene/control-room'
import { StudioScene } from './scene/studio-scene'

export default function StudioApp() {
  const { entries, storage, addEntry } = useGuestbook()
  const multiplayer = useMultiplayer()
  const [chatTarget, setChatTarget] = useState<{ userId: string; name: string } | null>(null)
  const [guestbookOpen, setGuestbookOpen] = useState(false)
  const [entered, setEntered] = useState(false)
  const [startSignal, setStartSignal] = useState(0)
  const [resetKey, setResetKey] = useState(0)
  const candleCount = entries.filter((e) => e.candle).length

  const enter = () => {
    unlockAudio()
    setEntered(true)
    setStartSignal((n) => n + 1)
  }

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-neutral-950 text-white">
      <h1 className="sr-only">MPD Music Studio 3D 메타버스 녹음실 & 합주실</h1>
      <div className="absolute inset-0">
        <StudioScene
          entries={entries}
          resetKey={resetKey}
          players={multiplayer.players}
          onLocalPosition={multiplayer.publishPosition}
          onSelectPlayer={setChatTarget}
        />
      </div>
      <Loader containerStyles={{ background: '#0c0a09' }} barStyles={{ background: '#e8b26a' }} dataInterpolation={(p) => `스튜디오 불러오는 중 ${p.toFixed(0)}%`} />

      <header className="pointer-events-none fixed inset-x-4 top-4 z-20 flex items-start justify-between gap-3">
        <a
          href="https://mpdlee.carrd.co/"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="MPD Music Studio 공식 페이지 열기"
          className="pointer-events-auto flex items-center gap-3 rounded-full border border-white/10 bg-neutral-950/65 py-1.5 pl-1.5 pr-4 backdrop-blur-md transition hover:border-amber-200/50 hover:bg-neutral-900/80"
        >
          <span className="flex size-8 items-center justify-center rounded-full bg-amber-300 text-xs font-bold text-neutral-950">MPD</span>
          <div className="leading-tight">
            <p className="text-sm font-semibold">MPD Music Studio</p>
            <p className="text-[11px] text-neutral-400">녹음실 & 합주실 · 공식 페이지</p>
          </div>
        </a>
        <div className="pointer-events-auto flex items-center gap-2">
          <span className="hidden items-center gap-1.5 rounded-full border border-white/10 bg-neutral-950/65 px-3 py-2 text-xs backdrop-blur-md md:flex">
            <span className={`size-1.5 rounded-full ${multiplayer.connection === 'online' ? 'bg-emerald-400' : 'bg-amber-300'}`} />
            {multiplayer.connection === 'online' ? `접속자 ${multiplayer.players.length + 1}명` : multiplayer.connection === 'error' ? '연결 설정 확인' : '미리보기'}
          </span>
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
        className="fixed bottom-4 left-4 z-20 flex items-center gap-1 rounded-2xl border border-white/10 bg-neutral-950/70 p-1.5 backdrop-blur-md lg:left-1/2 lg:-translate-x-1/2"
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

      <ChatPanel
        userId={multiplayer.userId}
        userName={multiplayer.userName}
        connection={multiplayer.connection}
        target={chatTarget}
        onCloseDirect={() => setChatTarget(null)}
      />

      <GuestbookPanel
        open={guestbookOpen}
        onClose={() => setGuestbookOpen(false)}
        entries={entries}
        storage={storage}
        addEntry={addEntry}
      />
      <MusicPlayer startSignal={startSignal} />

      {!entered && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/55 p-6 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-white/10 bg-neutral-950/85 p-7 text-center shadow-2xl">
            <p className="text-xs font-medium uppercase tracking-[0.3em] text-amber-300">Welcome to</p>
            <h2 className="mt-2 text-balance text-3xl font-semibold">MPD Music Studio</h2>
            <p className="mt-2 text-sm text-neutral-400">자연과 연결된 프리미엄 녹음실 & 합주실</p>
            <ul className="mt-6 space-y-2 text-left text-sm text-neutral-200">
              <li className="flex gap-3"><span className="w-20 shrink-0 text-amber-200">드래그</span>수평 회전 + 상하 각도 제한 (뒤집힘 방지)</li>
              <li className="flex gap-3"><span className="w-20 shrink-0 text-amber-200">바닥 클릭</span>아바타가 그 위치로 걸어갑니다</li>
              <li className="flex gap-3"><span className="w-20 shrink-0 text-amber-200">뒤쪽 완전 개방 출입구</span>잔디 정원·수영장·비치베드까지 자유롭게 산책합니다</li>
              <li className="flex gap-3"><span className="w-20 shrink-0 text-amber-200">악기 클릭</span>피아노·드럼 연주, 기타/스피커 링크</li>
              <li className="flex gap-3"><span className="w-20 shrink-0 text-amber-200">의자/소파</span>클릭하면 걸어가서 착석합니다</li>
              <li className="flex gap-3"><span className="w-20 shrink-0 text-amber-200">다른 아바타</span>클릭하면 1:1 채팅이 열립니다</li>
              <li className="flex gap-3"><span className="w-20 shrink-0 text-amber-200">Global Chat</span>접힌 채팅 버튼을 눌러 열고 상단을 잡아 이동합니다</li>
              <li className="flex gap-3"><span className="w-20 shrink-0 text-amber-200">마이크 클릭</span>상대 아바타를 먼저 선택하면 1:1 음성통화가 시작됩니다</li>
            </ul>
            <button
              type="button"
              onClick={enter}
              className="mt-7 inline-flex w-full items-center justify-center gap-2 rounded-full bg-amber-300 px-6 py-3 text-sm font-semibold text-neutral-950 transition hover:bg-amber-200"
            >
              <MousePointerClick className="size-4" aria-hidden="true" />
              스튜디오 입장하기
            </button>
          </div>
        </div>
      )}
    </main>
  )
}
