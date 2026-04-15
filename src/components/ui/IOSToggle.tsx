"use client";

import { cn } from "@/lib/cn";

type IOSToggleProps = {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  id?: string;
  "aria-label"?: string;
};

export function IOSToggle({
  checked,
  onChange,
  disabled,
  id,
  "aria-label": ariaLabel,
}: IOSToggleProps) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel ?? "Applied status"}
      disabled={disabled}
      onClick={() => {
        if (!disabled) onChange(!checked);
      }}
      className={cn(
        "relative h-7 w-12 shrink-0 rounded-full border p-0.5 transition-colors duration-200",
        checked
          ? "border-success/40 bg-success"
          : "border-border bg-foreground-muted/30",
        disabled && "cursor-not-allowed opacity-50"
      )}
    >
      <span
        className={cn(
          "pointer-events-none block h-6 w-6 rounded-full bg-white shadow-sm ring-1 ring-black/5 transition-transform duration-200 ease-out",
          checked ? "translate-x-5" : "translate-x-0"
        )}
      />
    </button>
  );
}
