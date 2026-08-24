"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Pause, Play, Square } from "lucide-react";
import type { BriefingAudio } from "@/lib/briefing-audio";

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

const SPEED_OPTIONS = [1, 1.25, 1.5, 2] as const;
const SPEED_LABELS: Record<number, string> = { 1: "1x", 1.25: "1.25x", 1.5: "1.5x", 2: "2x" };

interface AudioBriefingPlayerProps {
  /** Briefing audio metadata loaded from the sidecar manifest. */
  audio?: BriefingAudio | null;
  /** Human-readable article title for aria-labels. */
  articleTitle?: string;
  /** Extra CSS classes for layout. */
  className?: string;
}

/* ------------------------------------------------------------------ */
/*  Animated waveform bars (cosmetic — no real FFT data)             */
/* ------------------------------------------------------------------ */

const BAR_COUNT = 28;
const BAR_HEIGHTS: number[] = (() => {
  const h: number[] = [];
  let seed = 31;
  for (let i = 0; i < BAR_COUNT; i++) {
    seed = ((seed * 1103515245 + 12345) & 0x7fffffff) >>> 0;
    h.push(0.3 + ((seed % 100) / 100) * 0.7); // 0.30–1.0 range
  }
  return h;
})();

function WaveformBars() {
  return (
    <div
      className="flex items-center gap-[2px] h-7 select-none shrink-0"
      aria-hidden="true"
    >
      {BAR_HEIGHTS.map((fraction, i) => (
        <span
          key={i}
          className="audio-waveform-pulse w-[3px] rounded-full bg-accent/60 dark:bg-warm-300/60 origin-bottom inline-block"
          style={{
            height: `${fraction * 1.9}rem`,
            animationDelay: `${(i / BAR_COUNT) * 1.5}s`,
          }}
        />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Time formatting                                                   */
/* ------------------------------------------------------------------ */

function fmt(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                    */
/* ------------------------------------------------------------------ */

/**
 * Play/Pause button — themed to match site accent buttons.
 */
function PlayPauseButton({ isPlaying, onToggle }: { isPlaying: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={isPlaying ? "Pause briefing" : "Play briefing"}
      title={isPlaying ? "Pause" : "Play"}
      className="
        inline-flex items-center justify-center
        w-10 h-10 rounded-full
        bg-accent text-white
        hover:bg-accent/85 active:scale-95
        disabled:opacity-40 disabled:pointer-events-none
        transition-all duration-150
        shrink-0 shadow-sm
      "
    >
      {isPlaying ? (
        <Pause className="w-4 h-4" strokeWidth={2.5} />
      ) : (
        <Play className="w-4 h-4" strokeWidth={2.5} style={{ marginLeft: 2 }} />
      )}
    </button>
  );
}

/**
 * Speed rate pill selector.
 */
function SpeedSelector({
  current,
  onChange,
}: {
  current: number;
  onChange: (rate: number) => void;
}) {
  return (
    <div
      className="flex items-center gap-1"
      role="radiogroup"
      aria-label="Playback speed"
    >
      {SPEED_OPTIONS.map((r) => (
        <button
          key={r}
          type="button"
          role="radio"
          aria-checked={r === current}
          onClick={() => onChange(r)}
          className={`
            min-w-[2.2rem] h-7 px-1.5 rounded-md
            text-[11px] font-bold tabular-nums
            select-none
            transition-all duration-120
            ${
              r === current
                ? "bg-accent text-white shadow-sm"
                : "text-warm-500 dark:text-warm-400 hover:bg-warm-200/70 dark:hover:bg-warm-800/70"
            }
          `}
        >
          {SPEED_LABELS[r]}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

export default function AudioBriefingPlayer({
  audio,
  className = "",
}: AudioBriefingPlayerProps) {
  /* ---- Refs ---- */

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const scrubberRef = useRef<HTMLInputElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(audio?.durationSeconds ?? 0);
  const [rate, setRate] = useState(1);
  const [hasInteracted, setHasInteracted] = useState(false);

  /* Derive if the component has real audio content
     (treats zero or missing duration as absent content). */
  const audioUrl = audio?.url ?? "";
  const hasAudio = duration > 0 && audioUrl.length > 0;

  /* ---- Placeholder: no audio generated yet ---- */

  if (!hasAudio) {
    return (
      <div
        className={`
          flex flex-wrap items-center gap-y-2 gap-x-4
          rounded-xl
          border border-warm-200/60 dark:border-warm-800/60
          bg-warm-50/50 dark:bg-warm-900/25
          backdrop-blur-sm
          px-4 py-2.5
          ${className}
        `}
      role="region"
        aria-label="Audio briefing — coming soon"
      >
        <div
          className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-warm-200 dark:bg-warm-800 text-warm-400 dark:text-warm-600 shrink-0"
          aria-hidden="true"
        >
          <Play className="w-4 h-4" strokeWidth={2} style={{marginLeft: 2}} />
        </div>
        <div className="flex-1 min-w-[10rem]">
          <span className="text-sm font-semibold text-warm-600 dark:text-warm-500 block">Audio Briefing</span>
          <span className="text-[11px] text-warm-400 dark:text-warm-600 block mt-0.5">AI-generated voice audio coming soon</span>
        </div>
        <div className="flex items-center gap-1 shrink-0 opacity-40" aria-hidden="true">
          {[1,1.25,1.5,2].map((r) => (
            <span key={r} className="min-w-[2.2rem] h-7 px-1.5 rounded-md text-[11px] font-bold tabular-nums select-none">
              {r === 1 ? '1x' : r === 1.25 ? '1.25x' : r === 1.5 ? '1.5x' : '2x'}
            </span>
          ))}
        </div>
      </div>
    );
  }

  /* ---- Effect: sync audio ref ---- */

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    el.playbackRate = rate;
  }, [rate]);

  /* ---- Effect: auto-pause on unmount / route change ---- */

  useEffect(() => {
    const el = audioRef.current;
    return () => {
      if (el) {
        el.pause();
        el.src = "";
        el.load();
      }
    };
  }, []);

  /* ---- Audio event handlers ---- */

  const onAudioPlay = useCallback(() => setIsPlaying(true), []);
  const onAudioPause = useCallback(() => setIsPlaying(false), []);
  const onAudioEnded = useCallback(() => {
    setIsPlaying(false);
    setCurrentTime(0);
  }, []);
  const onAudioLoaded = useCallback(() => {
    const el = audioRef.current;
    if (el && el.duration && isFinite(el.duration)) {
      setDuration(el.duration);
    }
    setIsBuffering(false);
  }, []);
  const onAudioWaiting = useCallback(() => setIsBuffering(true), []);
  const onAudioCanPlay = useCallback(() => setIsBuffering(false), []);
  const onTimeUpdate = useCallback(() => {
    const el = audioRef.current;
    if (el) setCurrentTime(el.currentTime);
  }, []);

  /* ---- Playback actions ---- */

  const togglePlay = useCallback(() => {
    const el = audioRef.current;
    if (!el || !hasAudio) return;
    setHasInteracted(true);

    if (el.paused) {
      el.play().catch(() => {
        // Autoplay policy may block — user will need to click again
        setIsPlaying(false);
      });
    } else {
      el.pause();
    }
  }, [hasAudio]);

  const stopPlayback = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    el.pause();
    el.currentTime = 0;
    setIsPlaying(false);
  }, []);

  const handleRateChange = useCallback((newRate: number) => {
    setRate(newRate);
    const el = audioRef.current;
    if (el) el.playbackRate = newRate;
  }, []);

  const handleScrub = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const el = audioRef.current;
      if (!el) return;
      const t = parseFloat(e.target.value);
      el.currentTime = t;
      setCurrentTime(t);
    },
    [],
  );

  /* ---- Derived values ---- */

  const playingProgress = duration > 0 ? currentTime / duration : 0;

  /* ---- Loading / empty states ---- */

  const isLoadingAudio = hasAudio && !hasInteracted && isBuffering;

  /* ---- Render ---- */

  return (
    <div
      className={`
        flex flex-wrap items-center gap-y-3 gap-x-4
        rounded-xl
        border border-warm-200/80 dark:border-warm-800/80
        bg-warm-50/70 dark:bg-warm-900/35
        backdrop-blur-sm
        px-4 py-2.5
        ${className}
      `}
      role="region"
      aria-label="AI voice briefing player"
    >
      {/* Hidden audio element */}
      {hasAudio && (
        <audio
          ref={audioRef}
          src={audioUrl}
          preload="metadata"
          onPlay={onAudioPlay}
          onPause={onAudioPause}
          onEnded={onAudioEnded}
          onLoadedMetadata={onAudioLoaded}
          onCanPlay={onAudioCanPlay}
          onWaiting={onAudioWaiting}
          onTimeUpdate={onTimeUpdate}
          onError={() => {
            setIsPlaying(false);
            setIsBuffering(false);
          }}
        />
      )}

      {/* ── Left: play/pause ── */}

      <PlayPauseButton isPlaying={isPlaying} onToggle={togglePlay} />

      {/* ── Center: label, waveform, scrubber, time stamps ── */}

      <div className="flex-1 min-w-[10rem] flex flex-col gap-1.5">
        <div className="flex items-center gap-3">
          <div className="flex flex-col min-w-0 leading-tight">
            <span className="text-sm font-semibold text-warm-700 dark:text-warm-200 truncate block">
              Audio Briefing
            </span>
            <span className="text-[11px] text-warm-500 dark:text-warm-400 tabular-nums">
              {isLoadingAudio
                ? "Loading audio…"
                : isBuffering
                  ? "Buffering…"
                  : isPlaying
                    ? `Playing · ${fmt(duration - currentTime)} left`
                    : `~${fmt(duration)} · ${SPEED_LABELS[rate]}`}
            </span>
          </div>
          {(isPlaying || (!hasInteracted && !isBuffering && isPlaying === false)) && <WaveformBars />}
        </div>

        {/* Scrubber + time stamps */}
        {hasAudio && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] tabular-nums text-warm-400 dark:text-warm-500 w-8 text-right shrink-0">
              {fmt(currentTime)}
            </span>

            <div className="flex-1 relative h-5 flex items-center group">
              {/* Track background */}
              <div className="absolute inset-x-0 h-1 rounded-full bg-warm-200 dark:bg-warm-700" />
              {/* Fill */}
              <div
                className="absolute left-0 h-1 rounded-full bg-accent/70 dark:bg-warm-300/70 group-hover:bg-accent dark:group-hover:bg-warm-200 transition-colors"
                style={{ width: `${playingProgress * 100}%` }}
              />
              {/* Thumb — hidden until hover for a clean look */}
              <input
                ref={scrubberRef}
                type="range"
                min={0}
                max={duration || 0}
                step={0.1}
                value={currentTime}
                onChange={handleScrub}
                aria-label="Audio progress"
                className="
                  absolute inset-x-0 w-full h-5 appearance-none bg-transparent
                  [&::-webkit-slider-thumb]:appearance-none
                  [&::-webkit-slider-thumb]:h-3.5
                  [&::-webkit-slider-thumb]:w-3.5
                  [&::-webkit-slider-thumb]:rounded-full
                  [&::-webkit-slider-thumb]:bg-accent
                  [&::-webkit-slider-thumb]:shadow-md
                  [&::-webkit-slider-thumb]:opacity-0
                  [&::-webkit-slider-thumb]:group-hover:opacity-100
                  [&::-webkit-slider-thumb]:transition-opacity
                  [&::-moz-range-thumb]:h-3.5
                  [&::-moz-range-thumb]:w-3.5
                  [&::-moz-range-thumb]:rounded-full
                  [&::-moz-range-thumb]:bg-accent
                  [&::-moz-range-thumb]:border-0
                  [&::-moz-range-thumb]:shadow-md
                  cursor-pointer
                "
              />
            </div>

            <span className="text-[10px] tabular-nums text-warm-400 dark:text-warm-500 w-8 shrink-0">
              {fmt(duration)}
            </span>
          </div>
        )}
      </div>

      {/* ── Right: speed + stop ── */}

      <div className="flex items-center gap-2 shrink-0">
        <SpeedSelector current={rate} onChange={handleRateChange} />

        <div className="h-4 w-px bg-warm-200 dark:bg-warm-700 mx-0.5" />

        <button
          type="button"
          onClick={stopPlayback}
          disabled={!isPlaying}
          aria-label="Stop briefing"
          title="Stop"
          className="
            inline-flex items-center justify-center
            w-8 h-8 rounded-lg
            text-warm-400 dark:text-warm-500
            hover:text-red-600 dark:hover:text-red-400
            hover:bg-red-50 dark:hover:bg-red-950/30
            disabled:opacity-25 disabled:pointer-events-none
            transition-all duration-150
            shrink-0
          "
        >
          <Square className="w-3.5 h-3.5" strokeWidth={2} fill="currentColor" />
        </button>
      </div>
    </div>
  );
}