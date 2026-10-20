import { SCORE_LABELS } from "../config/matching.js";
import { labelForScore } from "./matchService.js";

const TOP_MIN = SCORE_LABELS[0].min; // 90
const STRONG_MIN = SCORE_LABELS[1].min; // 80

const time = (d) => new Date(d).getTime();
const scoreOf = (j) => j.score ?? -1;

/** What a dashboard card shows. Both ids are here: `id` opens the job page, `userJobId` is for PATCH /api/user-jobs/:id. */
const toCard = (job) => ({
  id: job.id,
  userJobId: job.userJobId,
  title: job.title,
  company: job.company,
  sourcePortal: job.sourcePortal,
  score: job.match?.score ?? null,
  label: job.match ? labelForScore(job.match.score) : null,
  status: job.status,
  postedAgeDays: job.postedAgeDays,
  receivedAt: job.receivedAt,
  interviewDate: job.interviewDate,
});

const bestFirst = (a, b) => scoreOf(b) - scoreOf(a) || time(b.receivedAt) - time(a.receivedAt) || a.id.localeCompare(b.id);
const newestFirst = (a, b) => time(b.receivedAt) - time(a.receivedAt) || a.id.localeCompare(b.id);

/**
 * Which one section a job belongs to, or null. A job is in at most one section:
 * - rejected / archived jobs are in none (they are still on the full jobs list);
 * - Interviews: status is "interview", OR the user entered an interview date. A date alone is enough to show
 *   the job here, but it never changes the job's status (the card still shows the real status);
 * - Applied: status is "applied";
 * - Top / Strong matches: still open (new or saved) and scored 90+ / 80-89.
 * Open jobs below 80 or not scored yet appear in no section; the response counts them in `otherOpenJobs`.
 */
export function sectionFor(job) {
  if (job.status === "rejected" || job.status === "archived") return null;
  if (job.status === "interview" || job.interviewDate) return "interviews";
  if (job.status === "applied") return "applied";
  const score = job.match?.score;
  if (score === undefined) return null;
  if (score >= TOP_MIN) return "topMatches";
  if (score >= STRONG_MIN) return "strongMatches";
  return null;
}

/** Upcoming interviews (soonest first), then ones with no date yet, then past ones (most recent first). */
function sortInterviews(cards, now) {
  const group = (c) => (!c.interviewDate ? 1 : time(c.interviewDate) >= now ? 0 : 2);
  return cards.sort((a, b) => {
    const g = group(a) - group(b);
    if (g !== 0) return g;
    if (group(a) === 0) return time(a.interviewDate) - time(b.interviewDate) || a.id.localeCompare(b.id);
    if (group(a) === 2) return time(b.interviewDate) - time(a.interviewDate) || a.id.localeCompare(b.id);
    return newestFirst(a, b);
  });
}

export function createDashboardService({ jobRepository, portalService, now = () => new Date() }) {
  return {
    /**
     * GET /api/dashboard. Read-only: it never changes a status.
     * `pendingPortals` are the caller's own portal submissions still waiting for an admin; no one else's.
     * TODO: pagination. Fine for personal use; a long-lived account will want it.
     */
    async get(userId) {
      const all = await jobRepository.listForUser(userId);
      const sections = { topMatches: [], strongMatches: [], applied: [], interviews: [] };
      let otherOpenJobs = 0;

      for (const job of all) {
        const section = sectionFor(job);
        if (section) sections[section].push(toCard(job));
        else if (job.status === "new" || job.status === "saved") otherOpenJobs += 1;
      }

      sections.topMatches.sort(bestFirst);
      sections.strongMatches.sort(bestFirst);
      sections.applied.sort(newestFirst);
      sortInterviews(sections.interviews, now().getTime());

      return { ...sections, pendingPortals: await portalService.listPendingFor(userId), otherOpenJobs };
    },
  };
}
