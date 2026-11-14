/**
 * Client-safe article types and utilities.
 * No Node.js dependencies - safe for client components.
 */

export interface ArticleSummary {
  slug: string;
  title: string;
  date: string;
  readTime: string;
  excerpt: string;
  author: string;
  category: string;
}

/* ------------------------------------------------------------------ */
/*  Client-safe Helpers                                               */
/* ------------------------------------------------------------------ */

export function formatPublishDate(iso: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}