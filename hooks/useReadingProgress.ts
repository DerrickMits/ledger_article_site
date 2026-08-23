"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface ReadingProgressOptions {
  /** Offset in pixels for fixed headers */
  offset?: number;
  /** Throttle delay in milliseconds for scroll handler */
  throttle?: number;
}

/**
 * Hook to track reading progress through article content
 * Uses Intersection Observer for performance and accuracy
 */
export function useReadingProgress(
  targetRef: React.RefObject<HTMLElement>,
  options: ReadingProgressOptions = {}
) {
  const { offset = 80, throttle = 100 } = options;
  const [progress, setProgress] = useState(0);
  const [isReading, setIsReading] = useState(false);
  const throttleRef = useRef<NodeJS.Timeout | null>(null);

  const calculateProgress = useCallback(() => {
    const target = targetRef.current;
    if (!target) return 0;

    const rect = target.getBoundingClientRect();
    const height = rect.height;
    const scrollTop = window.scrollY;
    const offsetTop = rect.top + scrollTop;

    const viewportHeight = window.innerHeight;
    const progressPercent = Math.min(
      100,
      Math.max(
        0,
        ((offsetTop - offset) / (height - viewportHeight + offset)) * 100
      )
    );

    return Math.max(0, Math.min(100, progressPercent));
  }, [targetRef, offset]);

  const updateProgress = useCallback(() => {
    const newProgress = calculateProgress();
    setProgress(newProgress);
    if (newProgress > 0 && !isReading) {
      setIsReading(true);
    } else if (newProgress === 0 && isReading) {
      setIsReading(false);
    }
  }, [calculateProgress, isReading]);

  useEffect(() => {
    const handleScroll = () => {
      if (throttleRef.current) {
        clearTimeout(throttleRef.current);
      }
      throttleRef.current = setTimeout(() => {
        updateProgress();
      }, throttle);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll(); // Initial calculation

    return () => {
      if (throttleRef.current) {
        clearTimeout(throttleRef.current);
      }
      window.removeEventListener("scroll", handleScroll);
    };
  }, [throttle, updateProgress]);

  return { progress, isReading };
}

/**
 * Hook to calculate estimated reading time for content
 * @param content - Text content to analyze
 * @param wordsPerMinute - Reading speed (default: 200)
 * @returns Estimated reading time in minutes
 */
export function useReadingTime(
  content: string,
  wordsPerMinute = 200
): number {
  return Math.ceil(content.split(/\s+/).filter(Boolean).length / wordsPerMinute);
}

/**
 * Hook to calculate word count from content
 */
export function useWordCount(content: string): number {
  return content.split(/\s+/).filter(Boolean).length;
}