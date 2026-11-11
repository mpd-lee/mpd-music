'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { ChevronDown, Download, FileUp, GripHorizontal, MessageCircle, Mic, MicOff, Phone, PhoneOff, Send, Users, X, Check, Ban, Trash2 } from 'lucide-react'
import { getSupabaseClient, getSupabaseProjectUrl, getSupabasePublicKey, isSupabaseConfigured } from '@/lib/supabase'
import type { StudioPlayer, VoiceSignal } from '@/lib/use-multiplayer'

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
  players: StudioPlayer[]
  target: ChatTarget | null
  onSelectPlayer: (target: ChatTarget) => void
  onCloseDirect: () => void
  sendVoiceSignal: (toId: string, signal: Pick<VoiceSignal, 'type' | 'sdp' | 'candidate'>) => Promise<void>
  isOwner: boolean
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
  return [...current, incoming].slice(-100)
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

function chatTopic(userId: string, targetId: string | null) {
  if (!targetId) return 'mpd-chat-global'
  return `mpd-chat-dm-${[userId, targetId].sort().join('-')}`
}

export function ChatPanel({
  userId,
  userName,
  connection,
  players,
  target,
  onSelectPlayer,
  onCloseDirect,
  sendVoiceSignal,
  isOwner,
}: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  const [tab, setTab] = useState<'global' | 'direct'>(target ? 'direct' : 'global')
  const [minimized, setMinimized] = useState(true)
  const [panelPosition, setPanelPosition] = useState<{ x: number; y: number } | null>(null)
  const [chatNotice, setChatNotice] = useState('')
  const [callStatus, setCallStatus] = useState<'idle' | 'calling' | 'ringing' | 'connected'>('idle')
  const [callPeer, setCallPeer] = useState<ChatTarget | null>(null)
  const [incomingCall, setIncomingCall] = useState<VoiceSignal | null>(null)
  const [muted, setMuted] = useState(false)
  const callStatusRef = useRef(callStatus)
  const activePeerRef = useRef<ChatTarget | null>(null)
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const pendingIceRef = useRef(new Map<string, RTCIceCandidateInit[]>())
  const remoteAudioRef = useRef<HTMLAudioElement>(null)
  callStatusRef.current = callStatus
  const panelRef = useRef<HTMLElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const dragOffset = useRef<{ x: number; y: number } | null>(null)
  const localKey = useMemo(() => {
    if (!target) return GLOBAL_KEY
    return `mpd-studio-dm-${[userId, target.userId].sort().join('-')}`
  }, [target, userId])
  const isDirect = tab === 'direct' && Boolean(target)

  useEffect(() => {
    if (target) {
      setTab('direct')
      setMinimized(false)
      setChatNotice('')
    } else {
      setTab('global')
    }
  }, [target])


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

  // Load persisted history and subscribe to inserts for the currently selected room.
  useEffect(() => {
    // Keep global/direct message history and realtime channels idle while the compact chat pill is closed.
    // Opening the panel fetches the latest history and reconnects the selected room.
    if (!userId || minimized) return
    let active = true
    setMessages([])
    setChatNotice('')
    const supabase = getSupabaseClient()
    const useDatabase = Boolean(supabase && connection === 'online')

    if (!useDatabase || !supabase) {
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
      let query = supabase.from(target ? 'direct_messages' : 'global_messages').select('*')
      if (target) {
        query = query.or(
          `and(sender_id.eq.${userId},recipient_id.eq.${target.userId}),and(sender_id.eq.${target.userId},recipient_id.eq.${userId})`,
        )
      }
      const { data, error } = await query.order('created_at', { ascending: false }).limit(100)
      if (error) {
        console.error('[MPD Studio] Message history load failed:', error)
        if (active) setChatNotice(`대화 기록을 불러오지 못했습니다: ${error.message}`)
        return
      }
      if (active && data) {
        const ordered = (data as ChatMessage[]).reverse()
        setMessages((current) => ordered.reduce((list, row) => appendUnique(list, row), current))
      }
    }
    void load()

    const channel = supabase.channel(chatTopic(userId, target?.userId ?? null))
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
    ).on(
      'postgres_changes',
      { event: 'DELETE', schema: 'public', table: target ? 'direct_messages' : 'global_messages' },
      (payload) => {
        // The owner moderation API uses a service-role client. replica identity FULL
        // is enabled by the supplied schema so the removed row is broadcast to everyone.
        const removed = payload.old as Partial<ChatMessage>
        if (!removed.id) return
        setMessages((current) => current.filter((message) => message.id !== removed.id))
      },
    ).subscribe((status, error) => {
      if (!active) return
      if (status === 'SUBSCRIBED') {
        setChatNotice('')
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        console.warn('[MPD Studio] Chat realtime subscription failed:', status, error)
        setChatNotice(`실시간 채팅 연결 실패 (${status}). Supabase Realtime과 RLS 설정을 확인해 주세요.`)
      }
    })

    return () => {
      active = false
      void channel.unsubscribe()
    }
  }, [connection, localKey, minimized, target, userId])

  const sendMessage = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const content = draft.trim()
    if (!content || !userId || sending) return
    setSending(true)
    setChatNotice('')

    try {
      const supabase = getSupabaseClient()
      if (supabase && connection === 'online') {
        if (target) {
          const { data, error } = await supabase
            .from('direct_messages')
            .insert({
              sender_id: userId,
              recipient_id: target.userId,
              sender_name: userName || 'MPD 방문자',
              content,
            })
            .select('*')
            .single()
          if (error) throw error
          if (data) setMessages((current) => appendUnique(current, data as ChatMessage))
        } else {
          const { data, error } = await supabase
            .from('global_messages')
            .insert({
              sender_id: userId,
              sender_name: userName || 'MPD 방문자',
              content,
            })
            .select('*')
            .single()
          if (error) throw error
          if (data) setMessages((current) => appendUnique(current, data as ChatMessage))
        }
      } else {
        const localMessage: ChatMessage = {
          id: `local-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          sender_id: userId,
          sender_name: userName || 'MPD 방문자',
          recipient_id: target?.userId || null,
          content,
          created_at: new Date().toISOString(),
        }
        const next = appendUnique(readLocal(localKey), localMessage)
        localStorage.setItem(localKey, JSON.stringify(next))
        setMessages(next)
      }
      setDraft('')
    } catch (error) {
      console.error('[MPD Studio] Message send failed:', error)
      setChatNotice(error instanceof Error ? `전송 실패: ${error.message}` : '메시지를 보내지 못했습니다. Supabase 정책과 연결을 확인해 주세요.')
    } finally {
      setSending(false)
    }
  }, [connection, draft, localKey, sending, target, userId, userName])

  const deleteMessage = useCallback(async (message: ChatMessage) => {
    if (!isOwner) return
    if (!window.confirm(`이 메시지를 삭제하시겠습니까?\n보낸 사람: ${message.sender_name}`)) return
    try {
      const supabase = getSupabaseClient()
      if (!supabase) throw new Error('Supabase 연결을 확인해 주세요.')
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
      if (sessionError) throw sessionError
      const token = sessionData.session?.access_token
      if (!token) throw new Error('로그인 세션이 없습니다. 다시 접속해 주세요.')
      const response = await fetch('/api/admin/moderate', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ table: target ? 'direct_messages' : 'global_messages', id: message.id }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || '메시지를 삭제하지 못했습니다.')
      setMessages((current) => current.filter((item) => item.id !== message.id))
      setChatNotice('선택한 메시지를 삭제했습니다.')
    } catch (error) {
      setChatNotice(error instanceof Error ? error.message : '메시지 삭제에 실패했습니다.')
    }
  }, [isOwner, target])


  const uploadFile = useCallback(async (file: File) => {
    if (!userId) return
    if (file.size > MAX_FILE_SIZE) {
      window.alert(`현재 프로젝트는 파일 1개당 최대 50MB로 설정되어 있습니다.\n선택한 파일: ${formatBytes(file.size)}`)
      if (fileRef.current) fileRef.current.value = ''
      return
    }
    const supabase = getSupabaseClient()
    if (!supabase || connection !== 'online') {
      window.alert('파일 업로드는 Supabase 실시간 연결 상태에서 사용할 수 있습니다.')
      if (fileRef.current) fileRef.current.value = ''
      return
    }

    const path = `${userId}/${Date.now()}-${safeFileName(file.name)}`
    const contentType = file.type || 'application/octet-stream'
    const directTarget = isDirect ? target : null
    const tableName = directTarget ? 'direct_messages' : 'global_messages'
    setUploading(true)
    setUploadProgress(0)
    setChatNotice('')

    try {
      if (file.size > TUS_THRESHOLD) {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
        if (sessionError) throw sessionError
        const accessToken = sessionData.session?.access_token
        const supabaseUrl = getSupabaseProjectUrl()
        const publicKey = getSupabasePublicKey()
        if (!accessToken || !supabaseUrl || !publicKey) throw new Error('Supabase 인증 세션을 확인할 수 없습니다.')

        const projectUrl = new URL(supabaseUrl)
        const storageBase = projectUrl.hostname.endsWith('.supabase.co')
          ? `https://${projectUrl.hostname.replace(/\.supabase\.co$/, '.storage.supabase.co')}`
          : projectUrl.origin
        const tus = await import('tus-js-client')
        await new Promise<void>((resolve, reject) => {
          const upload = new tus.Upload(file, {
            endpoint: `${storageBase}/storage/v1/upload/resumable`,
            retryDelays: [0, 3000, 5000, 10000, 20000],
            headers: { authorization: `Bearer ${accessToken}`, apikey: publicKey, 'x-upsert': 'false' },
            uploadDataDuringCreation: true,
            removeFingerprintOnSuccess: true,
            chunkSize: TUS_THRESHOLD,
            metadata: { bucketName: 'chat-files', objectName: path, contentType, cacheControl: '3600' },
            onError: reject,
            onProgress: (bytesUploaded, bytesTotal) => setUploadProgress(Math.min(99, Math.round((bytesUploaded / bytesTotal) * 100))),
            onSuccess: () => resolve(),
          })
          void upload.findPreviousUploads().then((previous) => {
            if (previous.length) upload.resumeFromPreviousUpload(previous[0])
            upload.start()
          }).catch(reject)
        })
      } else {
        const { error } = await supabase.storage.from('chat-files').upload(path, file, {
          cacheControl: '3600', upsert: false, contentType,
        })
        if (error) throw error
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
      const row = directTarget ? { ...baseRow, recipient_id: directTarget.userId } : baseRow
      const { data: inserted, error: messageError } = await supabase.from(tableName).insert(row).select('*').single()
      if (messageError) {
        await supabase.storage.from('chat-files').remove([path])
        throw messageError
      }
      if (inserted) setMessages((current) => appendUnique(current, inserted as ChatMessage))
      setUploadProgress(100)
    } catch (error) {
      console.error('[MPD Studio] file upload failed:', error)
      setChatNotice(error instanceof Error ? `파일 업로드 실패: ${error.message}` : '파일 업로드에 실패했습니다. Storage 버킷과 정책을 확인해 주세요.')
    } finally {
      setUploading(false)
      window.setTimeout(() => setUploadProgress(null), 900)
      if (fileRef.current) fileRef.current.value = ''
    }
  }, [connection, isDirect, target, userId, userName])

  const cleanupVoiceCall = useCallback(() => {
    peerConnectionRef.current?.close()
    peerConnectionRef.current = null
    localStreamRef.current?.getTracks().forEach((track) => track.stop())
    localStreamRef.current = null
    pendingIceRef.current.clear()
    activePeerRef.current = null
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null
    setIncomingCall(null)
    setCallPeer(null)
    setCallStatus('idle')
    setMuted(false)
  }, [])

  const createPeerConnection = useCallback((peer: ChatTarget) => {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
    })
    pc.onicecandidate = (event) => {
      if (!event.candidate) return
      void sendVoiceSignal(peer.userId, { type: 'ice', candidate: event.candidate.toJSON() }).catch((error) => {
        console.warn('[MPD Studio] Voice ICE signaling failed:', error)
      })
    }
    pc.ontrack = (event) => {
      const stream = event.streams[0]
      if (remoteAudioRef.current && stream) {
        remoteAudioRef.current.srcObject = stream
        void remoteAudioRef.current.play().catch(() => undefined)
      }
    }
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') setCallStatus('connected')
      if (pc.connectionState === 'failed') {
        setChatNotice('음성 연결에 실패했습니다. 상대방 네트워크에서 TURN 중계 서버가 필요할 수 있습니다.')
        cleanupVoiceCall()
      }
    }
    peerConnectionRef.current = pc
    return pc
  }, [cleanupVoiceCall, sendVoiceSignal])

  const getMicrophoneStream = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('마이크는 HTTPS 또는 localhost 환경의 최신 브라우저에서 사용할 수 있습니다.')
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: false,
    })
    localStreamRef.current = stream
    return stream
  }, [])

  const startVoiceCall = useCallback(async (peer: ChatTarget) => {
    if (connection !== 'online') {
      setChatNotice('음성통화는 Supabase 실시간 연결 상태에서 사용할 수 있습니다.')
      return
    }
    if (callStatusRef.current !== 'idle') {
      setChatNotice('이미 진행 중인 음성통화가 있습니다. 먼저 통화를 종료해 주세요.')
      return
    }
    try {
      setChatNotice('')
      activePeerRef.current = peer
      setCallPeer(peer)
      setCallStatus('calling')
      const stream = await getMicrophoneStream()
      const pc = createPeerConnection(peer)
      stream.getAudioTracks().forEach((track) => pc.addTrack(track, stream))
      const offer = await pc.createOffer({ offerToReceiveAudio: true })
      await pc.setLocalDescription(offer)
      await sendVoiceSignal(peer.userId, { type: 'offer', sdp: pc.localDescription?.toJSON() ?? offer })
    } catch (error) {
      cleanupVoiceCall()
      setChatNotice(error instanceof Error ? `마이크 통화를 시작하지 못했습니다: ${error.message}` : '마이크 통화를 시작하지 못했습니다.')
    }
  }, [connection, createPeerConnection, cleanupVoiceCall, getMicrophoneStream, sendVoiceSignal])

  const acceptIncomingCall = useCallback(async () => {
    const signal = incomingCall
    if (!signal?.sdp) return
    const peer = { userId: signal.fromId, name: signal.fromName || 'MPD 방문자' }
    try {
      setChatNotice('')
      activePeerRef.current = peer
      setCallPeer(peer)
      setCallStatus('calling')
      const stream = await getMicrophoneStream()
      const pc = createPeerConnection(peer)
      await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp))
      stream.getAudioTracks().forEach((track) => pc.addTrack(track, stream))
      for (const candidate of pendingIceRef.current.get(peer.userId) ?? []) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate))
      }
      pendingIceRef.current.delete(peer.userId)
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      await sendVoiceSignal(peer.userId, { type: 'answer', sdp: pc.localDescription?.toJSON() ?? answer })
      setIncomingCall(null)
    } catch (error) {
      cleanupVoiceCall()
      setChatNotice(error instanceof Error ? `통화 수락 실패: ${error.message}` : '통화를 수락하지 못했습니다.')
    }
  }, [incomingCall, getMicrophoneStream, createPeerConnection, sendVoiceSignal, cleanupVoiceCall])

  const declineIncomingCall = useCallback(() => {
    const peer = incomingCall
    if (peer) void sendVoiceSignal(peer.fromId, { type: 'hangup' }).catch(() => undefined)
    cleanupVoiceCall()
  }, [incomingCall, sendVoiceSignal, cleanupVoiceCall])

  const hangUpVoiceCall = useCallback(() => {
    const peer = activePeerRef.current
    if (peer) void sendVoiceSignal(peer.userId, { type: 'hangup' }).catch(() => undefined)
    cleanupVoiceCall()
  }, [sendVoiceSignal, cleanupVoiceCall])

  const toggleMute = useCallback(() => {
    const next = !muted
    localStreamRef.current?.getAudioTracks().forEach((track) => { track.enabled = !next })
    setMuted(next)
  }, [muted])

  useEffect(() => {
    const handleVoiceSignal = (event: Event) => {
      const signal = (event as CustomEvent<VoiceSignal>).detail
      if (!signal || signal.toId !== userId || signal.fromId === userId) return

      if (signal.type === 'offer') {
        if (callStatusRef.current !== 'idle') {
          void sendVoiceSignal(signal.fromId, { type: 'hangup' }).catch(() => undefined)
          return
        }
        const peer = { userId: signal.fromId, name: signal.fromName || 'MPD 방문자' }
        activePeerRef.current = peer
        setCallPeer(peer)
        setIncomingCall(signal)
        setCallStatus('ringing')
        setMinimized(false)
        return
      }
      if (signal.type === 'ice' && signal.candidate && activePeerRef.current?.userId !== signal.fromId) {
        const queued = pendingIceRef.current.get(signal.fromId) ?? []
        queued.push(signal.candidate)
        pendingIceRef.current.set(signal.fromId, queued)
        return
      }
      if (activePeerRef.current?.userId !== signal.fromId) return

      const pc = peerConnectionRef.current
      if (signal.type === 'answer' && signal.sdp && pc) {
        void pc.setRemoteDescription(new RTCSessionDescription(signal.sdp)).then(async () => {
          for (const candidate of pendingIceRef.current.get(signal.fromId) ?? []) {
            await pc.addIceCandidate(new RTCIceCandidate(candidate))
          }
          pendingIceRef.current.delete(signal.fromId)
        }).catch((error) => setChatNotice(`상대방 응답을 처리하지 못했습니다: ${String(error)}`))
      } else if (signal.type === 'ice' && signal.candidate) {
        if (pc?.remoteDescription) {
          void pc.addIceCandidate(new RTCIceCandidate(signal.candidate)).catch((error) => console.warn('[MPD Studio] ICE candidate failed:', error))
        } else {
          const queued = pendingIceRef.current.get(signal.fromId) ?? []
          queued.push(signal.candidate)
          pendingIceRef.current.set(signal.fromId, queued)
        }
      } else if (signal.type === 'hangup') {
        cleanupVoiceCall()
        setChatNotice(`${signal.fromName || '상대방'}이 통화를 종료했습니다.`)
      }
    }
    window.addEventListener('mpd-studio-voice-signal', handleVoiceSignal)
    return () => window.removeEventListener('mpd-studio-voice-signal', handleVoiceSignal)
  }, [userId, sendVoiceSignal, cleanupVoiceCall])

  useEffect(() => () => cleanupVoiceCall(), [cleanupVoiceCall])

  return (
    <>
      <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />
      {callStatus !== 'idle' && (
        <div className="fixed bottom-24 right-4 z-[65] flex w-[min(92vw,340px)] flex-col gap-2 rounded-2xl border border-emerald-200/25 bg-slate-950/95 p-3 text-white shadow-2xl backdrop-blur-xl">
          <div className="flex items-center gap-2">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-emerald-300/15 text-emerald-200"><Phone className="size-4" /></span>
            <div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold">{callPeer?.name || incomingCall?.fromName || 'MPD 방문자'}</p><p className="text-[10px] text-emerald-100/70">{callStatus === 'ringing' ? '마이크 음성통화 수신 중' : callStatus === 'calling' ? '음성통화 연결 중…' : '음성통화 연결됨'}</p></div>
          </div>
          {callStatus === 'ringing' ? (
            <div className="flex gap-2"><button type="button" onClick={() => void acceptIncomingCall()} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-400 px-3 py-2 text-xs font-semibold text-slate-950"><Check size={14} /> 받기</button><button type="button" onClick={declineIncomingCall} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-rose-500/90 px-3 py-2 text-xs font-semibold"><Ban size={14} /> 거절</button></div>
          ) : (
            <div className="flex gap-2"><button type="button" onClick={toggleMute} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-white/10 px-3 py-2 text-xs"><>{muted ? <MicOff size={14} /> : <Mic size={14} />}{muted ? '마이크 켜기' : '음소거'}</></button><button type="button" onClick={hangUpVoiceCall} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-rose-500 px-3 py-2 text-xs font-semibold"><PhoneOff size={14} /> 통화 종료</button></div>
          )}
          <p className="text-[9px] leading-relaxed text-slate-400">브라우저에서 마이크 권한을 허용해야 합니다. 일부 통신망은 별도 TURN 중계가 필요할 수 있습니다.</p>
        </div>
      )}
      {!minimized && (
        <section
          ref={panelRef}
          className="fixed right-3 top-[76px] z-30 flex h-[min(70dvh,640px)] w-[min(410px,calc(100vw-24px))] flex-col overflow-hidden rounded-2xl border border-white/15 bg-neutral-950/95 text-white shadow-2xl backdrop-blur-xl sm:w-[410px]"
          style={panelPosition ? { left: panelPosition.x, top: panelPosition.y, right: 'auto' } : undefined}
        >
          <header className="flex items-center justify-between border-b border-white/10 px-3 py-2.5">
            <div className="flex min-w-0 flex-1 cursor-grab touch-none select-none items-center gap-2 active:cursor-grabbing" onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={stopDrag} onPointerCancel={stopDrag} title="드래그하여 채팅창 위치 이동">
              <GripHorizontal className="size-4 shrink-0 text-neutral-500" />
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-amber-300/15 text-amber-200">{isDirect ? <MessageCircle className="size-4" /> : <Users className="size-4" />}</span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{isDirect ? target?.name : 'Global Chat'}</p>
                <p className="text-[10px] text-neutral-400">{connection === 'online' ? '실시간 연결됨' : connection === 'connecting' ? '연결 확인 중' : '로컬 미리보기 모드'} · 내 ID {userName || '확인 중'}</p>
              </div>
            </div>
            <div className="ml-2 flex shrink-0 items-center">
              {isDirect && target && <button type="button" onClick={() => void startVoiceCall(target)} aria-label="1:1 음성통화" title="마이크 음성통화" className="rounded-lg p-2 text-emerald-200 transition hover:bg-emerald-300/10 hover:text-white"><Phone className="size-4" /></button>}
              {isDirect && <button type="button" onClick={onCloseDirect} aria-label="전체 채팅으로 돌아가기" title="전체 채팅" className="rounded-lg p-2 text-neutral-400 transition hover:bg-white/10 hover:text-white"><X className="size-4" /></button>}
              <button type="button" onClick={() => setMinimized(true)} aria-label="채팅방 최소화" title="아래로 접기" className="rounded-lg p-2 text-neutral-300 transition hover:bg-white/10 hover:text-white"><ChevronDown className="size-4" /></button>
            </div>
          </header>

          <div className="flex gap-1 border-b border-white/10 p-2">
            <button type="button" onClick={() => { onCloseDirect(); setTab('global') }} className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-medium ${!isDirect ? 'bg-amber-300 text-neutral-950' : 'text-neutral-300 hover:bg-white/10'}`}>단체 채팅</button>
            <button type="button" onClick={() => target && setTab('direct')} disabled={!target} className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-medium ${isDirect ? 'bg-amber-300 text-neutral-950' : 'text-neutral-400 hover:bg-white/10 disabled:opacity-40'}`}>1:1 채팅</button>
          </div>

          <div className="border-b border-white/10 px-3 py-2">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold text-neutral-300">현재 접속자 {players.length + (userId ? 1 : 0)}명</span>
              <span className="text-[9px] text-neutral-500">이름을 누르면 1:1 채팅</span>
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-0.5">
              <span className="shrink-0 rounded-full border border-amber-300/30 bg-amber-300/10 px-2.5 py-1 text-[10px] font-semibold text-amber-100">● {userName || '나'}</span>
              {players.map((player) => (
                <span key={player.userId} className={`inline-flex shrink-0 items-center overflow-hidden rounded-full border ${target?.userId === player.userId ? 'border-sky-300/60 bg-sky-300/20' : 'border-white/10 bg-white/5'}`}>
                  <button type="button" onClick={() => onSelectPlayer({ userId: player.userId, name: player.name })} className="px-2.5 py-1 text-[10px] text-neutral-100 transition hover:bg-white/10">● {player.name}</button>
                  <button type="button" onClick={() => void startVoiceCall({ userId: player.userId, name: player.name })} aria-label={`${player.name}에게 음성통화`} title={`${player.name}에게 음성통화`} className="border-l border-white/10 px-2 py-1 text-emerald-200 transition hover:bg-emerald-300/15"><Phone className="size-3" /></button>
                </span>
              ))}
              {players.length === 0 && <span className="shrink-0 py-1 text-[10px] text-neutral-500">현재 다른 방문자가 없습니다.</span>}
            </div>
          </div>


          {!isSupabaseConfigured() && <p className="border-b border-amber-300/20 bg-amber-300/10 px-3 py-2 text-[10px] leading-relaxed text-amber-100">Supabase 키를 설정하면 다른 방문자와 실시간 단체 채팅·1:1 채팅·파일 전송을 사용할 수 있습니다.</p>}
          {connection === 'online' && <p className="border-b border-white/5 px-3 py-1.5 text-[9px] text-neutral-500">단체 채팅·1:1 채팅 파일 첨부 최대 50MB · 6MB 초과 파일은 이어 올리기 지원</p>}
          {chatNotice && <p className="border-b border-rose-300/20 bg-rose-300/5 px-3 py-2 text-[10px] leading-relaxed text-rose-200">{chatNotice}</p>}
          {uploading && <div className="border-b border-white/5 px-3 py-1.5 text-[10px] text-amber-200">파일 업로드 중 {uploadProgress ?? 0}%</div>}

          <div className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
            {messages.length === 0 ? <div className="flex h-full min-h-24 items-center justify-center text-center text-xs text-neutral-500">{isDirect ? `${target?.name ?? '상대방'}에게 첫 메시지를 보내 대화를 시작해 보세요.` : '아직 메시지가 없습니다. 첫 인사를 남겨보세요.'}</div> : messages.map((message) => {
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
                  <div className="mt-1 flex items-center gap-2 px-1">
                    <time className="text-[9px] text-neutral-500" dateTime={message.created_at}>{new Date(message.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</time>
                    {isOwner && <button type="button" onClick={() => void deleteMessage(message)} aria-label={`${message.sender_name} 메시지 삭제`} title="대표 관리자: 이 메시지 삭제" className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] text-rose-300/80 hover:bg-rose-400/10 hover:text-rose-200"><Trash2 className="size-3"/>삭제</button>}
                  </div>
                </div>
              )
            })}
          </div>

          <form onSubmit={sendMessage} className="flex items-center gap-2 border-t border-white/10 p-2.5">
            <input ref={fileRef} type="file" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadFile(file) }} />
            <button type="button" disabled={uploading || connection !== 'online'} onClick={() => fileRef.current?.click()} aria-label="파일 첨부" title="단체 채팅·1:1 채팅에 최대 50MB 파일 첨부" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/5 text-neutral-300 transition hover:bg-white/10 disabled:opacity-40"><FileUp className="size-4" /></button>
            <input value={draft} onChange={(event) => setDraft(event.target.value.slice(0, 300))} placeholder={isDirect ? `${target?.name ?? '상대방'}에게 메시지...` : '전체에게 메시지 보내기...'} maxLength={300} className="min-w-0 flex-1 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-white outline-none placeholder:text-neutral-500 focus:border-amber-300/60" />
            <button type="submit" disabled={!draft.trim() || sending || connection === 'connecting'} aria-label="메시지 보내기" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-amber-300 text-neutral-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-40"><Send className="size-4" /></button>
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
