'use client'

import { ChevronDown, Pause, Play, Volume2, VolumeX } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

const VIDEO_ID = '8JUMTVvHd-4'

type YTPlayer = {
  playVideo: () => void
  pauseVideo: () => void
  mute: () => void
  unMute: () => void
  setVolume: (v: number) => void
  seekTo: (s: number) => void
  getPlayerState: () => number
  getVideoData?: () => { title?: string }
}

declare global {
  interface Window {
    YT?: { Player: new (el: HTMLElement, opts: unknown) => YTPlayer; PlayerState: Record<string, number> }
    onYouTubeIframeAPIReady?: () => void
  }
}

export function MusicPlayer({ startSignal }: { startSignal: number }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<YTPlayer | null>(null)
  const [ready, setReady] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(false)
  const [volume, setVolume] = useState(45)
  const [minimized, setMinimized] = useState(false)
  const [title, setTitle] = useState('MPD Music 배경 음악')

  useEffect(() => {
    let cancelled = false
    const create = () => {
      if (cancelled || !containerRef.current || playerRef.current || !window.YT) return
      const host = document.createElement('div')
      containerRef.current.appendChild(host)
      playerRef.current = new window.YT.Player(host, {
        videoId: VIDEO_ID,
        width: '100%',
        height: '100%',
        playerVars: { autoplay: 1, loop: 1, playlist: VIDEO_ID, controls: 0, playsinline: 1, rel: 0, modestbranding: 1 },
        events: {
          onReady: (e: { target: YTPlayer }) => {
            setReady(true)
            e.target.setVolume(45)
            e.target.playVideo()
            const data = e.target.getVideoData?.()
            if (data?.title) setTitle(data.title)
          },
          onStateChange: (e: { data: number; target: YTPlayer }) => {
            const S = window.YT!.PlayerState
            if (e.data === S.PLAYING) {
              setPlaying(true)
              const data = e.target.getVideoData?.()
              if (data?.title) setTitle(data.title)
            } else if (e.data === S.PAUSED) setPlaying(false)
            else if (e.data === S.ENDED) {
              e.target.seekTo(0)
              e.target.playVideo()
            }
          },
        },
      })
    }

    if (window.YT?.Player) create()
    else {
      const previous = window.onYouTubeIframeAPIReady
      window.onYouTubeIframeAPIReady = () => {
        previous?.()
        create()
      }
      if (!document.getElementById('youtube-iframe-api')) {
        const script = document.createElement('script')
        script.id = 'youtube-iframe-api'
        script.src = 'https://www.youtube.com/iframe_api'
        document.body.appendChild(script)
      }
    }
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (startSignal > 0 && playerRef.current) {
      playerRef.current.unMute()
      playerRef.current.playVideo()
      setMuted(false)
    }
  }, [startSignal])

  const togglePlay = () => {
    const p = playerRef.current
    if (!p) return
    if (playing) p.pauseVideo()
    else p.playVideo()
  }

  const toggleMute = () => {
    const p = playerRef.current
    if (!p) return
    if (muted) p.unMute()
    else p.mute()
    setMuted(!muted)
  }

  return (
    <>
      <section
        aria-label="배경 음악 플레이어"
        aria-hidden={minimized}
        className={cn(
          'fixed bottom-4 right-4 z-30 w-[min(300px,calc(100vw-2rem))] rounded-2xl border border-white/10 bg-neutral-950/75 p-3 text-white shadow-2xl backdrop-blur-md transition-all duration-300',
          minimized && 'pointer-events-none translate-y-6 opacity-0',
        )}
      >
        <div className="flex items-center gap-3">
          <div ref={containerRef} className="relative h-[54px] w-24 shrink-0 overflow-hidden rounded-lg bg-black [&_iframe]:pointer-events-none" />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-medium uppercase tracking-widest text-amber-300/90">Now Playing · 무한 반복</p>
            <p className="truncate text-sm font-medium" title={title}>
              {title}
            </p>
            <div className="mt-1 flex h-3 items-end gap-0.5" aria-hidden="true">
              {Array.from({ length: 14 }).map((_, i) => (
                <span
                  key={i}
                  className={cn('w-1 rounded-sm bg-amber-300/80', playing ? 'animate-pulse' : '')}
                  style={{ height: playing ? `${30 + ((i * 37) % 70)}%` : '20%', animationDelay: `${i * 90}ms` }}
                />
              ))}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setMinimized(true)}
            className="flex size-8 shrink-0 items-center justify-center self-start rounded-full text-neutral-300 transition hover:bg-white/10 hover:text-white"
            aria-label="플레이어 최소화"
            title="최소화 / 접기"
          >
            <ChevronDown className="size-4" />
          </button>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={togglePlay}
            disabled={!ready}
            className="flex size-9 items-center justify-center rounded-full bg-amber-300 text-neutral-950 transition hover:bg-amber-200 disabled:opacity-50"
            aria-label={playing ? '일시정지' : '재생'}
          >
            {playing ? <Pause className="size-4" /> : <Play className="size-4 translate-x-px" />}
          </button>
          <button
            type="button"
            onClick={toggleMute}
            disabled={!ready}
            className="flex size-8 items-center justify-center rounded-full text-neutral-200 transition hover:bg-white/10 disabled:opacity-50"
            aria-label={muted ? '음소거 해제' : '음소거'}
          >
            {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
          </button>
          <input
            type="range"
            min={0}
            max={100}
            value={volume}
            onChange={(e) => {
              const v = Number(e.target.value)
              setVolume(v)
              playerRef.current?.setVolume(v)
            }}
            className="h-1 flex-1 cursor-pointer accent-amber-300"
            aria-label="볼륨"
          />
        </div>
      </section>

      {minimized && (
        <button
          type="button"
          onClick={() => setMinimized(false)}
          className="fixed bottom-4 right-4 z-30 flex size-12 items-center justify-center rounded-full border border-amber-200/30 bg-neutral-950/80 text-xl shadow-2xl backdrop-blur-md transition hover:scale-105"
          aria-label="배경 음악 플레이어 열기"
          title="플레이어 열기"
        >
          {playing && <span className="absolute inset-0 animate-ping rounded-full border border-amber-300/40" aria-hidden="true" />}
          <span aria-hidden="true">🎵</span>
        </button>
      )}
    </>
  )
}
