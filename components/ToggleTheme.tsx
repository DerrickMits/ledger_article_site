"use client";

import { useEffect, useId, useState } from "react";
import { useTheme } from "next-themes";
import { SunIcon, MoonIcon } from "lucide-react";

import { Switch } from "./ui/switch";

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
        className="cursor-pointer"
        style={{ transitionProperty: "color, opacity" }}
      >
        <SunIcon className="size-4" aria-hidden="true" />
      </button>

      <Switch.Root
        id={id}
        checked={isDark}
        onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
        aria-labelledby={`${id}-light ${id}-dark`}
        aria-label="Toggle between dark and light mode"
        className="inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent bg-warm-200 data-[state=checked]:bg-warm-900 data-[state=unchecked]:bg-warm-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
        style={{ transitionProperty: "background-color" }}
      >
        <Switch.Thumb className="pointer-events-none block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform data-[checked]:translate-x-5 data-[unchecked]:translate-x-0" />
      </Switch.Root>

      <button
        id={`${id}-dark`}
        type="button"
        aria-label="Switch to dark mode"
        aria-controls={id}
        onClick={() => setTheme("dark")}
        className="cursor-pointer"
        style={{ transitionProperty: "color, opacity" }}
      >
        <MoonIcon className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}