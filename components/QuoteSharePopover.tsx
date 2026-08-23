"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Copy, Check } from "lucide-react";

interface QuoteSharePopoverProps {
  selectedText: string;
  rect: DOMRect;
  currentUrl: string;
  onDismiss: () => void;
}

const GAP = 10;
const POPOVER_HEIGHT = 44;

export default function QuoteSharePopover({
  selectedText,
  rect,
  currentUrl,
  onDismiss,
}: QuoteSharePopoverProps) {
  const [copied, setCopied] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, flipped: false });
  const popoverRef = useRef<HTMLDivElement>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const defaultTop = rect.top - GAP - POPOVER_HEIGHT;
    const flippedTop = rect.bottom + GAP + 8;
    const flipped = defaultTop < 8;

    let top = flipped ? flippedTop : defaultTop;
    let left = rect.left + rect.width / 2;

    const halfWidth = 130;
    const vw = window.innerWidth;
    left = Math.max(halfWidth + 8, Math.min(vw - halfWidth - 8, left));

    setPosition({ top, left, flipped });
  }, [rect]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        window.getSelection()?.removeAllRanges();
        onDismiss();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onDismiss]);

  useEffect(() => {
    let handler: ReturnType<typeof setTimeout>;
    const handleMouseDown = (e: MouseEvent) => {
      if (popoverRef.current?.contains(e.target as Node)) return;
      handler = setTimeout(() => {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed) onDismiss();
      }, 150);
    };
    document.addEventListener("mousedown", handleMouseDown, true);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown, true);
      clearTimeout(handler);
    };
  }, [onDismiss]);

  const preventBlur = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
  }, []);

  const handleCopy = useCallback(async () => {
    const quote = `"${selectedText}" — ${currentUrl}`;
    try {
      await navigator.clipboard.writeText(quote);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = quote;
      ta.style.cssText = "position:fixed;opacity:0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }

    setCopied(true);
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => {
      setCopied(false);
      onDismiss();
    }, 1800);
  }, [selectedText, currentUrl, onDismiss]);

  const handleShareX = useCallback(() => {
    const text = encodeURIComponent(`"${selectedText}"`);
    const url = encodeURIComponent(currentUrl);
    window.open(
      `https://twitter.com/intent/tweet?text=${text}&url=${url}`,
      "_blank",
      "width=600,height=420,left=50,top=50"
    );
    onDismiss();
  }, [selectedText, currentUrl, onDismiss]);

  const handleShareLinkedIn = useCallback(() => {
    const url = encodeURIComponent(currentUrl);
    window.open(
      `https://www.linkedin.com/sharing/share-offsite/?url=${url}`,
      "_blank",
      "width=600,height=600,left=50,top=50"
    );
    onDismiss();
  }, [currentUrl, onDismiss]);

  useEffect(() => () => {
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
  }, []);

  const popover = (
    <div
      ref={popoverRef}
      onMouseDown={preventBlur}
      onTouchStart={preventBlur}
      style={{
        position: "fixed",
        top: position.top,
        left: position.left,
        transform: "translateX(-50%)",
        animation: "popover-in 150ms ease-out both",
        zIndex: 9999,
      }}
      role="toolbar"
      aria-label="Share selected quote"
    >
      <div className="flex items-center gap-1 px-1.5 py-1.5 rounded-full
        bg-warm-800/95 dark:bg-warm-200/95
        backdrop-blur-md
        border border-warm-600/40 dark:border-warm-500/40
        shadow-[0_8px_30px_-12px_rgba(0,0,0,0.35)] dark:shadow-[0_8px_30px_-12px_rgba(0,0,0,0.5)]
        ring-1 ring-warm-600/10 dark:ring-warm-300/10">

        {/* Copy */}
        <button
          onClick={handleCopy}
          title="Copy quote"
          aria-label="Copy quote to clipboard"
          className="flex items-center justify-center w-9 h-9 rounded-full
            text-warm-100 dark:text-warm-800
            hover:bg-warm-700/60 dark:hover:bg-warm-300/60
            active:bg-warm-700 dark:active:bg-warm-300
            transition-colors duration-150
            focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-warm-800 dark:focus-visible:ring-offset-warm-200">
          {copied ? (
            <Check className="w-4 h-4 text-green-400 dark:text-green-600" strokeWidth={2.5} />
          ) : (
            <Copy className="w-4 h-4" strokeWidth={1.8} />
          )}
        </button>

        <div className="w-px h-5 bg-warm-600/40 dark:bg-warm-500/40" />

        {/* X (Twitter) */}
        <button
          onClick={handleShareX}
          title="Share on X"
          aria-label="Share quote on X"
          className="flex items-center justify-center w-9 h-9 rounded-full
            text-warm-100 dark:text-warm-800
            hover:bg-warm-700/60 dark:hover:bg-warm-300/60
            active:bg-warm-700 dark:active:bg-warm-300
            transition-colors duration-150
            focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-warm-800 dark:focus-visible:ring-offset-warm-200">
          <XIcon className="w-4 h-4" />
        </button>

        {/* LinkedIn */}
        <button
          onClick={handleShareLinkedIn}
          title="Share on LinkedIn"
          aria-label="Share quote on LinkedIn"
          className="flex items-center justify-center w-9 h-9 rounded-full
            text-warm-100 dark:text-warm-800
            hover:bg-warm-700/60 dark:hover:bg-warm-300/60
            active:bg-warm-700 dark:active:bg-warm-300
            transition-colors duration-150
            focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-warm-800 dark:focus-visible:ring-offset-warm-200">
          <LinkedinIcon className="w-4 h-4" />
        </button>
      </div>

      {/* Caret arrow */}
      <div
        className="absolute left-1/2"
        style={{
          [position.flipped ? "top" : "bottom"]: "-7px",
          transform: "translateX(-50%) rotate(45deg)",
        }}
      >
        <div
          className="w-3 h-3
            bg-warm-800/95 dark:bg-warm-200/95
            border-r border-b border-warm-600/40 dark:border-warm-500/40
            backdrop-blur-md"
        />
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(popover, document.body);
}

/* ------------------------------------------------------------------ */
/* Inline brand icons — lucide-react v1.25 does not export these      */
/* ------------------------------------------------------------------ */

function XIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function LinkedinIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  );
}