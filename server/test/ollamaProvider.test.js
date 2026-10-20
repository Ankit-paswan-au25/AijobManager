import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_OLLAMA_BASE_URL, OLLAMA_CONCURRENCY, OLLAMA_MAX_OUTPUT_TOKENS, OLLAMA_NUM_CTX, OLLAMA_REQUEST_TIMEOUT_MS,
} from "../src/config/ai.js";
import { loadConfig } from "../src/config/env.js";
import { createAiProvider, createAnthropicProvider, createOllamaProvider } from "../src/services/ai/index.js";
import { createMatchService } from "../src/services/matchService.js";
import { AiProviderError, assertAiProvider } from "../src/services/ai/provider.js";
import { createInMemoryJobRepository } from "./gmailFakes.js";
import { VALID_FORM } from "./helpers.js";
import { createInMemoryMatchRepository, llmReply } from "./matchFakes.js";

const okResponse = (body) => ({ ok: true, status: 200, json: async () => body });
const chatReply = (content, extra = {}) => okResponse({ message: { role: "assistant", content }, done: true, ...extra });
const quietLogger = () => ({ info() {}, warn: vi.fn(), error() {} });

describe("createOllamaProvider", () => {
  it("posts the prompt to Ollama's chat API (no key needed) and returns the reply text", async () => {
    const fetchImpl = vi.fn(async () => chatReply('{"score":80}'));
    const provider = createOllamaProvider({ model: "qwen2.5:7b", fetchImpl });

    expect(await provider.complete("hello prompt")).toBe('{"score":80}');

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(`${DEFAULT_OLLAMA_BASE_URL}/api/chat`);
    expect(init.method).toBe("POST");
    expect(Object.keys(init.headers)).toEqual(["content-type"]);
    expect(JSON.parse(init.body)).toEqual({
      model: "qwen2.5:7b",
      messages: [{ role: "user", content: "hello prompt" }],
      stream: false,
      format: "json",
      options: { num_ctx: OLLAMA_NUM_CTX, num_predict: OLLAMA_MAX_OUTPUT_TOKENS, temperature: expect.any(Number) },
    });
  });

  it("asks for a bigger context window and a longer reply than Ollama's defaults", () => {
    expect(OLLAMA_NUM_CTX).toBeGreaterThan(4096);
    expect(OLLAMA_MAX_OUTPUT_TOKENS).toBeGreaterThan(1024);
  });

  it("uses the base URL it is given, with or without a trailing slash", async () => {
    for (const baseUrl of ["http://gpu-box:11434", "http://gpu-box:11434/", "http://gpu-box:11434///"]) {
      const fetchImpl = vi.fn(async () => chatReply("ok"));
      await createOllamaProvider({ model: "m", baseUrl, fetchImpl }).complete("p");
      expect(fetchImpl.mock.calls[0][0]).toBe("http://gpu-box:11434/api/chat");
    }
  });

  it("can ask for plain text instead of JSON, and take its limits from the caller", async () => {
    const fetchImpl = vi.fn(async () => chatReply("ok"));
    await createOllamaProvider({ model: "m", fetchImpl, format: null, numCtx: 2048, maxOutputTokens: 99, temperature: 0 }).complete("p");
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body).not.toHaveProperty("format");
    expect(body.options).toEqual({ num_ctx: 2048, num_predict: 99, temperature: 0 });
  });

  it("labels its model so local output can't be mistaken for a hosted model's, and scores one job at a time", () => {
    const provider = createOllamaProvider({ model: "qwen2.5:7b" });
    expect(provider).toMatchObject({ name: "ollama", model: "ollama:qwen2.5:7b", concurrency: OLLAMA_CONCURRENCY });
    expect(OLLAMA_CONCURRENCY).toBe(1);
  });

  it("HTTP errors carry only the status, never Ollama's body (it can echo the prompt)", async () => {
    const fetchImpl = async () => ({
      ok: false, status: 500,
      json: async () => ({ error: "failed on prompt: SECRET-PROMPT" }),
      text: async () => "SECRET-PROMPT",
    });
    const err = await createOllamaProvider({ model: "m", fetchImpl }).complete("SECRET-PROMPT").catch((e) => e);
    expect(err).toBeInstanceOf(AiProviderError);
    expect(err).toMatchObject({ kind: "http", status: 500 });
    expect(`${err.message} ${err.stack}`).not.toContain("SECRET-PROMPT");
  });

  it("explains a 404 as a model that hasn't been pulled", async () => {
    const fetchImpl = async () => ({ ok: false, status: 404, json: async () => ({ error: "model 'x' not found" }) });
    const err = await createOllamaProvider({ model: "x", fetchImpl }).complete("p").catch((e) => e);
    expect(err).toMatchObject({ kind: "http", status: 404 });
    expect(err.message).toMatch(/ollama pull/);
  });

  it("maps an unreachable server and a timeout to AiProviderError without leaking the prompt", async () => {
    const net = await createOllamaProvider({
      model: "m", baseUrl: "http://localhost:11434",
      fetchImpl: async () => { throw new Error("connect ECONNREFUSED SECRET-PROMPT"); },
    }).complete("SECRET-PROMPT").catch((e) => e);
    expect(net).toMatchObject({ name: "AiProviderError", kind: "network" });
    expect(net.message).toContain("http://localhost:11434");
    expect(net.message).not.toContain("SECRET-PROMPT");

    const timeout = await createOllamaProvider({
      model: "m", fetchImpl: async () => { throw Object.assign(new Error("t"), { name: "TimeoutError" }); },
    }).complete("p").catch((e) => e);
    expect(timeout).toMatchObject({ kind: "timeout" });
  });

  it("gives the model a long timeout by default", () => {
    expect(OLLAMA_REQUEST_TIMEOUT_MS).toBeGreaterThanOrEqual(120_000);
  });

  it("an empty or unreadable reply is an error", async () => {
    for (const fetchImpl of [
      async () => okResponse({ message: { content: "" } }),
      async () => okResponse({ message: { content: "   " } }),
      async () => okResponse({ message: {} }),
      async () => okResponse({}),
      async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError("bad"); } }),
    ]) {
      await expect(createOllamaProvider({ model: "m", fetchImpl }).complete("p")).rejects.toMatchObject({ kind: "empty_response" });
    }
  });

  it("warns, without logging the reply, when the reply stopped at the output limit", async () => {
    const logger = quietLogger();
    const cutOff = createOllamaProvider({ model: "m", logger, fetchImpl: async () => chatReply('{"a": "SECRET-REPLY', { done_reason: "length" }) });
    expect(await cutOff.complete("p")).toContain("SECRET-REPLY"); // still returned; the caller's validation handles it
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn.mock.calls[0][0]).not.toContain("SECRET-REPLY");

    const normal = quietLogger();
    await createOllamaProvider({ model: "m", logger: normal, fetchImpl: async () => chatReply("{}", { done_reason: "stop" }) }).complete("p");
    expect(normal.warn).not.toHaveBeenCalled();
  });

  it("refuses to be built without a model", () => {
    expect(() => createOllamaProvider({ model: "" })).toThrow(/OLLAMA_MODEL/);
    expect(() => createOllamaProvider({})).toThrow();
  });

  it("satisfies the provider interface", () => {
    expect(() => assertAiProvider(createOllamaProvider({ model: "m" }))).not.toThrow();
  });
});

