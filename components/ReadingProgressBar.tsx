"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";

interface ReadingProgressBarProps {
  targetRef?: React.RefObject<HTMLElement>;
  className?: string;
}

/**
 * Reading progress bar - minimalist 2px bar pinned to top of viewport
 * Tracks scroll progress through the main article content
 */
export default function ReadingProgressBar({
  targetRef,
  className = "",
}: ReadingProgressBarProps) {
  const [progress, setProgress] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const throttleRef = useRef<NodeJS.Timeout | null>(null);

  const calculateProgress = useCallback(() => {
    const target = targetRef?.current;
    if (!target) return 0;

    const rect = target.getBoundingClientRect();
    const height = rect.height;
    const offset = 80; // Account for fixed header

    const scrollTop = window.scrollY - offset;
    const viewportHeight = window.innerHeight;

    // Calculate progress through the content
    const progressPercent = Math.max(
      0,
      Math.min(
        100,
        ((scrollTop / (height - viewportHeight)) * 100) || 0
      )
    );

    return Math.max(0, Math.min(100, progressPercent));
  }, [targetRef]);

  const updateProgress = useCallback(() => {
    const newProgress = calculateProgress();
    setProgress(newProgress);
    if (newProgress > 5 && !isVisible) {
      setIsVisible(true);
    } else if (newProgress < 5 && isVisible) {
      setIsVisible(false);
    }
  }, [calculateProgress, isVisible]);

  useEffect(() => {
    const handleScroll = () => {
      if (throttleRef.current) {
        clearTimeout(throttleRef.current);
      }
      throttleRef.current = setTimeout(() => {
        updateProgress();
      }, 16); // ~60fps
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    document.addEventListener("visibilitychange", handleScroll);
    
    // Initial calculation
    updateProgress();

    return () => {
      if (throttleRef.current) {
        clearTimeout(throttleRef.current);
      }
      window.removeEventListener("scroll", handleScroll);
      document.removeEventListener("visibilitychange", handleScroll);
    };
  }, [updateProgress]);

  // Only render on article pages
  const [isArticlePage, setIsArticlePage] = useState(false);
  useEffect(() => {
    setIsArticlePage(window.location.pathname.includes("/articles/"));
  }, []);

  if (!isArticlePage) return null;

  return (
    <div
      className={`fixed top-0 left-0 h-1 z-50 transition-opacity duration-300 ${
        isVisible ? "opacity-100" : "opacity-0 pointer-events-none"
      } ${className}`}
    >
      <div className="h-full w-full bg-warm-200 dark:bg-warm-800">
        <div
          className="h-full transition-all duration-200 ease-out"
          style={{
            width: `${progress}%`,
            background: progress > 50
              ? "linear-gradient(90deg, #B45309 0%, #FBBF24 100%)"
              : progress > 25
              ? "linear-gradient(90deg, #B45309 0%, #E7E5E4 100%)"
              : "#B45309",
          }}
        />
      </div>
    </div>
  );
}