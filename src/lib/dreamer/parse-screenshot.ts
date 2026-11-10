import { groqVisionChat, groqVisionModel } from "@/lib/ai/groq";
import { parseAndSummarize, type IngestParseResult } from "@/lib/dreamer/ingest";

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

const TRANSCRIBE_PROMPT = `Transcribe ALL visible booking-confirmation text from this screenshot exactly.
Include flight numbers, airline names, airport codes (IATA), cities, dates, times, confirmation/PNR codes, hotel names, and addresses when visible.
Do not invent, guess, or complete missing fields. If a value is unreadable, omit it.
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
  return text.slice(0, 50_000);
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
  primaryContext?: Parameters<typeof parseAndSummarize>[0]["primaryContext"];
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

  const summarized = parseAndSummarize({
    subject: input.subject ?? "Screenshot booking",
    text,
    primaryContext: input.primaryContext,
  });
  return { ...summarized, text };
}
