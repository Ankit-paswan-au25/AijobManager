/** Database access for match_scores. One row per (user, job); rescoring replaces it. */
export function createMatchRepository(pool) {
  return {
    async upsert({ userId, jobId, score, matchedSkills, missingSkills, reasoning, llmFailed }) {
      const { rows } = await pool.query(
        `INSERT INTO match_scores (user_id, job_id, score, matched_skills, missing_skills, reasoning, llm_failed)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (user_id, job_id) DO UPDATE SET
           score = EXCLUDED.score,
           matched_skills = EXCLUDED.matched_skills,
           missing_skills = EXCLUDED.missing_skills,
           reasoning = EXCLUDED.reasoning,
           llm_failed = EXCLUDED.llm_failed,
           scored_at = now()
         RETURNING score, matched_skills, missing_skills, reasoning, llm_failed, scored_at`,
        [userId, jobId, score, JSON.stringify(matchedSkills), JSON.stringify(missingSkills), reasoning, llmFailed],
      );
      const r = rows[0];
      return {
        score: r.score,
        matchedSkills: r.matched_skills,
        missingSkills: r.missing_skills,
        reasoning: r.reasoning,
        llmFailed: r.llm_failed,
        scoredAt: r.scored_at,
      };
    },
  };
}
