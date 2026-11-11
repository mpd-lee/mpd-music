'use client'

import { useEffect, useRef, useState } from 'react'
import { ExternalLink, Maximize2, Minus, Pause, Play, Volume2, VolumeX, X } from 'lucide-react'
import { loadYouTubeIframeApi, type YouTubePlayer } from '@/lib/youtube-iframe-api'

const VIDEO_ID = 'T8KrE4O0Dlc'
const VIDEO_URL = `https://www.youtube.com/watch?v=${VIDEO_ID}`

export function ConsolePlayer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const playerMount = useRef<HTMLDivElement>(null)
  const player = useRef<YouTubePlayer | null>(null)
  const [status, setStatus] = useState('콘솔 클릭으로 음악 플레이어를 불러왔습니다.')
  const [isPlaying, setIsPlaying] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [isReady, setIsReady] = useState(false)
  const [volume, setVolume] = useState(32)
  const volumeRef = useRef(32)
  const [loadError, setLoadError] = useState('')
  const [minimized, setMinimized] = useState(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setStatus('YouTube 영상 연결 중...')
    setLoadError('')
    setIsReady(false)
    setIsPlaying(false)
    setMinimized(false)
    window.dispatchEvent(new CustomEvent('mpd-console-player-state', { detail: { active: false } }))

    void loadYouTubeIframeApi().then((api) => {
      if (cancelled || !playerMount.current || player.current) return
      player.current = new api.Player(playerMount.current, {
        videoId: VIDEO_ID,
        width: '100%',
        height: '100%',
        playerVars: {
          autoplay: 1,
          controls: 1,
          loop: 1,
          playlist: VIDEO_ID,
          playsinline: 1,
          rel: 0,
          enablejsapi: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: (event: { target: YouTubePlayer }) => {
            if (cancelled) return
            setIsReady(true)
            event.target.setVolume(volumeRef.current)
            event.target.playVideo()
            setStatus('재생 준비 완료 · 자동재생이 차단되면 재생 버튼을 눌러주세요.')
          },
          onStateChange: (event: { data: number; target: YouTubePlayer }) => {
            if (cancelled) return
            const state = api.PlayerState
            const active = event.data === state.PLAYING
            setIsPlaying(active)
            window.dispatchEvent(new CustomEvent('mpd-console-player-state', { detail: { active } }))
            if (active) setStatus('재생 중 · 한 곡 반복')
            if (event.data === state.ENDED) {
              event.target.seekTo(0, true)
              event.target.playVideo()
              setStatus('처음부터 다시 재생합니다.')
            }
            if (event.data === state.PAUSED) setStatus('일시정지')
          },
          onError: (event: { data: number }) => {
            if (cancelled) return
            const message = event.data === 101 || event.data === 150
              ? '이 영상은 소유자가 외부 사이트 재생을 허용하지 않았습니다. YouTube에서 열어주세요.'
              : `YouTube 재생 오류 (${event.data}) · 영상 공개 상태를 확인해 주세요.`
            setLoadError(message)
            setStatus('YouTube 영상 재생 불가')
          },
        },
      })
    }).catch((error: unknown) => {
      if (!cancelled) setLoadError(error instanceof Error ? error.message : 'YouTube 연결에 실패했습니다.')
    })

    return () => {
      cancelled = true
      player.current?.destroy()
      player.current = null
      setIsReady(false)
      setIsPlaying(false)
      window.dispatchEvent(new CustomEvent('mpd-console-player-state', { detail: { active: false } }))
    }
  }, [open])

  useEffect(() => {
    volumeRef.current = volume
    if (player.current) player.current.setVolume(volume)
  }, [volume])

  const togglePlayback = () => {
    if (!player.current || !isReady) {
      window.open(VIDEO_URL, '_blank', 'noopener,noreferrer')
      return
    }
    if (isPlaying) player.current.pauseVideo()
    else player.current.playVideo()
  }

  const toggleMute = () => {
    if (!player.current || !isReady) return
    if (isMuted) player.current.unMute()
    else player.current.mute()
    setIsMuted((value) => !value)
  }

  const closePlayer = () => {
    setMinimized(false)
    onClose()
  }

  if (!open) return null

  return (
    <>
      {/* The same iframe mount stays in the DOM while minimized, so playback continues in the dock. */}
      <section
        aria-hidden={minimized}
        className={minimized
          ? 'pointer-events-none fixed -left-[10000px] top-0 z-[-1] h-[220px] w-[220px] overflow-hidden opacity-0'
          : 'fixed inset-x-3 bottom-[5.3rem] z-[60] mx-auto max-h-[70dvh] w-[94vw] max-w-[980px] overflow-y-auto rounded-2xl border border-amber-200/25 bg-[#090d12]/95 p-4 text-white shadow-[0_18px_70px_rgba(0,0,0,0.65)] backdrop-blur-xl'}
      >
        <div className={minimized ? 'h-[220px] w-[220px]' : 'grid gap-4 md:grid-cols-[minmax(280px,360px)_1fr]'}>
          <div className={minimized ? 'h-[220px] w-[220px]' : 'overflow-hidden rounded-xl border border-white/10 bg-black'}>
            <div className={minimized ? 'h-full w-full' : 'aspect-[4/3] min-h-[220px] w-full'}>
              <div ref={playerMount} className="h-full w-full" />
            </div>
            {!minimized && (
              <div className="flex items-center justify-between border-t border-white/10 px-3 py-2 text-xs text-neutral-300">
                <span>지정하신 YouTube 영상</span>
                <a href={VIDEO_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-amber-200 hover:text-amber-100">YouTube에서 열기 <ExternalLink className="size-3" /></a>
              </div>
            )}
          </div>

          {!minimized && (
            <div className="flex min-w-0 flex-col justify-between gap-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold tracking-[0.24em] text-amber-300">MPD CONSOLE MONITOR</p>
                  <h2 className="mt-1 text-base font-semibold">레퍼런스 음악 · 무한 반복</h2>
                  <p className="mt-1 text-xs text-neutral-400">{status}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button type="button" onClick={() => setMinimized(true)} aria-label="음악 창 최소화" title="최소화" className="rounded-full border border-white/10 p-2 hover:bg-white/10"><Minus className="size-4" /></button>
                  <button type="button" onClick={closePlayer} aria-label="음악 플레이어 닫기" title="닫기" className="rounded-full border border-white/10 p-2 hover:bg-white/10"><X className="size-4" /></button>
                </div>
              </div>

              <div className="rounded-xl border border-emerald-300/15 bg-black/50 p-3">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-[10px] font-bold tracking-[0.2em] text-emerald-200">SPECTRUM ANALYZER</span>
                  <span className={`rounded-full px-2 py-1 text-[10px] ${isPlaying ? 'bg-emerald-400/15 text-emerald-200' : 'bg-white/10 text-neutral-400'}`}>{isPlaying ? 'SIGNAL ACTIVE' : 'STANDBY'}</span>
                </div>
                <div className="flex h-28 items-end gap-[3px] overflow-hidden">
                  {Array.from({ length: 56 }, (_, index) => (
                    <span key={index} className={`mpd-spectrum-bar min-w-0 flex-1 rounded-t-[2px] ${isPlaying ? 'opacity-100' : 'opacity-35'}`} style={{ animationDelay: `${(index % 13) * -0.11}s`, height: `${18 + ((index * 37) % 69)}%` }} />
                  ))}
                </div>
                <div className="mt-2 flex justify-between text-[9px] tracking-widest text-neutral-500"><span>LOW</span><span>MID</span><span>HIGH</span></div>
              </div>

              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-3">
                <button type="button" onClick={togglePlayback} disabled={!isReady} className="inline-flex items-center gap-2 rounded-full bg-amber-300 px-4 py-2 text-sm font-bold text-black hover:bg-amber-200 disabled:opacity-50">
                  {isPlaying ? <Pause className="size-4" /> : <Play className="size-4" />}{isPlaying ? '일시정지' : '재생'}
                </button>
                <button type="button" onClick={toggleMute} disabled={!isReady} className="rounded-full border border-white/15 p-2 hover:bg-white/10 disabled:opacity-40" aria-label={isMuted ? '음소거 해제' : '음소거'}>
                  {isMuted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
                </button>
                <div className="flex min-w-[150px] flex-1 items-center gap-2">
                  <input aria-label="음악 볼륨" type="range" min="0" max="100" value={volume} onChange={(event) => setVolume(Number(event.target.value))} className="w-full accent-amber-300" />
                  <span className="w-9 text-right text-xs tabular-nums text-neutral-300">{volume}%</span>
                </div>
              </div>
              {loadError && <p role="alert" className="rounded-lg border border-rose-400/25 bg-rose-950/35 p-3 text-xs leading-relaxed text-rose-200">{loadError} <a href={VIDEO_URL} target="_blank" rel="noopener noreferrer" className="ml-1 underline">영상 열기</a></p>}
              <p className="text-[11px] leading-relaxed text-neutral-500">브라우저 자동재생 정책에 따라 첫 재생 때 재생 버튼을 한 번 더 눌러야 할 수 있습니다. 미터는 재생 상태에 연동된 시각화이며 YouTube 내부 오디오 신호를 직접 측정하지는 않습니다.</p>
            </div>
          )}
        </div>
      </section>

      {minimized && (
        <div className="fixed bottom-[5.5rem] left-[10.8rem] z-[45] flex w-[min(270px,calc(100vw-185px))] items-center gap-2 rounded-2xl border border-amber-200/25 bg-[#090d12]/95 p-2 text-white shadow-2xl backdrop-blur-xl">
          <button type="button" onClick={() => setMinimized(false)} className="flex min-w-0 flex-1 items-center gap-2 text-left" title="음악 플레이어 펼치기">
            <span className={`flex size-8 shrink-0 items-center justify-center rounded-full ${isPlaying ? 'bg-emerald-300/15 text-emerald-200' : 'bg-white/10 text-neutral-300'}`}><Maximize2 className="size-4" /></span>
            <span className="min-w-0"><span className="block truncate text-[11px] font-semibold">MPD Console Music</span><span className="block truncate text-[9px] text-neutral-400">{isPlaying ? '재생 중 · 한 곡 반복' : status}</span></span>
          </button>
          <button type="button" onClick={togglePlayback} disabled={!isReady} aria-label={isPlaying ? '일시정지' : '재생'} title={isPlaying ? '일시정지' : '재생'} className="rounded-lg p-1.5 hover:bg-white/10 disabled:opacity-40">{isPlaying ? <Pause className="size-4" /> : <Play className="size-4" />}</button>
          <button type="button" onClick={toggleMute} disabled={!isReady} aria-label={isMuted ? '음소거 해제' : '음소거'} title={isMuted ? '음소거 해제' : '음소거'} className="rounded-lg p-1.5 hover:bg-white/10 disabled:opacity-40">{isMuted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}</button>
          <button type="button" onClick={closePlayer} aria-label="음악 플레이어 닫기" title="닫기" className="rounded-lg p-1.5 text-neutral-400 hover:bg-white/10 hover:text-white"><X className="size-4" /></button>
        </div>
      )}

      <style>{`@keyframes mpd-spectrum { 0%,100%{transform:scaleY(.15);filter:hue-rotate(0deg)} 18%{transform:scaleY(.82)} 42%{transform:scaleY(.34)} 66%{transform:scaleY(1)} 82%{transform:scaleY(.5);filter:hue-rotate(30deg)} } .mpd-spectrum-bar{transform-origin:bottom;animation:mpd-spectrum .78s ease-in-out infinite;background:linear-gradient(to top,#20d58b 0%,#b5e84b 56%,#ffbd4c 83%,#ff5e53 100%);box-shadow:0 0 8px rgba(48,225,151,.22)}`}</style>
    </>
  )
}
