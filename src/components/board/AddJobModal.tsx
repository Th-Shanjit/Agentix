"use client";

import { useEffect, useState } from "react";
import { GlassModal } from "@/components/ui/GlassModal";
import { cn } from "@/lib/cn";

type AddJobModalProps = {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: {
    company: string;
    role: string;
    url: string;
  }) => void | Promise<void>;
  submitting?: boolean;
};

export function AddJobModal({
  open,
  onClose,
  onSubmit,
  submitting,
}: AddJobModalProps) {
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [url, setUrl] = useState("");

  useEffect(() => {
    if (!open) {
      setCompany("");
      setRole("");
      setUrl("");
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit({ company, role, url });
  };

  const busy = Boolean(submitting);

  return (
    <GlassModal
      open={open}
      onClose={busy ? () => {} : onClose}
      title="Add job manually"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className={cn(
              "inline-flex min-h-[44px] w-full items-center justify-center rounded-full border border-white/60 bg-white/35 px-4 py-2.5 text-xs font-semibold text-slate-800 shadow-sm backdrop-blur-xl transition-all duration-300 sm:w-auto sm:min-h-0 sm:py-2",
              "hover:bg-white/55 disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.99]"
            )}
          >
            Cancel
          </button>
          <button
            type="submit"
            form="add-job-form"
            disabled={busy}
            className={cn(
              "inline-flex min-h-[44px] w-full items-center justify-center rounded-full border border-sky-400/40 bg-sky-500/20 px-4 py-2.5 text-xs font-semibold text-sky-900 shadow-sm backdrop-blur-xl transition-all duration-300 sm:w-auto sm:min-h-0 sm:py-2",
              "hover:bg-sky-500/30 disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.99]"
            )}
          >
            {busy ? "Adding…" : "Add job"}
          </button>
        </div>
      }
    >
      <form id="add-job-form" onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="add-job-company"
            className="block text-xs font-semibold uppercase tracking-wide text-slate-500"
          >
            Company
          </label>
          <input
            id="add-job-company"
            name="company"
            type="text"
            autoComplete="organization"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            required
            disabled={busy}
            className="mt-1.5 w-full rounded-2xl border border-white/60 bg-white/40 px-3 py-3 text-base text-slate-900 shadow-inner backdrop-blur-md placeholder:text-slate-400 focus:border-sky-400/50 focus:outline-none focus:ring-2 focus:ring-sky-400/25 disabled:opacity-60 sm:py-2.5 sm:text-sm"
            placeholder="Acme Corp"
          />
        </div>
        <div>
          <label
            htmlFor="add-job-role"
            className="block text-xs font-semibold uppercase tracking-wide text-slate-500"
          >
            Role
          </label>
          <input
            id="add-job-role"
            name="role"
            type="text"
            autoComplete="organization-title"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            required
            disabled={busy}
            className="mt-1.5 w-full rounded-2xl border border-white/60 bg-white/40 px-3 py-3 text-base text-slate-900 shadow-inner backdrop-blur-md placeholder:text-slate-400 focus:border-sky-400/50 focus:outline-none focus:ring-2 focus:ring-sky-400/25 disabled:opacity-60 sm:py-2.5 sm:text-sm"
            placeholder="Senior Engineer"
          />
        </div>
        <div>
          <label
            htmlFor="add-job-url"
            className="block text-xs font-semibold uppercase tracking-wide text-slate-500"
          >
            Posting URL
          </label>
          <input
            id="add-job-url"
            name="url"
            type="url"
            inputMode="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            required
            disabled={busy}
            className="mt-1.5 w-full rounded-2xl border border-white/60 bg-white/40 px-3 py-3 text-base text-slate-900 shadow-inner backdrop-blur-md placeholder:text-slate-400 focus:border-sky-400/50 focus:outline-none focus:ring-2 focus:ring-sky-400/25 disabled:opacity-60 sm:py-2.5 sm:text-sm"
            placeholder="https://…"
          />
        </div>
      </form>
    </GlassModal>
  );
}
