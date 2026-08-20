"use client";

import { useEffect, useState, useRef, useCallback } from "react";

/**
 * Hook to track which heading is currently at the top of the viewport.
 * Uses IntersectionObserver for optimal performance.
 * 
 * @param headings - Array of heading IDs to observe
 * @param options - Configuration options
 * @returns The ID of the currently active heading, or null if none
 */
export function useScrollSpy(
  headings: string[],
  options?: {
    offset?: number;
    rootMargin?: string;
  }
): string | null {
  const [activeHeading, setActiveHeading] = useState<string | null>(null);
  const offset = options?.offset ?? 80; // Default offset for navbar height

  useEffect(() => {
    // Early return if no headings
    if (headings.length === 0) {
      setActiveHeading(null);
      return;
    }

    // Create intersection observer
    const observer = new IntersectionObserver(
      (entries) => {
        // Filter to only intersecting entries and sort by position
        const intersecting = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => {
            const aEl = a.target as HTMLElement;
            const bEl = b.target as HTMLElement;
            return aEl.offsetTop - bEl.offsetTop;
          });

        if (intersecting.length > 0) {
          const topEntry = intersecting[0];
          const headingId = topEntry.target.getAttribute("data-heading-id");
          if (headingId) {
            setActiveHeading(headingId);
          }
        } else {
          // If no headings are intersecting, check if we're past all of them
          const lastHeading = document.querySelector(
            `[data-heading-id="${headings[headings.length - 1]}"]`
          ) as HTMLElement | null;
          
          if (lastHeading) {
            const rect = lastHeading.getBoundingClientRect();
            // If the last heading is near the bottom of the viewport, it's active
            if (rect.top < window.innerHeight / 2) {
              setActiveHeading(headings[headings.length - 1]);
            } else {
              setActiveHeading(null);
            }
          }
        }
      },
      {
        root: null, // Use viewport as root
        threshold: 0.1, // Trigger when 10% visible
        rootMargin: `-${offset}px 0px 0px 0px`, // Adjust for fixed header
      }
    );

    // Observe all headings
    headings.forEach((headingId) => {
      const element = document.querySelector(`[data-heading-id="${headingId}"]`);
      if (element) {
        observer.observe(element);
      }
    });

    // Set initial active heading (closest to top initially)
    const initialHeading = headings.find((id) => {
      const el = document.querySelector(`[data-heading-id="${id}"]`) as HTMLElement;
      if (!el) return false;
      const rect = el.getBoundingClientRect();
      return rect.top <= offset;
    });
    
    if (initialHeading) {
      setActiveHeading(initialHeading);
    }

    // Cleanup function
    return () => {
      observer.disconnect();
    };
  }, [headings, offset]);

  return activeHeading;
}

/**
 * Hook to handle smooth scroll behavior for anchor links.
 * Returns a function that scrolls to an element with proper offset.
 */
export function useSmoothScroll(offset?: number) {
  const scrollToElement = useCallback((id: string) => {
    const element = document.querySelector(`[data-heading-id="${id}"]`) as HTMLElement;
    if (!element) return;

    // Get the offset from the top, accounting for the navbar
    const navbarHeight = offset ?? 80; 
    const elementPosition = element.getBoundingClientRect().top;
    const absolutePosition = elementPosition + window.pageYOffset - navbarHeight - 20; // Add 20px buffer

    window.scrollTo({
      top: absolutePosition,
      behavior: "smooth",
    });
  }, [offset]);

  return scrollToElement;
}