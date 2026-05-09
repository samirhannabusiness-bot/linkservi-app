import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { apiFetch, getAuthHeader } from "@/lib/api";
import { getSocket, joinRoom, leaveRoom } from "@/lib/socket";
import { toast } from "@/hooks/use-toast";
import {
  Send, ChevronLeft, Mic, MicOff, Image, FileText,
  Loader2, Play, Pause, Check, CheckCheck, Wifi, WifiOff,
  X, Lock, Paperclip,
} from "lucide-react";
import { format, isToday, isYesterday } from "date-fns";
import { es } from "date-fns/locale";

// ─── Types ───────────────────────────────────────────────────────────────────
interface Message {
  id: number; conversationId: number; senderId: number;
  senderName: string; senderAvatar: string | null;
  messageType: string; content: string;
  mediaUrl: string | null; mediaMime: string | null;
  duration: number | null; readAt: string | null; createdAt: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function initials(name: string) {
  return name?.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase() ?? "?";
}

function dayLabel(d: Date) {
  if (isToday(d)) return "Hoy";
  if (isYesterday(d)) return "Ayer";
  return format(d, "d 'de' MMMM", { locale: es });
}

function fmtTime(ts: string) {
  return format(new Date(ts), "HH:mm");
}

function fmtDuration(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ─── Object storage upload helper ────────────────────────────────────────────
async function uploadFile(file: File): Promise<string> {
  const r = await fetch("/api/storage/uploads/request-url", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeader() },
    body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
  });
  if (!r.ok) throw new Error("No se pudo obtener URL de subida");
  const { uploadURL, objectPath } = await r.json();
  const put = await fetch(uploadURL, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
  if (!put.ok) throw new Error("Error al subir archivo");
  return `/api/storage${objectPath}`;
}

// ─── Waveform bars (static, decorative) ──────────────────────────────────────
function Waveform({ bars = 28, progress = 0, color = "currentColor" }: { bars?: number; progress?: number; color?: string }) {
  const heights = [3, 6, 10, 8, 14, 18, 12, 20, 16, 10, 22, 18, 14, 8, 18, 22, 12, 16, 10, 20, 14, 8, 16, 12, 10, 6, 8, 4];
  return (
    <div className="flex items-center gap-[2px] h-6">
      {Array.from({ length: bars }, (_, i) => {
        const h = heights[i % heights.length];
        const filled = i / bars < progress;
        return (
          <div
            key={i}
            style={{ height: `${h}px`, background: filled ? "#8b5cf6" : color, opacity: filled ? 1 : 0.35, width: 3, borderRadius: 4, flexShrink: 0 }}
          />
        );
      })}
    </div>
  );
}

// ─── Live recording waveform ──────────────────────────────────────────────────
function LiveWaveform({ analyser }: { analyser: AnalyserNode | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<number>(0);

  useEffect(() => {
    if (!analyser) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const data = new Uint8Array(analyser.frequencyBinCount);

    function draw() {
      analyser!.getByteFrequencyData(data);
      ctx.clearRect(0, 0, canvas!.width, canvas!.height);
      const barW = 3;
      const gap = 2;
      const total = Math.floor(canvas!.width / (barW + gap));
      const step = Math.floor(data.length / total);
      ctx.fillStyle = "#8b5cf6";
      for (let i = 0; i < total; i++) {
        const val = data[i * step] / 255;
        const h = Math.max(4, val * canvas!.height);
        const y = (canvas!.height - h) / 2;
        ctx.globalAlpha = 0.3 + val * 0.7;
        ctx.fillRect(i * (barW + gap), y, barW, h);
      }
      frameRef.current = requestAnimationFrame(draw);
    }
    draw();
    return () => cancelAnimationFrame(frameRef.current);
  }, [analyser]);

  return <canvas ref={canvasRef} width={140} height={28} className="rounded" />;
}

// ─── Audio Player ─────────────────────────────────────────────────────────────
function AudioPlayer({ url, duration, isMe }: { url: string; duration: number | null; isMe: boolean }) {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);

  function toggle() {
    const a = audioRef.current;
    if (!a) return;
    if (playing) { a.pause(); setPlaying(false); }
    else { a.play(); setPlaying(true); }
  }

  return (
    <div className={`flex items-center gap-3 px-3 py-2.5 rounded-2xl min-w-[220px] max-w-[280px]
      ${isMe ? "bg-violet-700/80" : "bg-muted"}`}>
      <audio
        ref={audioRef}
        src={url}
        onTimeUpdate={e => {
          const a = e.currentTarget;
          const p = a.duration ? a.currentTime / a.duration : 0;
          setProgress(p);
          setElapsed(Math.floor(a.currentTime));
        }}
        onEnded={() => { setPlaying(false); setProgress(0); setElapsed(0); }}
        preload="metadata"
      />
      <button
        onClick={toggle}
        className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-colors
          ${isMe ? "bg-white/20 hover:bg-white/30" : "bg-violet-600/20 hover:bg-violet-600/30"}`}
      >
        {playing
          ? <Pause className={`w-4 h-4 ${isMe ? "text-white" : "text-violet-600"}`} />
          : <Play className={`w-4 h-4 ${isMe ? "text-white" : "text-violet-600"}`} />}
      </button>
      <div className="flex flex-col gap-1 flex-1 min-w-0">
        <Waveform bars={24} progress={progress} color={isMe ? "rgba(255,255,255,0.5)" : "rgba(139,92,246,0.4)"} />
        <span className={`text-[10px] ${isMe ? "text-white/60" : "text-muted-foreground"}`}>
          {elapsed > 0 ? fmtDuration(elapsed) : duration ? fmtDuration(duration) : "0:00"}
        </span>
      </div>
      <Mic className={`w-3.5 h-3.5 flex-shrink-0 ${isMe ? "text-white/50" : "text-muted-foreground"}`} />
    </div>
  );
}

// ─── Image message ────────────────────────────────────────────────────────────
function ImageMsg({ url, isMe }: { url: string; isMe: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <img
        src={url}
        onClick={() => setOpen(true)}
        className="rounded-xl max-w-[220px] max-h-[200px] object-cover cursor-pointer hover:opacity-90 transition-opacity"
      />
      {open && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <img src={url} className="max-w-full max-h-full rounded-xl object-contain" />
          <button className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
      )}
    </>
  );
}

// ─── Document message ─────────────────────────────────────────────────────────
function DocMsg({ url, content, isMe }: { url: string; content: string; isMe: boolean }) {
  const filename = content || url.split("/").pop() || "Documento";
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`flex items-center gap-3 px-3.5 py-3 rounded-2xl min-w-[180px] max-w-[260px] transition-colors
        ${isMe ? "bg-violet-700/80 hover:bg-violet-600/80" : "bg-muted hover:bg-muted/80"}`}
    >
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0
        ${isMe ? "bg-white/20" : "bg-violet-600/15"}`}>
        <FileText className={`w-5 h-5 ${isMe ? "text-white" : "text-violet-600"}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-xs font-semibold truncate ${isMe ? "text-white" : "text-foreground"}`}>{filename}</p>
        <p className={`text-[10px] ${isMe ? "text-white/60" : "text-muted-foreground"}`}>Toca para abrir</p>
      </div>
    </a>
  );
}

