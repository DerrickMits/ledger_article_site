"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface TextSelectionState {
  selectedText: string;
  boundingRect: DOMRect;
}

export interface UseTextSelectionOptions {
  /** Ref to the container element to scope selection detection within (e.g., article prose) */
  containerRef?: React.RefObject<HTMLElement | null>;
  /** Minimum character count for a valid selection (default: 5) */
  minLength?: number;
}

export function useTextSelection({
  containerRef,
  minLength = 5,
}: UseTextSelectionOptions = {}) {
  const [selection, setSelection] = useState<TextSelectionState | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const rafRef = useRef<number>(0);

  const clearSelection = useCallback(() => {
    setSelection(null);
    setIsVisible(false);
  }, []);

  const readSelection = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
    }

    rafRef.current = requestAnimationFrame(() => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        clearSelection();
        return;
      }

      const text = sel.toString().trim();
      if (text.length < minLength) {
        clearSelection();
        return;
      }

      // Scope to the article content container if provided
      if (containerRef?.current) {
        const range = sel.getRangeAt(0);
        const node = range.startContainer;
        if (!containerRef.current.contains(node)) {
          clearSelection();
          return;
        }
      }

      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();

      // Guard against zero-dimension rects (e.g., collapsed range)
      if (rect.width < 1 && rect.height < 1) {
        clearSelection();
        return;
      }

      setSelection({
        selectedText: text,
        boundingRect: rect,
      });
      setIsVisible(true);
    });
  }, [containerRef, minLength, clearSelection]);

  useEffect(() => {
    const handleResize = () => clearSelection();

    document.addEventListener("selectionchange", readSelection);
    window.addEventListener("scroll", clearSelection, { passive: true });
    window.addEventListener("resize", handleResize);

    return () => {
      document.removeEventListener("selectionchange", readSelection);
      window.removeEventListener("scroll", clearSelection);
      window.removeEventListener("resize", handleResize);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [readSelection, clearSelection]);

  return { selection, isVisible, dismiss: clearSelection };
}