describe("loadConfig: choosing the AI provider", () => {
  const base = { DATABASE_URL: "postgres://x", JWT_SECRET: "x".repeat(40) };
  const KEY = "sk-ant-fake-key-for-tests";

  it("with nothing set, AI is off", () => {
    expect(loadConfig(base)).toMatchObject({ aiProvider: null, anthropic: null, ollama: null });
  });

  it("an Anthropic key alone still selects Anthropic, as before", () => {
    expect(loadConfig({ ...base, ANTHROPIC_API_KEY: KEY })).toMatchObject({ aiProvider: "anthropic", ollama: null });
  });

  it("AI_PROVIDER=ollama selects Ollama with defaults for the URL and timeout", () => {
    const config = loadConfig({ ...base, AI_PROVIDER: "ollama", OLLAMA_MODEL: "qwen2.5:7b" });
    expect(config.aiProvider).toBe("ollama");
    expect(config.anthropic).toBeNull();
    expect(config.ollama).toEqual({ model: "qwen2.5:7b", baseUrl: DEFAULT_OLLAMA_BASE_URL, timeoutMs: OLLAMA_REQUEST_TIMEOUT_MS });
  });

  it("the URL and timeout can be overridden, and empty values count as unset", () => {
    const set = loadConfig({ ...base, AI_PROVIDER: "ollama", OLLAMA_MODEL: "m", OLLAMA_BASE_URL: "http://box:1234", OLLAMA_TIMEOUT_MS: "5000" });
    expect(set.ollama).toEqual({ model: "m", baseUrl: "http://box:1234", timeoutMs: 5000 });
    const blank = loadConfig({ ...base, AI_PROVIDER: "ollama", OLLAMA_MODEL: "m", OLLAMA_BASE_URL: "", OLLAMA_TIMEOUT_MS: "" });
    expect(blank.ollama).toEqual({ model: "m", baseUrl: DEFAULT_OLLAMA_BASE_URL, timeoutMs: OLLAMA_REQUEST_TIMEOUT_MS });
  });

  it("an explicit AI_PROVIDER wins over an Anthropic key that happens to be set", () => {
    const config = loadConfig({ ...base, ANTHROPIC_API_KEY: KEY, AI_PROVIDER: "ollama", OLLAMA_MODEL: "m" });
    expect(config).toMatchObject({ aiProvider: "ollama", anthropic: null });
    const other = loadConfig({ ...base, ANTHROPIC_API_KEY: KEY, AI_PROVIDER: "anthropic", OLLAMA_MODEL: "m" });
    expect(other).toMatchObject({ aiProvider: "anthropic", ollama: null });
  });

  it("OLLAMA_* settings alone do not switch anything on (Ollama must be asked for)", () => {
    expect(loadConfig({ ...base, OLLAMA_MODEL: "m" })).toMatchObject({ aiProvider: null, ollama: null });
    expect(loadConfig({ ...base, AI_PROVIDER: "", OLLAMA_MODEL: "m" }).aiProvider).toBeNull();
  });

  it("an explicit provider that is missing what it needs is an error naming the setting", () => {
    expect(() => loadConfig({ ...base, AI_PROVIDER: "ollama" })).toThrow(/OLLAMA_MODEL/);
    expect(() => loadConfig({ ...base, AI_PROVIDER: "anthropic" })).toThrow(/ANTHROPIC_API_KEY/);
  });

  it("rejects an unknown provider, a bad URL and a tiny timeout", () => {
    expect(() => loadConfig({ ...base, AI_PROVIDER: "openai" })).toThrow(/AI_PROVIDER/);
    expect(() => loadConfig({ ...base, AI_PROVIDER: "ollama", OLLAMA_MODEL: "m", OLLAMA_BASE_URL: "not a url" })).toThrow(/OLLAMA_BASE_URL/);
    expect(() => loadConfig({ ...base, AI_PROVIDER: "ollama", OLLAMA_MODEL: "m", OLLAMA_TIMEOUT_MS: "5" })).toThrow(/OLLAMA_TIMEOUT_MS/);
  });

  it("none of the raw AI settings are left on the top-level config", () => {
    const config = loadConfig({ ...base, ANTHROPIC_API_KEY: KEY, AI_PROVIDER: "ollama", OLLAMA_MODEL: "m", OLLAMA_BASE_URL: "http://b:1" });
    for (const key of ["AI_PROVIDER", "OLLAMA_MODEL", "OLLAMA_BASE_URL", "OLLAMA_TIMEOUT_MS", "ANTHROPIC_API_KEY", "ANTHROPIC_MODEL"]) {
      expect(config[key], key).toBeUndefined();
    }
  });
});

