"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, Feather, Search } from "lucide-react";
import ToggleTheme from "./ToggleTheme";
import CommandMenu from "./CommandMenu";
import { ArticleSummary } from "@/lib/articles";

interface NavbarProps {
  articles: ArticleSummary[];
}

export default function Navbar({ articles }: NavbarProps) {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        setIsSearchOpen(true);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <>
      <header
        className={`fixed top-0 inset-x-0 z-40 transition-all duration-300 ${
          scrolled
            ? "glass border-b border-warm-200/60 dark:border-warm-800/60 shadow-sm"
            : "bg-transparent"
        }`}
      >
        <nav className="max-w-5xl mx-auto px-4 sm:px-6 md:px-8 h-16 flex items-center justify-between gap-3">
          {/* Left section - Back link */}
          <div className="flex items-center gap-2">
            <Link
              href="https://portfoliosite-pearl-one.vercel.app"
              className="group inline-flex items-center gap-2 text-sm font-medium text-warm-600 dark:text-warm-400 hover:text-warm-900 dark:hover:text-warm-100 transition-colors"
            >
              <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-warm-100 dark:bg-warm-800 group-hover:bg-warm-200 dark:group-hover:bg-warm-700 transition-colors">
                <ArrowLeft
                  className="w-4 h-4 transition-transform duration-200 group-hover:-translate-x-0.5"
                  strokeWidth={2}
                />
              </span>
              <span className="hidden sm:inline">Back to Portfolio</span>
            </Link>
          </div>

          {/* Center section - Wordmark */}
          <div className="flex-1 flex justify-center items-center">
            <Link
              href="/"
              className="flex-shrink-0 flex items-center gap-1.5 font-display text-lg sm:text-xl font-bold text-warm-900 dark:text-warm-100 hover:text-warm-700 dark:hover:text-warm-300 transition-colors"
            >
              <Feather
                className="w-4 h-4 text-accent dark:text-warm-300"
                strokeWidth={2}
              />
              <span className="hidden sm:inline">The Ledger</span>
              <span className="sm:hidden text-base font-bold">L</span>
            </Link>
          </div>

          {/* Right section - Actions */}
          <div className="flex items-center gap-2">
            {/* Mobile search icon */}
            <button
              onClick={() => setIsSearchOpen(true)}
              className="sm:hidden inline-flex items-center justify-center w-9 h-9 rounded-lg border border-warm-300 dark:border-warm-700 bg-warm-50 dark:bg-warm-900 text-warm-600 dark:text-warm-400 hover:text-warm-900 dark:hover:text-warm-200 transition-colors"
              aria-label="Search articles"
            >
              <Search className="w-4 h-4" />
            </button>

            {/* Desktop search trigger */}
            <button
              onClick={() => setIsSearchOpen(true)}
              className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg border border-warm-300 dark:border-warm-700 bg-warm-50 dark:bg-warm-900 text-sm text-warm-600 dark:text-warm-400 hover:border-warm-400 dark:hover:border-warm-600 hover:text-warm-900 dark:hover:text-warm-200 transition-all duration-150"
            >
              <Search className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">Search articles...</span>
              <kbd className="ml-2 inline-flex items-center gap-0.5 px-1.5 py-0.5 text-xs font-medium rounded border border-warm-300 dark:border-warm-700 text-warm-500 dark:text-warm-400 bg-warm-100 dark:bg-warm-800">
                ⌘K
              </kbd>
            </button>

            <ToggleTheme />
          </div>
        </nav>
      </header>

      <CommandMenu
        articles={articles}
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
      />
    </>
  );
}