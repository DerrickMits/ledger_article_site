import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft, Clock, CalendarDays, User } from "lucide-react";
import {
  getAllSlugs,
  getArticleBySlug,
  formatPublishDate,
} from "@/lib/articles";
import { SITE } from "@/lib/site";
import MarkdownContent from "@/components/MarkdownContent";
import ReadingProgress from "@/components/ReadingProgress";

/** Pre-render every article so future drops ship as static files. */
export function generateStaticParams() {
  return getAllSlugs().map((slug) => ({ slug }));
}

export function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  return params.then(({ slug }) => {
    const article = getArticleBySlug(slug);
    if (!article) return { title: "Article not found" };
    return {
      title: article.title,
      description: article.excerpt,
      openGraph: {
        title: article.title,
        description: article.excerpt,
        type: "article",
        publishedTime: article.date,
        authors: [article.author],
      },
    };
  });
}

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const article = getArticleBySlug(slug);
  if (!article) notFound();

  return (
    <>
      <ReadingProgress />

      <article className="pt-12 sm:pt-20">
        {/* ---------- Article header ---------- */}
        <header className="mx-auto max-w-3xl px-6 sm:px-8 animate-fade-up">
          <Link
            href="/"
            className="group inline-flex items-center gap-2 text-sm font-medium text-warm-500 dark:text-warm-400 hover:text-warm-900 dark:hover:text-warm-100 transition-colors block w-fit"
          >
            <ArrowLeft
              className="w-4 h-4 transition-transform duration-200 group-hover:-translate-x-1"
              strokeWidth={2}
            />
            All articles
          </Link>

          {article.category && (
            <div className="mt-8 mb-8">
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-[0.18em] bg-accent/10 text-accent dark:bg-warm-300/15 dark:text-warm-200 border border-accent/20 dark:border-warm-300/25">
                {article.category}
              </span>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-warm-500 dark:text-warm-400 mb-6">
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="w-4 h-4" strokeWidth={1.8} />
              {formatPublishDate(article.date) || article.date}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock className="w-4 h-4" strokeWidth={1.8} />
              {article.readTime}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <User className="w-4 h-4" strokeWidth={1.8} />
              {article.author}
            </span>
          </div>

          <h1 className="font-display text-4xl sm:text-5xl md:text-[3.25rem] leading-[1.08] font-bold tracking-tight text-warm-900 dark:text-warm-100">
            {article.title}
          </h1>

          <p className="mt-6 text-xl leading-relaxed text-warm-600 dark:text-warm-400">
            {article.excerpt}
          </p>

          <div className="mt-10 flex items-center gap-3">
            <span className="h-px w-10 bg-accent dark:bg-warm-300" />
            <span className="text-xs uppercase tracking-[0.22em] text-warm-500 dark:text-warm-500">
              The Article
            </span>
          </div>
        </header>

        {/* ---------- Article body ---------- */}
        <div className="mx-auto max-w-3xl px-6 sm:px-8 mt-10">
          <MarkdownContent content={article.content} />
        </div>

        {/* ---------- Closing call to action ---------- */}
        <div className="mx-auto max-w-3xl px-6 sm:px-8 mt-20">
          <div className="rounded-3xl bg-white dark:bg-warm-900 border border-warm-200 dark:border-warm-800 p-8 sm:p-10 text-center">
            <p className="font-display text-2xl sm:text-3xl font-bold text-warm-900 dark:text-warm-100">
              Keep the conversation going.
            </p>
            <p className="mt-3 text-warm-600 dark:text-warm-400 leading-relaxed">
              For more on operations, automation, and CRM strategy, return to
              the main portfolio or browse the rest of The Ledger.
            </p>
            <div className="mt-7 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link
                href="/"
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-warm-900 dark:bg-warm-100 text-cream dark:text-deep text-sm font-semibold hover:bg-warm-800 dark:hover:bg-white transition-colors"
              >
                <ArrowLeft className="w-4 h-4" strokeWidth={2} />
                All articles
              </Link>
              <Link
                href={SITE.portfolioUrl}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl border border-warm-300 dark:border-warm-700 text-warm-700 dark:text-warm-300 text-sm font-semibold hover:bg-warm-100 dark:hover:bg-warm-800 transition-colors"
              >
                Back to Portfolio
              </Link>
            </div>
          </div>
        </div>
      </article>
    </>
  );
}
