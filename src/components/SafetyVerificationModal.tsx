import React, { useState } from 'react';
import { ShieldCheck, Lock, Copy, Check, X, ServerOff, Smartphone, Cpu } from 'lucide-react';
import { SafetyFingerprint } from '../types';

interface SafetyVerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  fingerprint: SafetyFingerprint | null;
  peerName: string;
}

export const SafetyVerificationModal: React.FC<SafetyVerificationModalProps> = ({
  isOpen,
  onClose,
  fingerprint,
  peerName
}) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen || !fingerprint) return null;

  const handleCopy = () => {
    const text = `${fingerprint.emojis.join(' ')}\n${fingerprint.numberBlocks.join(' ')}`;
    navigator.clipboard?.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl p-6 text-slate-100 overflow-hidden">
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-1.5">
              Сквозное шифрование E2EE
            </h3>
            <p className="text-xs text-slate-400">
              Секретный чат с {peerName}
            </p>
          </div>
        </div>

        {/* Telegram-style 4 Emoji Verification Matrix */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 text-center mb-4">
          <div className="text-xs text-slate-400 mb-2.5 font-medium">
            Визуальный отпечаток ключа шифрования:
          </div>
          <div className="flex items-center justify-center gap-4 py-2 text-4xl select-none">
            {fingerprint.emojis.map((emoji, index) => (
              <span
                key={index}
                className="w-14 h-14 rounded-2xl bg-slate-800/80 border border-slate-700/60 flex items-center justify-center shadow-inner hover:scale-105 transition-transform"
              >
                {emoji}
              </span>
            ))}
          </div>
          <p className="text-[11px] text-emerald-400/90 mt-2.5 leading-relaxed">
            Сравните эти 4 эмодзи с экраном собеседника. Если они одинаковые — переписка защищена от перехвата на 100%.
          </p>
        </div>

        {/* 60-digit safety numbers */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1.5 text-xs text-slate-400 font-medium">
            <span>Цифровой отпечаток (Safety Numbers):</span>
            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-1 text-sky-400 hover:text-sky-300 transition-colors cursor-pointer"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Скопировано' : 'Копировать'}</span>
            </button>
          </div>
          <div className="grid grid-cols-3 gap-1.5 p-3 rounded-xl bg-slate-950/60 border border-slate-800 text-[11px] font-mono text-slate-300 text-center select-all">
            {fingerprint.numberBlocks.map((block, idx) => (
              <div key={idx} className="tracking-wider bg-slate-900/60 py-1 rounded border border-slate-800/40">
                {block}
              </div>
            ))}
          </div>
        </div>

        {/* Architecture details */}
        <div className="space-y-2 border-t border-slate-800/80 pt-3.5 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-sky-400 flex-shrink-0" />
            <span>Алгоритм: <strong className="text-slate-200">AES-256-GCM</strong> (ключ вычисляется на процессоре телефона)</span>
          </div>
          <div className="flex items-center gap-2">
            <ServerOff className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span>Серверы: <strong className="text-slate-200">Отсутствуют</strong> (прямой P2P DataChannel WebRTC)</span>
          </div>
          <div className="flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <span>Хранилище: <strong className="text-slate-200">Исключительно локально на устройстве</strong></span>
          </div>
        </div>

        <div className="mt-5">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-semibold text-sm transition-colors cursor-pointer"
          >
            Понятно, всё безопасно
          </button>
        </div>
      </div>
    </div>
  );
};
