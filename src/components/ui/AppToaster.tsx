"use client";

import { Toaster } from "sonner";

export function AppToaster() {
  return (
    <Toaster
      position="top-center"
      richColors
      closeButton
      duration={4500}
      visibleToasts={4}
      toastOptions={{
        classNames: {
          toast:
            "border border-border bg-surface-overlay backdrop-blur-xl shadow-card text-foreground",
          title: "font-medium",
          description: "text-foreground-secondary",
        },
      }}
    />
  );
}
