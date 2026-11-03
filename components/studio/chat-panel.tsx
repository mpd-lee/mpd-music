'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { ChevronDown, Download, FileUp, GripHorizontal, MessageCircle, Phone, PhoneOff, Send, Users, X } from 'lucide-react'
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase'
import { useVoiceChat } from '@/lib/use-voice-chat'

type ChatTarget = { userId: string; name: string }
type ChatMessage = {
  id: string
  sender_id: string
  sender_name: string
  recipient_id?: string | null
  content: string
  created_at: string
  file_url?: string | null
  file_name?: string | null
  file_size?: number | null
  file_type?: string | null
}

type ChatPanelProps = {
  userId: string
  userName: string
  connection: 'connecting' | 'online' | 'preview' | 'error'
  target: ChatTarget | null
  onCloseDirect: () => void
}

const GLOBAL_KEY = 'mpd-studio-global-preview'
const MAX_FILE_SIZE = 50 * 1024 * 1024
const TUS_THRESHOLD = 6 * 1024 * 1024

function readLocal(key: string): ChatMessage[] {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as ChatMessage[]) : []
  } catch {
    return []
  }
}

function appendUnique(current: ChatMessage[], incoming: ChatMessage) {
  if (current.some((message) => message.id === incoming.id)) return current
  return [...current, incoming].slice(-80)
}

function formatBytes(bytes?: number | null) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function safeFileName(name: string) {
  return name.normalize('NFKD').replace(/[^a-zA-Z0-9._()\-]/g, '_').replace(/_+/g, '_').slice(0, 120) || 'upload'
}

