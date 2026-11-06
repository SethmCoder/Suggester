import Groq from "groq-sdk";
import { logger } from "@/lib/logger";

/** Default Groq model. Override with GROQ_MODEL, including qwen/qwen3.8-27b. */
export const DEFAULT_GROQ_MODEL = "openai/gpt-oss-120b";

export type GroqEffort = "low" | "medium" | "high";

export type GroqHeaderSource = { get(name: string): string | null };

export type GroqQuota = {
  remainingRequests: number | null;
  remainingTokens: number | null;
  resetRequestsAt: number | null;
  resetTokensAt: number | null;
};

type GroqMessage = { role: "system" | "user" | "assistant"; content: string };

export type GroqChatRequest = {
  model?: string;
  temperature?: number;
  messages: GroqMessage[];
  responseFormat?: {
    type: "json_object";
  } | {
    type: "json_schema";
    json_schema: {
      name: string;
      strict?: boolean;
      schema: Record<string, unknown>;
    };
  };
  effort?: GroqEffort;
  /** Briefs and other copy can be skipped when the free-tier quota is already spent. */
  optional?: boolean;
};

const emptyQuota = (): GroqQuota => ({
  remainingRequests: null,
  remainingTokens: null,
  resetRequestsAt: null,
  resetTokensAt: null,
});

let quota: GroqQuota = emptyQuota();
let client: Groq | null = null;
let clientKey: string | null = null;

export function groqModel(): string {
  const configured = process.env.GROQ_MODEL?.trim();
  return configured || DEFAULT_GROQ_MODEL;
}

export function proGroqModel(): string {
  const configured = process.env.GROQ_PRO_MODEL?.trim();
  return configured || groqModel();
}

export function resetGroqQuotaForTests() {
  quota = emptyQuota();
}

export function currentGroqQuota(): GroqQuota {
  return { ...quota };
}

export function parseGroqReset(value: string | null, now = Date.now()): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    const amount = Number(trimmed);
    if (amount > 1e12) return amount;
    if (amount > 1e9) return amount * 1000;
    return now + amount * 1000;
  }
  const match = trimmed.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+(?:\.\d+)?)s)?$/i);
  if (!match || (match[1] == null && match[2] == null && match[3] == null)) return null;
  const ms =
    (Number(match[1] || 0) * 3600 + Number(match[2] || 0) * 60 + Number(match[3] || 0)) * 1000;
  if (!Number.isFinite(ms)) return null;
  return now + ms;
}

function headerNumber(value: string | null): number | null {
  if (value == null || value.trim() === "") return null;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}

export function noteGroqHeaders(headers: GroqHeaderSource, now = Date.now()) {
  const remainingRequests = headerNumber(headers.get("x-ratelimit-remaining-requests"));
  const remainingTokens = headerNumber(headers.get("x-ratelimit-remaining-tokens"));
  const resetRequestsAt = parseGroqReset(headers.get("x-ratelimit-reset-requests"), now);
  const resetTokensAt = parseGroqReset(headers.get("x-ratelimit-reset-tokens"), now);
  quota = {
    remainingRequests: remainingRequests ?? quota.remainingRequests,
    remainingTokens: remainingTokens ?? quota.remainingTokens,
    resetRequestsAt: resetRequestsAt ?? quota.resetRequestsAt,
    resetTokensAt: resetTokensAt ?? quota.resetTokensAt,
  };
}

export function groqQuotaBlocked(now = Date.now()): boolean {
  if (
    quota.remainingRequests === 0 &&
    (quota.resetRequestsAt == null || quota.resetRequestsAt > now)
  ) {
    return true;
  }
  if (
    quota.remainingTokens != null &&
    quota.remainingTokens <= 0 &&
    (quota.resetTokensAt == null || quota.resetTokensAt > now)
  ) {
    return true;
  }
  return false;
}

export function retryDelayMs(attempt: number, retryAfter: string | null): number {
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.min(15_000, Math.max(200, seconds * 1000));
    const parsed = parseGroqReset(retryAfter, 0);
    if (parsed != null) return Math.min(15_000, Math.max(200, parsed));
  }
  return Math.min(8_000, 400 * 2 ** attempt);
}

function errorStatus(err: unknown): { status?: number; headers?: GroqHeaderSource } {
  if (!err || typeof err !== "object") return {};
  const status = "status" in err && typeof err.status === "number" ? err.status : undefined;
  const headers =
    "headers" in err && err.headers && typeof err.headers === "object" && "get" in err.headers
      ? (err.headers as GroqHeaderSource)
      : undefined;
  return { status, headers };
}

export async function completeGroqChat(
  input: { optional?: boolean },
  send: () => Promise<{ content: string | null; headers: GroqHeaderSource }>,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<string | null> {
  if (input.optional && groqQuotaBlocked()) return null;
  const attempts = 3;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const result = await send();
      noteGroqHeaders(result.headers);
      const content = result.content?.trim() || null;
      return content;
    } catch (err) {
      const { status, headers } = errorStatus(err);
      if (headers) noteGroqHeaders(headers);
      const retry = status === 429 || status === 503;
      if (retry && attempt < attempts - 1) {
        const wait = retryDelayMs(attempt, headers?.get("retry-after") ?? null);
        logger.warn("groq_retry", { status, attempt: attempt + 1 });
        await sleep(wait);
        continue;
      }
      logger.warn("groq_request_failed", { status: status ?? "unknown" });
      return null;
    }
  }
  return null;
}

function groqClient(): Groq | null {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;
  if (!client || clientKey !== apiKey) {
    client = new Groq({ apiKey });
    clientKey = apiKey;
  }
  return client;
}

/** One Groq chat completion. Reasoning text is discarded. Empty content is a failed call. */
export async function groqChat(request: GroqChatRequest): Promise<string | null> {
  const groq = groqClient();
  if (!groq) return null;
  const model = request.model?.trim() || groqModel();
  return completeGroqChat({ optional: request.optional }, async () => {
    const { data, response } = await groq.chat.completions
      .create({
        model,
        temperature: request.temperature ?? 0.3,
        messages: request.messages,
        response_format: request.responseFormat,
        reasoning_format: "parsed",
        reasoning_effort: request.effort ?? "low",
      })
      .withResponse();
    return {
      content: data.choices[0]?.message?.content ?? null,
      headers: response.headers,
    };
  });
}
