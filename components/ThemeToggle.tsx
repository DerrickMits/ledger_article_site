"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";

// A tiny external store that flips to true only after hydration completes.
const emptySubscribe = () => () => {};
function getClientSnapshot() {
  return true;
}
function getServerSnapshot() {
  return false;
}

function useHasMounted() {
  return useSyncExternalStore(
    emptySubscribe,
    getClientSnapshot,
    getServerSnapshot,
  );
}

/**
 * Animated light and dark theme toggle.
 *
 * Mounted state guards against hydration mismatches when the
 * active theme is resolved from system preferences.
 */
export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const mounted = useHasMounted();

  if (!mounted) {
    // Reserve layout height to avoid theme pop on hydration.
    return (
      <span
        className="inline-flex w-10 h-10 rounded-xl bg-warm-100 dark:bg-warm-800"
        aria-hidden
      />
    );
  }

  const toggle = () => setTheme(theme === "dark" ? "light" : "dark");

  return (
    <button
      onClick={toggle}
      className="group inline-flex items-center justify-center w-10 h-10 rounded-xl bg-warm-100 dark:bg-warm-800 text-warm-700 dark:text-warm-300 hover:bg-warm-200 dark:hover:bg-warm-700 transition-all duration-200 focus-visible:outline-none"
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
    >
      <span className="relative inline-flex">
        {theme === "dark" ? (
          <Sun
            className="w-5 h-5 transition-transform duration-300 group-hover:rotate-45"
            strokeWidth={2}
          />
        ) : (
          <Moon
            className="w-5 h-5 transition-transform duration-300 group-hover:-rotate-12"
            strokeWidth={2}
          />
        )}
      </span>
    </button>
  );
}
