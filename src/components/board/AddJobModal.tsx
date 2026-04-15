"use client";

import { useEffect, useState } from "react";
import { GlassModal } from "@/components/ui/GlassModal";

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
            className="btn-secondary w-full sm:w-auto"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="add-job-form"
            disabled={busy}
            className="btn-primary w-full sm:w-auto"
          >
            {busy ? "Adding…" : "Add job"}
          </button>
        </div>
      }
    >
      <form id="add-job-form" onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="add-job-company" className="label">
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
            className="input mt-1.5"
            placeholder="Acme Corp"
          />
        </div>
        <div>
          <label htmlFor="add-job-role" className="label">
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
            className="input mt-1.5"
            placeholder="Senior Engineer"
          />
        </div>
        <div>
          <label htmlFor="add-job-url" className="label">
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
            className="input mt-1.5"
            placeholder="https://…"
          />
        </div>
      </form>
    </GlassModal>
  );
}