export function ChatPanel({ userId, userName, connection, target, onCloseDirect }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  const [tab, setTab] = useState<'global' | 'direct'>(target ? 'direct' : 'global')
  const [minimized, setMinimized] = useState(true)
  const [panelPosition, setPanelPosition] = useState<{ x: number; y: number } | null>(null)
  const [voiceNotice, setVoiceNotice] = useState(false)
  const panelRef = useRef<HTMLElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const dragOffset = useRef<{ x: number; y: number } | null>(null)
  const localKey = useMemo(() => {
    if (!target) return GLOBAL_KEY
    return `mpd-studio-dm-${[userId, target.userId].sort().join('-')}`
  }, [target, userId])
  const isDirect = tab === 'direct' && Boolean(target)
  const voice = useVoiceChat(userId, isDirect ? target?.userId ?? null : null)

  useEffect(() => {
    if (target) {
      setTab('direct')
      setMinimized(false)
      setVoiceNotice(false)
    } else {
      setTab('global')
    }
  }, [target])

  useEffect(() => {
    const openVoicePanel = () => {
      setMinimized(false)
      setVoiceNotice(true)
      // If a visitor's 1:1 room is already selected, the studio microphone starts the call.
      if (isDirect && connection === 'online' && voice.state === 'idle') void voice.startCall()
    }
    window.addEventListener('mpd-open-voice-chat', openVoicePanel)
    return () => window.removeEventListener('mpd-open-voice-chat', openVoicePanel)
  }, [connection, isDirect, voice.startCall, voice.state])

  const startDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    const rect = panelRef.current?.getBoundingClientRect()
    if (!rect) return
    dragOffset.current = { x: event.clientX - rect.left, y: event.clientY - rect.top }
    setPanelPosition({ x: rect.left, y: rect.top })
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const moveDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragOffset.current) return
    const width = panelRef.current?.offsetWidth ?? 360
    const height = panelRef.current?.offsetHeight ?? 520
    const x = Math.max(8, Math.min(window.innerWidth - width - 8, event.clientX - dragOffset.current.x))
    const y = Math.max(8, Math.min(window.innerHeight - height - 8, event.clientY - dragOffset.current.y))
    setPanelPosition({ x, y })
  }

  const stopDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    dragOffset.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  useEffect(() => {
    if (!userId) return
    let active = true
    const supabase = getSupabaseClient()
    const useDatabase = Boolean(supabase && connection === 'online')

    if (!useDatabase) {
      setMessages(readLocal(localKey))
      const onStorage = (event: StorageEvent) => {
        if (event.key === localKey) setMessages(readLocal(localKey))
      }
      window.addEventListener('storage', onStorage)
      return () => {
        active = false
        window.removeEventListener('storage', onStorage)
      }
    }

    const load = async () => {
      if (!supabase) return
      let query = supabase.from(target ? 'direct_messages' : 'global_messages').select('*')
      if (target) {
        query = query.or(
          `and(sender_id.eq.${userId},recipient_id.eq.${target.userId}),and(sender_id.eq.${target.userId},recipient_id.eq.${userId})`,
        )
      }
      const { data, error } = await query.order('created_at', { ascending: true }).limit(80)
      if (error) {
        console.error('[MPD Studio] Message history load failed:', error)
        return
      }
      if (active && data) setMessages(data as ChatMessage[])
    }
    void load()

    const channel = supabase!.channel(`mpd-chat-${userId}-${target?.userId || 'global'}`)
    channel.on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: target ? 'direct_messages' : 'global_messages' },
      (payload) => {
        const row = payload.new as ChatMessage
        if (target && !(
          (row.sender_id === userId && row.recipient_id === target.userId) ||
          (row.sender_id === target.userId && row.recipient_id === userId)
        )) return
        setMessages((current) => appendUnique(current, row))
      },
    ).subscribe()

    return () => {
      active = false
      void channel.unsubscribe()
    }
  }, [connection, localKey, target, userId])

  const sendMessage = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const content = draft.trim()
    if (!content || !userId || sending) return
    setSending(true)
    const now = new Date().toISOString()
    const localMessage: ChatMessage = {
      id: `local-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      sender_id: userId,
      sender_name: userName || 'Guest',
      recipient_id: target?.userId || null,
      content,
      created_at: now,
    }

    const supabase = getSupabaseClient()
    if (supabase && connection === 'online') {
      const row = target
        ? { sender_id: userId, recipient_id: target.userId, sender_name: userName, content }
        : { sender_id: userId, sender_name: userName, content }
      const { error } = await supabase.from(target ? 'direct_messages' : 'global_messages').insert(row)
      if (error) {
        console.error('[MPD Studio] Message send failed:', error)
        setMessages((current) => appendUnique(current, localMessage))
      }
    } else {
      const next = appendUnique(readLocal(localKey), localMessage)
      localStorage.setItem(localKey, JSON.stringify(next))
      setMessages(next)
    }
    setDraft('')
    setSending(false)
  }, [connection, draft, localKey, sending, target, userId, userName])

  const uploadFile = useCallback(async (file: File) => {
    if (!userId) return
    if (file.size > MAX_FILE_SIZE) {
      window.alert(`Supabase 무료 플랜에서는 파일 1개당 최대 50MB까지 가능합니다.\n선택한 파일: ${formatBytes(file.size)}\n50MB보다 큰 파일은 Supabase 요금제와 Storage 제한을 함께 올려야 합니다.`)
      if (fileRef.current) fileRef.current.value = ''
      return
    }
    const supabase = getSupabaseClient()
    if (!supabase || connection !== 'online') {
      window.alert('파일 업로드는 Supabase 실시간 연결 상태에서 사용할 수 있습니다.')
      if (fileRef.current) fileRef.current.value = ''
      return
    }

    const directTarget = isDirect ? target : null
    const tableName = directTarget ? 'direct_messages' : 'global_messages'
    const path = `${userId}/${Date.now()}-${safeFileName(file.name)}`
    const contentType = file.type || 'application/octet-stream'
    setUploading(true)
    setUploadProgress(0)

    try {
      if (file.size > TUS_THRESHOLD) {
        // Reliable resumable upload for files larger than 6MB.
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
        if (sessionError) throw sessionError
        const accessToken = sessionData.session?.access_token
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
        const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
        if (!accessToken || !supabaseUrl || !anonKey) {
          throw new Error('Supabase 인증 세션을 확인할 수 없습니다.')
        }

        const projectUrl = new URL(supabaseUrl)
        const storageBase = projectUrl.hostname.endsWith('.supabase.co')
          ? `https://${projectUrl.hostname.replace(/\.supabase\.co$/, '.storage.supabase.co')}`
          : projectUrl.origin
        const tusEndpoint = `${storageBase}/storage/v1/upload/resumable`
        const tus = await import('tus-js-client')

        await new Promise<void>((resolve, reject) => {
          const upload = new tus.Upload(file, {
            endpoint: tusEndpoint,
            retryDelays: [0, 3000, 5000, 10000, 20000],
            headers: {
              authorization: `Bearer ${accessToken}`,
              apikey: anonKey,
              'x-upsert': 'false',
            },
            uploadDataDuringCreation: true,
            removeFingerprintOnSuccess: true,
            chunkSize: TUS_THRESHOLD,
            metadata: {
              bucketName: 'chat-files',
              objectName: path,
              contentType,
              cacheControl: '3600',
            },
            onError: (error) => reject(error),
            onProgress: (bytesUploaded, bytesTotal) => {
              setUploadProgress(Math.min(99, Math.round((bytesUploaded / bytesTotal) * 100)))
            },
            onSuccess: () => resolve(),
          })

          void upload.findPreviousUploads().then((previousUploads) => {
            if (previousUploads.length > 0) upload.resumeFromPreviousUpload(previousUploads[0])
            upload.start()
          }).catch(reject)
        })
      } else {
        const { error: uploadError } = await supabase.storage.from('chat-files').upload(path, file, {
          cacheControl: '3600',
          upsert: false,
          contentType,
        })
        if (uploadError) throw uploadError
        setUploadProgress(99)
      }

      const { data: publicUrl } = supabase.storage.from('chat-files').getPublicUrl(path)
      const baseRow = {
        sender_id: userId,
        sender_name: userName,
        content: `📎 ${file.name}`.slice(0, 300),
        file_url: publicUrl.publicUrl,
        file_name: file.name,
        file_size: file.size,
        file_type: contentType,
      }
      const row = directTarget
        ? { ...baseRow, recipient_id: directTarget.userId }
        : baseRow

      const { data: inserted, error: messageError } = await supabase
        .from(tableName)
        .insert(row)
        .select('*')
        .single()
      if (messageError) {
        await supabase.storage.from('chat-files').remove([path]).catch(() => undefined)
        throw messageError
      }
      setMessages((current) => appendUnique(current, inserted as ChatMessage))
      setUploadProgress(100)
    } catch (error) {
      console.error('[MPD Studio] file upload failed:', error)
      window.alert('파일 업로드에 실패했습니다. Supabase Storage의 chat-files 버킷, 50MB 제한 및 정책을 확인해 주세요.')
    } finally {
      setUploading(false)
      window.setTimeout(() => setUploadProgress(null), 900)
      if (fileRef.current) fileRef.current.value = ''
    }
  }, [connection, isDirect, target, userId, userName])

  return (
    <>
      {!minimized && (
        <section
          ref={panelRef}
          className="fixed right-3 top-[76px] z-30 flex h-[min(64vh,590px)] w-[min(390px,calc(100vw-24px))] flex-col overflow-hidden rounded-2xl border border-white/15 bg-neutral-950/94 text-white shadow-2xl backdrop-blur-xl sm:w-[390px]"
          style={panelPosition ? { left: panelPosition.x, top: panelPosition.y, right: 'auto' } : undefined}
        >
          <header className="flex items-center justify-between border-b border-white/10 px-3 py-2.5">
            <div className="flex min-w-0 flex-1 cursor-grab touch-none select-none items-center gap-2 active:cursor-grabbing" onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={stopDrag} onPointerCancel={stopDrag} title="드래그하여 채팅창 위치 이동">
              <GripHorizontal className="size-4 shrink-0 text-neutral-500" />
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-amber-300/15 text-amber-200">{isDirect ? <MessageCircle className="size-4" /> : <Users className="size-4" />}</span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{isDirect ? target?.name : 'Global Chat'}</p>
                <p className="text-[10px] text-neutral-400">{connection === 'online' ? '실시간 연결됨' : connection === 'connecting' ? '연결 확인 중' : '로컬 미리보기 모드'} · 잡고 이동</p>
              </div>
            </div>
            <div className="ml-2 flex shrink-0 items-center">
              {isDirect && (
                <button
                  type="button"
                  onClick={() => voice.state === 'incoming' ? voice.acceptCall() : (voice.state === 'connected' || voice.state === 'calling') ? voice.endCall() : voice.startCall()}
                  aria-label={voice.state === 'incoming' ? '음성통화 받기' : voice.state === 'connected' || voice.state === 'calling' ? '음성통화 종료' : '음성통화 시작'}
                  title={voice.state === 'incoming' ? '걸려온 음성통화 받기' : voice.state === 'connected' || voice.state === 'calling' ? '음성통화 종료' : '1:1 음성통화 시작'}
                  className={`rounded-lg p-2 transition ${voice.state === 'connected' || voice.state === 'calling' ? 'text-rose-300 hover:bg-rose-300/10' : 'text-emerald-300 hover:bg-emerald-300/10'}`}
                >
                  {voice.state === 'connected' || voice.state === 'calling' ? <PhoneOff className="size-4" /> : <Phone className="size-4" />}
                </button>
              )}
              {isDirect && <button type="button" onClick={onCloseDirect} aria-label="전체 채팅으로 돌아가기" title="전체 채팅" className="rounded-lg p-2 text-neutral-400 transition hover:bg-white/10 hover:text-white"><X className="size-4" /></button>}
              <button type="button" onClick={() => setMinimized(true)} aria-label="채팅방 최소화" title="아래로 접기" className="rounded-lg p-2 text-neutral-300 transition hover:bg-white/10 hover:text-white"><ChevronDown className="size-4" /></button>
            </div>
          </header>

          <div className="flex gap-1 border-b border-white/10 p-2">
            <button type="button" onClick={() => { onCloseDirect(); setTab('global') }} className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-medium ${!isDirect ? 'bg-amber-300 text-neutral-950' : 'text-neutral-300 hover:bg-white/10'}`}>전체 단톡방</button>
            <button type="button" onClick={() => target && setTab('direct')} disabled={!target} className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-medium ${isDirect ? 'bg-amber-300 text-neutral-950' : 'text-neutral-400 hover:bg-white/10 disabled:opacity-40'}`}>1:1 채팅</button>
          </div>

          {(voiceNotice || (isDirect && (voice.state !== 'idle' || voice.error))) && (
            <div className="border-b border-emerald-300/15 bg-emerald-300/5 px-3 py-2 text-[10px] leading-relaxed text-emerald-100">
              <div className="flex items-center justify-between gap-2">
                <span>{!isDirect ? '음성통화를 하려면 먼저 다른 방문자 아바타를 클릭해 1:1 채팅을 연 다음 마이크를 누르세요.' : voice.state === 'connected' ? '🎙 음성통화 연결됨 · 서로 실시간으로 대화할 수 있습니다.' : voice.state === 'calling' ? '상대방의 음성 연결을 기다리는 중...' : voice.state === 'incoming' ? '📞 상대방이 음성통화를 요청했습니다.' : '마이크 버튼으로 1:1 음성통화를 시작할 수 있습니다.'}</span>
                <div className="flex shrink-0 gap-1">
                  {isDirect && voice.state === 'incoming' && <button type="button" onClick={voice.acceptCall} className="rounded-full bg-emerald-300 px-2 py-1 font-semibold text-neutral-950">받기</button>}
                  {isDirect && voice.state !== 'idle' && <button type="button" onClick={voice.endCall} className="rounded-full bg-rose-300 px-2 py-1 font-semibold text-neutral-950">종료</button>}
                </div>
              </div>
              {voice.error && <p className="mt-1 text-rose-200">{voice.error}</p>}
            </div>
          )}

          {!isSupabaseConfigured() && <p className="border-b border-amber-300/20 bg-amber-300/10 px-3 py-2 text-[10px] leading-relaxed text-amber-100">Supabase 키를 설정하면 다른 방문자와 실시간 채팅·1:1 음성통화·파일 전송을 사용할 수 있습니다.</p>}
          {connection === 'online' && <p className="border-b border-white/5 px-3 py-1.5 text-[9px] text-neutral-500">전체 단톡방·1:1 채팅 파일 첨부 최대 50MB · 6MB 초과 파일은 이어올리기 지원</p>}
          {uploading && <div className="border-b border-white/5 px-3 py-1.5 text-[10px] text-amber-200">파일 업로드 중 {uploadProgress ?? 0}%</div>}

          <div className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
            {messages.length === 0 ? <div className="flex h-full min-h-24 items-center justify-center text-center text-xs text-neutral-500">{isDirect ? '첫 메시지를 보내 대화를 시작해 보세요.' : '아직 메시지가 없습니다. 첫 인사를 남겨보세요.'}</div> : messages.map((message) => {
              const mine = message.sender_id === userId
              return (
                <div key={message.id} className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
                  {!mine && <span className="mb-1 px-1 text-[10px] text-amber-200">{message.sender_name}</span>}
                  <div className={`max-w-[90%] rounded-2xl px-3 py-2 text-xs leading-relaxed ${mine ? 'rounded-br-sm bg-amber-300 text-neutral-950' : 'rounded-bl-sm bg-white/10 text-neutral-100'}`}>
                    {message.file_url ? (
                      <a href={message.file_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 underline decoration-amber-500/50 underline-offset-2">
                        <Download className="size-3.5 shrink-0" />
                        <span className="min-w-0 truncate">{message.file_name || message.content}</span>
                        <span className="shrink-0 text-[9px] opacity-60">{formatBytes(message.file_size)}</span>
                      </a>
                    ) : message.content}
                  </div>
                  <time className="mt-1 px-1 text-[9px] text-neutral-500" dateTime={message.created_at}>{new Date(message.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</time>
                </div>
              )
            })}
          </div>

          <form onSubmit={sendMessage} className="flex items-center gap-2 border-t border-white/10 p-2.5">
            <input ref={fileRef} type="file" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadFile(file) }} />
            <button type="button" disabled={uploading || connection !== 'online'} onClick={() => fileRef.current?.click()} aria-label="파일 첨부" title="전체 단톡방·1:1 채팅에 최대 50MB 파일 첨부" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/5 text-neutral-300 transition hover:bg-white/10 disabled:opacity-40"><FileUp className="size-4" /></button>
            <input value={draft} onChange={(event) => setDraft(event.target.value.slice(0, 300))} placeholder={isDirect ? '메시지를 입력하세요...' : '전체에게 메시지 보내기...'} maxLength={300} className="min-w-0 flex-1 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-white outline-none placeholder:text-neutral-500 focus:border-amber-300/60" />
            <button type="submit" disabled={!draft.trim() || sending} aria-label="메시지 보내기" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-amber-300 text-neutral-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-40"><Send className="size-4" /></button>
          </form>
        </section>
      )}
      {minimized && <button type="button" onClick={() => setMinimized(false)} className="fixed bottom-[5.5rem] left-4 z-30 flex items-center gap-2 rounded-full border border-amber-200/25 bg-neutral-950/90 px-4 py-3 text-white shadow-2xl backdrop-blur-xl transition hover:scale-[1.02] hover:border-amber-200/50" aria-label="채팅방 열기" title="Global Chat 열기">
        <span className="relative flex size-7 items-center justify-center rounded-full bg-amber-300 text-neutral-950">{isDirect ? <MessageCircle className="size-4" /> : <Users className="size-4" />}<span className="absolute -right-1 -top-1 size-2.5 rounded-full border border-neutral-950 bg-emerald-400" /></span>
        <span className="text-left"><span className="block text-xs font-semibold">{isDirect ? `${target?.name ?? '사용자'} · 1:1` : 'Global Chat'}</span><span className="block text-[10px] text-neutral-400">채팅 열기</span></span>
      </button>}
    </>
  )
}
