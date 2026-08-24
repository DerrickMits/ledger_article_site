"use client";

import { useCallback, useState } from "react";
import { Pause, Play, Speaker, StopCircle } from "lucide-react";
import { useSpeechSynthesizer } from "@/hooks/useSpeechSynthesizer";

/* ------------------------------------------------------------------ */
/*  Speed-rate preset options                                         */
/* ------------------------------------------------------------------ */

const RATE_OPTIONS = [1, 1.25, 1.5, 2] as const;
const RATE_LABELS: Record<number, string> = {
  1: "1x",
  1.25: "1.25x",
  1.5: "1.5x",
  2: "2x",
};

/* ------------------------------------------------------------------ */
/*  Props                                                             */
/* ------------------------------------------------------------------ */

interface BrowserAudioBriefingProps {
  /** Cleaned prose text the synthesizer reads aloud. */
  briefingText: string;
  /** Approximate human-readable listen estimate shown when idle (e.g. "2 min"). */
  estimatedReadTimeMin?: number;
  /** Extra CSS classes for placement control. */
  className?: string;
}

/* ------------------------------------------------------------------ */
/*  Animated waveform bar set                                         */
/* ------------------------------------------------------------------ */

/** Number of equalizer bars in the waveform. */
const BAR_COUNT = 26;

/**
 * Procedurally generated heights for each bar so the waveform looks
 * organic and never repeats identically, yet stays within a readable range.
 */
const BAR_HEIGHTS: number[] = (() => {
  const heights: number[] = [];
  let seed = 7;
  for (let i = 0; i < BAR_COUNT; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    heights.push(0.35 + ((seed % 100) / 100) * 0.5);
  }
  return heights;
})();

/**
 * Vertical bars that pulse with an animation while audio is active.
 * Per-bar animation-delay creates a travelling-wave visual.
 */
