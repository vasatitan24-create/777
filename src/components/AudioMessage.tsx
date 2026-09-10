import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause } from 'lucide-react';

interface AudioMessageProps {
  dataUrl: string;
  duration?: number;
  waveform?: number[];
  isMe: boolean;
}

export const AudioMessage: React.FC<AudioMessageProps> = ({
  dataUrl,
  duration = 0,
  waveform,
  isMe
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [totalDuration, setTotalDuration] = useState(duration);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Fallback waveform if not recorded
  const bars = waveform && waveform.length > 0 ? waveform : [
    20, 35, 60, 45, 80, 100, 70, 50, 65, 90, 40, 60, 85, 95, 60, 30, 75, 45, 30, 20
  ];

  useEffect(() => {
    const audio = new Audio(dataUrl);
    audioRef.current = audio;

    audio.onloadedmetadata = () => {
      if (audio.duration && !isNaN(audio.duration) && audio.duration !== Infinity) {
        setTotalDuration(Math.round(audio.duration));
      }
    };

    audio.ontimeupdate = () => {
      setCurrentTime(audio.currentTime);
    };

    audio.onended = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    return () => {
      audio.pause();
      audioRef.current = null;
    };
  }, [dataUrl]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.playbackRate = playbackRate;
      audioRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  };

  const handleSpeedToggle = () => {
    const nextRate = playbackRate === 1 ? 1.5 : playbackRate === 1.5 ? 2 : 1;
    setPlaybackRate(nextRate);
    if (audioRef.current) {
      audioRef.current.playbackRate = nextRate;
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const progress = totalDuration > 0 ? Math.min(currentTime / totalDuration, 1) : 0;

  return (
    <div className="flex items-center gap-3 select-none py-1">
      {/* Play/Pause Button */}
      <button
        type="button"
        onClick={togglePlay}
        className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-transform active:scale-95 shadow-sm cursor-pointer ${
          isMe
            ? 'bg-white text-sky-700 hover:bg-sky-50'
            : 'bg-sky-500 text-white hover:bg-sky-600'
        }`}
        aria-label={isPlaying ? 'Пауза' : 'Слушать'}
      >
        {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
      </button>

      {/* Waveform Scrubber */}
      <div className="flex-1 flex flex-col justify-center gap-1.5 min-w-[130px]">
        <div
          className="flex items-center gap-[2.5px] h-7 cursor-pointer"
          onClick={(e) => {
            if (!audioRef.current || !totalDuration) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const clickProgress = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            audioRef.current.currentTime = clickProgress * totalDuration;
            setCurrentTime(audioRef.current.currentTime);
          }}
        >
          {bars.slice(0, 24).map((heightPercent, index) => {
            const barProgress = index / 24;
            const isPlayed = barProgress <= progress;
            return (
              <span
                key={index}
                className="flex-1 rounded-full transition-colors duration-150"
                style={{
                  height: `${Math.max(18, Math.min(heightPercent, 100))}%`,
                  backgroundColor: isPlayed
                    ? isMe ? '#ffffff' : '#38bdf8'
                    : isMe ? 'rgba(255,255,255,0.38)' : 'rgba(255,255,255,0.22)'
                }}
              />
            );
          })}
        </div>

        {/* Timers & Speed */}
        <div className="flex items-center justify-between text-[11px] font-mono leading-none">
          <span className={isMe ? 'text-sky-100' : 'text-slate-400'}>
            {isPlaying ? formatTime(currentTime) : formatTime(totalDuration)}
          </span>
          <button
            type="button"
            onClick={handleSpeedToggle}
            className={`px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wider cursor-pointer ${
              isMe
                ? 'bg-white/20 text-white hover:bg-white/30'
                : 'bg-slate-700/60 text-slate-300 hover:bg-slate-700'
            }`}
          >
            {playbackRate}x
          </button>
        </div>
      </div>
    </div>
  );
};
