import React, { useState, useRef, useEffect } from 'react';
import { Mic, Trash2, Send } from 'lucide-react';
import { fileToDataUrl } from '../crypto/cipher';

interface AudioRecorderProps {
  onSendVoice: (dataUrl: string, durationSec: number, waveform: number[]) => void;
  onCancel: () => void;
}

export const AudioRecorder: React.FC<AudioRecorderProps> = ({ onSendVoice, onCancel }) => {
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [waveformLevels, setWaveformLevels] = useState<number[]>([30, 45, 20, 60, 40]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerIntervalRef = useRef<number | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const collectedWaveformRef = useRef<number[]>([]);

  useEffect(() => {
    let audioCtx: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;

    const startAudioStream = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;

        // Visualizer setup
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        audioCtx = new AudioCtx();
        const source = audioCtx.createMediaStreamSource(stream);
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 64;
        source.connect(analyser);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        const updateMeter = () => {
          if (!analyser) return;
          analyser.getByteFrequencyData(dataArray);

          // Calculate average volume
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
          }
          const avg = sum / dataArray.length;
          const normalized = Math.min(100, Math.max(15, Math.round((avg / 128) * 100)));

          setWaveformLevels(prev => [...prev.slice(1), normalized]);
          collectedWaveformRef.current.push(normalized);

          animFrameRef.current = requestAnimationFrame(updateMeter);
        };

        animFrameRef.current = requestAnimationFrame(updateMeter);

        // MediaRecorder setup
        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;
        audioChunksRef.current = [];

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            audioChunksRef.current.push(event.data);
          }
        };

        mediaRecorder.start(100);

        timerIntervalRef.current = window.setInterval(() => {
          setRecordingSeconds(s => s + 1);
        }, 1000);
      } catch (err) {
        console.error('Microphone access denied or error:', err);
        alert('Не удалось получить доступ к микрофону. Проверьте разрешения браузера.');
        onCancel();
      }
    };

    startAudioStream();

    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (audioCtx) audioCtx.close().catch(() => {});
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [onCancel]);

  const handleStopAndSend = () => {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') return;

    mediaRecorderRef.current.onstop = async () => {
      const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
      const dataUrl = await fileToDataUrl(audioBlob);

      // Downsample waveform to ~24 bars
      const full = collectedWaveformRef.current;
      const sampledWaveform: number[] = [];
      const step = Math.max(1, Math.floor(full.length / 24));
      for (let i = 0; i < 24; i++) {
        const val = full[i * step] || 35;
        sampledWaveform.push(val);
      }

      onSendVoice(dataUrl, Math.max(1, recordingSeconds), sampledWaveform);
    };

    mediaRecorderRef.current.stop();
  };

  const formatTimer = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex items-center justify-between w-full bg-slate-900/95 border border-sky-500/30 rounded-2xl px-4 py-2.5 shadow-lg backdrop-blur-md animate-in fade-in slide-in-from-bottom-2 duration-200">
      {/* Cancel button */}
      <button
        type="button"
        onClick={onCancel}
        className="p-2 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-full transition-colors cursor-pointer"
        title="Отменить запись"
      >
        <Trash2 className="w-5 h-5" />
      </button>

      {/* Recording status & Waveform */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500"></span>
          </span>
          <span className="font-mono text-sm font-semibold text-rose-300">
            {formatTimer(recordingSeconds)}
          </span>
        </div>

        {/* Live dynamic bars */}
        <div className="flex items-center gap-1 h-5 w-28 overflow-hidden">
          {waveformLevels.map((val, idx) => (
            <span
              key={idx}
              className="flex-1 bg-sky-400 rounded-full transition-all duration-75"
              style={{ height: `${Math.max(20, val)}%` }}
            />
          ))}
        </div>
      </div>

      {/* Send voice button */}
      <button
        type="button"
        onClick={handleStopAndSend}
        className="p-2.5 bg-sky-500 hover:bg-sky-400 text-white rounded-full transition-all shadow-md active:scale-95 cursor-pointer"
        title="Отправить голосовое"
      >
        <Send className="w-4 h-4" />
      </button>
    </div>
  );
};
