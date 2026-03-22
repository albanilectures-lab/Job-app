import type { Job } from "./types";
import { EXCLUSION_KEYWORDS, INCLUSION_KEYWORDS } from "./constants";

/**
 * Filter a job listing based on inclusion/exclusion keywords.
 * Returns true if the job PASSES all filters (should be kept).
 */
export function filterJob(job: Job): boolean {
  const text = `${job.title} ${job.description} ${job.location}`.toLowerCase();

  // Must match at least one inclusion keyword
  const hasInclusion = INCLUSION_KEYWORDS.some((kw) => text.includes(kw.toLowerCase()));
  if (!hasInclusion) return false;

  // Must NOT match any exclusion keyword
  const hasExclusion = EXCLUSION_KEYWORDS.some((kw) => text.includes(kw.toLowerCase()));
  if (hasExclusion) return false;

  // Exclude LinkedIn and Indeed URLs
  if (job.url.includes("linkedin.com") || job.url.includes("indeed.com")) return false;

  return true;
}
