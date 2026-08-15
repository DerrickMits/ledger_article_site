"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

const Switch = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { checked?: boolean }
>(({ className, checked, ...props }, ref) => {
  const id = React.useId();
  return (
    <button
      ref={ref}
      role="switch"
      aria-checked={checked}
      data-state={checked ? "checked" : "unchecked"}
      className={cn(
        "peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-warm-900" : "bg-warm-200",
        className,
      )}
      style={{ transitionProperty: "background-color" }}
      {...props}
    >
      <span
        className="pointer-events-none block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform"
        style={{
          transform: checked ? "translateX(20px)" : "translateX(0)",
          transitionProperty: "transform",
        }}
      />
    </button>
  );
});
Switch.displayName = "Switch";

export { Switch };
