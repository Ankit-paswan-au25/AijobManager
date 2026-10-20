import { day } from "./jobsApp.js";

/** Creates one job for the user (via the real saveForUser path), then sets up its score / status / interview date. */
export async function seedJob(ctx, userId, n, {
  score = null, status = "new", interviewDate = null, receivedAgo = 1, postedAgeDays = null, portal = "naukri",
} = {}) {
  await ctx.jobRepository.saveForUser(userId, [{
    source_portal: portal, title: `Job ${n}`, company: `Company ${n}`, location: "Pune",
    job_url: `https://www.${portal}.com/jd/job-${n}`, posted_age_days: postedAgeDays, salary_text: null,
    experience: null, received_at: day(receivedAgo), raw_snippet: "z".repeat(120), needs_link: false,
  }]);
  const job = ctx.jobRepository.jobs.find((j) => j.title === `Job ${n}`);
  if (score !== null) {
    await ctx.matchRepository.upsert({
      userId, jobId: job.id, score, matchedSkills: ["Node.js"], missingSkills: [], reasoning: "r", llmFailed: false,
    });
  }
  const link = ctx.jobRepository.userJobs.find((u) => u.user_id === userId && u.job_id === job.id);
  link.status = status;
  link.interview_date = interviewDate;
  return { job, userJobId: link.id };
}
