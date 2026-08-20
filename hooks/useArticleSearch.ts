"use client";

import { useMemo, useState, useCallback } from "react";
import Fuse from "fuse.js";
import { ArticleSummary } from "@/lib/articles";

export interface SearchResult {
  item: ArticleSummary;
  refIndex: number;
}

interface UseArticleSearchOptions {
  threshold?: number;
  includeScore?: boolean;
  includeMatches?: boolean;
  keys?: (keyof ArticleSummary)[];
}

export function useArticleSearch(
  articles: ArticleSummary[],
  options: UseArticleSearchOptions = {}
) {
  const {
    threshold = 0.3,
    includeScore = true,
    includeMatches = true,
    keys = ["title", "excerpt", "category"],
  } = options;

  const fuse = useMemo(() => {
    return new Fuse(articles, {
      keys,
      threshold,
      includeScore,
      includeMatches,
    });
  }, [articles, threshold, includeScore, includeMatches, JSON.stringify(keys)]);

  const [query, setQuery] = useState("");
  const results = useMemo(() => {
    if (!query.trim()) {
      return articles.slice(0, 8);
    }
    const fuseResults = fuse.search(query).slice(0, 8);
    return fuseResults.map((r) => r.item);
  }, [query, articles, fuse]);

  const search = useCallback((q: string) => {
    setQuery(q);
  }, []);

  return { query, setQuery, search, results };
}