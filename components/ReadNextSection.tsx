"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowUpRight, Sparkles } from "lucide-react";
import { ArticleSummary, formatPublishDate } from "@/lib/client/articles";

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

interface Recommendation {
  articleId: string;
  badge: string;
  reason: string;
}

interface ReadNextSectionProps {
  currentSlug: string;
  currentTitle: string;
  allArticles: ArticleSummary[];
}

/* ------------------------------------------------------------------ */
/*  Fallback Data                                                     */
/* ------------------------------------------------------------------ */

function getFallbackRecommendations(currentSlug: string, allArticles: ArticleSummary[]): Recommendation[] {
  const otherArticles = allArticles.filter(a => a.slug !== currentSlug);
  const recent = otherArticles
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 3);
  
  return recent.map((article, index) => ({
    articleId: article.slug,
    badge: index === 0 ? "Latest" : index === 1 ? "Recent" : "More Reading",
    reason: `Continue exploring ${article.category.toLowerCase()} insights with this recent article.`,
  }));
}

/* ------------------------------------------------------------------ */
/*  Badge Styling                                                     */
/* ------------------------------------------------------------------ */

function getBadgeStyle(badge: string): string {
  const base = "inline-flex items-center px-2.5 py-1 rounded-full text-[0.7rem] font-semibold uppercase tracking-wider border";
  
  const styles: Record<string, string> = {
    "Deep Dive": "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800",
    "Next Step": "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800",
    "Practical Application": "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800",
    "Counter-Perspective": "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800",
    "Prerequisite": "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-900/30 dark:text-slate-300 dark:border-slate-800",
    "Companion": "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-800",
    "Latest": "bg-accent/10 text-accent border-accent/20 dark:bg-warm-300/15 dark:text-warm-200 dark:border-warm-300/25",
    "Recent": "bg-accent/10 text-accent border-accent/20 dark:bg-warm-300/15 dark:text-warm-200 dark:border-warm-300/25",
    "More Reading": "bg-accent/10 text-accent border-accent/20 dark:bg-warm-300/15 dark:text-warm-200 dark:border-warm-300/25",
  };
  
  return `${base} ${styles[badge] || styles["More Reading"]}`;
}

/* ------------------------------------------------------------------ */
/*  Recommendation Card                                               */
/* ------------------------------------------------------------------ */

