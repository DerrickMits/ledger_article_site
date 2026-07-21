"use client";

import Link from "next/link";
import { SITE } from "@/lib/site";

/**
 * Site footer with a brief sign-off and professional channel links.
 */
export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="mt-24 border-t border-warm-200 dark:border-warm-800 bg-cream dark:bg-deep">
      <div className="max-w-5xl mx-auto px-6 sm:px-8 py-14 text-center">
        <Link
          href={SITE.portfolioUrl}
          className="font-display text-2xl font-bold text-warm-900 dark:text-warm-100 hover:text-warm-700 dark:hover:text-warm-300 transition-colors"
        >
          {SITE.name}
        </Link>
        <p className="mt-2 text-sm text-warm-500 dark:text-warm-400">
          {SITE.location}
        </p>

        <div className="mt-6 flex items-center justify-center gap-6">
          {SITE.channels.map((channel) => (
            <a
              key={channel.label}
              href={channel.href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-warm-600 dark:text-warm-300 hover:text-warm-900 dark:hover:text-warm-100 transition-colors"
            >
              {channel.label}
            </a>
          ))}
        </div>

        <div className="mt-8 flex items-center justify-center gap-3 text-xs text-warm-500 dark:text-warm-600">
          <span className="h-px w-10 bg-warm-200 dark:bg-warm-700" />
          <span>&copy; {currentYear} {SITE.name}. All rights reserved.</span>
          <span className="h-px w-10 bg-warm-200 dark:bg-warm-700" />
        </div>
      </div>
    </footer>
  );
}
