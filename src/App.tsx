/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Lock,
  ShieldCheck,
  QrCode,
  Paperclip,
  Mic,
  Send,
  MoreVertical,
  Flame,
  Timer,
  Check,
  CheckCheck,
  Image as ImageIcon,
  FileText,
  Download,
  Smile,
  Search,
  ArrowLeft,
  EyeOff,
  Eye,
  Info,
  Radio
} from 'lucide-react';
import {
  ChatMessage,
  EncryptedPayload,
  ConnectionState,
  SafetyFingerprint,
  MessageType
} from './types';
import {
  generateRandomSecret,
  deriveKeyFromSecret,
  encryptData,
  decryptData,
  generateSafetyFingerprint,
  fileToDataUrl
} from './crypto/cipher';
import { P2PManager } from './services/p2p';
import { LocalStorageService } from './services/storage';
import { AudioMessage } from './components/AudioMessage';
import { AudioRecorder } from './components/AudioRecorder';
import { SafetyVerificationModal } from './components/SafetyVerificationModal';
import { PairingModal } from './components/PairingModal';
import { PanicModal } from './components/PanicModal';
import { ImageLightbox } from './components/ImageLightbox';

const BURN_OPTIONS = [
  { label: 'Выкл', value: 0 },
  { label: '10 сек', value: 10 },
  { label: '30 сек', value: 30 },
  { label: '1 мин', value: 60 },
  { label: '5 мин', value: 300 },
  { label: '1 час', value: 3600 },
  { label: '24 часа', value: 86400 },
];

