import { describe, expect, it, vi } from "vitest";
import { DEFAULT_ANTHROPIC_MODEL } from "../src/config/ai.js";
import { loadConfig } from "../src/config/env.js";
import { createAnthropicProvider } from "../src/services/ai/anthropicProvider.js";
import { AiProviderError, assertAiProvider } from "../src/services/ai/provider.js";

// A made-up key. No test here ever needs, reads, or sends a real one: the network is always faked.
const FAKE_KEY = "sk-ant-fake-key-for-tests";

const okResponse = (body) => ({ ok: true, status: 200, json: async () => body });

describe("createAnthropicProvider", () => {
  it("posts the prompt to the Messages API with the key in a header and returns the text", async () => {
    const fetchImpl = vi.fn(async () => okResponse({ content: [{ type: "text", text: '{"score":80}' }] }));
    const provider = createAnthropicProvider({ apiKey: FAKE_KEY, model: "test-model", fetchImpl });

    expect(await provider.complete("hello prompt")).toBe('{"score":80}');

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(init.method).toBe("POST");
    expect(init.headers["x-api-key"]).toBe(FAKE_KEY);
    expect(init.headers["anthropic-version"]).toBeTruthy();
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ model: "test-model", messages: [{ role: "user", content: "hello prompt" }] });
    expect(body.max_tokens).toBeGreaterThan(0);
    expect(init.body).not.toContain(FAKE_KEY);
  });

  it("uses the default model from config/ai.js when none is given", async () => {
    const fetchImpl = vi.fn(async () => okResponse({ content: [{ type: "text", text: "ok" }] }));
    await createAnthropicProvider({ apiKey: FAKE_KEY, fetchImpl }).complete("p");
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body).model).toBe(DEFAULT_ANTHROPIC_MODEL);
  });

  it("joins several text blocks and ignores other block types", async () => {
    const fetchImpl = async () => okResponse({ content: [{ type: "text", text: "a" }, { type: "tool_use" }, { type: "text", text: "b" }] });
    expect(await createAnthropicProvider({ apiKey: FAKE_KEY, fetchImpl }).complete("p")).toBe("ab");
  });

  it("HTTP errors carry only the status, never the response body, prompt or key", async () => {
    const fetchImpl = async () => ({
      ok: false, status: 401,
      json: async () => ({ error: { message: `invalid key ${FAKE_KEY} for prompt: SECRET-PROMPT` } }),
      text: async () => `invalid key ${FAKE_KEY} SECRET-PROMPT`,
    });
    const err = await createAnthropicProvider({ apiKey: FAKE_KEY, fetchImpl }).complete("SECRET-PROMPT").catch((e) => e);
    expect(err).toBeInstanceOf(AiProviderError);
    expect(err).toMatchObject({ kind: "http", status: 401 });
    expect(`${err.message} ${err.stack}`).not.toContain(FAKE_KEY);
    expect(err.message).not.toContain("SECRET-PROMPT");
  });

  it("maps network failures and timeouts to AiProviderError without leaking details", async () => {
    const net = await createAnthropicProvider({
      apiKey: FAKE_KEY, fetchImpl: async () => { throw new Error(`connect failed ${FAKE_KEY}`); },
    }).complete("p").catch((e) => e);
    expect(net).toMatchObject({ name: "AiProviderError", kind: "network" });
    expect(net.message).not.toContain(FAKE_KEY);

    const timeout = await createAnthropicProvider({
      apiKey: FAKE_KEY, fetchImpl: async () => { throw Object.assign(new Error("t"), { name: "TimeoutError" }); },
    }).complete("p").catch((e) => e);
    expect(timeout).toMatchObject({ kind: "timeout" });
  });

  it("an empty or unreadable reply is an error", async () => {
    for (const fetchImpl of [
      async () => okResponse({ content: [] }),
      async () => okResponse({ content: [{ type: "text", text: "   " }] }),
      async () => okResponse({}),
      async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError("bad"); } }),
    ]) {
      await expect(createAnthropicProvider({ apiKey: FAKE_KEY, fetchImpl }).complete("p")).rejects.toMatchObject({
        kind: "empty_response",
      });
    }
  });

  it("refuses to be built without a key", () => {
    expect(() => createAnthropicProvider({ apiKey: "" })).toThrow(/ANTHROPIC_API_KEY/);
    expect(() => createAnthropicProvider({})).toThrow();
  });

  it("satisfies the provider interface", () => {
    expect(() => assertAiProvider(createAnthropicProvider({ apiKey: FAKE_KEY }))).not.toThrow();
    expect(() => assertAiProvider({})).toThrow();
    expect(() => assertAiProvider(null)).toThrow();
  });
});

describe("loadConfig (AI)", () => {
  const base = { DATABASE_URL: "postgres://x", JWT_SECRET: "x".repeat(40) };

  it("AI is off without a key, and empty values count as unset", () => {
    expect(loadConfig(base).anthropic).toBeNull();
    expect(loadConfig({ ...base, ANTHROPIC_API_KEY: "", ANTHROPIC_MODEL: "" }).anthropic).toBeNull();
  });

  it("the model defaults to the one in config/ai.js and can be overridden by ANTHROPIC_MODEL", () => {
    expect(loadConfig({ ...base, ANTHROPIC_API_KEY: FAKE_KEY }).anthropic).toEqual({
      apiKey: FAKE_KEY, model: DEFAULT_ANTHROPIC_MODEL,
    });
    expect(loadConfig({ ...base, ANTHROPIC_API_KEY: FAKE_KEY, ANTHROPIC_MODEL: "other-model" }).anthropic.model).toBe("other-model");
    expect(loadConfig({ ...base, ANTHROPIC_API_KEY: FAKE_KEY, ANTHROPIC_MODEL: "" }).anthropic.model).toBe(DEFAULT_ANTHROPIC_MODEL);
  });

  it("the key is not left on the top-level config", () => {
    const config = loadConfig({ ...base, ANTHROPIC_API_KEY: FAKE_KEY });
    expect(config.ANTHROPIC_API_KEY).toBeUndefined();
    expect(config.ANTHROPIC_MODEL).toBeUndefined();
  });
});