// ─── Message bubble ───────────────────────────────────────────────────────────
function MessageBubble({ msg, isMe, showAvatar }: { msg: Message; isMe: boolean; showAvatar: boolean }) {
  return (
    <div className={`flex items-end gap-2 ${isMe ? "flex-row-reverse" : "flex-row"} mb-1`}>
      {/* Avatar — other user only */}
      {!isMe && (
        <div className={`w-7 h-7 rounded-full flex-shrink-0 mb-1 transition-opacity ${showAvatar ? "opacity-100" : "opacity-0"}`}>
          {msg.senderAvatar
            ? <img src={msg.senderAvatar} className="w-7 h-7 rounded-full object-cover" />
            : <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center text-white text-[10px] font-bold">
                {initials(msg.senderName)}
              </div>}
        </div>
      )}

      <div className={`flex flex-col max-w-[72%] ${isMe ? "items-end" : "items-start"}`}>
        {!isMe && showAvatar && (
          <p className="text-[10px] text-muted-foreground mb-1 px-1">{msg.senderName}</p>
        )}

        {/* Content */}
        {msg.messageType === "audio" && msg.mediaUrl && (
          <AudioPlayer url={msg.mediaUrl} duration={msg.duration} isMe={isMe} />
        )}
        {msg.messageType === "image" && msg.mediaUrl && (
          <ImageMsg url={msg.mediaUrl} isMe={isMe} />
        )}
        {msg.messageType === "document" && msg.mediaUrl && (
          <DocMsg url={msg.mediaUrl} content={msg.content} isMe={isMe} />
        )}
        {msg.messageType === "text" && (
          <div className={`px-3.5 py-2.5 rounded-2xl shadow-sm
            ${isMe
              ? "bg-violet-600 text-white rounded-br-md"
              : "bg-muted text-foreground rounded-bl-md"
            }`}>
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
          </div>
        )}

        {/* Time + read status */}
        <div className={`flex items-center gap-1 mt-1 px-1 ${isMe ? "flex-row-reverse" : "flex-row"}`}>
          <span className="text-[10px] text-muted-foreground">{fmtTime(msg.createdAt)}</span>
          {isMe && (
            msg.readAt
              ? <CheckCheck className="w-3 h-3 text-cyan-400" />
              : <Check className="w-3 h-3 text-muted-foreground" />
          )}
        </div>
      </div>

      {isMe && <div className="w-7 flex-shrink-0" />}
    </div>
  );
}