export default function App() {
  // Connection & Crypto state
  const [roomId, setRoomId] = useState<string>('');
  const [roomSecret, setRoomSecret] = useState<string>('');
  const [cryptoKey, setCryptoKey] = useState<CryptoKey | null>(null);
  const [safetyFingerprint, setSafetyFingerprint] = useState<SafetyFingerprint | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [latencyMs, setLatencyMs] = useState<number | null>(null);

  // Messages & UI state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [ghostMode, setGhostMode] = useState(false); // incognito in-memory only
  const [burnTimerSec, setBurnTimerSec] = useState<number>(0);
  const [showBurnMenu, setShowBurnMenu] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  // Modals
  const [isPairingOpen, setIsPairingOpen] = useState(false);
  const [isSafetyOpen, setIsSafetyOpen] = useState(false);
  const [isPanicOpen, setIsPanicOpen] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [lightboxFileName, setLightboxFileName] = useState<string>('photo.jpg');

  // References
  const p2pManagerRef = useRef<P2PManager | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  // Parse Room ID and Secret Key from URL on mount
  useEffect(() => {
    let initialRoom = '';
    let initialSecret = '';

    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const urlRoom = urlParams.get('room');
      const hash = window.location.hash.replace('#key=', '');

      if (urlRoom) {
        initialRoom = urlRoom;
      }
      if (hash) {
        try {
          initialSecret = decodeURIComponent(hash);
        } catch {
          initialSecret = hash;
        }
      }
    }

    if (!initialRoom) {
      initialRoom = `cc-${Math.random().toString(36).substring(2, 8)}`;
    }
    if (!initialSecret) {
      initialSecret = generateRandomSecret(24);
    }

    setRoomId(initialRoom);
    setRoomSecret(initialSecret);
  }, []);

  // Initialize Crypto Key & Safety Fingerprint whenever secret changes
  useEffect(() => {
    if (!roomSecret) return;

    deriveKeyFromSecret(roomSecret).then(async (key) => {
      setCryptoKey(key);
      const fp = await generateSafetyFingerprint(key);
      setSafetyFingerprint(fp);
    });
  }, [roomSecret]);

  // Load saved local messages on mount
  useEffect(() => {
    LocalStorageService.loadMessages().then((loaded) => {
      if (loaded.length > 0) {
        setMessages(loaded);
      } else {
        // Welcome tutorial message
        const welcome: ChatMessage = {
          id: 'welcome-1',
          senderId: 'system',
          senderName: 'CipherChat Security',
          isMe: false,
          type: 'text',
          text: '🔐 **Секретный P2P чат запущен!**\n\n• **Без серверов:** Все данные передаются прямо между браузерами (WebRTC DataChannel DTLS/SCTP).\n• **Сквозное шифрование:** AES-256-GCM с уникальным IV для каждого сообщения.\n• **Нулевой след:** Сообщения хранятся только в памяти вашего телефона (IndexedDB), серверных БД не существует.\n\nНажмите значок **QR/Связка** сверху, чтобы подключить второе устройство или открыть вторую вкладку!',
          timestamp: Date.now(),
          delivered: true,
          read: true
        };
        setMessages([welcome]);
      }
    });
  }, []);

  // Initialize P2P connection when roomId & cryptoKey are ready
  useEffect(() => {
    if (!roomId || !cryptoKey) return;

    const manager = new P2PManager({
      onStateChange: (state) => {
        setConnectionState(state);
      },
      onPayload: async (payload: EncryptedPayload) => {
        try {
          // Decrypt payload with current AES-256-GCM key
          const decryptedJson = await decryptData(payload.ciphertext, payload.iv, cryptoKey);
          const parsed = JSON.parse(decryptedJson);

          const now = Date.now();
          const incomingMsg: ChatMessage = {
            id: payload.id,
            senderId: payload.senderId,
            senderName: payload.senderName,
            isMe: false,
            type: payload.type,
            text: parsed.text,
            attachment: parsed.attachment,
            timestamp: payload.timestamp || now,
            delivered: true,
            read: true,
            burnDuration: payload.burnDuration,
            burnExpiresAt: payload.burnDuration ? now + payload.burnDuration * 1000 : undefined
          };

          setMessages((prev) => {
            if (prev.some(m => m.id === incomingMsg.id)) return prev;
            return [...prev, incomingMsg];
          });

          // Save to local storage unless ghost mode
          LocalStorageService.saveMessage(incomingMsg, ghostMode);
        } catch (err) {
          console.error('Decryption failed for payload:', err);
        }
      },
      onAck: (messageId: string) => {
        setMessages(prev => prev.map(m => m.id === messageId ? { ...m, delivered: true, read: true } : m));
      },
      onPingUpdate: (pingMs) => {
        setLatencyMs(pingMs);
      },
      onError: (err) => {
        console.warn('P2P Error:', err);
      }
    });

    p2pManagerRef.current = manager;
    // Determine if host: if we opened without specific query param initially or generated fresh
    const isHost = !window.location.search.includes('room=') || window.location.search.includes(`room=${roomId}`);
    manager.initialize(roomId, isHost);

    return () => {
      manager.cleanup();
    };
  }, [roomId, cryptoKey, ghostMode]);

  // Periodic burn message timer check
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setMessages((prev) => {
        const expired = prev.filter(m => m.burnExpiresAt && m.burnExpiresAt <= now);
        if (expired.length === 0) return prev;

        // Delete expired from DB
        expired.forEach(m => LocalStorageService.deleteMessage(m.id));
        return prev.filter(m => !m.burnExpiresAt || m.burnExpiresAt > now);
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Auto-scroll to bottom on new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Send message helper
  const sendMessage = async (type: MessageType, text?: string, attachment?: ChatMessage['attachment']) => {
    if (!cryptoKey || !p2pManagerRef.current) return;
    if (type === 'text' && (!text || !text.trim())) return;

    const id = `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const now = Date.now();

    const rawData = JSON.stringify({
      text: text?.trim(),
      attachment
    });

    // Encrypt client-side with AES-256-GCM
    const { ciphertext, iv } = await encryptData(rawData, cryptoKey);

    const payload: EncryptedPayload = {
      id,
      senderId: p2pManagerRef.current.getMyId() || 'me',
      senderName: 'Вы',
      type,
      iv,
      ciphertext,
      burnDuration: burnTimerSec > 0 ? burnTimerSec : undefined,
      timestamp: now
    };

    // Send over P2P DataChannel
    p2pManagerRef.current.sendPayload(payload);

    const newChatMessage: ChatMessage = {
      id,
      senderId: 'me',
      senderName: 'Вы',
      isMe: true,
      type,
      text: text?.trim(),
      attachment,
      timestamp: now,
      delivered: connectionState === 'connected',
      read: false,
      burnDuration: burnTimerSec > 0 ? burnTimerSec : undefined,
      burnExpiresAt: burnTimerSec > 0 ? now + burnTimerSec * 1000 : undefined
    };

    setMessages(prev => [...prev, newChatMessage]);
    LocalStorageService.saveMessage(newChatMessage, ghostMode);

    if (type === 'text') {
      setInputText('');
    }
  };

  const handleSendText = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    sendMessage('text', inputText);
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const dataUrl = await fileToDataUrl(file);
    sendMessage('image', undefined, {
      name: file.name,
      size: file.size,
      mimeType: file.type,
      dataUrl
    });

    if (photoInputRef.current) photoInputRef.current.value = '';
    setShowAttachMenu(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const dataUrl = await fileToDataUrl(file);
    sendMessage('file', undefined, {
      name: file.name,
      size: file.size,
      mimeType: file.type,
      dataUrl
    });

    if (fileInputRef.current) fileInputRef.current.value = '';
    setShowAttachMenu(false);
  };

  const handleSendVoice = (dataUrl: string, durationSec: number, waveform: number[]) => {
    sendMessage('voice', undefined, {
      dataUrl,
      duration: durationSec,
      waveform
    });
    setIsRecordingVoice(false);
  };

  const handleConfirmWipe = async () => {
    await LocalStorageService.emergencyWipe();
    p2pManagerRef.current?.cleanup();
    setMessages([]);
    setIsPanicOpen(false);
    // Generate fresh room and keys
    const newR = `cc-${Math.random().toString(36).substring(2, 8)}`;
    const newS = generateRandomSecret(24);
    setRoomId(newR);
    setRoomSecret(newS);
  };

  const handleJoinNewRoom = (newR: string, newS: string) => {
    setRoomId(newR);
    setRoomSecret(newS);
    setMessages([]);
    // Update browser URL hash without reload
    const base = window.location.origin + window.location.pathname;
    window.history.replaceState(null, '', `${base}?room=${newR}#key=${encodeURIComponent(newS)}`);
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatMessageTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const filteredMessages = useMemo(() => {
    if (!searchQuery.trim()) return messages;
    const q = searchQuery.toLowerCase();
    return messages.filter(m => m.text?.toLowerCase().includes(q) || m.attachment?.name?.toLowerCase().includes(q));
  }, [messages, searchQuery]);

  const quickEmojis = ['👍', '❤️', '🔥', '😂', '🎉', '🔒', '👀', '🤫', '🤝', '🚀'];

  return (
    <div className="flex h-screen w-screen bg-[#0e1621] text-slate-100 font-sans overflow-hidden select-none">
      {/* Hidden File Inputs */}
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handlePhotoUpload}
      />
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFileUpload}
      />

      {/* Main Container - Telegram Layout */}
      <div className="flex w-full h-full max-w-7xl mx-auto shadow-2xl overflow-hidden">
        
        {/* Left Sidebar - Chat List (Telegram Desktop style) */}
        <aside className="w-80 md:w-96 flex-shrink-0 bg-[#17212b] border-r border-[#0e1621] flex flex-col hidden sm:flex">
          {/* Sidebar Header */}
          <div className="p-3.5 border-b border-[#0e1621] flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-sky-600 to-cyan-400 flex items-center justify-center font-bold text-white shadow-md text-sm">
                CC
              </div>
              <div>
                <h1 className="text-sm font-bold text-white tracking-wide flex items-center gap-1.5">
                  CipherChat P2P
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded font-mono font-normal">
                    E2EE
                  </span>
                </h1>
                <p className="text-[11px] text-slate-400">
                  Без серверов • Zero Trace
                </p>
              </div>
            </div>

            <button
              id="sidebar-panic-btn"
              type="button"
              onClick={() => setIsPanicOpen(true)}
              className="p-2 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
              title="Экстренное стирание данных"
            >
              <Flame className="w-5 h-5" />
            </button>
          </div>

          {/* Search bar in sidebar */}
          <div className="p-3 border-b border-[#0e1621]">
            <div className="relative flex items-center">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
              <input
                type="text"
                placeholder="Поиск по переписке..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-[#242f3d] text-xs text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
            </div>
          </div>

          {/* Active Chat Item (Telegram Chat Card) */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            <div className="flex items-center gap-3 p-3 rounded-xl bg-[#2b5278] text-white cursor-pointer shadow-sm">
              <div className="relative">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center text-white font-bold text-base shadow">
                  🔒
                </div>
                <span
                  className={`absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-[#17212b] ${
                    connectionState === 'connected' ? 'bg-emerald-400' : 'bg-amber-400'
                  }`}
                />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-sm truncate flex items-center gap-1.5">
                    Секретный диалог
                    <Lock className="w-3.5 h-3.5 text-emerald-300" />
                  </span>
                  <span className="text-[11px] text-sky-200">
                    {messages.length > 0 ? formatMessageTime(messages[messages.length - 1].timestamp) : ''}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-sky-100/80">
                  <span className="truncate pr-2">
                    {connectionState === 'connected'
                      ? `🟢 P2P Онлайн ${latencyMs ? `(${latencyMs}мс)` : ''}`
                      : '🟡 Ожидание подключения'}
                  </span>
                  {messages.length > 0 && (
                    <span className="text-[10px] bg-sky-400/30 text-white font-bold px-1.5 py-0.5 rounded-full">
                      {messages.length}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Quick Tips Box */}
            <div className="mt-4 p-3 rounded-xl bg-[#0e1621]/60 border border-slate-800 text-[11px] text-slate-400 space-y-2">
              <div className="flex items-center gap-1.5 text-sky-400 font-semibold uppercase tracking-wider text-[10px]">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Защита от перехватов</span>
              </div>
              <p className="leading-relaxed">
                Ключ шифрования <strong>AES-256</strong> никогда не покидает телефон. Связка происходит через QR или хэш в ссылке.
              </p>
              <button
                type="button"
                onClick={() => setIsSafetyOpen(true)}
                className="w-full py-1.5 px-2.5 rounded-lg bg-[#242f3d] hover:bg-[#2b5278] text-slate-200 text-xs font-medium text-center transition-colors cursor-pointer"
              >
                Проверить отпечаток ключа
              </button>
            </div>
          </div>

          {/* Sidebar Footer / Ghost Mode Toggle */}
          <div className="p-3 border-t border-[#0e1621] bg-[#17212b]/80 flex items-center justify-between text-xs">
            <button
              type="button"
              onClick={() => setGhostMode(!ghostMode)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                ghostMode
                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-[#242f3d]'
              }`}
              title="Не сохранять сообщения даже в локальную память телефона"
            >
              {ghostMode ? <EyeOff className="w-4 h-4 text-purple-400" /> : <Eye className="w-4 h-4" />}
              <span>{ghostMode ? 'Ghost: Только ОЗУ' : 'Хранение: Телефон'}</span>
            </button>

            <button
              type="button"
              onClick={() => setIsPairingOpen(true)}
              className="p-2 text-sky-400 hover:text-sky-300 hover:bg-[#242f3d] rounded-lg transition-colors cursor-pointer"
              title="Открыть QR-код для связки"
            >
              <QrCode className="w-5 h-5" />
            </button>
          </div>
        </aside>

        {/* Right Chat Column (Telegram Main Window) */}
        <section className="flex-1 flex flex-col bg-[#0e1621] relative min-w-0 h-full">
          
          {/* Chat Header (Telegram style) */}
          <header className="h-16 px-4 bg-[#17212b] border-b border-[#0e1621] flex items-center justify-between flex-shrink-0 z-10 shadow-sm">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setIsSafetyOpen(true)}
                className="relative group cursor-pointer"
                title="Нажмите, чтобы проверить отпечаток безопасности"
              >
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-teal-600 to-emerald-600 flex items-center justify-center text-white font-bold text-sm shadow">
                  🔒
                </div>
                <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-slate-900 flex items-center justify-center">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                </div>
              </button>

              <div className="min-w-0">
                <button
                  type="button"
                  onClick={() => setIsSafetyOpen(true)}
                  className="text-sm font-bold text-white hover:text-sky-300 transition-colors flex items-center gap-1.5 cursor-pointer text-left"
                >
                  <span className="truncate">Секретный P2P чат</span>
                  <Lock className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                </button>
                <div className="flex items-center gap-2 text-xs">
                  {connectionState === 'connected' ? (
                    <span className="text-emerald-400 flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      <span>В сети (P2P прямой канал)</span>
                      {latencyMs && <span className="text-slate-400 text-[11px] font-mono">• {latencyMs}ms</span>}
                    </span>
                  ) : connectionState === 'connecting' ? (
                    <span className="text-amber-400 flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                      <span>Поиск собеседника...</span>
                    </span>
                  ) : (
                    <span className="text-slate-400">Собеседник офлайн</span>
                  )}
                </div>
              </div>
            </div>

            {/* Header Action Buttons */}
            <div className="flex items-center gap-1.5">
              {/* Pairing / QR button */}
              <button
                id="pair-btn"
                type="button"
                onClick={() => setIsPairingOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 text-xs font-semibold border border-sky-500/30 transition-all cursor-pointer"
                title="Показать QR-код или ссылку для связки"
              >
                <QrCode className="w-4 h-4" />
                <span className="hidden md:inline">Связать</span>
              </button>

              {/* Burn Timer selector */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowBurnMenu(!showBurnMenu)}
                  className={`p-2 rounded-lg transition-colors cursor-pointer ${
                    burnTimerSec > 0
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-[#242f3d]'
                  }`}
                  title="Таймер самоуничтожения сообщений"
                >
                  <Timer className="w-5 h-5" />
                </button>

                {showBurnMenu && (
                  <div className="absolute right-0 mt-2 w-48 bg-[#17212b] border border-slate-700 rounded-xl shadow-2xl p-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
                    <div className="px-2.5 py-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-800">
                      Автоудаление:
                    </div>
                    {BURN_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => {
                          setBurnTimerSec(opt.value);
                          setShowBurnMenu(false);
                        }}
                        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                          burnTimerSec === opt.value
                            ? 'bg-sky-500 text-white'
                            : 'text-slate-300 hover:bg-[#242f3d]'
                        }`}
                      >
                        <span>{opt.label}</span>
                        {burnTimerSec === opt.value && <Check className="w-3.5 h-3.5" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Safety Key Verification Button */}
              <button
                type="button"
                onClick={() => setIsSafetyOpen(true)}
                className="p-2 text-slate-400 hover:text-emerald-400 hover:bg-[#242f3d] rounded-lg transition-colors cursor-pointer"
                title="Отпечаток безопасности E2EE"
              >
                <ShieldCheck className="w-5 h-5" />
              </button>

              {/* Panic Button */}
              <button
                type="button"
                onClick={() => setIsPanicOpen(true)}
                className="p-2 text-rose-400 hover:text-rose-300 hover:bg-rose-500/15 rounded-lg transition-colors cursor-pointer"
                title="Экстренное уничтожение всех данных"
              >
                <Flame className="w-5 h-5" />
              </button>
            </div>
          </header>

          {/* Messages Area */}
          <div
            id="chat-messages-container"
            className="flex-1 overflow-y-auto px-3 sm:px-6 py-4 space-y-3 bg-[radial-gradient(#17212b_1px,transparent_1px)] [background-size:16px_16px]"
          >
            {/* Encryption & Security banner */}
            <div className="max-w-sm mx-auto my-2 text-center">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#182533]/90 border border-slate-700/60 text-[11px] text-slate-300 shadow-sm">
                <Lock className="w-3 h-3 text-emerald-400" />
                <span>Сообщения зашифрованы сквозным ключом</span>
              </div>
            </div>

            {/* Message list */}
            {filteredMessages.map((msg) => {
              const isMe = msg.isMe;

              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} group transition-all`}
                >
                  <div
                    className={`relative max-w-[85%] sm:max-w-md md:max-w-lg rounded-2xl px-3.5 py-2.5 shadow-md ${
                      isMe
                        ? 'bg-[#2b5278] text-white rounded-br-sm'
                        : 'bg-[#182533] text-slate-100 rounded-bl-sm border border-slate-700/30'
                    }`}
                  >
                    {/* Burn timer badge */}
                    {msg.burnExpiresAt && (
                      <div className="flex items-center gap-1 text-[10px] font-mono text-amber-300 mb-1 opacity-90">
                        <Timer className="w-3 h-3 animate-pulse" />
                        <span>
                          Самоуничтожение через {Math.max(1, Math.round((msg.burnExpiresAt - Date.now()) / 1000))}с
                        </span>
                      </div>
                    )}

                    {/* Content: Photo */}
                    {msg.type === 'image' && msg.attachment?.dataUrl && (
                      <div className="mb-1.5 overflow-hidden rounded-xl">
                        <img
                          src={msg.attachment.dataUrl}
                          alt={msg.attachment.name || 'Зашифрованное фото'}
                          onClick={() => {
                            setLightboxSrc(msg.attachment?.dataUrl || null);
                            setLightboxFileName(msg.attachment?.name || 'photo.jpg');
                          }}
                          className="max-h-72 w-full object-cover rounded-xl cursor-pointer hover:opacity-95 transition-opacity"
                        />
                      </div>
                    )}

                    {/* Content: Voice Audio */}
                    {msg.type === 'voice' && msg.attachment?.dataUrl && (
                      <AudioMessage
                        dataUrl={msg.attachment.dataUrl}
                        duration={msg.attachment.duration}
                        waveform={msg.attachment.waveform}
                        isMe={isMe}
                      />
                    )}

                    {/* Content: Generic Document / File */}
                    {msg.type === 'file' && (
                      <div className="flex items-center gap-3 p-2 rounded-xl bg-black/20 my-1">
                        <div className="w-10 h-10 rounded-lg bg-sky-500/20 text-sky-400 flex items-center justify-center flex-shrink-0">
                          <FileText className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-semibold truncate text-white">
                            {msg.attachment?.name || 'Документ'}
                          </div>
                          <div className="text-[10px] text-slate-300">
                            {formatFileSize(msg.attachment?.size)}
                          </div>
                        </div>
                        {msg.attachment?.dataUrl && (
                          <a
                            href={msg.attachment.dataUrl}
                            download={msg.attachment.name || 'document'}
                            className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
                            title="Скачать расшифрованный файл"
                          >
                            <Download className="w-4 h-4" />
                          </a>
                        )}
                      </div>
                    )}

                    {/* Content: Text */}
                    {msg.text && (
                      <p className="text-sm sm:text-[14.5px] leading-relaxed break-words whitespace-pre-wrap selection:bg-sky-400/30">
                        {msg.text}
                      </p>
                    )}

                    {/* Message Meta: Timestamp & Read Status */}
                    <div className="flex items-center justify-end gap-1 mt-1 text-[10px] text-slate-300/80 font-mono select-none">
                      <span>{formatMessageTime(msg.timestamp)}</span>
                      {isMe && (
                        <span>
                          {msg.delivered ? (
                            <CheckCheck className="w-3.5 h-3.5 text-sky-300" />
                          ) : (
                            <Check className="w-3.5 h-3.5 text-slate-300" />
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            <div ref={messagesEndRef} />
          </div>

          {/* Emoji Quick Bar */}
          {showEmojiPicker && (
            <div className="px-4 py-2 bg-[#17212b] border-t border-[#0e1621] flex items-center gap-2 overflow-x-auto">
              {quickEmojis.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => {
                    setInputText(prev => prev + emoji);
                  }}
                  className="text-xl p-1.5 hover:bg-[#242f3d] rounded-lg transition-transform active:scale-90 cursor-pointer"
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}

          {/* Attachment Menu Popup */}
          {showAttachMenu && (
            <div className="absolute bottom-20 left-4 z-40 bg-[#17212b] border border-slate-700/80 rounded-2xl shadow-2xl p-2 animate-in fade-in zoom-in-95 duration-100 flex flex-col gap-1 w-48">
              <button
                type="button"
                onClick={() => photoInputRef.current?.click()}
                className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-200 hover:bg-[#242f3d] hover:text-white transition-colors cursor-pointer"
              >
                <div className="w-7 h-7 rounded-lg bg-sky-500/20 text-sky-400 flex items-center justify-center">
                  <ImageIcon className="w-4 h-4" />
                </div>
                <span>Фотография</span>
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-200 hover:bg-[#242f3d] hover:text-white transition-colors cursor-pointer"
              >
                <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                  <FileText className="w-4 h-4" />
                </div>
                <span>Файл / Документ</span>
              </button>
            </div>
          )}

          {/* Bottom Input Area */}
          <footer className="p-3 bg-[#17212b] border-t border-[#0e1621] flex-shrink-0">
            {isRecordingVoice ? (
              <AudioRecorder
                onSendVoice={handleSendVoice}
                onCancel={() => setIsRecordingVoice(false)}
              />
            ) : (
              <form onSubmit={handleSendText} className="flex items-center gap-2">
                {/* Paperclip attachment button */}
                <button
                  type="button"
                  onClick={() => setShowAttachMenu(!showAttachMenu)}
                  className={`p-2.5 rounded-full transition-colors cursor-pointer ${
                    showAttachMenu
                      ? 'bg-sky-500 text-white'
                      : 'text-slate-400 hover:text-white hover:bg-[#242f3d]'
                  }`}
                  title="Прикрепить файл или фото"
                >
                  <Paperclip className="w-5 h-5" />
                </button>

                {/* Emoji toggle button */}
                <button
                  type="button"
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                  className={`p-2.5 rounded-full transition-colors cursor-pointer ${
                    showEmojiPicker
                      ? 'text-amber-400 bg-[#242f3d]'
                      : 'text-slate-400 hover:text-white hover:bg-[#242f3d]'
                  }`}
                  title="Эмодзи"
                >
                  <Smile className="w-5 h-5" />
                </button>

                {/* Text input */}
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Написать зашифрованное сообщение..."
                  className="flex-1 bg-[#242f3d] border border-transparent focus:border-sky-500 rounded-2xl px-4 py-2.5 text-sm text-white placeholder-slate-400 focus:outline-none transition-colors"
                />

                {/* Send or Voice Record button */}
                {inputText.trim() ? (
                  <button
                    id="send-msg-btn"
                    type="submit"
                    className="p-2.5 bg-sky-500 hover:bg-sky-400 text-white rounded-full transition-all shadow-md active:scale-95 cursor-pointer"
                    title="Отправить (Enter)"
                  >
                    <Send className="w-5 h-5" />
                  </button>
                ) : (
                  <button
                    id="record-voice-btn"
                    type="button"
                    onClick={() => setIsRecordingVoice(true)}
                    className="p-2.5 text-slate-400 hover:text-white hover:bg-[#242f3d] rounded-full transition-all active:scale-95 cursor-pointer"
                    title="Записать голосовое сообщение"
                  >
                    <Mic className="w-5 h-5" />
                  </button>
                )}
              </form>
            )}
          </footer>
        </section>
      </div>

      {/* Modals */}
      <PairingModal
        isOpen={isPairingOpen}
        onClose={() => setIsPairingOpen(false)}
        roomId={roomId}
        roomSecret={roomSecret}
        onJoinRoom={handleJoinNewRoom}
        isConnected={connectionState === 'connected'}
      />

      <SafetyVerificationModal
        isOpen={isSafetyOpen}
        onClose={() => setIsSafetyOpen(false)}
        fingerprint={safetyFingerprint}
        peerName="Собеседник"
      />

      <PanicModal
        isOpen={isPanicOpen}
        onClose={() => setIsPanicOpen(false)}
        onConfirmWipe={handleConfirmWipe}
      />

      <ImageLightbox
        src={lightboxSrc}
        fileName={lightboxFileName}
        onClose={() => setLightboxSrc(null)}
      />
    </div>
  );
}
