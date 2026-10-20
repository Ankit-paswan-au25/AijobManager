import { labelForScore } from "./matchService.js";

const time = (d) => new Date(d).getTime();
const scoreOf = (job) => job.match?.score ?? -1; // unscored jobs sort last

const COMPARATORS = {
  score: (a, b) => scoreOf(b) - scoreOf(a) || time(b.receivedAt) - time(a.receivedAt) || a.id.localeCompare(b.id),
  received_at: (a, b) => time(b.receivedAt) - time(a.receivedAt) || scoreOf(b) - scoreOf(a) || a.id.localeCompare(b.id),
};

export function createJobService({ jobRepository }) {
  return {
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
