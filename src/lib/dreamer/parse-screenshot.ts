import { groqVisionChat, groqVisionModel } from "@/lib/ai/groq";
import {
  parseAndSummarizeAsync,
  type IngestParseResult,
} from "@/lib/dreamer/ingest";
import { redactSecretsForLlm } from "@/lib/dreamer/redact-secrets";

const DATA_URL_RE =
  /^data:(image\/(?:jpeg|jpg|png|webp|gif));base64,([A-Za-z0-9+/=\s]+)$/i;

/** Max decoded image bytes accepted by the paste/screenshot API. */
export const MAX_SCREENSHOT_BYTES = 4 * 1024 * 1024;

export type NormalizedScreenshot = {
  mimeType: string;
  dataUrl: string;
  byteLength: number;
};

export function normalizeScreenshotDataUrl(
  raw: string,
): NormalizedScreenshot | { error: string } {
  const trimmed = raw.trim();
  const match = trimmed.match(DATA_URL_RE);
  if (!match) {
    return {
      error:
        "Screenshot must be a JPEG, PNG, WebP, or GIF image (data URL).",
    };
  }
  const mimeType = match[1].toLowerCase().replace("image/jpg", "image/jpeg");
  const base64 = match[2].replace(/\s+/g, "");
  const byteLength = Math.floor((base64.length * 3) / 4);
  if (byteLength < 32) {
    return { error: "Screenshot image is empty or too small." };
  }
  if (byteLength > MAX_SCREENSHOT_BYTES) {
    return {
      error: "Screenshot is too large — try a tighter crop (max about 4 MB).",
    };
  }
  return {
    mimeType,
    dataUrl: `data:${mimeType};base64,${base64}`,
    byteLength,
  };
}

const TRANSCRIBE_PROMPT = `Transcribe travel booking fields visible in this confirmation screenshot.
Include ONLY: flight numbers, airline names, airport IATA codes, cities, travel dates, local times, hotel names, train/rail details, and booking/PNR/reference codes when clearly visible.
Do NOT transcribe: credit/debit card numbers, CVV, bank details, passwords, government ID numbers, full street addresses beyond city, phone numbers, or email addresses.
Do not invent missing fields. If unreadable, omit them.
Output plain text only — no markdown, no commentary.`;

/** Strip markdown fences / model chatter so deterministic parsers see plain text. */
export function cleanScreenshotTranscript(raw: string): string {
  let text = raw.trim();
  if (text.startsWith("```")) {
    text = text.replace(/^```(?:\w+)?\s*/i, "").replace(/\s*```$/i, "");
  }
  text = text
    .replace(/^(here(?:'s| is) (?:the )?(?:transcription|text|content)[:\s]*)/i, "")
    .trim();
  return redactSecretsForLlm(text).slice(0, 50_000);
}

export async function extractTextFromConfirmationScreenshot(
  dataUrl: string,
): Promise<string | null> {
  const normalized = normalizeScreenshotDataUrl(dataUrl);
  if ("error" in normalized) return null;

  const raw = await groqVisionChat({
    model: groqVisionModel(),
    temperature: 0.1,
    effort: "low",
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: TRANSCRIBE_PROMPT },
          {
            type: "image_url",
            image_url: { url: normalized.dataUrl },
          },
        ],
      },
    ],
  });
  if (!raw) return null;
  const cleaned = cleanScreenshotTranscript(raw);
  return cleaned.length >= 8 ? cleaned : null;
}

export async function parseBookingFromScreenshot(input: {
  dataUrl: string;
  subject?: string | null;
  primaryContext?: Parameters<typeof parseAndSummarizeAsync>[0]["primaryContext"];
}): Promise<
  | (IngestParseResult & { text: string })
  | { error: string; status: number }
> {
  const normalized = normalizeScreenshotDataUrl(input.dataUrl);
  if ("error" in normalized) {
    return { error: normalized.error, status: 400 };
  }

  if (!process.env.GROQ_API_KEY) {
    return {
      error:
        "Screenshot reading needs AI configured (GROQ_API_KEY). Paste the confirmation text instead.",
      status: 503,
    };
  }

  const text = await extractTextFromConfirmationScreenshot(normalized.dataUrl);
  if (!text) {
    return {
      error:
        "Could not read that screenshot — try a clearer crop or paste the confirmation text.",
      status: 422,
    };
  }

  const summarized = await parseAndSummarizeAsync({
    subject: input.subject ?? "Screenshot booking",
    text,
    primaryContext: input.primaryContext,
  });
  return { ...summarized, text };
}
