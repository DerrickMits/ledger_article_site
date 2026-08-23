"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

type ColumnWidth = "standard" | "wide";

interface FocusModeState {
  isEnabled: boolean;
  fontSizeScale: number; // 0.875 | 1 | 1.125
  columnWidth: ColumnWidth;
  areControlsDimmed: boolean;
}

interface FocusModeActions {
  toggle: () => void;
  enable: () => void;
  disable: () => void;
  setFontSize: (scale: number) => void;
  setColumnWidth: (width: ColumnWidth) => void;
  resetControlsDim: () => void;
}

/* ------------------------------------------------------------------ */
/*  Persistence helpers                                               */
/* ------------------------------------------------------------------ */

const STORAGE_KEY = "ledger-focus-mode-preferences";

interface StoredPrefs {
  fontSizeScale: number;
  columnWidth: ColumnWidth;
}

function loadPrefs(): Partial<StoredPrefs> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function savePrefs(prefs: Partial<StoredPrefs>) {
  if (typeof window === "undefined") return;
  try {
    const existing = loadPrefs();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...existing, ...prefs }));
  } catch {
    // silently ignore storage errors
  }
}

/* ------------------------------------------------------------------ */
/*  Defaults                                                          */
/* ------------------------------------------------------------------ */

const DEFAULT_STATE: FocusModeState = {
  isEnabled: false,
  fontSizeScale: loadPrefs().fontSizeScale ?? 1,
  columnWidth: loadPrefs().columnWidth ?? "standard",
  areControlsDimmed: false,
};

const FONT_SIZE_OPTIONS = [0.875, 1, 1.125] as const;
const COLUMN_WIDTH_OPTIONS: ColumnWidth[] = ["standard", "wide"];

/* ------------------------------------------------------------------ */
/*  Context                                                           */
/* ------------------------------------------------------------------ */

interface FocusModeContextValue {
  state: FocusModeState;
  actions: FocusModeActions;
}

const FocusModeContext = createContext<FocusModeContextValue | null>(null);

/* ------------------------------------------------------------------ */
/*  Provider                                                          */
/* ------------------------------------------------------------------ */

export function FocusModeProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<FocusModeState>(DEFAULT_STATE);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ---- Persist fontSizeScale and columnWidth on change ---- */
  useEffect(() => {
    savePrefs({
      fontSizeScale: state.fontSizeScale,
      columnWidth: state.columnWidth,
    });
  }, [state.fontSizeScale, state.columnWidth]);

  /* ---- Toggle body class for CSS-driven layout changes ---- */
  useEffect(() => {
    const body = document.body;
    if (state.isEnabled) {
      body.classList.add("focus-mode");
      // Prevent body scroll bounce on some mobile browsers when hidden elements collapse
      body.style.overflowY = "scroll";
    } else {
      body.classList.remove("focus-mode");
      body.style.overflowY = "";
    }
    return () => {
      body.classList.remove("focus-mode");
      body.style.overflowY = "";
    };
  }, [state.isEnabled]);

  /* ---- Global keyboard shortcuts ---- */
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;

      // Suppress when user is in an input, textarea, or contentEditable
      const tag = target?.tagName?.toLowerCase();
      if (
        tag === "input" ||
        tag === "textarea" ||
        target?.isContentEditable ||
        (tag !== "input" && target?.closest("[data-command-palette]"))
      ) {
        return;
      }

      // Escape exits focus mode
      if (e.key === "Escape" && state.isEnabled) {
        e.preventDefault();
        setState((prev) => ({ ...prev, isEnabled: false }));
        return;
      }

      // Shift + F toggles focus mode (only when F is the only modifier)
      if (
        e.key === "f" &&
        e.shiftKey &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey
      ) {
        e.preventDefault();
        setState((prev) => ({ ...prev, isEnabled: !prev.isEnabled }));
      }
    };

    document.addEventListener("keydown", handleKey, { capture: true });
    return () => document.removeEventListener("keydown", handleKey, { capture: true });
  }, [state.isEnabled]);

  /* ---- Auto-dim controls after 3s of scroll inactivity ---- */
  const resetControlsDim = useCallback(() => {
    setState((prev) => ({ ...prev, areControlsDimmed: false }));
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = setTimeout(() => {
      setState((prev) => ({ ...prev, areControlsDimmed: true }));
    }, 3000);
  }, []);

  useEffect(() => {
    if (!state.isEnabled) return;

    const onScroll = () => resetControlsDim();
    const onKey = () => resetControlsDim();
    const onMove = () => resetControlsDim();

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("touchmove", onScroll, { passive: true });

    // Start dimmed (user hasn't interacted yet)
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = setTimeout(() => {
      setState((prev) => ({ ...prev, areControlsDimmed: true }));
    }, 3000);

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("touchmove", onScroll);
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    };
  }, [state.isEnabled, resetControlsDim]);

  /* ---- Actions ---- */
  const toggle = useCallback(() => {
    setState((prev) => ({ ...prev, isEnabled: !prev.isEnabled }));
  }, []);

  const enable = useCallback(() => {
    setState((prev) => ({ ...prev, isEnabled: true }));
  }, []);

  const disable = useCallback(() => {
    setState((prev) => ({ ...prev, isEnabled: false }));
  }, []);

  const setFontSize = useCallback((scale: number) => {
    setState((prev) => ({ ...prev, fontSizeScale: scale }));
    resetControlsDim();
  }, [resetControlsDim]);

  const setColumnWidthFn = useCallback((width: ColumnWidth) => {
    setState((prev) => ({ ...prev, columnWidth: width }));
    resetControlsDim();
  }, [resetControlsDim]);

  const value: FocusModeContextValue = {
    state,
    actions: {
      toggle,
      enable,
      disable,
      setFontSize,
      setColumnWidth: setColumnWidthFn,
      resetControlsDim,
    },
  };

  return (
    <FocusModeContext.Provider value={value}>
      {children}
    </FocusModeContext.Provider>
  );
}

/* ------------------------------------------------------------------ */
/*  Hook                                                              */
/* ------------------------------------------------------------------ */

export function useFocusMode(): FocusModeContextValue {
  const ctx = useContext(FocusModeContext);
  if (!ctx) {
    // Graceful fallback: return a no-op context so components don't crash
    // outside of a FocusModeProvider (e.g., during tests).
    return {
      state: DEFAULT_STATE,
      actions: {
        toggle: () => {},
        enable: () => {},
        disable: () => {},
        setFontSize: () => {},
        setColumnWidth: () => {},
        resetControlsDim: () => {},
      },
    };
  }
  return ctx;
}