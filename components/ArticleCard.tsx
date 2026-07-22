import Link from "next/link";
import { Clock, CalendarDays, ArrowUpRight } from "lucide-react";
import { ArticleSummary, formatPublishDate } from "@/lib/articles";

/**
 * Elegant preview card used in the article index grid.
 *
 * Visual rhythm intentionally mirrors the portfolio's warm
 * cream and stone palette for seamless brand continuity.
 */
export default function ArticleCard({ article }: { article: ArticleSummary }) {
  return (
    <article className="group relative animate-fade-up">
      <Link
        href={`/articles/${article.slug}`}
        className="block h-full rounded-3xl bg-white dark:bg-warm-900 border border-warm-200 dark:border-warm-800 p-7 sm:p-8 transition-all duration-300 hover:-translate-y-1 hover:border-warm-300 dark:hover:border-warm-700 hover:shadow-[0_18px_40px_-20px_rgba(28,25,23,0.18)] focus-visible:outline-none"
      >
        {/* Top accent strip + optional category badge */}
        <div className="flex items-center gap-3 mb-6">
          <span className="block h-px w-12 bg-accent dark:bg-warm-300 transition-all duration-300 group-hover:w-20" />
          {article.category && (
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[0.7rem] font-semibold uppercase tracking-wider bg-accent/10 text-accent dark:bg-warm-300/15 dark:text-warm-200 border border-accent/20 dark:border-warm-300/25">
              {article.category}
            </span>
          )}
        </div>

        {/* Meta row */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-medium text-warm-500 dark:text-warm-400 mb-4">
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays className="w-3.5 h-3.5" strokeWidth={1.8} />
            {formatPublishDate(article.date) || article.date}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" strokeWidth={1.8} />
            {article.readTime}
          </span>
        </div>

        {/* Title */}
        <h2 className="font-display text-2xl font-bold leading-snug text-warm-900 dark:text-warm-100 tracking-tight group-hover:text-warm-700 dark:group-hover:text-warm-300 transition-colors">
          {article.title}
        </h2>

        {/* Excerpt */}
        <p className="mt-4 text-base leading-relaxed text-warm-600 dark:text-warm-400">
          {article.excerpt}
        </p>

        {/* Read more */}
        <div className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-accent dark:text-warm-300">
          Read article
          <ArrowUpRight
            className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
            strokeWidth={2}
          />
        </div>
      </Link>
    </article>
  );
}
