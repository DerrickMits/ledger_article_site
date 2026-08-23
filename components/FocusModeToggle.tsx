"use client";

import { Focus } from "lucide-react";
import { useFocusMode } from "@/hooks/useFocusMode";

export default function FocusModeToggle() {
  const { state, actions } = useFocusMode();

  return (
    <button
      onClick={actions.toggle}
      title="Focus Mode (Shift + F)"
      aria-label={state.isEnabled ? "Exit Focus Mode" : "Enter Focus Mode"}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg
        text-xs font-medium
        text-warm-600 dark:text-warm-400
        hover:text-warm-900 dark:hover:text-warm-100
        hover:bg-warm-100 dark:hover:bg-warm-800
        border border-warm-200 dark:border-warm-700
        transition-colors duration-150"
    >
      <Focus
        className={`w-3.5 h-3.5 ${state.isEnabled ? "text-accent" : ""}`}
        strokeWidth={1.8}
      />
      <span className="hidden sm:inline">
        {state.isEnabled ? "Exit Focus" : "Focus"}
      </span>
    </button>
  );
}