"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  autoUpdate,
  flip,
  shift,
  size,
  useFloating,
  type Placement,
} from "@floating-ui/react";
import { getGlossaryEntry } from "@/lib/glossary";

/* ================================================================== */
/*  Tooltip instance — mounted under each <span data-glossary-term>   */
/* ================================================================== */

interface GlossaryTooltipProps {
  /** Term dictionary key */
  termKey: string;
  /** DOM node to tooltip-anchor against */
  triggerEl: HTMLSpanElement;
}

export default function GlossaryTooltip({
  termKey,
  triggerEl,
}: GlossaryTooltipProps) {
  const entry = getGlossaryEntry(termKey);
  if (!entry) return null;

  const [isOpen, setIsOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const floatingData = useRef<ReturnType<typeof useFloating> | null>(null);
  const generatedId = useId();
  const tooltipId = `glossary-tooltip-${generatedId}`;

  /* ---- Touch detection (one-shot) ---- */
  useEffect(() => {
    setIsMobile(
      typeof window !== "undefined" &&
        ("ontouchstart" in window || navigator.maxTouchPoints > 0)
    );
  }, []);

  /* ---- Floating UI ---- */
  const {
    refs: _refs,
    floatingStyles,
    middlewareData,
    update,
  } = useFloating({
    open: isOpen,
    placement: "top",
    whileElementsMounted: autoUpdate,
    middleware: [
      flip({ fallbackPlacements: ["bottom", "left", "right"] }),
      shift({ padding: 8 }),
      size({
        apply({ rects, elements }) {
          Object.assign(elements.floating.style, {
            maxWidth: `${Math.min(320, rects.reference.width + 60)}px`,
          });
        },
      }),
    ],
  });

  // Manually bind floating-ui's ref to our DOM nodes outside of render
  useEffect(() => {
    _refs.setReference(triggerEl);

    // Keep floated position updated on resize
    const ro = new ResizeObserver(() => update());
    ro.observe(triggerEl);
    return () => ro.disconnect();
  }, [triggerEl, _refs, update]);

  const setPopoverRef = useCallback(
    (node: HTMLDivElement | null) => {
      popoverRef.current = node;
      _refs.setFloating(node);
    },
    [_refs]
  );

  /* ---- Open / close helpers ---- */
  const open = useCallback(() => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => {
      setIsOpen(true);
      requestAnimationFrame(update);
    }, 100);
  }, [update]);

  const close = useCallback(() => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    setIsOpen(false);
  }, []);

  const toggle = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  /* ---- Style trigger element ---- */
  useEffect(() => {
    const el = triggerEl;
    if (!el) return;

    el.setAttribute("role", "button");
    el.setAttribute("tabindex", "0");
    el.classList.add(
      "border-b",
      "border-dotted",
      "border-warm-400/70",
      "dark:border-warm-500/70",
      "hover:border-warm-700",
      "dark:hover:border-warm-300",
      "hover:text-warm-900",
      "dark:hover:text-warm-100",
      "cursor-help",
      "transition-colors",
      "duration-150",
      "select-none",
      "rounded-[1px]"
    );

    const on: [string, EventListener | undefined][] = [
      ["mouseenter", isMobile ? undefined : open],
      ["mouseleave", isMobile ? undefined : close],
      ["focus", open],
      ["blur", close],
      ["click", isMobile ? toggle : undefined],
      ["touchstart", isMobile ? (e) => e.stopPropagation() : undefined],
    ];

    on.forEach(([evt, fn]) => {
      if (fn) el.addEventListener(evt, fn);
    });

    return () => {
      el.removeAttribute("role");
      el.removeAttribute("tabindex");
      el.classList.remove(
        "border-b",
        "border-dotted",
        "border-warm-400/70",
        "dark:border-warm-500/70",
        "hover:border-warm-700",
        "dark:hover:border-warm-300",
        "hover:text-warm-900",
        "dark:hover:text-warm-100",
        "cursor-help",
        "transition-colors",
        "duration-150",
        "select-none",
        "rounded-[1px]"
      );
      on.forEach(([evt, fn]) => {
        if (fn) el.removeEventListener(evt, fn);
      });
    };
  }, [triggerEl, isMobile, open, close, toggle]);

  // Sync aria-describedby
  useEffect(() => {
    if (isOpen) {
      triggerEl.setAttribute("aria-describedby", tooltipId);
    } else {
      triggerEl.removeAttribute("aria-describedby");
    }
  }, [isOpen, triggerEl, tooltipId]);

  /* ---- Cleanup timers ---- */
  useEffect(() => () => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
  }, []);

  /* ---- Escape ---- */
  useEffect(() => {
    if (!isOpen) return;
    const fn = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
        triggerEl.focus();
      }
    };
    document.addEventListener("keydown", fn);
    return () => document.removeEventListener("keydown", fn);
  }, [isOpen, triggerEl, close]);

  /* ---- Outside click ---- */
  useEffect(() => {
    if (!isOpen) return;
    let timer: ReturnType<typeof setTimeout>;
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (popoverRef.current?.contains(t) || triggerEl.contains(t)) return;
      close();
    };
    timer = setTimeout(
      () => document.addEventListener("mousedown", handler, true),
      0
    );
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handler, true);
    };
  }, [isOpen, triggerEl, close]);

  /* ---- Keep open while hovering the popover ---- */
  useEffect(() => {
    if (!isOpen) return;
    const po = popoverRef.current;
    if (!po) return;
    const enter = () => open();
    const leave = () => close();
    po.addEventListener("mouseenter", enter);
    po.addEventListener("mouseleave", leave);
    return () => {
      po.removeEventListener("mouseenter", enter);
      po.removeEventListener("mouseleave", leave);
    };
  }, [isOpen, open, close]);

  /* ---- Arrow geometry ---- */
  const arrowX = middlewareData.arrow?.x ?? 0;
  const arrowY = middlewareData.arrow?.y ?? 0;
  // Derive arrow side from x/y offsets relative to popover edges
  const arrowSide: "top" | "bottom" | "left" | "right" = Math.abs(arrowY) > Math.abs(arrowX)
    ? arrowY < 0
      ? "bottom"
      : "top"
    : arrowX < 0
      ? "right"
      : "left";
  const isArrowTop = arrowSide === "top";
  const isArrowBottom = arrowSide === "bottom";
  const isArrowLeft = arrowSide === "left";
  const isArrowRight = arrowSide === "right";

  /* ---- Portal ---- */
  const popover = isOpen ? (
    <div
      ref={setPopoverRef}
      id={tooltipId}
      role="tooltip"
      aria-live="polite"
      className="fixed z-[9998] w-max max-w-[320px]"
      style={{ ...floatingStyles, animation: "popover-in 150ms ease-out both" }}
    >
      {/* Card */}
      <div
        className="rounded-lg border border-warm-200 dark:border-warm-700
          bg-white dark:bg-warm-900
          shadow-lg shadow-black/[0.06] dark:shadow-black/40
          backdrop-blur-sm overflow-hidden"
      >
        {/* Header */}
        <div
          className="flex items-center justify-between gap-3
            px-3.5 py-2.5
            border-b border-warm-100 dark:border-warm-800
            bg-warm-50/60 dark:bg-warm-800/40"
        >
          <span
            className="text-sm font-semibold tracking-tight
              text-warm-900 dark:text-warm-100"
          >
            {entry.title}
          </span>
          <span
            className="shrink-0 inline-flex items-center
              px-2 py-0.5 rounded-md
              text-[10px] font-medium uppercase tracking-wider
              bg-accent/10 text-accent
              dark:bg-accent/20 dark:text-accent
              border border-accent/15 dark:border-accent/25"
          >
            {entry.category}
          </span>
        </div>

        {/* Body */}
        <p
          className="px-3.5 py-2.5 text-[13px] leading-relaxed
            text-warm-700 dark:text-warm-300"
        >
          {entry.definition}
        </p>
      </div>

      {/* Caret */}
      <div
        className="absolute z-[-1]"
        style={{
          ...(isArrowTop
            ? { bottom: "-5px", left: arrowX, top: "auto" }
            : isArrowBottom
              ? { top: "-5px", left: arrowX, bottom: "auto" }
              : isArrowLeft
                ? { right: "-5px", top: arrowY, bottom: "auto" }
                : { left: "-5px", top: arrowY, bottom: "auto" }),
        }}
      >
        <div
          className="w-2.5 h-2.5 rotate-45
            bg-white dark:bg-warm-900
            border-r border-b border-warm-200 dark:border-warm-700
            shadow-[1px_1px_2px_rgba(0,0,0,0.04)]
            dark:shadow-[1px_1px_2px_rgba(0,0,0,0.3)]"
        />
      </div>
    </div>
  ) : null;

  if (typeof document === "undefined") return null;
  return createPortal(popover, document.body);
}

