"use client";

import { useEffect, useId, useState } from "react";
import { useTheme } from "next-themes";
import { SunIcon, MoonIcon } from "lucide-react";

import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export default function ToggleTheme() {
  const id = useId();
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const isDark = mounted ? resolvedTheme === "dark" : true;

  if (!mounted) {
    return (
      <span
        className="inline-flex w-10 h-10 rounded-xl bg-warm-100 dark:bg-warm-800"
        aria-hidden
      />
    );
  }

  return (
    <div
      className="group inline-flex items-center gap-2"
      style={{ contain: "layout paint style" }}
    >
      <button
        id={`${id}-light`}
        type="button"
        aria-label="Switch to light mode"
        aria-controls={id}
        onClick={() => setTheme("light")}
        className={cn(
          "cursor-pointer text-sm font-medium",
          isDark ? "text-foreground/40 hover:text-foreground/70" : "text-foreground",
        )}
        style={{ transitionProperty: "color, opacity" }}
      >
        <SunIcon className="size-4" aria-hidden="true" />
      </button>

      <Switch
        id={id}
        checked={isDark}
        onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
        aria-labelledby={`${id}-light ${id}-dark`}
        aria-label="Toggle between dark and light mode"
        className="data-[state=checked]:bg-warm-900 data-[state=unchecked]:bg-warm-200"
        style={{ transitionProperty: "background-color" }}
      />

      <button
        id={`${id}-dark`}
        type="button"
        aria-label="Switch to dark mode"
        aria-controls={id}
        onClick={() => setTheme("dark")}
        className={cn(
          "cursor-pointer text-sm font-medium",
          isDark ? "text-foreground" : "text-foreground/40 hover:text-foreground/70",
        )}
        style={{ transitionProperty: "color, opacity" }}
      >
        <MoonIcon className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}