import Link from "next/link";
import { ArrowRight, BookOpen } from "lucide-react";
import ArticleCard from "@/components/ArticleCard";
import { getAllArticles } from "@/lib/articles";
import { SITE } from "@/lib/site";

export default function Home() {
  const articles = getAllArticles();

  return (
    <>
      {/* ---------- Hero ---------- */}
      <section className="relative overflow-hidden">
        <div className="max-w-5xl mx-auto px-6 sm:px-8 pt-20 sm:pt-28 pb-16 sm:pb-20 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-warm-100 dark:bg-warm-900 border border-warm-200 dark:border-warm-800 text-xs font-medium text-warm-600 dark:text-warm-400 mb-7 animate-fade-up">
            <BookOpen className="w-3.5 h-3.5 text-accent dark:text-warm-300" strokeWidth={2} />
            Thought Leadership & Long-form Reflections
          </div>

          <h1
            className="font-display text-5xl sm:text-6xl md:text-7xl font-bold tracking-tight text-warm-900 dark:text-warm-100 leading-[1.05] animate-fade-up"
            style={{ animationDelay: "60ms" }}
          >
            The Ledger
          </h1>

          <p
            className="mx-auto mt-6 max-w-2xl text-lg sm:text-xl leading-relaxed text-warm-600 dark:text-warm-400 animate-fade-up"
            style={{ animationDelay: "120ms" }}
          >
            A quiet space for long-form thinking on operations, customer
            relationship strategy, and the steady craft of building systems
            that people genuinely rely on.
          </p>

          <div
            className="mt-9 flex items-center justify-center gap-2 text-sm text-warm-500 dark:text-warm-500 animate-fade-up"
            style={{ animationDelay: "180ms" }}
          >
            <span className="h-px w-12 bg-warm-300 dark:bg-warm-700" />
            <span className="uppercase tracking-[0.2em] text-xs">
              Curated by {SITE.name}
            </span>
            <span className="h-px w-12 bg-warm-300 dark:bg-warm-700" />
          </div>
        </div>
      </section>

      {/* ---------- Article Index ---------- */}
      <section className="max-w-5xl mx-auto px-6 sm:px-8 pb-20">
        <div className="flex items-end justify-between gap-4 mb-10">
          <div>
            <h2 className="font-display text-3xl sm:text-4xl font-bold text-warm-900 dark:text-warm-100 tracking-tight">
              Latest Articles
            </h2>
            <p className="mt-2 text-sm text-warm-500 dark:text-warm-400">
              {articles.length === 0
                ? "The first chapter is being written."
                : `${articles.length} ${articles.length === 1 ? "article" : "articles"} ready to read.`}
            </p>
          </div>
        </div>

        {articles.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-warm-300 dark:border-warm-700 p-12 text-center text-warm-500 dark:text-warm-400">
            No articles have been published yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-7">
            {articles.map((article) => (
              <ArticleCard key={article.slug} article={article} />
            ))}
          </div>
        )}

        {/* Closing invitation */}
        <div className="mt-16 text-center">
          <Link
            href={SITE.portfolioUrl}
            className="group inline-flex items-center gap-2 text-sm font-medium text-warm-700 dark:text-warm-300 hover:text-warm-900 dark:hover:text-warm-100 transition-colors"
          >
            <span className="h-px w-6 bg-warm-300 dark:bg-warm-700 transition-all duration-300 group-hover:w-10" />
            Continue on the main portfolio
            <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" strokeWidth={2} />
          </Link>
        </div>
      </section>
    </>
  );
}
