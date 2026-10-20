import { notFound } from "../lib/errors.js";
import { isLimitedInfo } from "../lib/limitedInfo.js";
import { labelForScore } from "./matchService.js";

const time = (d) => new Date(d).getTime();
const scoreOf = (job) => job.match?.score ?? -1; // unscored jobs sort last

const COMPARATORS = {
  score: (a, b) => scoreOf(b) - scoreOf(a) || time(b.receivedAt) - time(a.receivedAt) || a.id.localeCompare(b.id),
  received_at: (a, b) => time(b.receivedAt) - time(a.receivedAt) || scoreOf(b) - scoreOf(a) || a.id.localeCompare(b.id),
};

export function createJobService({ jobRepository }) {
  return {
    /** GET /api/jobs/:id. The job detail page's data: one job with its match and the short snippet we have. */
    async get(userId, jobId) {
      const job = await jobRepository.findOneForUser(userId, jobId);
      if (!job) throw notFound("Job not found");
      const { rawSnippet, ...rest } = job;
      return {
        job: {
          ...rest,
          snippet: rawSnippet,
          limitedInfo: isLimitedInfo({ raw_snippet: rawSnippet }),
          match: job.match ? { ...job.match, label: labelForScore(job.match.score) } : null,
        },
      };
    },

    /**
     * Lists the user's jobs, best first.
     * - Scored jobs below `minScore` are hidden (default 80, set by the route); `hiddenBelowMinScore` says how many.
     * - Jobs with no score yet are not hidden by a score they don't have: they show only when minScore is 0,
     *   and `unscored` always says how many are waiting.
     * TODO: pagination. Fine for personal use; a long-lived account will want it.
     */
    async list(userId, { status, minScore, sort }) {
      const all = await jobRepository.listForUser(userId, { status });
      const unscored = all.filter((j) => !j.match).length;

      const visible = all.filter((j) => (j.match ? j.match.score >= minScore : minScore === 0));
      const hiddenBelowMinScore = all.filter((j) => j.match && j.match.score < minScore).length;

      visible.sort(COMPARATORS[sort]);
      const jobs = visible.map((j) => (j.match ? { ...j, match: { ...j.match, label: labelForScore(j.match.score) } } : j));
      return { jobs, total: jobs.length, unscored, hiddenBelowMinScore };
    },
  };
}
