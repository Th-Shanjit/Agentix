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
            "border border-white/60 bg-white/50 backdrop-blur-xl shadow-glass text-slate-800",
          title: "font-semibold",
          description: "text-slate-600",
        },
      }}
    />
  );
}
