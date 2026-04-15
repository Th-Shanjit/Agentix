export type LetterGrade = "A" | "B" | "C" | "D" | "F";

export function relevanceScoreToLetterGrade(score: number): LetterGrade {
  if (!Number.isFinite(score)) return "F";
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}
