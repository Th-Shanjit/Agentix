/** Normalized row before persistence (provider-agnostic). */
export type NormalizedJob = {
  title: string;
  company: string;
  applyUrl: string;
  location: string | null;
  description: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string;
  remotePolicy: string | null;
  countryCodes: string[] | null;
  experienceYearsMin: number | null;
  experienceYearsMax: number | null;
  postedAt: Date;
  source: string;
  sourceName: string;
  externalId: string | null;
  raw: Record<string, unknown>;
};
