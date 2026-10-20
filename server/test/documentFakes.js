import { randomUUID } from "node:crypto";
import { VALID_FORM } from "./helpers.js";

/** Mirrors documentRepository: every insert is a new version; nothing is overwritten or deleted. */
export function createInMemoryDocumentRepository() {
  const docs = [];
  return {
    docs,
    async insertVersion({ userId, jobId, type, content, limitedInfo, modelUsed }) {
      const version = Math.max(0, ...docs.filter((d) => d.userId === userId && d.jobId === jobId && d.type === type).map((d) => d.version)) + 1;
      const doc = { id: randomUUID(), userId, jobId, type, content, limitedInfo, modelUsed, generatedAt: new Date(), version };
      docs.push(doc);
      const { userId: _u, ...publicDoc } = doc;
      return publicDoc;
    },
    async listLatest(userId, jobId) {
      const latest = new Map();
      for (const d of docs.filter((x) => x.userId === userId && x.jobId === jobId)) {
        if (!latest.has(d.type) || latest.get(d.type).version < d.version) latest.set(d.type, d);
      }
      return [...latest.values()].map(({ userId: _u, ...rest }) => rest);
    },
  };
}

/** A tailored resume that stays inside VALID_FORM: reordered and rephrased only. */
export const validTailored = (overrides = {}) => ({
  summary: "Backend engineer with 4 years of experience building APIs.",
  skills: ["PostgreSQL", "Node.js", "React"],
  experience: [{ role: "Engineer", company: "Acme", dates: "2021 - 2024", bullets: ["Cut latency 30%", "Built APIs"] }],
  education: [{ institution: "TU", degree: "BSc CSIT", dates: "2016 - 2020" }],
  projects: [{ name: "JobFinder", description: "Job alert organiser" }],
  ...overrides,
});

export const resumeReply = (overrides) => JSON.stringify(validTailored(overrides));

/** A cover note of exactly `words` words. */
export const coverReply = (words = 150, text = null) =>
  JSON.stringify({ cover_note: text ?? Array.from({ length: words }, (_, i) => `word${i}`).join(" ") });

export const prepReply = ({ questions = 10, asks = 5, queries = ["node js tutorial"], extra = {} } = {}) =>
  JSON.stringify({
    role_summary: "A backend role working with Node.js services.",
    likely_questions: Array.from({ length: questions }, (_, i) => ({
      question: `Question ${i + 1}?`, answer_approach: `Talk about the APIs you built at Acme (${i + 1}).`,
    })),
    technical_topics: [
      { topic: "Node.js event loop", youtube_queries: queries },
      { topic: "PostgreSQL indexing", youtube_queries: ["postgresql indexes explained"] },
    ],
    questions_to_ask: Array.from({ length: asks }, (_, i) => `What does ask ${i + 1} look like?`),
    ...extra,
  });

export const ORIGINAL = VALID_FORM;