/* ================================================================== */
/*  Hydrator — scans prose DOM, creates one GlossaryTooltip per span   */
/* ================================================================== */

interface GlossaryTermsHydratorProps {
  proseRef: React.RefObject<HTMLElement | null>;
}

const tooltipInstances: Map<string, GlossaryTooltipInstance> = new Map();

interface GlossaryTooltipInstance {
  key: string;
  triggerEl: HTMLSpanElement;
  setRendered: React.Dispatch<React.SetStateAction<boolean>>;
  cleanup: () => void;
}

export function GlossaryTermsHydrator({
  proseRef,
}: GlossaryTermsHydratorProps) {
  const [renderedKeys, setRenderedKeys] = useState<Set<string>>(new Set());
  const createdDuringRender = useRef<Set<string>>(new Set());

  useEffect(() => {
    const container = proseRef.current;
    if (!container) return;

    const spans = container.querySelectorAll<HTMLSpanElement>(
      'span[data-glossary-term]'
    );

    // Set text content to the dictionary key as default label
    spans.forEach((span) => {
      const termKey = span.getAttribute("data-glossary-term") || "";
      if (!termKey || renderedKeys.has(termKey)) return;

      const label = span.getAttribute("data-glossary-label") || termKey;
      span.textContent = label;

      // Avoid double-wrapping if already hydrated
      if (span.hasAttribute("data-glossary-hydrated")) return;
      span.setAttribute("data-glossary-hydrated", "true");

      // Stash the trigger element reference so React can find it
      triggerElMap.set(termKey, span);

      createdDuringRender.current.add(termKey);
    });

    // Trigger a React re-render to mount <GlossaryTooltip> instances
    if (createdDuringRender.current.size > 0) {
      setRenderedKeys((prev) => new Set([...prev, ...createdDuringRender.current]));
      createdDuringRender.current.clear();
    }

    return () => {
      // Cleanup instances that no longer exist in DOM
      tooltipInstances.forEach((inst, key) => {
        if (!container.querySelector(`[data-glossary-term="${key}"]`)) {
          inst.cleanup();
          tooltipInstances.delete(key);
          triggerElMap.delete(key);
          setRenderedKeys((prev) => {
            const next = new Set(prev);
            next.delete(key);
            return next;
          });
        }
      });
    };
  });

  const keys = Array.from(renderedKeys);

  return (
    <>
      {keys.map((key) => {
        const el = triggerElMap.get(key);
        if (!el) return null;
        return (
          <GlossaryTooltip key={key} termKey={key} triggerEl={el} />
        );
      })}
    </>
  );
}

/* ---- Module-level map: survives hydration boundary ---- */
const triggerElMap: Map<string, HTMLSpanElement> = new Map();