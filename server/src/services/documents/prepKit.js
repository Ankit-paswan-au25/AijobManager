import { z } from "zod";
import { LIMITED_INFO_NOTE } from "../../config/matching.js";
import { PREP_ASK_COUNT, PREP_QUESTION_COUNT } from "../../config/documents.js";
import { FENCE_NOTE, jobBlock, problemsBlock, resumeBlock } from "./promptParts.js";

const text = (max) => z.string().trim().min(1).max(max);

export const prepKitSchema = z.object({
  role_summary: text(1500),
  likely_questions: z.array(z.object({ question: text(400), answer_approach: text(1200) })).length(PREP_QUESTION_COUNT),
  technical_topics: z.array(z.object({ topic: text(120), youtube_queries: z.array(text(120)).min(1).max(4) })).min(1).max(12),
  questions_to_ask: z.array(text(400)).length(PREP_ASK_COUNT),
});

// A search phrase like "node js tutorial youtube" is fine; anything that looks like an address is not.
const URL_LIKE = /https?:\/\/|\bwww\.|\byoutu\.be\b|\byoutube\.com\b|\b[a-z0-9-]+\.(com|be|org|net|io)\/|watch\?v=/i;

const render = (kit) =>
  [
    "ROLE SUMMARY",
    kit.roleSummary,
    "",
    "LIKELY INTERVIEW QUESTIONS",
    ...kit.likelyQuestions.flatMap((q, i) => [`${i + 1}. ${q.question}`, `   Approach: ${q.answerApproach}`]),
    "",
    "TECHNICAL TOPICS TO REVIEW",
    ...kit.technicalTopics.flatMap((t) => [`- ${t.topic}`, ...t.youtubeQueries.map((q) => `    YouTube search: ${q}`)]),
    "",
    "QUESTIONS TO ASK THE INTERVIEWER",
    ...kit.questionsToAsk.map((q, i) => `${i + 1}. ${q}`),
  ].join("\n");

export const prepKit = {
  type: "prep_kit",
  schema: prepKitSchema,

  buildPrompt({ resume, job, limitedInfo, problems }) {
    return [
      "You prepare a candidate for an interview for one job, using their resume and the job details.",
      FENCE_NOTE,
      "",
      resumeBlock(resume),
      "",
      jobBlock(job, limitedInfo),
      "",
      "Write:",
      "- role_summary: 2-4 sentences on what the role probably involves, based only on the title and details given.",
      `- likely_questions: exactly ${PREP_QUESTION_COUNT} questions the interviewer is most likely to ask. For each, answer_approach says how this candidate could answer, drawing only on experience that appears in <resume>. Never invent experience.`,
      "- technical_topics: the technical topics to review, derived from the job title and details (not from the resume alone). For each, youtube_queries lists 1-3 YouTube SEARCH phrases a person could type to learn it.",
      "  youtube_queries are plain search phrases only. Never write a URL, a video title, a channel name or a link.",
      `- questions_to_ask: exactly ${PREP_ASK_COUNT} good questions for the candidate to ask the interviewer.`,
      ...(limitedInfo ? ["- The job details are limited: say so in role_summary, and keep topics to what the title and details support."] : []),
      problemsBlock(problems),
      "Reply with ONLY a JSON object (no markdown, no other text) in exactly this shape:",
      '{"role_summary": "...", "likely_questions": [{"question": "...", "answer_approach": "..."}], "technical_topics": [{"topic": "...", "youtube_queries": ["..."]}], "questions_to_ask": ["..."]}',
    ].join("\n");
  },

  validate({ data }) {
    const problems = [];
    const everyString = [
      data.role_summary,
      ...data.likely_questions.flatMap((q) => [q.question, q.answer_approach]),
      ...data.technical_topics.flatMap((t) => [t.topic, ...t.youtube_queries]),
      ...data.questions_to_ask,
    ];
    // Search queries only: the model must not invent links to videos.
    if (everyString.some((s) => URL_LIKE.test(s))) problems.push("it contains a link or URL; use plain search phrases only");
    return problems;
  },

  toContent({ data, limitedInfo }) {
    const kit = {
      roleSummary: limitedInfo ? `${data.role_summary} ${LIMITED_INFO_NOTE}` : data.role_summary,
      likelyQuestions: data.likely_questions.map((q) => ({ question: q.question, answerApproach: q.answer_approach })),
      technicalTopics: data.technical_topics.map((t) => ({ topic: t.topic, youtubeQueries: t.youtube_queries })),
      questionsToAsk: data.questions_to_ask,
    };
    return { ...kit, text: render(kit) };
  },
};
