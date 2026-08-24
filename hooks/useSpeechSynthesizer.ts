"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

export type PlaybackStatus = "idle" | "playing" | "paused" | "unsupported";

export interface UseSpeechSynthesizerOptions {
  /** The full text the synthesizer will read aloud. */
  text: string;
}

export interface UseSpeechSynthesizerReturn {
  /** Whether the browser supports `window.speechSynthesis`. */
  isSupported: boolean;
  /** Current playback lifecycle state. */
  status: PlaybackStatus;
  /** Currently selected `SpeechSynthesisVoice` instance or null. */
  voice: SpeechSynthesisVoice | null;
  /** Playback rate multiplier (1, 1.25, 1.5, 2). */
  rate: number;
  /** Total spoken word count (updated during playback). */
  wordsSpoken: number;
  /** Total words in the transcript (computed once on mount). */
  totalWords: number;
  /** Approximate remaining listen time in seconds. */
  timeRemainingSec: number;
  /** Start (or resume) playback. */
  play: () => void;
  /** Pause playback; can be resumed with `play`. */
  pause: () => void;
  /** Completely cancel and reset. */
  stop: () => void;
  /** Change the playback speed mid-stream. */
  setRate: (rate: number) => void;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function cleanForSpeech(raw: string): string {
  return raw
    .replace(/```[\s\S]*?```/g, "")
    .replace(/!\[.*?\]\(.*?\)/g, "")
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, "$1")
    .replace(/#{1,6}\s+/g, "")
    .replace(/\*\*|\*|__|_/g, "")
    .replace(/`/g, "")
    .replace(/>\s+/g, "")
    .replace(/\|/g, ",")
    .replace(/\s+/g, " ")
    .trim();
}

const WPM_BASE = 130;

function estimateSeconds(wc: number, rate: number): number {
  const effectiveWpm = WPM_BASE * rate;
  return Math.round((wc / effectiveWpm) * 60);
}

/**
 * Select the highest-quality English voice from the browser's roster.
 */
function pickBestEnglishVoice(
  voices: SpeechSynthesisVoice[],
): SpeechSynthesisVoice | null {
  const englishVoices = voices.filter(
    (v) =>
      v.lang.startsWith("en") &&
      !v.name.includes("Info") &&
      !v.name.includes("IVONA"),
  );

  const platformOrder = ["google", "microsoft", "apple"];
  for (const proxy of platformOrder) {
    const candidate = englishVoices.find((v) =>
      v.name.toLowerCase().includes(proxy),
    );
    if (candidate) return candidate;
  }

  return englishVoices[0] ?? null;
}

/* ------------------------------------------------------------------ */
/*  Hook                                                              */
/* ------------------------------------------------------------------ */

export function useSpeechSynthesizer({
  text,
}: UseSpeechSynthesizerOptions): UseSpeechSynthesizerReturn {
  /* ---- Capability detection ---- */

  const [isSupported] = useState<boolean>(
    () => typeof window !== "undefined" && "speechSynthesis" in window,
  );

  /* ---- Derived text data ---- */

  const cleanedText = cleanForSpeech(text);
  const wordList = cleanedText.split(/\s+/).filter((w) => w.length > 0);
  const totalWords = wordList.length;

  /* ---- State ---- */

  const [status, setStatus] = useState<PlaybackStatus>("idle");
  const [voice, setVoice] = useState<SpeechSynthesisVoice | null>(null);
  const [currentRate, setCurrentRate] = useState<number>(1);
  const [wordsSpoken, setWordsSpoken] = useState<number>(0);
  const [timeRemainingSec, setTimeRemainingSec] = useState<number>(() =>
    estimateSeconds(totalWords, 1),
  );

  /* ---- Mutable refs — only accessed inside callbacks/effects ---- */

  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const wordsSpokenRef = useRef(0);
  const startWordRef = useRef(0);

  /* ---- Voice loading ---- */

  useEffect(() => {
    if (!isSupported) return;

    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) setVoice(pickBestEnglishVoice(voices));
    };

    loadVoices();
    window.speechSynthesis.addEventListener("voiceschanged", loadVoices, {
      once: true,
    });

    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", loadVoices);
    };
  }, [isSupported]);

  /* ---- Tick down time remaining while playing ---- */

  useEffect(() => {
    if (status !== "playing") return;
    const timer = setInterval(() => {
      setTimeRemainingSec((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [status]);

  /* ---- Recalculate time when rate changes ---- */

  useEffect(() => {
    const spoken = wordsSpokenRef.current;
    const rem = Math.max(0, totalWords - spoken);
    setTimeRemainingSec(estimateSeconds(rem, currentRate));
  }, [currentRate, totalWords]);

  /* ---- Reset time on idle ---- */

  useEffect(() => {
    if (status === "idle" && wordsSpokenRef.current === 0) {
      setTimeRemainingSec(estimateSeconds(totalWords, currentRate));
    }
  }, [status, totalWords, currentRate]);

  /* ---- Auto-cancel on unmount / route change ---- */

  useEffect(() => {
    return () => {
      if (isSupported) window.speechSynthesis.cancel();
    };
  }, [isSupported]);

  /* ---- Internal: start a fresh or resumed utterance ---- */

  const startUtterance = useCallback(
    (fromWordIndex: number) => {
      if (!isSupported || !voice) return;

      const utter = new SpeechSynthesisUtterance(
        wordList.slice(fromWordIndex).join(" "),
      );
      utter.rate = currentRate;
      utter.voice = voice;
      utter.pitch = 1;

      utteranceRef.current = utter;
      startWordRef.current = fromWordIndex;

      utter.onstart = () => setStatus("playing");

      utter.onboundary = (event: SpeechSynthesisEvent) => {
        if (event.name === "word") {
          const absoluteWord = fromWordIndex + event.charIndex + 1;
          wordsSpokenRef.current = absoluteWord;
          setWordsSpoken(absoluteWord);
          const rem = Math.max(0, totalWords - absoluteWord);
          setTimeRemainingSec(estimateSeconds(rem, currentRate));
        }
      };

      utter.onend = () => {
        setStatus("idle");
        setWordsSpoken(totalWords);
        setTimeRemainingSec(0);
        utteranceRef.current = null;
        wordsSpokenRef.current = 0;
        startWordRef.current = 0;
      };

      utter.onerror = (event: SpeechSynthesisErrorEvent) => {
        if (event.error !== "interrupted" && event.error !== "canceled") {
          console.error("[SpeechSynthesis] error:", event.error);
        }
        setStatus("idle");
        utteranceRef.current = null;
      };

      try {
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utter);
      } catch {
        setStatus("idle");
      }
    },
    [isSupported, voice, wordList, totalWords, currentRate],
  );

  /* ---- Stop helper ---- */

  const stop = useCallback(() => {
    if (!isSupported) return;
    try {
      window.speechSynthesis.cancel();
    } catch {
      // Ignore
    }
    utteranceRef.current = null;
    wordsSpokenRef.current = 0;
    startWordRef.current = 0;
    setWordsSpoken(0);
    setStatus("idle");
    setTimeRemainingSec(estimateSeconds(totalWords, currentRate));
  }, [isSupported, totalWords, currentRate]);

  /* ---- Play / pause actions ---- */

  const play = useCallback(() => {
    if (!isSupported || !voice || cleanedText.length === 0) return;

    if (status === "paused") {
      window.speechSynthesis.resume();
      setStatus("playing");
      return;
    }

    startUtterance(0);
  }, [isSupported, voice, cleanedText, status, startUtterance]);

  const pause = useCallback(() => {
    if (!isSupported || status !== "playing") return;
    window.speechSynthesis.pause();
    setStatus("paused");
  }, [isSupported, status]);

  /* ---- Speed change ---- */

  const setRate = useCallback(
    (newRate: number) => {
      setCurrentRate(newRate);
      if (status === "playing") {
        const pos = wordsSpokenRef.current;
        stop();
        setTimeout(() => startUtterance(pos), 50);
      }
    },
    [status, stop, startUtterance],
  );

  /* ---- Return the public API ---- */

  return {
    isSupported,
    status,
    voice,
    rate: currentRate,
    wordsSpoken,
    totalWords,
    timeRemainingSec,
    play,
    pause,
    stop,
    setRate,
  };
}