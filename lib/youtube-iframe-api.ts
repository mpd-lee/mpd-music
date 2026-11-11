export type YouTubePlayer = {
  playVideo: () => void
  pauseVideo: () => void
  mute: () => void
  unMute: () => void
  setVolume: (volume: number) => void
  seekTo: (seconds: number, allowSeekAhead?: boolean) => void
  getPlayerState: () => number
  getVideoData?: () => { title?: string }
  destroy: () => void
}

export type YouTubePlayerState = {
  UNSTARTED: number
  ENDED: number
  PLAYING: number
  PAUSED: number
  BUFFERING: number
  CUED: number
}

export type YouTubeIframeApi = {
  Player: new (element: HTMLElement, options: Record<string, unknown>) => YouTubePlayer
  PlayerState: YouTubePlayerState
}

declare global {
  interface Window {
    YT?: YouTubeIframeApi
    onYouTubeIframeAPIReady?: () => void
  }
}

let apiPromise: Promise<YouTubeIframeApi> | null = null

/** Loads the YouTube IFrame API once for every player in the application. */
export function loadYouTubeIframeApi(): Promise<YouTubeIframeApi> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new Error('YouTube 플레이어는 브라우저에서만 실행할 수 있습니다.'))
  }

  if (window.YT?.Player) return Promise.resolve(window.YT)
  if (apiPromise) return apiPromise

  apiPromise = new Promise<YouTubeIframeApi>((resolve, reject) => {
    let settled = false
    let timeoutId = 0

    const finish = (error?: Error) => {
      if (settled) return
      settled = true
      if (timeoutId) window.clearTimeout(timeoutId)
      if (error) reject(error)
      else if (window.YT?.Player) resolve(window.YT)
      else reject(new Error('YouTube 플레이어 API가 준비되지 않았습니다.'))
    }

    const previousCallback = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      try {
        previousCallback?.()
      } catch (error) {
        console.warn('[MPD Studio] 이전 YouTube API 콜백 오류:', error)
      }
      finish()
    }

    let script = document.querySelector<HTMLScriptElement>('script[data-mpd-youtube-api]')
      ?? (document.getElementById('youtube-iframe-api') as HTMLScriptElement | null)

    if (!script) {
      script = document.createElement('script')
      script.id = 'youtube-iframe-api'
      script.dataset.mpdYoutubeApi = 'true'
      script.src = 'https://www.youtube.com/iframe_api'
      script.async = true
      document.head.appendChild(script)
    }

    script.onerror = () => finish(new Error('YouTube 플레이어 API를 불러오지 못했습니다.'))
    timeoutId = window.setTimeout(() => {
      if (window.YT?.Player) finish()
      else finish(new Error('YouTube 플레이어 응답 시간이 초과되었습니다.'))
    }, 15000)

    if (window.YT?.Player) finish()
  }).catch((error) => {
    apiPromise = null
    throw error
  })

  return apiPromise
}
