import React, { useState, useEffect } from 'react';
import { X, QrCode, Copy, Check, ExternalLink, Link2, Key, RefreshCw, Smartphone } from 'lucide-react';
import QRCode from 'qrcode';
import { generateRandomSecret } from '../crypto/cipher';

interface PairingModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomId: string;
  roomSecret: string;
  onJoinRoom: (newRoomId: string, newSecret: string) => void;
  isConnected: boolean;
}

export const PairingModal: React.FC<PairingModalProps> = ({
  isOpen,
  onClose,
  roomId,
  roomSecret,
  onJoinRoom,
  isConnected
}) => {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [manualInput, setManualInput] = useState('');

  // Generate current share URL with key in hash (#key=...)
  // The hash (#) is strictly client-side according to RFC 3986 and is never transmitted over HTTP to any server!
  const getShareUrl = () => {
    if (typeof window === 'undefined') return '';
    const base = window.location.origin + window.location.pathname;
    return `${base}?room=${roomId}#key=${encodeURIComponent(roomSecret)}`;
  };

  useEffect(() => {
    if (!isOpen) return;

    const shareUrl = getShareUrl();
    QRCode.toDataURL(shareUrl, {
      width: 280,
      margin: 2,
      color: {
        dark: '#0f172a',
        light: '#ffffff'
      }
    })
      .then(url => setQrDataUrl(url))
      .catch(err => console.error('QR generation error:', err));
  }, [isOpen, roomId, roomSecret]);

  if (!isOpen) return null;

  const shareUrl = getShareUrl();

  const handleCopyLink = () => {
    navigator.clipboard?.writeText(shareUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleCopyCode = () => {
    navigator.clipboard?.writeText(`${roomId}:${roomSecret}`);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleOpenSecondTab = () => {
    window.open(shareUrl, '_blank');
  };

  const handleJoinManual = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualInput.trim()) return;

    // Check if user pasted full URL
    try {
      if (manualInput.includes('?room=') || manualInput.includes('#key=')) {
        const url = new URL(manualInput.trim());
        const targetRoom = url.searchParams.get('room');
        const hash = url.hash.replace('#key=', '');
        if (targetRoom && hash) {
          onJoinRoom(targetRoom, decodeURIComponent(hash));
          onClose();
          return;
        }
      }

      // Check if format is roomId:secret
      if (manualInput.includes(':')) {
        const [rId, rSec] = manualInput.split(':');
        if (rId && rSec) {
          onJoinRoom(rId.trim(), rSec.trim());
          onClose();
          return;
        }
      }

      // Otherwise just room ID with current secret
      onJoinRoom(manualInput.trim(), roomSecret);
      onClose();
    } catch {
      alert('Неверный формат ссылки или кода');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl p-6 text-slate-100 max-h-[90vh] overflow-y-auto">
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Title */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-sky-500/20 text-sky-400 flex items-center justify-center border border-sky-500/30">
            <QrCode className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">
              Связка двух собеседников
            </h3>
            <p className="text-xs text-slate-400">
              {isConnected ? (
                <span className="text-emerald-400 font-medium">● Собеседник подключен напрямую P2P</span>
              ) : (
                'Ожидание подключения второго устройства'
              )}
            </p>
          </div>
        </div>

        {/* QR Code Container */}
        <div className="flex flex-col items-center justify-center bg-slate-950/80 border border-slate-800 rounded-xl p-5 mb-5 text-center">
          {qrDataUrl ? (
            <div className="p-3 bg-white rounded-xl shadow-md mb-3">
              <img src={qrDataUrl} alt="QR Код для подключения" className="w-48 h-48 block" />
            </div>
          ) : (
            <div className="w-48 h-48 flex items-center justify-center text-slate-500">
              Генерация QR...
            </div>
          )}
          <div className="text-xs text-slate-300 font-medium flex items-center gap-1.5 mb-1">
            <Smartphone className="w-4 h-4 text-sky-400" />
            <span>Наведите камеру телефона собеседника</span>
          </div>
          <p className="text-[11px] text-slate-400 max-w-xs">
            Ключ шифрования зашит в хеш ссылки (#key) и считывается локально в браузере, не попадая в интернет.
          </p>
        </div>

        {/* Action Buttons: Copy Link & Test in 2nd tab */}
        <div className="space-y-3 mb-5">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopyLink}
              className="flex-1 py-2.5 px-4 rounded-xl bg-sky-500 hover:bg-sky-400 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-98"
            >
              {copiedLink ? <Check className="w-4 h-4 text-white" /> : <Link2 className="w-4 h-4" />}
              <span>{copiedLink ? 'Ссылка скопирована в буфер!' : 'Скопировать секретную ссылку'}</span>
            </button>

            <button
              type="button"
              onClick={handleOpenSecondTab}
              className="py-2.5 px-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors border border-slate-700 cursor-pointer"
              title="Открыть во второй вкладке для быстрой проверки прямо на этом компьютере"
            >
              <ExternalLink className="w-4 h-4 text-sky-400" />
              <span>Тест во 2-й вкладке</span>
            </button>
          </div>

          <div className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-slate-950/60 border border-slate-800 text-xs text-slate-400">
            <div className="truncate pr-2 font-mono text-[11px]">
              Комната: <span className="text-slate-200">{roomId}</span>
            </div>
            <button
              type="button"
              onClick={handleCopyCode}
              className="text-sky-400 hover:text-sky-300 font-medium flex-shrink-0 cursor-pointer"
            >
              {copiedCode ? 'Скопировано' : 'Код комнаты'}
            </button>
          </div>
        </div>

        {/* PWA & APK Installation Guide */}
        <div className="border-t border-slate-800/80 pt-4 mb-4">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400 mb-2">
            <Smartphone className="w-4 h-4" />
            <span>Установка на телефон (PWA / APK):</span>
          </div>
          <div className="space-y-2 bg-slate-950/60 border border-slate-800 rounded-xl p-3 text-[11px] text-slate-300">
            <p>
              <strong className="text-white">1. Без скачивания файлов (PWA):</strong> В браузере телефона (Chrome/Safari) нажмите меню (три точки) ➔ <strong>«Установить приложение»</strong> или <strong>«На главный экран»</strong>. Появится полноценное приложение на рабочем столе.
            </p>
            <p>
              <strong className="text-white">2. Скачать готовый .APK:</strong> Вставьте ссылку на этот сайт в бесплатный генератор <a href="https://www.pwabuilder.com" target="_blank" rel="noopener noreferrer" className="text-sky-400 underline hover:text-sky-300 font-semibold">PWABuilder.com</a> и нажмите <em>«Package for Android»</em> для загрузки подписанного APK-файла.
            </p>
          </div>
        </div>

        {/* Manual Join / Switch Room form */}
        <form onSubmit={handleJoinManual} className="border-t border-slate-800/80 pt-4">
          <label className="block text-xs font-medium text-slate-300 mb-2">
            Или вставьте ссылку / код от собеседника:
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
              placeholder="Вставьте ссылку https://...#key=... или код"
              className="flex-1 px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-sky-500"
            />
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold border border-slate-700 cursor-pointer transition-colors"
            >
              Подключиться
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
