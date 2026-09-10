import React from 'react';
import { AlertTriangle, Flame, X } from 'lucide-react';

interface PanicModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmWipe: () => void;
}

export const PanicModal: React.FC<PanicModalProps> = ({
  isOpen,
  onClose,
  onConfirmWipe
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150">
      <div className="relative w-full max-w-sm bg-slate-900 border border-rose-500/50 rounded-2xl shadow-2xl p-6 text-slate-100 text-center">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="w-14 h-14 mx-auto rounded-2xl bg-rose-500/20 text-rose-500 flex items-center justify-center border border-rose-500/30 mb-4 animate-pulse">
          <Flame className="w-8 h-8" />
        </div>

        <h3 className="text-lg font-bold text-white mb-2">
          Экстренное стирание
        </h3>

        <p className="text-xs text-slate-300 leading-relaxed mb-6">
          Будут <strong className="text-rose-400">безвозвратно удалены</strong> все локальные сообщения, медиафайлы, голосовые записи и ключи шифрования из памяти устройства. Сессия P2P будет немедленно разорвана.
        </p>

        <div className="flex flex-col gap-2.5">
          <button
            type="button"
            onClick={onConfirmWipe}
            className="w-full py-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-sm shadow-lg shadow-rose-900/40 transition-colors cursor-pointer active:scale-98"
          >
            Уничтожить всё сейчас
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors cursor-pointer"
          >
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
};
