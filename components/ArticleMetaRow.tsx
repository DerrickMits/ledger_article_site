"use client";

import { CalendarDays, Clock, User } from "lucide-react";
import BrowserAudioBriefing from "./WebSpeechBriefingPlayer";
import FocusModeToggle from "./FocusModeToggle";

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

interface ArticleMetaRowProps {
  /** ISO date string from frontmatter. */
  date: string;
  /** Read-time label string from frontmatter, e.g. "10 min read". */
  readTime: string;
  /** Author display name. */
  author: string;
  /** Category slug/badge label. */
  category?: string;
  /** Executive summary object — used to derive the briefing text. */
  executiveSummary?: {
    bottleneck: string;
    fix: string;
    outcome: string;
    readTime?: number;
  } | null;
  /** Raw markdown body — used as fallback text if no summary. */
  content?: string;
  /** Additional CSS classes for layout control. */
  className?: string;
}

/* ------------------------------------------------------------------ */
/*  Derive briefing text from article data                            */
/* ------------------------------------------------------------------ */

/**
 * Build the briefing prose from the structured executive summary.
 * Falls back to the first chunk of the article body if no summary exists.
 */
function buildBriefingText(article: ArticleMetaRowProps): string {
  if (article.executiveSummary) {
    const { bottleneck, fix, outcome } = article.executiveSummary;
    return [
      `Here is your executive briefing.`,
      `The core bottleneck: ${bottleneck}`,
      `The recommended fix: ${fix}`,
      `The measured outcome: ${outcome}`,
    ].join(" ");
  }

  if (article.content) {
    // Strip markdown and take the first 300 words
    const plain = article.content
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
    const words = plain.split(/\s+/).filter(Boolean).slice(0, 300);
    return words.join(" ");
  }

  return "";
}

/* ------------------------------------------------------------------ */
/*  Format the publish date                                           */
/* ------------------------------------------------------------------ */

function formatPublishDate(iso: string): string {
  try {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

export default function ArticleMetaRow({
  date,
  readTime,
  author,
  category,
  executiveSummary,
  content,
  className = "",
}: ArticleMetaRowProps) {
  const briefingText = buildBriefingText({ date, readTime, author, category, executiveSummary, content });

  // Estimate listen time from the briefing text length.
  // Average speech rate ≈ 130 words/min at default rate of 1x.
  const wordEstimate = briefingText.split(/\s+/).filter(Boolean).length;
  const estimatedMinutes = Math.max(1, Math.ceil(wordEstimate / 130));

  return (
    <>
      {/* Meta row — matches the existing article metadata striping */}
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
        {/* Focus mode toggle preserved from original meta row */}
        <FocusModeToggle />
      </div>

      {/* Audio Briefing Player — sits directly below the meta row */}
      {briefingText && (
        <BrowserAudioBriefing
          briefingText={briefingText}
          estimatedReadTimeMin={estimatedMinutes}
          className="mb-6"
        />
      )}
    </>
  );
}