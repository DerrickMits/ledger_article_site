"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Search, ArrowRight, FileText } from "lucide-react";
import { ArticleSummary } from "@/lib/articles";
import { useArticleSearch } from "@/hooks/useArticleSearch";

interface CommandMenuProps {
  articles: ArticleSummary[];
  isOpen: boolean;
  onClose: () => void;
}

export default function CommandMenu({
  articles,
  isOpen,
  onClose,
}: CommandMenuProps) {
  const router = useRouter();
  const [inputValue, setInputValue] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const { search, results } = useArticleSearch(articles);

  useEffect(() => {
    if (isOpen) {
      setInputValue("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [isOpen]);

  const displayResults = inputValue.trim()
    ? results
    : articles.slice(0, 8);

  useEffect(() => {
    setSelectedIndex(0);
  }, [inputValue, articles]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedIndex((prev) =>
          Math.min(prev + 1, displayResults.length - 1)
        );
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      }

      if (event.key === "Enter" && displayResults[selectedIndex]) {
        event.preventDefault();
        const article = displayResults[selectedIndex];
        router.push(`/articles/${article.slug}`);
        onClose();
      }
    },
    [displayResults, selectedIndex, onClose, router]
  );

  useEffect(() => {
    if (!isOpen) return;
    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isOpen, handleKeyDown]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInputValue(value);
    search(value);
  };

  const formatReadTime = (readTime: string): string => {
    if (readTime.includes("min")) return readTime;
    return `${readTime} min read`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] px-4">
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative z-10 w-full max-w-2xl bg-cream dark:bg-deep border border-warm-200 dark:border-warm-800 rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-warm-200 dark:border-warm-800">
          <Search className="w-5 h-5 text-warm-500 dark:text-warm-400" />
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={handleInputChange}
            placeholder="Search articles..."
            className="flex-1 bg-transparent text-warm-900 dark:text-warm-100 placeholder:text-warm-500 dark:placeholder:text-warm-400 outline-none text-base"
            autoComplete="off"
          />
          <kbd className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded border border-warm-300 dark:border-warm-700 text-warm-600 dark:text-warm-400 bg-warm-100 dark:bg-warm-800">
            ESC
          </kbd>
        </div>

        <div className="max-h-[50vh] overflow-y-auto p-2">
          {displayResults.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
              <FileText className="w-10 h-10 text-warm-400 dark:text-warm-600" />
              <div>
                <p className="text-sm font-medium text-warm-700 dark:text-warm-300">
                  No matching articles found
                </p>
                <p className="text-xs text-warm-500 dark:text-warm-400 mt-1">
                  Try adjusting your search query
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-1">
              {displayResults.map((article, index) => {
                const isSelected = index === selectedIndex;

                return (
                  <Link
                    key={article.slug}
                    href={`/articles/${article.slug}`}
                    className={`
                      flex items-center gap-3 px-4 py-3 rounded-lg cursor-pointer
                      transition-colors duration-100 group
                      ${
                        isSelected
                          ? "bg-warm-200/60 dark:bg-warm-800/60"
                          : "hover:bg-warm-100 dark:hover:bg-warm-800/40"
                      }
                    `}
                    onClick={onClose}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={`
                            text-sm font-semibold truncate
                            ${
                              isSelected
                                ? "text-accent dark:text-warm-200"
                                : "text-warm-900 dark:text-warm-100"
                            }
                          `}
                        >
                          {article.title}
                        </span>
                        {article.category && (
                          <span
                            className="
                              inline-flex items-center px-2 py-0.5 rounded-full
                              text-[10px] font-semibold uppercase tracking-[0.12em]
                              bg-accent/10 text-accent dark:bg-warm-300/15 dark:text-warm-200
                              border border-accent/20 dark:border-warm-300/25
                              flex-shrink-0
                            "
                          >
                            {article.category}
                          </span>
                        )}
                      </div>
                      {article.excerpt && (
                        <p className="text-xs text-warm-600 dark:text-warm-400 mt-1 line-clamp-1">
                          {article.excerpt}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-[11px] text-warm-500 dark:text-warm-400">
                        {formatReadTime(article.readTime)}
                      </span>
                      {isSelected && (
                        <ArrowRight className="w-4 h-4 text-accent dark:text-warm-300" />
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}