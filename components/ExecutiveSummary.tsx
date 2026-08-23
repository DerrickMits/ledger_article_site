"use client";

import React from "react";
import { ChevronDown, Layout } from "lucide-react";

export interface ExecutiveSummaryData {
  bottleneck: string;
  fix: string;
  outcome: string;
  readTime?: number;
}

interface ExecutiveSummaryProps {
  data: ExecutiveSummaryData | null;
  className?: string;
  defaultOpen?: boolean;
}

export default function ExecutiveSummary({
  data,
  className = "",
  defaultOpen = true,
}: ExecutiveSummaryProps) {
  const [isOpen, setIsOpen] = React.useState(defaultOpen);

  if (!data) return null;

  const summaryReadTime = data.readTime ?? 1;

  return (
    <div className={`
      border border-warm-200 dark:border-warm-800 
      rounded-xl bg-white dark:bg-warm-900 
      shadow-sm overflow-hidden ${className}
    `}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`
          w-full flex items-center justify-between 
          px-5 py-4 bg-cream dark:bg-deep
          hover:bg-warm-100 dark:hover:bg-warm-800
          transition-colors duration-200
          focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2
        `}
        aria-expanded={isOpen}
        aria-controls="executive-summary-content"
      >
        <div className="flex items-center gap-3">
          <div className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-accent/10 text-accent dark:bg-warm-300/20 dark:text-warm-200">
            <span className="sr-only">Summary</span>
            <Layout className="w-4 h-4" />
          </div>
          <div className="text-left">
            <div className="flex items-center gap-2 text-sm font-semibold text-warm-900 dark:text-warm-100">
              Executive Briefing
              <span className="text-xs text-warm-500 dark:text-warm-400">
                {'·'} {summaryReadTime * 30}s read
              </span>
            </div>
          </div>
        </div>
        <ChevronDown
          className={`w-4 h-4 text-warm-500 dark:text-warm-400 transition-transform duration-200 ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      <div className={`
        transition-all duration-300 ease-in-out ${
          isOpen ? "max-h-96" : "max-h-0"
        } overflow-hidden
      `}>
        <div id="executive-summary-content" className="px-5 pt-4 pb-5">
          <div className="grid gap-y-4">
            <div>
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0">
                  <div className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400">
                    <span className="text-xs font-bold">1</span>
                  </div>
                </div>
                <div className="flex-1">
                  <h3 className="text-xs font-medium uppercase tracking-[0.12em] text-warm-600 dark:text-warm-400 mb-1">
                    The Core Bottleneck
                  </h3>
                  <p className="text-sm text-warm-700 dark:text-warm-300 leading-relaxed">
                    {data.bottleneck}
                  </p>
                </div>
              </div>
            </div>

            <div>
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0">
                  <div className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                    <Layout className="w-3 h-3" />
                  </div>
                </div>
                <div className="flex-1">
                  <h3 className="text-xs font-medium uppercase tracking-[0.12em] text-warm-600 dark:text-warm-400 mb-1">
                    The Architecture Fix
                  </h3>
                  <p className="text-sm text-warm-700 dark:text-warm-300 leading-relaxed">
                    {data.fix}
                  </p>
                </div>
              </div>
            </div>

            <div>
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0">
                  <div className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="w-3 h-3"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  </div>
                </div>
                <div className="flex-1">
                  <h3 className="text-xs font-medium uppercase tracking-[0.12em] text-warm-600 dark:text-warm-400 mb-1">
                    The Measured Outcome
                  </h3>
                  <p className="text-sm text-warm-700 dark:text-warm-300 leading-relaxed">
                    {data.outcome}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}