function RecommendationCard({ 
  recommendation, 
  article 
}: { 
  recommendation: Recommendation; 
  article: ArticleSummary;
}) {
  return (
    <article className="group relative flex flex-col h-full rounded-3xl bg-white dark:bg-warm-900 border border-warm-200 dark:border-warm-800 p-7 sm:p-8 transition-all duration-300 hover:-translate-y-1 hover:border-warm-300 dark:hover:border-warm-700 hover:shadow-[0_18px_40px_-20px_rgba(28,25,23,0.18)]">
      {/* Badge */}
      <div className="mb-4">
        <span className={getBadgeStyle(recommendation.badge)}>
          <Sparkles className="w-3 h-3 mr-1.5" strokeWidth={2} />
          {recommendation.badge}
        </span>
      </div>
      
      {/* Category & Meta */}
      {article.category && (
        <div className="mb-3">
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[0.7rem] font-semibold uppercase tracking-wider bg-accent/10 text-accent dark:bg-warm-300/15 dark:text-warm-200 border border-accent/20 dark:border-warm-300/25">
            {article.category}
          </span>
        </div>
      )}
      
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-medium text-warm-500 dark:text-warm-400 mb-4">
        <span className="inline-flex items-center gap-1.5">
          <ArrowUpRight className="w-3.5 h-3.5" strokeWidth={1.8} />
          {formatPublishDate(article.date) || article.date}
        </span>
      </div>
      
      {/* Title */}
      <Link href={`/articles/${article.slug}`} className="block">
        <h3 className="font-display text-xl font-bold leading-snug text-warm-900 dark:text-warm-100 tracking-tight group-hover:text-warm-700 dark:group-hover:text-warm-300 transition-colors mb-3">
          {article.title}
        </h3>
      </Link>
      
      {/* AI Reason */}
      <p className="text-sm leading-relaxed text-warm-600 dark:text-warm-400 mb-4 flex-1">
        {recommendation.reason}
      </p>
      
      {/* Read link */}
      <Link
        href={`/articles/${article.slug}`}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-accent dark:text-warm-300 hover:text-accent/80 dark:hover:text-warm-200 transition-colors mt-auto"
      >
        Read article
        <ArrowUpRight
          className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
          strokeWidth={2}
        />
      </Link>
    </article>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                    */
/* ------------------------------------------------------------------ */

export default function ReadNextSection({ currentSlug, currentTitle, allArticles }: ReadNextSectionProps) {
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  
  useEffect(() => {
    let mounted = true;
    
    async function fetchRecommendations() {
      try {
        // Try to fetch from API first
        const response = await fetch(`/api/recommendations/${currentSlug}`, {
          headers: { "Accept": "application/json" },
        });
        
        if (response.ok) {
          const data = await response.json();
          if (mounted && data.recommendations?.length) {
            setRecommendations(data.recommendations);
            setLoading(false);
            return;
          }
        }
      } catch (err) {
        console.warn("[ReadNextSection] API fetch failed, using fallback:", err);
      }
      
      // Fallback to client-side fallback
      if (mounted) {
        setRecommendations(getFallbackRecommendations(currentSlug, allArticles));
        setError(true); // Indicate we're using fallback
        setLoading(false);
      }
    }
    
    fetchRecommendations();
    
    return () => { mounted = false; };
  }, [currentSlug, allArticles]);
  
  if (loading) {
    return (
      <section className="mx-auto max-w-6xl px-6 sm:px-8 mt-20 animate-fade-up" aria-label="Loading recommendations">
        <div className="text-center py-12">
          <div className="inline-flex items-center gap-2 text-warm-500 dark:text-warm-400">
            <Sparkles className="w-5 h-5 animate-spin" strokeWidth={2} />
            <span>Finding your next read...</span>
          </div>
        </div>
      </section>
    );
  }
  
  // Get full article data for each recommendation
  const recommendationData = recommendations
    .map(rec => ({
      recommendation: rec,
      article: allArticles.find(a => a.slug === rec.articleId),
    }))
    .filter((item): item is { recommendation: Recommendation; article: ArticleSummary } => !!item.article);
  
  if (recommendationData.length === 0) {
    return null;
  }
  
  return (
    <section className="mx-auto max-w-6xl px-6 sm:px-8 mt-20 animate-fade-up" aria-labelledby="read-next-heading">
      {/* Section Header */}
      <header className="mb-10 text-center">
        <div className="inline-flex items-center gap-2 text-warm-500 dark:text-warm-400 mb-3">
          <Sparkles className="w-5 h-5" strokeWidth={2} />
          <span className="text-sm font-medium uppercase tracking-[0.18em]">Curated for you</span>
        </div>
        <h2 id="read-next-heading" className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-warm-900 dark:text-warm-100">
          What to read next
        </h2>
        <p className="mt-3 text-base text-warm-600 dark:text-warm-400 max-w-2xl mx-auto">
          Hand-picked by our AI editor based on what you just finished reading. Each recommendation builds on the ideas in <strong>"{currentTitle}"</strong>.
        </p>
      </header>
      
      {/* Recommendations Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {recommendationData.map(({ recommendation, article }) => (
          <RecommendationCard key={article.slug} recommendation={recommendation} article={article} />
        ))}
      </div>
      
      {/* Fallback notice */}
      {error && (
        <p className="mt-6 text-center text-sm text-warm-500 dark:text-warm-500">
          Showing recent articles while AI recommendations load.
        </p>
      )}
    </section>
  );
}