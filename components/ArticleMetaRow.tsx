"use client";

import { useMemo } from "react";
import { CalendarDays, Clock, User } from "lucide-react";
import AudioBriefingPlayer from "./AudioBriefingPlayer";
import FocusModeToggle from "./FocusModeToggle";
import type { BriefingAudio } from "@/lib/briefing-audio";

/* ------------------------------------------------------------------ */
/*  Component interface                                                */
/* ------------------------------------------------------------------ */

interface ExecutiveSummaryData {
  bottleneck: string;
  fix: string;
  outcome: string;
  readTime?: number;
}

interface ArticleMetaRowInnerProps {
  date: string;
  readTime: string;
  author: string;
  category?: string;
  executiveSummary?: ExecutiveSummaryData | null;
  content?: string;
  audio?: BriefingAudio | null;
  className?: string;
}

/* ------------------------------------------------------------------ */
/*  Component interface                                                */
/* ------------------------------------------------------------------ */

interface ExecutiveSummaryData {
  bottleneck: string;
  fix: string;
  outcome: string;
  readTime?: number;
}

interface ArticleMetaRowInnerProps {
  date: string;
  readTime: string;
  author: string;
  category?: string;
  executiveSummary?: ExecutiveSummaryData | null;
  content?: string;
  audio?: BriefingAudio | null;
  className?: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatPublishDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

/**
 * Build briefing prose from the structured executive summary as a FALLBACK
 * only — production audio is expected to come from the pre-generated
 * `audio` field populated by the generation script / manifest.
 */
function buildBriefingText(execSummary: ArticleMetaRowInnerProps["executiveSummary"], content?: string): string {
  if (execSummary) {
    return [
      "Here is your executive briefing.",
      `The core bottleneck: ${execSummary.bottleneck}`,
      `The recommended fix: ${execSummary.fix}`,
      `The measured outcome: ${execSummary.outcome}`,
    ].join(" ");
  }

  if (content) {
    const plain = content
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
    return plain.split(/\s+/).filter(Boolean).slice(0, 300).join(" ");
  }

  return "";
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function ArticleMetaRow({
  date,
  readTime,
  author,
  category,
  executiveSummary,
  content,
  audio,
  className = "",
}: ArticleMetaRowInnerProps) {
  // Legacy buildBriefingText is no longer used directly in JSX;
  // pre-generated audio from the manifest drives the player.
  useMemo(
    () => buildBriefingText(executiveSummary ?? null, content),
    [executiveSummary, content],
  );

  // When pre-generated audio exists, pass it to the dedicated HTML5 player.
  // Otherwise the player stays hidden and the legacy synthesizer
  // path is NOT re-activated — we only render audio when we have
  // a real pre-rendered file to play.

  return (
    <>
      <div
        className={`
          flex flex-wrap items-center gap-x-5 gap-y-2
          text-sm text-warm-500 dark:text-warm-400 mb-6
          ${className}
        `}
      >
        <span className="inline-flex items-center gap-1.5">
          <CalendarDays className="w-4 h-4" strokeWidth={1.8} />
          {formatPublishDate(date) || date}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Clock className="w-4 h-4" strokeWidth={1.8} />
          {readTime}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <User className="w-4 h-4" strokeWidth={1.8} />
          {author}
        </span>
        {category && (
          <span className="hidden sm:inline-flex items-center gap-1.5 text-warm-400 dark:text-warm-500 text-xs">
            · {category}
          </span>
        )}
        <FocusModeToggle />
      </div>

      {audio && (
        <AudioBriefingPlayer audio={audio} className="mb-6" />
      )}
    </>
  );
}