describe("createAiProvider", () => {
  const base = { DATABASE_URL: "postgres://x", JWT_SECRET: "x".repeat(40) };

  it("builds whichever provider the config chose, or null when AI is off", () => {
    expect(createAiProvider(loadConfig(base))).toBeNull();
    expect(createAiProvider(loadConfig({ ...base, ANTHROPIC_API_KEY: "k" })).name).toBe("anthropic");
    expect(createAiProvider(loadConfig({ ...base, AI_PROVIDER: "ollama", OLLAMA_MODEL: "m" })).name).toBe("ollama");
  });

  it("the Anthropic provider is unchanged: no concurrency override", () => {
    expect(createAnthropicProvider({ apiKey: "k" }).concurrency).toBeUndefined();
  });
});

describe("scoring concurrency follows the provider", () => {
  const LONG = "x".repeat(150);
  async function scoreFiveJobs(concurrency) {
    const matchRepository = createInMemoryMatchRepository();
    const jobRepository = createInMemoryJobRepository({ matchRepository });
    for (let i = 0; i < 5; i += 1) {
      await jobRepository.saveForUser("u1", [{
        source_portal: "naukri", title: `Job ${i}`, company: "Acme", location: "Pune", job_url: `https://www.naukri.com/jd/job-${i}`,
        posted_age_days: null, salary_text: null, experience: null, received_at: new Date(), raw_snippet: LONG, needs_link: false,
      }]);
    }
    let inFlight = 0;
    let maxInFlight = 0;
    const provider = {
      name: "slow", ...(concurrency ? { concurrency } : {}),
      async complete() {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((r) => setTimeout(r, 15));
        inFlight -= 1;
        return llmReply({ score: 85 });
      },
    };
    const resumes = new Map([["u1", { structuredData: VALID_FORM, extractedText: "Backend engineer Node.js" }]]);
    const service = createMatchService({
      aiProvider: provider, matchRepository, jobRepository,
      resumeRepository: { findByUserId: async (id) => resumes.get(id) ?? null },
      logger: quietLogger(),
    });
    const summary = await service.rescoreAllForUser("u1");
    return { maxInFlight, summary };
  }

  it("a provider that asks for one at a time (Ollama) gets one request in flight", async () => {
    const { maxInFlight, summary } = await scoreFiveJobs(1);
    expect(summary).toMatchObject({ total: 5, scored: 5 });
    expect(maxInFlight).toBe(1);
  });

  it("a provider with no preference keeps the normal concurrency", async () => {
    const { maxInFlight, summary } = await scoreFiveJobs(undefined);
    expect(summary).toMatchObject({ total: 5, scored: 5 });
    expect(maxInFlight).toBeGreaterThan(1);
    expect(maxInFlight).toBeLessThanOrEqual(3);
  });
});
