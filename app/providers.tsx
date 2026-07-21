"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ReactNode } from "react";

/**
 * Application wide theme provider.
 *
 * `attribute="class"` swaps Tailwind's `dark` variant on the `<html>` tag,
 * enabling smooth light and dark transitions without hydration mismatches.
 */
export default function Providers({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
