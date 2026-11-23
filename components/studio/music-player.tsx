'use client'

import { ChevronDown, ExternalLink, Pause, Play, Volume2, VolumeX, X } from 'lucide-react'
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { loadYouTubeIframeApi, type YouTubePlayer } from '@/lib/youtube-iframe-api'

// 기존 MPD 배경 음악은 유지합니다. 콘솔 플레이어가 열리면 자동으로 잠시 멈춥니다.
const VIDEO_ID = '8JUMTVvHd-4'

type SpotifyTrackChoice = { id: string; title: string; url: string }
type SpotifyPlaybackUpdate = { playingURI?: string; isPaused: boolean; isBuffering: boolean; duration: number; position: number }
type SpotifyEmbedController = {
  loadEntity?: (uriOrUrl: string) => void
  loadUri: (uri: string) => void
  play: () => void
  pause: () => void
  restart: () => void
  addListener: (event: string, callback: (event: { data?: SpotifyPlaybackUpdate }) => void) => void
  destroy: () => void
}
type SpotifyIframeApi = {
  createController: (element: HTMLElement, options: { uri: string; width: number; height: number }, callback: (controller: SpotifyEmbedController) => void) => void
}
declare global {
  interface Window { onSpotifyIframeApiReady?: (api: SpotifyIframeApi) => void }
}

const SPOTIFY_TRACK_CHOICES: Record<string, SpotifyTrackChoice> = {
  bass: { id: '7BjbMr0x9y6E7lEJWToJHn', title: '베이스 기타 연주곡', url: 'https://open.spotify.com/track/7BjbMr0x9y6E7lEJWToJHn' },
  electric: { id: '4axVLkm3SntSDRPtf2PPSF', title: '일렉트릭 기타 연주곡', url: 'https://open.spotify.com/track/4axVLkm3SntSDRPtf2PPSF' },
}

let spotifyIframeApiPromise: Promise<SpotifyIframeApi> | null = null
function loadSpotifyIframeApi(): Promise<SpotifyIframeApi> {
  if (spotifyIframeApiPromise) return spotifyIframeApiPromise
  spotifyIframeApiPromise = new Promise((resolve, reject) => {
    const previous = window.onSpotifyIframeApiReady
    let settled = false
    window.onSpotifyIframeApiReady = (api) => {
      previous?.(api)
      if (settled) return
      settled = true
      resolve(api)
    }
    const script = document.createElement('script')
    script.src = 'https://open.spotify.com/embed/iframe-api/v1'
    script.async = true
    script.dataset.mpdSpotifyIframeApi = 'true'
    script.onerror = () => {
      if (!settled) { settled = true; spotifyIframeApiPromise = null; reject(new Error('Spotify 임베드 플레이어를 불러오지 못했습니다.')) }
    }
    document.head.appendChild(script)
  })
  return spotifyIframeApiPromise
}

export type MusicPlayerHandle = { playFromGesture: () => void }
type MusicPlayerStatus = 'loading' | 'ready' | 'error'
type MusicPlayerProps = { startSignal: number; suspended?: boolean; visible?: boolean; onStatusChange?: (status: MusicPlayerStatus) => void }

