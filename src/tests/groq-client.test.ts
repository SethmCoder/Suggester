import { afterEach, describe, expect, it } from "vitest";
import { itineraryGenerationSchema } from "@/lib/ai/schema";
import {
  completeGroqChat,
  currentGroqQuota,
  groqModel,
  noteGroqHeaders,
  parseGroqReset,
  proGroqModel,
  resetGroqQuotaForTests,
} from "@/lib/ai/groq";

const previousModel = process.env.GROQ_MODEL;
const previousPro = process.env.GROQ_PRO_MODEL;

afterEach(() => {
  if (previousModel == null) delete process.env.GROQ_MODEL;
  else process.env.GROQ_MODEL = previousModel;
  if (previousPro == null) delete process.env.GROQ_PRO_MODEL;
  else process.env.GROQ_PRO_MODEL = previousPro;
  resetGroqQuotaForTests();
});

describe("groq model id", () => {
  it("defaults to openai/gpt-oss-120b", () => {
    delete process.env.GROQ_MODEL;
    delete process.env.GROQ_PRO_MODEL;
    expect(groqModel()).toBe("openai/gpt-oss-120b");
    expect(proGroqModel()).toBe("openai/gpt-oss-120b");
  });

  it("uses GROQ_MODEL, including the qwen alternate", () => {
    process.env.GROQ_MODEL = "qwen/qwen3.8-27b";
    expect(groqModel()).toBe("qwen/qwen3.8-27b");
    expect(proGroqModel()).toBe("qwen/qwen3.8-27b");
  });

  it("lets GROQ_PRO_MODEL override only the pro model", () => {
    process.env.GROQ_MODEL = "openai/gpt-oss-120b";
    process.env.GROQ_PRO_MODEL = "qwen/qwen3.8-27b";
    expect(groqModel()).toBe("openai/gpt-oss-120b");
    expect(proGroqModel()).toBe("qwen/qwen3.8-27b");
  });
});

describe("groq rate limits", () => {
  it("reads remaining requests and a duration reset", () => {
    const now = 1_000_000;
    noteGroqHeaders(
      new Headers({
        "x-ratelimit-remaining-requests": "4",
        "x-ratelimit-remaining-tokens": "1200",
        "x-ratelimit-reset-requests": "7m59.5s",
      }),
      now,
    );
    const quota = currentGroqQuota();
    expect(quota.remainingRequests).toBe(4);
    expect(quota.remainingTokens).toBe(1200);
    expect(quota.resetRequestsAt).toBe(now + (7 * 60 + 59.5) * 1000);
    expect(parseGroqReset("2s", now)).toBe(now + 2000);
  });

  it("retries a 429 and then keeps the response", async () => {
    let calls = 0;
    const content = await completeGroqChat(
      {},
      async () => {
        calls += 1;
        if (calls === 1) {
          const headers = new Headers({ "retry-after": "0" });
          throw Object.assign(new Error("busy"), { status: 429, headers });
        }
        return {
          content: '{"ok":true}',
          headers: new Headers({ "x-ratelimit-remaining-requests": "8" }),
        };
      },
      async () => {},
    );
    expect(calls).toBe(2);
    expect(content).toBe('{"ok":true}');
    expect(currentGroqQuota().remainingRequests).toBe(8);
  });

  it("skips an optional call when the remaining request count is already zero", async () => {
    noteGroqHeaders(
      new Headers({
        "x-ratelimit-remaining-requests": "0",
        "x-ratelimit-reset-requests": "30s",
      }),
    );
    let calls = 0;
    const content = await completeGroqChat({ optional: true }, async () => {
      calls += 1;
      return { content: "later", headers: new Headers() };
    });
    expect(calls).toBe(0);
    expect(content).toBeNull();
  });

  it("treats empty model content as a failed call", async () => {
    const content = await completeGroqChat({}, async () => ({
      content: "  ",
      headers: new Headers(),
    }));
    expect(content).toBeNull();
  });
});

describe("itinerary schema", () => {
  it("rejects a payload without days", () => {
    expect(() => itineraryGenerationSchema.parse({ warnings: [] })).toThrow();
  });
});