// ─── Date separator ───────────────────────────────────────────────────────────
function DateSeparator({ date }: { date: Date }) {
  return (
    <div className="flex items-center gap-3 my-4">
      <div className="flex-1 h-px bg-border" />
      <span className="text-[11px] text-muted-foreground font-medium px-2 bg-background">{dayLabel(date)}</span>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export function JobChatPage() {
  const { id } = useParams<{ id: string }>();
  const convId = parseInt(id);
  const [, navigate] = useLocation();
  const { user } = useAuth();

  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [otherUser, setOtherUser] = useState<{ name: string; avatarUrl: string | null } | null>(null);
  const [online, setOnline] = useState(false);
  const [typing, setTyping] = useState(false);

  // Media upload state
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Voice recording state
  const [recording, setRecording] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const mediaRecRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load messages + conversation info
  const loadMessages = useCallback(async () => {
    try {
      const data = await apiFetch(`/api/jobs/conversations/${convId}/messages`, { headers: getAuthHeader() });
      setMessages(data ?? []);
    } catch {}
    setLoading(false);
  }, [convId]);

  useEffect(() => {
    // Get conversation info for the header
    apiFetch("/api/jobs/conversations", { headers: getAuthHeader() })
      .then((convs: any[]) => {
        const conv = convs?.find((c: any) => c.id === convId);
        if (conv?.otherUser) setOtherUser(conv.otherUser);
      })
      .catch(() => {});
  }, [convId]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    if (!convId) return;
    const room = `job:${convId}`;
    const socket = getSocket();
    joinRoom(room);
    const handler = (msg: any) => {
      setMessages(prev => {
        if (prev.some((m: any) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
    };
    socket.on("new_message", handler);
    return () => { socket.off("new_message", handler); leaveRoom(room); };
  }, [convId]);

  // Scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typing]);

  // Poll typing indicator
  useEffect(() => {
    const iv = setInterval(async () => {
      try {
        const { typing: t } = await apiFetch(`/api/jobs/conversations/${convId}/typing`, { headers: getAuthHeader() });
        setTyping(t);
      } catch {}
    }, 2500);
    return () => clearInterval(iv);
  }, [convId]);

  // Poll online status
  useEffect(() => {
    async function checkOnline() {
      try {
        const { online: o } = await apiFetch(`/api/jobs/conversations/${convId}/online`, { headers: getAuthHeader() });
        setOnline(o);
      } catch {}
    }
    checkOnline();
    const iv = setInterval(checkOnline, 30000);
    return () => clearInterval(iv);
  }, [convId]);

  // Signal typing to server
  function signalTyping() {
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    apiFetch(`/api/jobs/conversations/${convId}/typing`, {
      method: "POST", headers: getAuthHeader(),
    }).catch(() => {});
  }

  // Send text message
  async function sendText(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      const msg = await apiFetch(`/api/jobs/conversations/${convId}/messages`, {
        method: "POST",
        headers: { ...getAuthHeader(), "Content-Type": "application/json" },
        body: JSON.stringify({ messageType: "text", content: text.trim() }),
      });
      setText("");
      setMessages(prev => [...prev, msg]);
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    } catch (err: any) {
      toast({ title: err?.message ?? "Error al enviar", variant: "destructive" });
    } finally {
      setSending(false);
    }
  }

  // Upload image or document
  async function handleFileUpload(file: File, type: "image" | "document") {
    setUploading(true);
    try {
      const mediaUrl = await uploadFile(file);
      const msg = await apiFetch(`/api/jobs/conversations/${convId}/messages`, {
        method: "POST",
        headers: { ...getAuthHeader(), "Content-Type": "application/json" },
        body: JSON.stringify({
          messageType: type,
          content: file.name,
          mediaUrl,
          mediaMime: file.type,
        }),
      });
      setMessages(prev => [...prev, msg]);
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    } catch (err: any) {
      toast({ title: err?.message ?? "Error al subir archivo", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }

  // Start voice recording
  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const audioCtx = new AudioContext();
      const src = audioCtx.createMediaStreamSource(stream);
      const an = audioCtx.createAnalyser();
      an.fftSize = 128;
      src.connect(an);
      setAnalyser(an);

      const mr = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/ogg" });
      audioChunksRef.current = [];
      mr.ondataavailable = e => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mr.start(100);
      mediaRecRef.current = mr;
      setRecording(true);
      setRecSeconds(0);
      recTimerRef.current = setInterval(() => setRecSeconds(s => s + 1), 1000);
    } catch {
      toast({ title: "No se pudo acceder al micrófono", variant: "destructive" });
    }
  }

  // Stop recording and send audio
  function stopRecording() {
    const mr = mediaRecRef.current;
    if (!mr) return;
    if (recTimerRef.current) clearInterval(recTimerRef.current);
    const seconds = recSeconds;

    mr.onstop = async () => {
      const blob = new Blob(audioChunksRef.current, { type: mr.mimeType || "audio/webm" });
      mr.stream.getTracks().forEach(t => t.stop());
      setAnalyser(null);
      setRecording(false);
      setRecSeconds(0);

      if (seconds < 1) return; // ignore tiny recordings

      setUploading(true);
      try {
        const ext = blob.type.includes("ogg") ? "ogg" : "webm";
        const file = new File([blob], `voice-${Date.now()}.${ext}`, { type: blob.type });
        const mediaUrl = await uploadFile(file);
        const msg = await apiFetch(`/api/jobs/conversations/${convId}/messages`, {
          method: "POST",
          headers: { ...getAuthHeader(), "Content-Type": "application/json" },
          body: JSON.stringify({
            messageType: "audio",
            content: "",
            mediaUrl,
            mediaMime: blob.type,
            duration: seconds,
          }),
        });
        setMessages(prev => [...prev, msg]);
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      } catch (err: any) {
        toast({ title: err?.message ?? "Error al enviar nota de voz", variant: "destructive" });
      } finally {
        setUploading(false);
      }
    };

    mr.stop();
  }

  function cancelRecording() {
    const mr = mediaRecRef.current;
    if (!mr) return;
    if (recTimerRef.current) clearInterval(recTimerRef.current);
    mr.stream.getTracks().forEach(t => t.stop());
    setAnalyser(null);
    setRecording(false);
    setRecSeconds(0);
    mediaRecRef.current = null;
  }

  // Render timeline with date separators
  const timeline = messages.reduce<Array<{ type: "separator"; date: Date } | { type: "msg"; msg: Message }>>((acc, msg, i) => {
    const d = new Date(msg.createdAt);
    const prev = messages[i - 1];
    if (!prev || !isSameDay(new Date(prev.createdAt), d)) {
      acc.push({ type: "separator", date: d });
    }
    acc.push({ type: "msg", msg });
    return acc;
  }, []);

  function isSameDay(a: Date, b: Date) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  const otherName = otherUser?.name ?? "Conversación";

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b border-border px-3 py-3 flex items-center gap-3">
        <button
          onClick={() => navigate("/mensajes")}
          className="w-9 h-9 rounded-xl hover:bg-muted flex items-center justify-center text-muted-foreground transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        {/* Avatar */}
        <div className="relative">
          {otherUser?.avatarUrl
            ? <img src={otherUser.avatarUrl} className="w-10 h-10 rounded-full object-cover" />
            : <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center text-white font-bold">
                {initials(otherName)}
              </div>}
          <div className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-background ${online ? "bg-emerald-500" : "bg-zinc-400"}`} />
        </div>

        <div className="flex-1 min-w-0">
          <p className="font-semibold text-foreground text-sm truncate">{otherName}</p>
          <p className="text-[11px] text-muted-foreground flex items-center gap-1">
            {typing
              ? <span className="text-violet-400 font-medium animate-pulse">Escribiendo...</span>
              : online
                ? <><Wifi className="w-2.5 h-2.5 text-emerald-500" /> En línea</>
                : <><WifiOff className="w-2.5 h-2.5" /> Desconectado</>
            }
          </p>
        </div>

        <div className="flex items-center gap-1">
          <div className="flex items-center gap-1 text-[10px] text-violet-400 bg-violet-500/10 px-2 py-1 rounded-full border border-violet-500/20">
            <Lock className="w-2.5 h-2.5" />
            <span>Premium</span>
          </div>
        </div>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-3 py-3">
        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        )}

        {!loading && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 py-16">
            <div className="w-14 h-14 rounded-2xl bg-violet-500/10 flex items-center justify-center">
              <Lock className="w-7 h-7 text-violet-500/60" />
            </div>
            <p className="text-foreground font-semibold text-sm">Conversación privada</p>
            <p className="text-muted-foreground text-xs text-center max-w-xs">
              Este chat es exclusivo entre tú y {otherName}. Solo los miembros Business Premium pueden iniciar conversaciones.
            </p>
          </div>
        )}

        {timeline.map((item, i) => {
          if (item.type === "separator") return <DateSeparator key={`sep-${i}`} date={item.date} />;
          const msg = item.msg;
          const isMe = msg.senderId === user?.id;
          const prev = timeline[i - 1];
          const prevMsg = prev?.type === "msg" ? prev.msg : null;
          const showAvatar = !isMe && (
            !prevMsg || prevMsg.senderId !== msg.senderId ||
            new Date(msg.createdAt).getTime() - new Date(prevMsg.createdAt).getTime() > 5 * 60 * 1000
          );
          return <MessageBubble key={msg.id} msg={msg} isMe={isMe} showAvatar={showAvatar} />;
        })}

        {/* Typing indicator bubble */}
        {typing && (
          <div className="flex items-end gap-2 mb-1">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0 mb-1">
              {initials(otherName)}
            </div>
            <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="border-t border-border bg-background/95 backdrop-blur px-3 py-3">
        {/* Recording state */}
        {recording ? (
          <div className="flex items-center gap-3 bg-violet-500/10 border border-violet-500/20 rounded-2xl px-4 py-3">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
            <LiveWaveform analyser={analyser} />
            <span className="text-sm font-mono text-red-400 flex-shrink-0 min-w-[36px]">
              {fmtDuration(recSeconds)}
            </span>
            <div className="flex items-center gap-2 ml-auto">
              <button
                onClick={cancelRecording}
                className="w-9 h-9 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center hover:bg-red-500/30 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
              <button
                onClick={stopRecording}
                className="w-9 h-9 rounded-full bg-emerald-500 text-white flex items-center justify-center hover:bg-emerald-400 transition-colors"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={sendText} className="flex items-end gap-2">
            {/* Attachment buttons */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="w-9 h-9 rounded-xl hover:bg-muted flex items-center justify-center text-muted-foreground transition-colors disabled:opacity-40"
                title="Enviar imagen"
              >
                <Image className="w-4.5 h-4.5" />
              </button>
              <button
                type="button"
                onClick={() => docInputRef.current?.click()}
                disabled={uploading}
                className="w-9 h-9 rounded-xl hover:bg-muted flex items-center justify-center text-muted-foreground transition-colors disabled:opacity-40"
                title="Enviar documento"
              >
                <Paperclip className="w-4.5 h-4.5" />
              </button>
            </div>

            {/* Text input */}
            <div className="flex-1 relative">
              <textarea
                ref={inputRef}
                value={text}
                onChange={e => {
                  setText(e.target.value);
                  // Auto-resize
                  e.target.style.height = "auto";
                  e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
                  signalTyping();
                }}
                onKeyDown={e => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendText(e as any);
                  }
                }}
                placeholder="Mensaje..."
                rows={1}
                className="w-full px-4 py-2.5 rounded-2xl border border-border bg-muted text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500/50 resize-none leading-relaxed overflow-hidden transition-all"
                style={{ minHeight: 42, maxHeight: 120 }}
                disabled={uploading || sending}
              />
            </div>

            {/* Send or mic */}
            {text.trim() ? (
              <button
                type="submit"
                disabled={sending || uploading}
                className="w-10 h-10 rounded-xl bg-violet-600 text-white flex items-center justify-center hover:bg-violet-500 active:bg-violet-700 transition-colors disabled:opacity-60 flex-shrink-0"
              >
                {sending
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Send className="w-4 h-4" />}
              </button>
            ) : (
              <button
                type="button"
                onPointerDown={startRecording}
                disabled={uploading}
                className="w-10 h-10 rounded-xl bg-violet-600 text-white flex items-center justify-center hover:bg-violet-500 active:bg-violet-700 transition-colors disabled:opacity-60 flex-shrink-0"
                title="Mantén presionado para grabar"
              >
                <Mic className="w-4 h-4" />
              </button>
            )}
          </form>
        )}

        {uploading && (
          <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span>Subiendo archivo...</span>
          </div>
        )}

        {/* Hidden file inputs */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={e => {
            const f = e.target.files?.[0];
            if (f) handleFileUpload(f, "image");
            e.target.value = "";
          }}
        />
        <input
          ref={docInputRef}
          type="file"
          accept=".pdf,.doc,.docx,.xls,.xlsx,.txt"
          className="hidden"
          onChange={e => {
            const f = e.target.files?.[0];
            if (f) handleFileUpload(f, "document");
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}
