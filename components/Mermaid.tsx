"use client";

import { useSyncExternalStore, useEffect, useRef, useState, useId } from "react";
import { useTheme } from "next-themes";

/**
 * A tiny external store that flips to true only after hydration completes.
 * Mirrors the pattern in ThemeToggle.tsx so SSR and first client render
 * produce identical output and we avoid hydration mismatches.
 */
const emptySubscribe = () => () => {};
function getClientSnapshot() {
  return true;
}
function getServerSnapshot() {
  return false;
}
function useHasMounted() {
  return useSyncExternalStore(emptySubscribe, getClientSnapshot, getServerSnapshot);
}

interface MermaidProps {
  chart: string;
  /** Optional caption shown above the diagram (e.g. "Workflow 1: Lead Nurturing"). */
  caption?: string;
}

/**
 * Renders a Mermaid chart as inline SVG inside a styled figure container.
 *
 * - Light/dark themes are picked from next-themes' `resolvedTheme`.
 * - Until mounted, a neutral placeholder is rendered so SSR output matches
 *   first client render (no hydration warnings).
 * - When `resolvedTheme` changes, mermaid is re-initialized and the chart
 *   is re-rendered with the new theme.
 */
export default function Mermaid({ chart, caption }: MermaidProps) {
  const mounted = useHasMounted();
  const { resolvedTheme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string>("");
  // Stable unique id for the render target (mermaid needs a real DOM id).
  const reactId = useId().replace(/[^a-zA-Z0-9]/g, "");
  const renderId = `mermaid-${reactId}`;

  useEffect(() => {
    if (!mounted) return;

    let cancelled = false;

    (async () => {
      try {
        // Mermaid is a heavy client-only bundle — import lazily.
        const mermaid = (await import("mermaid")).default;

        const isDark = resolvedTheme === "dark";

        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "loose",
          fontFamily: "inherit",
          theme: isDark ? "dark" : "neutral",
          themeVariables: isDark
            ? {
                background: "#0C0A09",
                primaryColor: "#1C1917",
                primaryTextColor: "#F5F5F4",
                primaryBorderColor: "#44403C",
                lineColor: "#A8A29E",
                secondaryColor: "#292524",
                tertiaryColor: "#44403C",
                accentColor: "#FBBF24",
                textColor: "#F5F5F4",
              }
            : {
                background: "#FDFBF7",
                primaryColor: "#F5F5F4",
                primaryTextColor: "#1C1917",
                primaryBorderColor: "#E7E5E4",
                lineColor: "#78716C",
                secondaryColor: "#F5F5F4",
                tertiaryColor: "#E7E5E4",
                accentColor: "#B45309",
                textColor: "#1C1917",
              },
        });

        // mermaid 11.x exposes `.render(id, chart)` returning a Promise<{svg}>.
        const { svg: renderedSvg } = await mermaid.render(renderId, chart.trim());

        if (!cancelled) {
          setSvg(renderedSvg);
          setError("");
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Mermaid render failed:", err);
          setError("Diagram failed to render. Please reload the page.");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [chart, resolvedTheme, mounted, renderId]);

  // SSR / pre-mount placeholder — keeps hydration output identical.
  if (!mounted) {
    return (
      <figure className="my-8 mx-0">
        {caption && (
          <figcaption className="text-center text-sm text-warm-500 dark:text-warm-400 mb-3 italic">
            {caption}
          </figcaption>
        )}
        <div
          className="h-64 rounded-xl bg-warm-100 dark:bg-warm-800 border border-warm-200 dark:border-warm-700 animate-pulse"
          aria-hidden
        />
      </figure>
    );
  }

  if (error) {
    return (
      <figure className="my-8 mx-0">
        <div className="rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 p-4 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      </figure>
    );
  }

  return (
    <figure className="my-8 mx-0">
      {caption && (
        <figcaption className="text-center text-sm text-warm-500 dark:text-warm-400 mb-3 italic">
          {caption}
        </figcaption>
      )}
      <div
        ref={containerRef}
        className="mermaid-container flex justify-center overflow-x-auto rounded-xl p-4 md:p-6 bg-cream dark:bg-warm-900 border border-warm-200 dark:border-warm-700"
      >
        {svg ? (
          <div
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{ __html: svg }}
            className="mermaid-svg-wrapper [&_svg]:max-w-full [&_svg]:h-auto"
          />
        ) : (
          <div
            className="h-64 w-full rounded-lg bg-warm-100 dark:bg-warm-800 animate-pulse"
            aria-hidden
          />
        )}
      </div>
    </figure>
  );
}