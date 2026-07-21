"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, Feather } from "lucide-react";
import ThemeToggle from "./ThemeToggle";
import { SITE } from "@/lib/site";

/**
 * Sticky glassmorphism navigation.
 *
 * Surfaces a cross-link back to the executive portfolio, the
 * publication wordmark, and the light and dark theme toggle.
 */
export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 inset-x-0 z-40 transition-all duration-300 ${
        scrolled
          ? "glass border-b border-warm-200/60 dark:border-warm-800/60 shadow-sm"
          : "bg-transparent"
      }`}
    >
      <nav className="max-w-5xl mx-auto px-5 sm:px-6 md:px-8 h-16 flex items-center justify-between gap-4">
        {/* Back to portfolio */}
        <Link
          href={SITE.portfolioUrl}
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

        {/* Wordmark */}
        <Link
          href="/"
          className="absolute left-1/2 -translate-x-1/2 font-display text-lg sm:text-xl font-bold text-warm-900 dark:text-warm-100 hover:text-warm-700 dark:hover:text-warm-300 transition-colors inline-flex items-center gap-1.5"
        >
          <Feather
            className="w-4 h-4 text-accent dark:text-warm-300"
            strokeWidth={2}
          />
          <span>The Ledger</span>
        </Link>

        {/* Theme toggle */}
        <ThemeToggle />
      </nav>
    </header>
  );
}
