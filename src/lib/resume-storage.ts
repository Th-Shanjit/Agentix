/**
 * Legacy browser helpers for one-time migration from localStorage → DB.
 * Source of truth is `User.resumeText` (see `saveResumeText`).
 */

export const RESUME_TEXT_STORAGE_KEY = "agentix:resumeText";
export const RESUME_FILENAME_STORAGE_KEY = "agentix:resumeFileName";

export function getStoredResumeText(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(RESUME_TEXT_STORAGE_KEY);
    return raw;
  } catch {
    return null;
  }
}

export function getStoredResumeFileName(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(RESUME_FILENAME_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredResumeText(
  text: string,
  fileName?: string | null
): void {
  if (typeof window === "undefined") return;
  try {
    if (text.length === 0) {
      window.localStorage.removeItem(RESUME_TEXT_STORAGE_KEY);
      window.localStorage.removeItem(RESUME_FILENAME_STORAGE_KEY);
    } else {
      window.localStorage.setItem(RESUME_TEXT_STORAGE_KEY, text);
      if (fileName && fileName.trim()) {
        window.localStorage.setItem(
          RESUME_FILENAME_STORAGE_KEY,
          fileName.trim()
        );
      } else {
        window.localStorage.removeItem(RESUME_FILENAME_STORAGE_KEY);
      }
    }
  } catch {
    throw new Error("Could not save resume text (storage full or unavailable).");
  }
}

export function clearStoredResumeText(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(RESUME_TEXT_STORAGE_KEY);
    window.localStorage.removeItem(RESUME_FILENAME_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
