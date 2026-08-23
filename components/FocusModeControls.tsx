"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  X,
  Keyboard,
} from "lucide-react";
import { useFocusMode } from "@/hooks/useFocusMode";

const FONT_SIZE_STEPS = [0.875, 1, 1.125] as const;
const COLUMN_WIDTHS = {
  standard: "max-w-prose",
  wide: "max-w-3xl",
} as const;

export default function FocusModeControls() {
  const { state, actions } = useFocusMode();
  const [showShortcut, setShowShortcut] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Only render when focus mode is active
  if (!state.isEnabled) return null;

  const fontSizeIndex = FONT_SIZE_STEPS.indexOf(state.fontSizeScale as (typeof FONT_SIZE_STEPS)[number]);
  const currentFontSize = state.fontSizeScale;
  const currentWidthClass = COLUMN_WIDTHS[state.columnWidth];

  const handleFontSizeUp = useCallback(() => {
    const next = FONT_SIZE_STEPS[Math.min(fontSizeIndex + 1, FONT_SIZE_STEPS.length - 1)];
    actions.setFontSize(next);
  }, [fontSizeIndex, actions]);

  const handleFontSizeDown = useCallback(() => {
    const prev = FONT_SIZE_STEPS[Math.max(fontSizeIndex - 1, 0)];
    actions.setFontSize(prev);
  }, [fontSizeIndex, actions]);

  const handleToggleWidth = useCallback(() => {
    const next: "standard" | "wide" =
      state.columnWidth === "standard" ? "wide" : "standard";
    actions.setColumnWidth(next);
  }, [state.columnWidth, actions]);

  // Keep controls visible while hovering or right after an action
  const keepVisible = useCallback(() => {
    setIsHovering(true);
    actions.resetControlsDim();
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
  }, [actions]);

  const release = useCallback(() => {
    setIsHovering(false);
    // Start the 3-second countdown
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => {
      actions.resetControlsDim();
    }, 3000);
  }, [actions]);

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    };
  }, []);

  const isDimmed = state.areControlsDimmed && !isHovering;
  const fontSizeLabel = currentFontSize === 0.875 ? "S" : currentFontSize === 1.125 ? "L" : "M";

  const pill = (
    <div
      data-focus-controls
      onMouseEnter={keepVisible}
      onMouseLeave={release}
    >
      <div
        className="flex items-center gap-1 px-2 py-1.5 rounded-full
          bg-warm-800/90 dark:bg-warm-200/90
          backdrop-blur-md
          border border-warm-600/30 dark:border-warm-500/30
          shadow-[0_8px_30px_-12px_rgba(0,0,0,0.4)] dark:shadow-[0_8px_30px_-12px_rgba(0,0,0,0.55)]
          transition-all duration-300"
        style={{
          opacity: isDimmed ? 0.35 : 1,
        }}
        role="toolbar"
        aria-label="Focus mode controls"
      >
        {/* Font size stepper */}
        <button
          onClick={handleFontSizeDown}
          disabled={fontSizeIndex <= 0}
          title="Decrease font size"
          aria-label="Decrease font size"
          className="flex items-center justify-center w-8 h-8 rounded-full
            text-warm-100 dark:text-warm-800
            hover:bg-warm-700/50 dark:hover:bg-warm-300/50
            active:bg-warm-700 dark:active:bg-warm-300
            disabled:opacity-30 disabled:pointer-events-none
            transition-colors duration-150"
        >
          <ZoomOut className="w-3.5 h-3.5" strokeWidth={1.8} />
        </button>

        {/* Font size label */}
        <span
          className="min-w-[2ch] text-center text-xs font-semibold
            text-warm-100 dark:text-warm-800 select-none"
          title={`Font size: ${Math.round(currentFontSize * 100)}%`}
        >
          {fontSizeLabel}
        </span>

        <button
          onClick={handleFontSizeUp}
          disabled={fontSizeIndex >= FONT_SIZE_STEPS.length - 1}
          title="Increase font size"
          aria-label="Increase font size"
          className="flex items-center justify-center w-8 h-8 rounded-full
            text-warm-100 dark:text-warm-800
            hover:bg-warm-700/50 dark:hover:bg-warm-300/50
            active:bg-warm-700 dark:active:bg-warm-300
            disabled:opacity-30 disabled:pointer-events-none
            transition-colors duration-150"
        >
          <ZoomIn className="w-3.5 h-3.5" strokeWidth={1.8} />
        </button>

        <div className="w-px h-5 bg-warm-600/30 dark:bg-warm-500/30" />

        {/* Reading width toggle */}
        <button
          onClick={handleToggleWidth}
          title={state.columnWidth === "standard" ? "Switch to wide reading width" : "Switch to standard reading width"}
          aria-label="Toggle reading column width"
          className="flex items-center justify-center w-8 h-8 rounded-full
            text-warm-100 dark:text-warm-800
            hover:bg-warm-700/50 dark:hover:bg-warm-300/50
            active:bg-warm-700 dark:active:bg-warm-300
            transition-colors duration-150"
        >
          <Maximize2 className="w-3.5 h-3.5" strokeWidth={1.8} />
        </button>

        <div className="w-px h-5 bg-warm-600/30 dark:bg-warm-500/30" />

        {/* Keyboard shortcut hint */}
        <button
          onMouseEnter={() => {
            setShowShortcut(true);
            keepVisible();
          }}
          onMouseLeave={() => {
            setShowShortcut(false);
            release();
          }}
          title="Keyboard shortcuts"
          aria-label="Show keyboard shortcuts"
          className="flex items-center justify-center w-8 h-8 rounded-full
            text-warm-100 dark:text-warm-800
            hover:bg-warm-700/50 dark:hover:bg-warm-300/50
            active:bg-warm-700 dark:active:bg-warm-300
            transition-colors duration-150"
        >
          <Keyboard className="w-3.5 h-3.5" strokeWidth={1.8} />
        </button>

        {/* Shortcut tooltip */}
        {showShortcut && (
          <div
            className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2
              px-3 py-2 rounded-lg
              bg-warm-900 dark:bg-warm-100
              text-warm-100 dark:text-warm-900
              text-xs leading-relaxed
              shadow-lg whitespace-nowrap
              border border-warm-700/30 dark:border-warm-300/30"
          >
            <span className="font-mono font-semibold">Shift+F</span> toggle mode ·{" "}
            <span className="font-mono font-semibold">Esc</span> exit
          </div>
        )}

        <div className="w-px h-5 bg-warm-600/30 dark:bg-warm-500/30" />

        {/* Exit */}
        <button
          onClick={actions.disable}
          title="Exit Focus Mode (Esc)"
          aria-label="Exit focus mode"
          className="flex items-center justify-center w-8 h-8 rounded-full
            text-warm-100 dark:text-warm-800
            hover:bg-red-500/80 dark:hover:bg-red-400/80
            active:bg-red-600 dark:active:bg-red-500
            transition-colors duration-150"
        >
          <X className="w-3.5 h-3.5" strokeWidth={2} />
        </button>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(pill, document.body);
}