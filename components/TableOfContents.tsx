"use client";

import { useScrollSpy, useSmoothScroll } from "@/hooks/useScrollSpy";
import { HeadingItem } from "@/lib/articles";

interface TableOfContentsProps {
  headings: HeadingItem[];
  className?: string;
}

/**
 * Table of Contents component that displays a sticky, scroll-aware sidebar
 * with navigation to article headings.
 * 
 * Features:
 * - Sticky positioning on desktop
 * - Active heading highlighting via IntersectionObserver
 * - Smooth scroll behavior
 * - Responsive layout with different behaviors for H2 vs H3
 */
export default function TableOfContents({
  headings,
  className = "",
}: TableOfContentsProps) {
  const activeHeading = useScrollSpy(headings.map(h => h.slug), { offset: 80 });

  const scrollToHeading = useSmoothScroll(80);

  // Don't render if fewer than 2 headings
  if (headings.length < 2) {
    return null;
  }

  const handleScroll = (slug: string) => {
    scrollToHeading(slug);
  };

  return (
    <aside
      className={`hidden xl:block w-full max-w-xs article-toc-sidebar bg-cream dark:bg-deep rounded-xl border border-warm-200 dark:border-warm-800 p-6 shadow-sm ${className}`}
      aria-label="Table of contents"
    >
      <nav className="space-y-2">
        <div className="mb-2">
          <span className="text-xs font-medium text-warm-500 dark:text-warm-400 uppercase tracking-[0.18em]">
            Contents
          </span>
        </div>
        
        <div className="space-y-1">
          {headings.map((heading) => (
            <button
              key={heading.slug}
              onClick={() => handleScroll(heading.slug)}
              className={`w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 ${
                activeHeading === heading.slug
                  ? "bg-accent/10 border-l-4 border-accent text-accent dark:bg-warm-300/20 dark:border-warm-300 dark:text-warm-200"
                  : "hover:bg-warm-200/60 dark:hover:bg-warm-800/40 text-warm-700 dark:text-warm-300"
              }`}
            >
              <div
                className={`flex-1 font-medium truncate ${
                  heading.level === 2
                    ? "text-base"
                    : "text-sm pl-4" // Indent H3s
                }`}
              >
                {heading.text}
              </div>
              {activeHeading === heading.slug && (
                <div className="w-2 h-2 rounded-full bg-accent dark:bg-warm-300 flex-shrink-0" />
              )}
            </button>
          ))}
        </div>
      </nav>
    </aside>
  );
}

/**
 * Mobile TOC component - renders as a collapsible drawer beneath the article header
 */
export function MobileTOC({
  headings,
  className = "",
}: TableOfContentsProps) {
  const activeHeading = useScrollSpy(headings.map(h => h.slug), { offset: 80 });

  const scrollToHeading = useSmoothScroll(80);

  // Don't render if fewer than 2 headings
  if (headings.length < 2) {
    return null;
  }

  const handleScroll = (slug: string) => {
    scrollToHeading(slug);
  };

  return (
    <div className={`xl:hidden ${className}`}>
      <details className="border border-warm-200 dark:border-warm-800 rounded-xl bg-cream dark:bg-deep p-5 shadow-sm">
        <summary className="flex items-center justify-between cursor-pointer">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-warm-500 dark:text-warm-400 uppercase tracking-[0.18em]">
              Jump to section
            </span>
            <span className="text-sm text-warm-600 dark:text-warm-400">
              ({headings.length} sections)
            </span>
          </div>
          <svg
            className="w-4 h-4 text-warm-600 dark:text-warm-400 transition-transform duration-200"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </summary>
        
        <div className="mt-4 space-y-1.5">
          {headings.map((heading) => (
            <button
              key={heading.slug}
              onClick={() => handleScroll(heading.slug)}
              className={`w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 ${
                activeHeading === heading.slug
                  ? "bg-accent/10 border-l-4 border-accent text-accent dark:bg-warm-300/20 dark:border-warm-300 dark:text-warm-200"
                  : "hover:bg-warm-200/60 dark:hover:bg-warm-800/40 text-warm-700 dark:text-warm-300"
              }`}
            >
              <div
                className={`flex-1 font-medium truncate ${
                  heading.level === 2
                    ? "text-sm"
                    : "text-xs pl-4" // Indent H3s more for mobile
                }`}
              >
                {heading.text}
              </div>
            </button>
          ))}
        </div>
      </details>
    </div>
  );
}