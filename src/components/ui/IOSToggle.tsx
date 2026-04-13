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
        "relative h-8 w-[3.35rem] shrink-0 rounded-full p-0.5 transition-all duration-300",
        "border border-white/50 shadow-inner backdrop-blur-sm",
        checked
          ? "bg-emerald-500/85 shadow-emerald-500/20"
          : "bg-slate-300/70",
        disabled && "cursor-not-allowed opacity-50"
      )}
    >
      <span
        className={cn(
          "pointer-events-none block h-7 w-7 rounded-full bg-white shadow-md ring-1 ring-black/5 transition-transform duration-300 ease-out",
          checked ? "translate-x-[1.28rem]" : "translate-x-0"
        )}
      />
    </button>
  );
}