export const MusicPlayer = forwardRef<MusicPlayerHandle, MusicPlayerProps>(function MusicPlayer({ startSignal, suspended = false, visible = true, onStatusChange }, forwardedRef) {
  const containerRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<YouTubePlayer | null>(null)
  const spotifyHostRef = useRef<HTMLDivElement>(null)
  const spotifyControllerRef = useRef<SpotifyEmbedController | null>(null)
  const spotifyReadyRef = useRef(false)
  const pendingSpotifyTrackRef = useRef<SpotifyTrackChoice | null>(null)
  const currentSpotifyTrackRef = useRef<SpotifyTrackChoice | null>(null)
  const spotifyLoopRestartAtRef = useRef(0)
  const resumeYouTubeAfterSpotifyRef = useRef(false)
  const playingRef = useRef(false)
  const suspendedRef = useRef(suspended)
  const resumeAfterConsoleRef = useRef(false)
  const playRequestedRef = useRef(false)
  const startSignalRef = useRef(startSignal)
  const previousSuspendedRef = useRef(false)
  const volumeRef = useRef(45)
  const [ready, setReady] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(true)
  const [volume, setVolume] = useState(45)
  const [minimized, setMinimized] = useState(false)
  const [title, setTitle] = useState('MPD Music 배경 음악')
  const [loadError, setLoadError] = useState('')
  const [needsSoundTap, setNeedsSoundTap] = useState(false)
  const [connectionAttempt, setConnectionAttempt] = useState(0)
  const [spotifySelection, setSpotifySelection] = useState<SpotifyTrackChoice | null>(null)
  const [spotifyStatus, setSpotifyStatus] = useState<'loading' | 'ready' | 'playing' | 'error'>('loading')
  const [spotifyError, setSpotifyError] = useState('')
  const onStatusChangeRef = useRef(onStatusChange)
  onStatusChangeRef.current = onStatusChange

  suspendedRef.current = suspended
  volumeRef.current = volume
  startSignalRef.current = startSignal

  useImperativeHandle(forwardedRef, () => ({
    playFromGesture: () => {
      playRequestedRef.current = true
      const player = playerRef.current
      if (player && ready && !suspendedRef.current) {
        player.unMute()
        player.setVolume(volumeRef.current)
        player.playVideo()
        playRequestedRef.current = false
        setMuted(false)
        setNeedsSoundTap(false)
      }
    },
  }), [ready])

  // Warm up the official Spotify Embed controller before the visitor clicks a guitar.
  // The iframe remains visible when selected; it is never used as a hidden audio-only stream.
  useEffect(() => {
    let cancelled = false
    void loadSpotifyIframeApi().then((api) => {
      if (cancelled || !spotifyHostRef.current || spotifyControllerRef.current) return
      api.createController(spotifyHostRef.current, {
        uri: `spotify:track:${SPOTIFY_TRACK_CHOICES.bass.id}`,
        width: 300,
        height: 152,
      }, (controller) => {
        if (cancelled) { try { controller.destroy() } catch { /* already removed */ }; return }
        spotifyControllerRef.current = controller
        controller.addListener('ready', () => {
          spotifyReadyRef.current = true
          setSpotifyStatus('ready')
          // A click can occur while the Spotify iframe is still loading. Keep the
          // selection queued until the Embed API explicitly reports ready.
          const pending = pendingSpotifyTrackRef.current
          if (pending) {
            pendingSpotifyTrackRef.current = null
            const uri = `spotify:track:${pending.id}`
            try {
              if (controller.loadEntity) controller.loadEntity(uri)
              else controller.loadUri(uri)
              controller.play()
            } catch {
              pendingSpotifyTrackRef.current = pending
              setSpotifyStatus('ready')
            }
          }
        })
        controller.addListener('playback_started', (event) => {
          const playingURI = event.data?.playingURI
          const current = currentSpotifyTrackRef.current
          if (current && (!playingURI || playingURI === `spotify:track:${current.id}`)) setSpotifyStatus('playing')
        })
        controller.addListener('playback_update', (event) => {
          const state = event.data
          const current = currentSpotifyTrackRef.current
          if (!state || !current || state.isBuffering || !state.isPaused || state.duration <= 0) return
          if (state.playingURI && state.playingURI !== `spotify:track:${current.id}`) return
          // Spotify's public Embed API has no repeat-mode switch. When it reports
          // this selected track at its end, request a restart through the official API.
          if (state.position >= state.duration - 1200 && performance.now() - spotifyLoopRestartAtRef.current > 1800) {
            spotifyLoopRestartAtRef.current = performance.now()
            try { controller.restart(); controller.play(); setSpotifyStatus('ready') } catch { setSpotifyStatus('ready') }
          }
        })
      })
    }).catch((error: unknown) => {
      if (!cancelled) {
        setSpotifyError(error instanceof Error ? error.message : 'Spotify 연결에 실패했습니다.')
        setSpotifyStatus('error')
      }
    })

    const playSpotifyFromGuitar = (event: Event) => {
      const detail = (event as CustomEvent<{ track: 'bass' | 'electric' }>).detail
      const track = SPOTIFY_TRACK_CHOICES[detail?.track]
      if (!track) return
      currentSpotifyTrackRef.current = track
      spotifyLoopRestartAtRef.current = 0
      pendingSpotifyTrackRef.current = track
      setSpotifySelection(track)
      setSpotifyError('')
      setSpotifyStatus(spotifyReadyRef.current ? 'ready' : 'loading')

      const youtube = playerRef.current
      if (youtube && (playingRef.current || youtube.getPlayerState?.() === 1)) {
        resumeYouTubeAfterSpotifyRef.current = true
        youtube.pauseVideo()
        playingRef.current = false
        setPlaying(false)
      }

      const controller = spotifyControllerRef.current
      if (controller && spotifyReadyRef.current) {
        pendingSpotifyTrackRef.current = null
        const uri = `spotify:track:${track.id}`
        try {
          if (controller.loadEntity) controller.loadEntity(uri)
          else controller.loadUri(uri)
          // This call is made synchronously from the real guitar click.
          controller.play()
          // The actual playing state is confirmed by Spotify's playback_started event.
        } catch {
          pendingSpotifyTrackRef.current = track
          setSpotifyStatus('ready')
        }
      }
    }

    window.addEventListener('mpd-play-spotify-track', playSpotifyFromGuitar)
    return () => {
      cancelled = true
      window.removeEventListener('mpd-play-spotify-track', playSpotifyFromGuitar)
      const controller = spotifyControllerRef.current
      spotifyControllerRef.current = null
      spotifyReadyRef.current = false
      if (controller) { try { controller.destroy() } catch { /* already disposed */ } }
      spotifyHostRef.current?.replaceChildren()
    }
  }, [])

  // 사용자 입장 버튼을 누르기 전에는 배경 음악을 자동으로 불러오거나 재생하지 않습니다.
  useEffect(() => {
    let cancelled = false

    void loadYouTubeIframeApi().then((api) => {
      if (cancelled || !containerRef.current || playerRef.current) return
      const host = document.createElement('div')
      containerRef.current.appendChild(host)
      playerRef.current = new api.Player(host, {
        videoId: VIDEO_ID,
        width: '100%',
        height: '100%',
        playerVars: {
          // Browsers may block unmuted autoplay when the IFrame finishes loading
          // after the visitor's entry tap. Start muted as a reliable fallback.
          autoplay: 0,
          mute: 1,
          loop: 1,
          playlist: VIDEO_ID,
          controls: 0,
          playsinline: 1,
          rel: 0,
          modestbranding: 1,
          enablejsapi: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: (event: { target: YouTubePlayer }) => {
            if (cancelled) return
            setReady(true)
            onStatusChangeRef.current?.('ready')
            event.target.setVolume(volumeRef.current)
            const data = event.target.getVideoData?.()
            if (data?.title) setTitle(data.title)
            if (suspendedRef.current) resumeAfterConsoleRef.current = true
            else if (playRequestedRef.current || startSignalRef.current > 0) {
              // Muted playback is allowed by browser autoplay policies. The volume
              // button below performs the unmute from a fresh user gesture.
              event.target.mute()
              event.target.setVolume(volumeRef.current)
              event.target.playVideo()
              setMuted(true)
              setNeedsSoundTap(true)
              playRequestedRef.current = false
            }
          },
          onStateChange: (event: { data: number; target: YouTubePlayer }) => {
            if (cancelled) return
            const state = api.PlayerState
            if (event.data === state.PLAYING) {
              if (suspendedRef.current) {
                resumeAfterConsoleRef.current = true
                event.target.pauseVideo()
                playingRef.current = false
                setPlaying(false)
                return
              }
              playingRef.current = true
              setPlaying(true)
              const data = event.target.getVideoData?.()
              if (data?.title) setTitle(data.title)
            } else if (event.data === state.ENDED) {
              event.target.seekTo(0, true)
              event.target.playVideo()
              playingRef.current = true
              setPlaying(true)
            } else if (event.data === state.PAUSED) {
              playingRef.current = false
              setPlaying(false)
            }
          },
          onError: (event: { data: number }) => {
            if (!cancelled) {
              const reason = event.data === 101 || event.data === 150
                ? '영상 소유자가 외부 사이트 재생을 허용하지 않았습니다.'
                : event.data === 100
                  ? '영상이 삭제되었거나 비공개 상태입니다.'
                  : event.data === 2
                    ? 'YouTube 영상 주소가 올바르지 않습니다.'
                    : event.data === 5
                      ? '브라우저의 YouTube HTML5 재생에 문제가 발생했습니다.'
                      : `YouTube 재생 오류 ${event.data}`
              setLoadError(`MPD 배경 음악을 재생할 수 없습니다. ${reason}`)
              onStatusChangeRef.current?.('error')
            }
          },
        },
      })
    }).catch((error: unknown) => {
      if (!cancelled) {
        setLoadError(error instanceof Error ? error.message : 'YouTube 연결에 실패했습니다.')
        onStatusChangeRef.current?.('error')
      }
    })

    return () => {
      cancelled = true
      const currentPlayer = playerRef.current
      playerRef.current = null
      if (currentPlayer) {
        try { currentPlayer.destroy() } catch { /* player may already be disposed */ }
      }
      containerRef.current?.replaceChildren()
    }
  }, [connectionAttempt])

  // 콘솔에서 지정 음악을 재생할 때 기존 배경 트랙과 소리가 겹치지 않도록 관리합니다.
  useEffect(() => {
    const player = playerRef.current
    const justOpenedConsole = suspended && !previousSuspendedRef.current
    const justClosedConsole = !suspended && previousSuspendedRef.current

    if (player && justOpenedConsole) {
      const currentlyPlaying = player.getPlayerState() === 1 || playingRef.current
      resumeAfterConsoleRef.current = currentlyPlaying
      if (currentlyPlaying) player.pauseVideo()
      playingRef.current = false
      setPlaying(false)
    } else if (player && justClosedConsole && resumeAfterConsoleRef.current) {
      resumeAfterConsoleRef.current = false
      player.playVideo()
    }

    previousSuspendedRef.current = suspended
  }, [suspended])

  const closeSpotifyPlayer = () => {
    try { spotifyControllerRef.current?.pause() } catch { /* Spotify iframe may be transitioning */ }
    currentSpotifyTrackRef.current = null
    pendingSpotifyTrackRef.current = null
    setSpotifySelection(null)
    if (resumeYouTubeAfterSpotifyRef.current && !suspendedRef.current) {
      resumeYouTubeAfterSpotifyRef.current = false
      playerRef.current?.playVideo()
    }
  }

  const retryConnection = () => {
    setLoadError('')
    setReady(false)
    setPlaying(false)
    setMuted(true)
    setNeedsSoundTap(false)
    playRequestedRef.current = true
    setConnectionAttempt((attempt) => attempt + 1)
  }

  const togglePlay = () => {
    const player = playerRef.current
    if (!player || !ready || suspended) return
    if (playing) {
      playingRef.current = false
      player.pauseVideo()
    } else {
      if (muted) {
        player.unMute()
        player.setVolume(volumeRef.current)
        setMuted(false)
        setNeedsSoundTap(false)
      }
      player.playVideo()
    }
  }

  const toggleMute = () => {
    const player = playerRef.current
    if (!player || !ready) return
    if (muted) { player.unMute(); player.setVolume(volumeRef.current) }
    else player.mute()
    setMuted((value) => !value)
  }

  return (
    <>
      <section
        aria-label="배경 음악 플레이어"
        aria-hidden={minimized}
        className={cn(
          'mpd-music-player fixed bottom-4 right-4 z-30 w-[min(300px,calc(100vw-2rem))] rounded-2xl border border-white/10 bg-neutral-950/75 p-3 text-white shadow-2xl backdrop-blur-md transition-all duration-300',
          minimized && 'pointer-events-none translate-y-6 opacity-0',
          suspended && 'opacity-55',
          !visible && 'pointer-events-none opacity-0',
        )}
      >
        <div className="flex items-center gap-3">
          <div ref={containerRef} className="relative h-[54px] w-24 shrink-0 overflow-hidden rounded-lg bg-black [&_iframe]:pointer-events-none" />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-medium uppercase tracking-widest text-amber-300/90">{suspended ? 'CONSOLE PLAYER ACTIVE' : 'Now Playing · 무한 반복'}</p>
            <p className="truncate text-sm font-medium" title={title}>{title}</p>
            {!ready && !loadError && <p className="mt-0.5 text-[9px] text-neutral-400">YouTube 플레이어 연결 중…</p>}
            <div className="mt-1 flex h-3 items-end gap-0.5" aria-hidden="true">
              {Array.from({ length: 14 }).map((_, i) => (
                <span key={i} className={cn('w-1 rounded-sm bg-amber-300/80', playing && !suspended ? 'animate-pulse' : '')} style={{ height: playing && !suspended ? `${30 + ((i * 37) % 70)}%` : '20%', animationDelay: `${i * 90}ms` }} />
              ))}
            </div>
          </div>
          <button type="button" onClick={() => setMinimized(true)} className="flex size-8 shrink-0 items-center justify-center self-start rounded-full text-neutral-300 transition hover:bg-white/10 hover:text-white" aria-label="플레이어 최소화" title="최소화 / 접기">
            <ChevronDown className="size-4" />
          </button>
        </div>
        {muted && ready && !suspended && (
          <button type="button" onClick={() => { playerRef.current?.unMute(); playerRef.current?.setVolume(volumeRef.current); playerRef.current?.playVideo(); setMuted(false); setNeedsSoundTap(false) }} className="mt-2 w-full rounded-lg bg-amber-300 px-3 py-2 text-xs font-bold text-neutral-950 hover:bg-amber-200">
            🔊 MPD Music 배경음악 소리 켜기
          </button>
        )}
        <div className="mt-3 flex items-center gap-2">
          <button type="button" onClick={togglePlay} disabled={!ready || suspended} className="flex size-9 items-center justify-center rounded-full bg-amber-300 text-neutral-950 transition hover:bg-amber-200 disabled:opacity-50" aria-label={playing ? '일시정지' : '재생'}>
            {playing ? <Pause className="size-4" /> : <Play className="size-4 translate-x-px" />}
          </button>
          <button type="button" onClick={toggleMute} disabled={!ready || suspended} className="flex size-8 items-center justify-center rounded-full text-neutral-200 transition hover:bg-white/10 disabled:opacity-50" aria-label={muted ? '음소거 해제' : '음소거'}>
            {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
          </button>
          <input type="range" min={0} max={100} value={volume} disabled={!ready || suspended} onChange={(event) => {
            const nextVolume = Number(event.target.value)
            setVolume(nextVolume)
            playerRef.current?.setVolume(nextVolume)
          }} className="h-1 flex-1 cursor-pointer accent-amber-300 disabled:opacity-50" aria-label="볼륨" />
        </div>
        {loadError && (
          <div role="status" className="mt-2 space-y-2 text-[10px] text-rose-200">
            <p>{loadError}</p>
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" onClick={retryConnection} className="rounded-md bg-white/10 px-2 py-1 text-white underline-offset-2 hover:bg-white/15">연결 다시 시도</button>
              <a className="underline" href={`https://www.youtube.com/watch?v=${VIDEO_ID}`} target="_blank" rel="noopener noreferrer">YouTube에서 직접 열기</a>
            </div>
          </div>
        )}
      </section>

      {minimized && !spotifySelection && (
        <button type="button" onClick={() => setMinimized(false)} className="fixed bottom-4 right-4 z-30 flex size-12 items-center justify-center rounded-full border border-amber-200/30 bg-neutral-950/80 text-xl shadow-2xl backdrop-blur-md transition hover:scale-105" aria-label="배경 음악 플레이어 열기" title="플레이어 열기">
          {playing && !suspended && <span className="absolute inset-0 animate-ping rounded-full border border-amber-300/40" aria-hidden="true" />}
          <span aria-hidden="true">🎵</span>
        </button>
      )}

      <section
        aria-label="Spotify 기타 연주곡 플레이어"
        aria-hidden={!spotifySelection}
        className={cn(
          'mpd-spotify-player fixed bottom-4 right-4 z-50 w-[min(320px,calc(100vw-24px))] overflow-hidden rounded-2xl border border-emerald-200/20 bg-neutral-950/95 p-2.5 text-white shadow-2xl backdrop-blur-xl transition-all duration-200',
          !spotifySelection && 'pointer-events-none translate-y-3 opacity-0',
          spotifySelection && 'opacity-100',
        )}
      >
        <div className="mb-2 flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-[9px] font-bold tracking-[0.18em] text-emerald-300">MPD INSTRUMENT TRACK</p>
            <p className="truncate text-xs font-semibold">{spotifySelection?.title || 'Spotify 연주곡'}</p>
            <p className="text-[9px] text-neutral-400">{spotifyStatus === 'playing' ? '재생 중 · 트랙 종료 시 자동 반복 재시도' : spotifyStatus === 'loading' ? 'Spotify 플레이어 연결 중…' : spotifyStatus === 'error' ? 'Spotify 연결 확인 필요' : 'Spotify 재생 준비 완료'}</p>
          </div>
          {spotifySelection && <a href={spotifySelection.url} target="_blank" rel="noopener noreferrer" className="flex size-7 shrink-0 items-center justify-center rounded-full text-emerald-200 hover:bg-white/10" title="Spotify 앱/웹에서 직접 열기" aria-label="Spotify에서 직접 열기"><ExternalLink className="size-3.5" /></a>}
          <button type="button" onClick={closeSpotifyPlayer} className="flex size-7 shrink-0 items-center justify-center rounded-full text-neutral-300 hover:bg-white/10" aria-label="Spotify 플레이어 닫기"><X className="size-4" /></button>
        </div>
        <div ref={spotifyHostRef} className="h-[152px] w-[300px] max-w-full overflow-hidden rounded-xl bg-black [&_iframe]:max-w-full" />
        {spotifyError && <p role="status" className="mt-1 text-[10px] text-rose-200">{spotifyError}</p>}
        {spotifySelection && <p className="mt-1 text-[9px] leading-relaxed text-neutral-500">브라우저에서 자동 재생이 차단되면 Spotify 플레이어 안의 재생 버튼을 눌러주세요.</p>}
      </section>
    </>
  )
})