function Waveform() {
  return (
    <div
      className="flex items-center gap-[3px] h-8 select-none"
      aria-hidden="true"
    >
      {BAR_HEIGHTS.map((fraction, i) => (
        <span
          key={i}
          className="audio-waveform-pulse w-[3px] rounded-full bg-warm-400 dark:bg-warm-500 origin-bottom inline-block"
          style={{
            height: `${fraction * 2.25}rem`,
            animationDelay: `${(i / BAR_COUNT) * 1.4}s`,
          }}
        />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Helper: derive human time-estimate string from state               */
/* ------------------------------------------------------------------ */

function estimateSeconds(wc: number, rate: number): number {
  const WPM_BASE = 130;
  const effectiveWpm = WPM_BASE * rate;
  return Math.round((wc / effectiveWpm) * 60);
}

function formatTimeEstimate(seconds: number): string {
  const mins = Math.max(1, Math.ceil(seconds / 60));
  return mins === 1 ? "~1 min listen" : `~${mins} min listen`;
}

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

export default function BrowserAudioBriefing({
  briefingText,
  estimatedReadTimeMin = 2,
  className = "",
}: BrowserAudioBriefingProps) {
  const {
    isSupported,
    status,
    wordsSpoken,
    totalWords,
    rate,
    play,
    pause,
    stop,
    setRate,
  } = useSpeechSynthesizer({
    text: briefingText,
  });

  // Derive display estimate directly from hook state (no setState in effect).
  const remainingWords = Math.max(0, totalWords - wordsSpoken);
  const currentRemainingSec = estimateSeconds(remainingWords, rate);
  const derivedEstimate = formatTimeEstimate(currentRemainingSec);

  // Idle baseline (set once, not mutated during playback to avoid jitter).
  const [baselineEstimate] = useState<string>(() =>
    estimatedReadTimeMin === 1 ? "~1 min listen" : `~${estimatedReadTimeMin} min listen`,
  );

  const isPlaying = status === "playing";
  const isPaused = status === "paused";
  const isIdle = status === "idle";

  /* ---- Handlers ---- */

  const handlePlayPause = useCallback(() => {
    if (!isSupported) return;
    if (isPlaying) {
      pause();
    } else {
      play();
    }
  }, [isSupported, isPlaying, play, pause]);

  const handleStop = useCallback(() => {
    stop();
  }, [stop]);

  const handleRateChange = useCallback(
    (newRate: number) => {
      setRate(newRate);
    },
    [setRate],
  );

  /* ---- Determine the label shown under "Audio Briefing" ---- */

  const statusLabel = isPlaying
    ? `Speaking · ${derivedEstimate}`
    : isPaused
      ? "Paused"
      : baselineEstimate;

  /* ---- Render: unsupported browser fallback ---- */

  if (!isSupported) {
    return (
      <div
        className={`
          flex items-center gap-3 rounded-xl
          border border-warm-200 dark:border-warm-800
          bg-warm-50/80 dark:bg-warm-900/30
          px-4 py-3 text-sm text-warm-500 dark:text-warm-400
          ${className}
        `}
      >
        <Speaker className="w-4 h-4 shrink-0 opacity-50" strokeWidth={1.8} />
        <span>Audio briefing unavailable in this browser.</span>
      </div>
    );
  }

  /* ---- Normal render ---- */

  const ariaLabel = isPlaying
    ? "Pause audio briefing"
    : isPaused
      ? "Resume audio briefing"
      : "Play audio briefing";

  return (
    <div
      className={`
        flex flex-wrap items-center gap-y-2 gap-x-4
        rounded-xl
        border border-warm-200/80 dark:border-warm-800/80
        bg-warm-50/80 dark:bg-warm-900/40
        backdrop-blur-sm
        px-4 py-2.5
        ${className}
      `}
      role="region"
      aria-label="Audio briefing player"
    >
      {/* ── Left: Play/Pause button ── */}

      <button
        type="button"
        onClick={handlePlayPause}
        disabled={!isSupported || totalWords === 0}
        aria-label={ariaLabel}
        title={ariaLabel}
        className="
          inline-flex items-center justify-center
          w-9 h-9 rounded-full
          bg-accent text-white
          hover:bg-accent/85 active:scale-[0.94]
          disabled:opacity-40 disabled:pointer-events-none
          transition-all duration-150
          shrink-0
        "
      >
        {isPlaying ? (
          <Pause className="w-[15px] h-[15px]" strokeWidth={2.5} />
        ) : (
          <Play
            className="w-[15px] h-[15px]"
            strokeWidth={2.5}
            style={{ marginLeft: 2 }}
          />
        )}
      </button>

      {/* ── Center label + waveform ── */}

      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="flex flex-col justify-center min-w-0">
          <span className="text-sm font-semibold text-warm-700 dark:text-warm-200 truncate block">
            Audio Briefing
          </span>
          <span
            className="text-xs text-warm-500 dark:text-warm-400 tracking-wide"
            aria-live="polite"
            aria-atomic="true"
          >
            {statusLabel}
          </span>
        </div>

        {/* Waveform animates continuously when audio is active */}
        {(isPlaying || isPaused) && <Waveform />}
      </div>

      {/* ── Right: Speed rate pills + Stop ── */}

      <div className="flex items-center gap-1.5 shrink-0">
        {RATE_OPTIONS.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => handleRateChange(r)}
            aria-label={`Set playback speed to ${RATE_LABELS[r]}`}
            aria-pressed={r === rate}
            title={`${RATE_LABELS[r]} speed`}
            className={`
              inline-flex items-center justify-center
              min-w-[2.1rem] px-1.5 py-0.5 rounded-lg
              text-xs font-semibold tabular-nums
              transition-all duration-100
              ${
                r === rate
                  ? "bg-accent/15 text-accent dark:bg-warm-300/20 dark:text-warm-200"
                  : "text-warm-500 dark:text-warm-400 hover:bg-warm-100 dark:hover:bg-warm-800"
              }
            `}
          >
            {RATE_LABELS[r]}
          </button>
        ))}

        <div className="w-px h-4 bg-warm-200 dark:bg-warm-700 mx-0.5" />

        <button
          type="button"
          onClick={handleStop}
          disabled={isIdle && wordsSpoken === 0}
          aria-label="Stop audio briefing"
          title="Stop"
          className="
            inline-flex items-center justify-center
            w-7 h-7 rounded-lg
            text-warm-500 dark:text-warm-400
            hover:text-red-600 dark:hover:text-red-400
            hover:bg-red-50 dark:hover:bg-red-900/20
            disabled:opacity-30 disabled:pointer-events-none
            transition-all duration-150
            shrink-0
          "
        >
          <StopCircle className="w-4 h-4" strokeWidth={1.8} />
        </button>
      </div>
    </div>
  );
}